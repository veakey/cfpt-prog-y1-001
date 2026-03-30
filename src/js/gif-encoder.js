/* ========================================
   GIF89a Encoder — Pure JavaScript
   No external dependencies
   ======================================== */

class GifEncoder {
  /**
   * @param {number} width
   * @param {number} height
   * @param {number} delay - Frame delay in ms (e.g. 33 for ~30fps)
   */
  constructor(width, height, delay = 33) {
    this.width = width;
    this.height = height;
    this.delay = Math.round(delay / 10); // GIF uses centiseconds
    this.frames = [];
    this.transparent = null;
  }

  /**
   * Add a frame from a canvas element
   * @param {HTMLCanvasElement} canvas
   */
  addFrame(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, this.width, this.height);
    this.frames.push(imageData);
  }

  /**
   * Add a frame from raw ImageData
   * @param {ImageData} imageData
   */
  addFrameData(imageData) {
    this.frames.push(imageData);
  }

  /**
   * Encode all frames into a GIF blob
   * @param {function} onProgress - callback(percent) for progress updates
   * @returns {Blob}
   */
  encode(onProgress) {
    const buf = [];

    // Helper to write bytes
    const writeByte = (b) => buf.push(b & 0xFF);
    const writeShort = (s) => { writeByte(s); writeByte(s >> 8); };
    const writeString = (s) => { for (let i = 0; i < s.length; i++) buf.push(s.charCodeAt(i)); };
    const writeBytes = (arr) => { for (let i = 0; i < arr.length; i++) buf.push(arr[i]); };

    // ── Header ──
    writeString('GIF89a');

    // ── Logical Screen Descriptor ──
    writeShort(this.width);
    writeShort(this.height);
    // Global Color Table Flag = 1, Color Resolution = 7 (8 bits), Sort = 0, Size = 7 (256 colors)
    writeByte(0xF7); // 1_111_0_111
    writeByte(0);     // Background color index
    writeByte(0);     // Pixel aspect ratio

    // ── Global Color Table (256 × RGB) ──
    // Will be overwritten per-frame via local color tables, but GIF spec wants this
    for (let i = 0; i < 256; i++) {
      writeByte(0); writeByte(0); writeByte(0);
    }

    // ── Netscape Extension (looping) ──
    writeByte(0x21); // Extension introducer
    writeByte(0xFF); // Application extension
    writeByte(11);   // Block size
    writeString('NETSCAPE2.0');
    writeByte(3);    // Sub-block size
    writeByte(1);    // Sub-block ID
    writeShort(0);   // Loop count (0 = infinite)
    writeByte(0);    // Block terminator

    // ── Frames ──
    for (let f = 0; f < this.frames.length; f++) {
      if (onProgress) onProgress(Math.round((f / this.frames.length) * 100));

      const imageData = this.frames[f];
      const { palette, indexed } = this._quantize(imageData);

      // Graphic Control Extension
      writeByte(0x21); // Extension introducer
      writeByte(0xF9); // Graphic control
      writeByte(4);    // Block size
      writeByte(0x00); // No transparency, no disposal
      writeShort(this.delay); // Delay in centiseconds
      writeByte(0);    // Transparent color index
      writeByte(0);    // Block terminator

      // Image Descriptor
      writeByte(0x2C); // Image separator
      writeShort(0);   // Left
      writeShort(0);   // Top
      writeShort(this.width);
      writeShort(this.height);
      // Local Color Table Flag = 1, Interlace = 0, Sort = 0, Size = 7 (256 entries)
      writeByte(0x87); // 1_0_0_00_111

      // Local Color Table
      for (let i = 0; i < 256; i++) {
        writeByte(palette[i * 3]);
        writeByte(palette[i * 3 + 1]);
        writeByte(palette[i * 3 + 2]);
      }

      // LZW Compressed Data
      const lzwMinCode = 8;
      writeByte(lzwMinCode);
      const compressed = this._lzwEncode(indexed, lzwMinCode);
      // Write in sub-blocks of max 255 bytes
      let offset = 0;
      while (offset < compressed.length) {
        const chunkSize = Math.min(255, compressed.length - offset);
        writeByte(chunkSize);
        for (let i = 0; i < chunkSize; i++) {
          writeByte(compressed[offset + i]);
        }
        offset += chunkSize;
      }
      writeByte(0); // Block terminator
    }

    // ── Trailer ──
    writeByte(0x3B);

    if (onProgress) onProgress(100);

    return new Blob([new Uint8Array(buf)], { type: 'image/gif' });
  }

  /**
   * Median-cut color quantization to 256 colors
   * @param {ImageData} imageData
   * @returns {{ palette: Uint8Array, indexed: Uint8Array }}
   */
  _quantize(imageData) {
    const pixels = imageData.data;
    const numPixels = this.width * this.height;
    const indexed = new Uint8Array(numPixels);
    const palette = new Uint8Array(256 * 3);

    // Build a histogram of unique colors (sampled for speed)
    const colorMap = new Map();
    const step = numPixels > 100000 ? 4 : 1;

    for (let i = 0; i < numPixels; i += step) {
      const off = i * 4;
      const r = pixels[off] >> 2;     // Reduce to 6 bits
      const g = pixels[off + 1] >> 2;
      const b = pixels[off + 2] >> 2;
      const key = (r << 12) | (g << 6) | b;
      colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }

    // Collect colors into a list
    const colors = [];
    for (const [key, count] of colorMap) {
      colors.push({
        r: ((key >> 12) & 0x3F) << 2,
        g: ((key >> 6) & 0x3F) << 2,
        b: (key & 0x3F) << 2,
        count,
      });
    }

    // Median-cut: split into 256 buckets
    const buckets = [colors];

    while (buckets.length < 256 && buckets.length > 0) {
      // Find the bucket with the largest range
      let bestIdx = 0;
      let bestRange = -1;

      for (let i = 0; i < buckets.length; i++) {
        if (buckets[i].length <= 1) continue;
        const range = this._colorRange(buckets[i]);
        if (range.maxRange > bestRange) {
          bestRange = range.maxRange;
          bestIdx = i;
        }
      }

      if (bestRange <= 0) break;

      const bucket = buckets[bestIdx];
      const range = this._colorRange(bucket);

      // Sort by the channel with the largest range
      bucket.sort((a, b) => a[range.channel] - b[range.channel]);

      const mid = Math.floor(bucket.length / 2);
      buckets[bestIdx] = bucket.slice(0, mid);
      buckets.push(bucket.slice(mid));
    }

    // Build palette from bucket averages
    for (let i = 0; i < Math.min(buckets.length, 256); i++) {
      const bucket = buckets[i];
      let tr = 0, tg = 0, tb = 0, tc = 0;
      for (const c of bucket) {
        tr += c.r * c.count;
        tg += c.g * c.count;
        tb += c.b * c.count;
        tc += c.count;
      }
      if (tc > 0) {
        palette[i * 3] = Math.round(tr / tc);
        palette[i * 3 + 1] = Math.round(tg / tc);
        palette[i * 3 + 2] = Math.round(tb / tc);
      }
    }

    // Map each pixel to the nearest palette entry
    // Build a cache for speed
    const cache = new Map();

    for (let i = 0; i < numPixels; i++) {
      const off = i * 4;
      const r = pixels[off];
      const g = pixels[off + 1];
      const b = pixels[off + 2];
      const key = (r << 16) | (g << 8) | b;

      if (cache.has(key)) {
        indexed[i] = cache.get(key);
      } else {
        let bestDist = Infinity;
        let bestIdx = 0;
        const palLen = Math.min(buckets.length, 256);
        for (let j = 0; j < palLen; j++) {
          const dr = r - palette[j * 3];
          const dg = g - palette[j * 3 + 1];
          const db = b - palette[j * 3 + 2];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = j;
          }
        }
        indexed[i] = bestIdx;
        cache.set(key, bestIdx);
      }
    }

    return { palette, indexed };
  }

  _colorRange(bucket) {
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (const c of bucket) {
      if (c.r < minR) minR = c.r; if (c.r > maxR) maxR = c.r;
      if (c.g < minG) minG = c.g; if (c.g > maxG) maxG = c.g;
      if (c.b < minB) minB = c.b; if (c.b > maxB) maxB = c.b;
    }
    const rr = maxR - minR, gr = maxG - minG, br = maxB - minB;
    if (rr >= gr && rr >= br) return { channel: 'r', maxRange: rr };
    if (gr >= rr && gr >= br) return { channel: 'g', maxRange: gr };
    return { channel: 'b', maxRange: br };
  }

  /**
   * LZW encoding for GIF
   * @param {Uint8Array} indexed - palette-indexed pixel data
   * @param {number} minCodeSize
   * @returns {Uint8Array}
   */
  _lzwEncode(indexed, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    const maxTableSize = 4096;

    // Output bit stream
    const output = [];
    let bitBuf = 0;
    let bitPos = 0;

    const writeBits = (code, size) => {
      bitBuf |= (code << bitPos);
      bitPos += size;
      while (bitPos >= 8) {
        output.push(bitBuf & 0xFF);
        bitBuf >>= 8;
        bitPos -= 8;
      }
    };

    // Initialize code table using a Map with string keys for speed
    let table = new Map();
    const resetTable = () => {
      table = new Map();
      for (let i = 0; i < clearCode; i++) {
        table.set(String(i), i);
      }
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
    };

    resetTable();
    writeBits(clearCode, codeSize);

    if (indexed.length === 0) {
      writeBits(eoiCode, codeSize);
      if (bitPos > 0) output.push(bitBuf & 0xFF);
      return new Uint8Array(output);
    }

    let current = String(indexed[0]);

    for (let i = 1; i < indexed.length; i++) {
      const pixel = String(indexed[i]);
      const combined = current + ',' + pixel;

      if (table.has(combined)) {
        current = combined;
      } else {
        writeBits(table.get(current), codeSize);

        if (nextCode < maxTableSize) {
          table.set(combined, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          // Table full — reset
          writeBits(clearCode, codeSize);
          resetTable();
        }

        current = pixel;
      }
    }

    // Write remaining
    writeBits(table.get(current), codeSize);
    writeBits(eoiCode, codeSize);

    if (bitPos > 0) output.push(bitBuf & 0xFF);

    return new Uint8Array(output);
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.GifEncoder = GifEncoder;
}
