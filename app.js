/* ========================================
   Pixel Art Animator - Main Application
   ======================================== */

// ── State ──────────────────────────────────────

const state = {
  assets: [],          // { id, name, img, src }
  layers: [],          // { id, name, assetId, x, y, z, opacity, visible, scaleX, scaleY, bindings, sprite }
  selectedLayerId: null,
  fps: 30,
  playing: false,
  recording: false,
  recMode: false,      // keyframe recording mode
  currentFrame: 0,
  keyframes: {},       // { layerId: [ { frame, x, y, opacity, scaleX, scaleY } ] }
  totalFrames: 300,    // 10 seconds at 30fps
  pressedKeys: new Set(),
  mediaRecorder: null,
  recordedChunks: [],
  animationId: null,
  lastFrameTime: 0,
};

// ── DOM refs ───────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const canvas = $('#main-canvas');
const ctx = canvas.getContext('2d');
const timelineCanvas = $('#timeline-canvas');
const timelineCtx = timelineCanvas.getContext('2d');

// ── Utility ────────────────────────────────────

let nextId = 1;
function genId() { return nextId++; }

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ── Asset Management ───────────────────────────

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Not an image file'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve({ img, src: e.target.result, name: file.name });
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addAssets(files) {
  for (const file of files) {
    try {
      const { img, src, name } = await loadImageFromFile(file);
      const asset = { id: genId(), name, img, src };
      state.assets.push(asset);
    } catch (err) {
      console.warn('Failed to load asset:', file.name, err);
    }
  }
  renderAssetList();
}

function removeAsset(id) {
  state.assets = state.assets.filter(a => a.id !== id);
  renderAssetList();
}

function getAsset(id) {
  return state.assets.find(a => a.id === id);
}

// ── Layer Management ───────────────────────────

function createLayer(assetId, name) {
  const layer = {
    id: genId(),
    name: name || `Calque ${state.layers.length + 1}`,
    assetId: assetId || null,
    x: 0,
    y: 0,
    z: state.layers.length,
    opacity: 1,
    visible: true,
    scaleX: 1,
    scaleY: 1,
    bindings: {
      up:    { key: null, action: 'move', dx: 0, dy: -4 },
      down:  { key: null, action: 'move', dx: 0, dy: 4 },
      left:  { key: null, action: 'move', dx: -4, dy: 0 },
      right: { key: null, action: 'move', dx: 4, dy: 0 },
    },
    sprite: {
      enabled: false,
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 1,
      columns: 1,
      currentFrame: 0,
      animSpeed: 8,  // frames per second of sprite animation
      loop: true,
      _elapsed: 0,
    },
  };
  state.layers.push(layer);
  state.keyframes[layer.id] = [];
  renderLayerList();
  selectLayer(layer.id);
  return layer;
}

function removeLayer(id) {
  state.layers = state.layers.filter(l => l.id !== id);
  delete state.keyframes[id];
  if (state.selectedLayerId === id) {
    state.selectedLayerId = state.layers.length > 0 ? state.layers[0].id : null;
  }
  renderLayerList();
  renderLayerProps();
  renderBindingsEditor();
  renderSpriteConfig();
}

function getLayer(id) {
  return state.layers.find(l => l.id === id);
}

function selectLayer(id) {
  state.selectedLayerId = id;
  renderLayerList();
  renderLayerProps();
  renderBindingsEditor();
  renderSpriteConfig();
}

function moveLayerZ(id, direction) {
  const idx = state.layers.findIndex(l => l.id === id);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= state.layers.length) return;
  [state.layers[idx], state.layers[newIdx]] = [state.layers[newIdx], state.layers[idx]];
  state.layers.forEach((l, i) => l.z = i);
  renderLayerList();
}

// ── Rendering ──────────────────────────────────

function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Sort layers by z-index
  const sorted = [...state.layers].sort((a, b) => a.z - b.z);

  for (const layer of sorted) {
    if (!layer.visible) continue;
    const asset = getAsset(layer.assetId);
    if (!asset) continue;

    ctx.save();
    ctx.globalAlpha = layer.opacity;

    if (layer.sprite.enabled) {
      const s = layer.sprite;
      const col = s.currentFrame % s.columns;
      const row = Math.floor(s.currentFrame / s.columns);
      ctx.drawImage(
        asset.img,
        col * s.frameWidth, row * s.frameHeight, s.frameWidth, s.frameHeight,
        layer.x, layer.y, s.frameWidth * layer.scaleX, s.frameHeight * layer.scaleY
      );
    } else {
      ctx.drawImage(
        asset.img,
        layer.x, layer.y,
        asset.img.width * layer.scaleX, asset.img.height * layer.scaleY
      );
    }

    ctx.restore();
  }
}

// ── Keyframe System ────────────────────────────

function addKeyframe(layerId, frame) {
  const layer = getLayer(layerId);
  if (!layer) return;

  const kf = {
    frame,
    x: layer.x,
    y: layer.y,
    opacity: layer.opacity,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
  };

  if (!state.keyframes[layerId]) state.keyframes[layerId] = [];
  const kfs = state.keyframes[layerId];

  // Replace existing keyframe at same frame
  const existingIdx = kfs.findIndex(k => k.frame === frame);
  if (existingIdx >= 0) {
    kfs[existingIdx] = kf;
  } else {
    kfs.push(kf);
    kfs.sort((a, b) => a.frame - b.frame);
  }

  renderTimeline();
}

function interpolateKeyframes(layerId, frame) {
  const kfs = state.keyframes[layerId];
  if (!kfs || kfs.length === 0) return null;

  // Before first keyframe
  if (frame <= kfs[0].frame) return { ...kfs[0] };

  // After last keyframe
  if (frame >= kfs[kfs.length - 1].frame) return { ...kfs[kfs.length - 1] };

  // Find surrounding keyframes
  for (let i = 0; i < kfs.length - 1; i++) {
    if (frame >= kfs[i].frame && frame <= kfs[i + 1].frame) {
      const a = kfs[i];
      const b = kfs[i + 1];
      const t = (frame - a.frame) / (b.frame - a.frame);
      return {
        frame,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        opacity: a.opacity + (b.opacity - a.opacity) * t,
        scaleX: a.scaleX + (b.scaleX - a.scaleX) * t,
        scaleY: a.scaleY + (b.scaleY - a.scaleY) * t,
      };
    }
  }
  return null;
}

function applyKeyframesAtFrame(frame) {
  for (const layer of state.layers) {
    const interp = interpolateKeyframes(layer.id, frame);
    if (interp) {
      layer.x = interp.x;
      layer.y = interp.y;
      layer.opacity = interp.opacity;
      layer.scaleX = interp.scaleX;
      layer.scaleY = interp.scaleY;
    }
  }
}

function clearKeyframes(layerId) {
  if (layerId) {
    state.keyframes[layerId] = [];
  } else {
    for (const id in state.keyframes) {
      state.keyframes[id] = [];
    }
  }
  renderTimeline();
}

// ── Input Handling ─────────────────────────────

function processBindings() {
  for (const layer of state.layers) {
    if (!layer.visible) continue;
    for (const dir in layer.bindings) {
      const binding = layer.bindings[dir];
      if (!binding.key) continue;
      if (state.pressedKeys.has(binding.key)) {
        layer.x += binding.dx;
        layer.y += binding.dy;

        // Auto-record keyframes in rec mode
        if (state.recMode && state.playing) {
          addKeyframe(layer.id, state.currentFrame);
        }
      }
    }
  }
}

// Mouse drag
let dragging = null; // { layerId, startX, startY, layerStartX, layerStartY }

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  // Find topmost layer under cursor
  const sorted = [...state.layers].sort((a, b) => b.z - a.z);
  for (const layer of sorted) {
    if (!layer.visible) continue;
    const asset = getAsset(layer.assetId);
    if (!asset) continue;

    const w = layer.sprite.enabled ? layer.sprite.frameWidth * layer.scaleX : asset.img.width * layer.scaleX;
    const h = layer.sprite.enabled ? layer.sprite.frameHeight * layer.scaleY : asset.img.height * layer.scaleY;

    if (mx >= layer.x && mx <= layer.x + w && my >= layer.y && my <= layer.y + h) {
      dragging = {
        layerId: layer.id,
        startX: mx,
        startY: my,
        layerStartX: layer.x,
        layerStartY: layer.y,
      };
      selectLayer(layer.id);
      break;
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  $('#mouse-pos').textContent = `x: ${Math.round(mx)}, y: ${Math.round(my)}`;

  if (dragging) {
    const layer = getLayer(dragging.layerId);
    if (layer) {
      layer.x = dragging.layerStartX + (mx - dragging.startX);
      layer.y = dragging.layerStartY + (my - dragging.startY);
      renderLayerProps();

      if (state.recMode) {
        addKeyframe(layer.id, state.currentFrame);
      }
    }
  }
});

canvas.addEventListener('mouseup', () => { dragging = null; });
canvas.addEventListener('mouseleave', () => { dragging = null; });

// Keyboard
document.addEventListener('keydown', (e) => {
  // Don't capture when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  state.pressedKeys.add(e.key);

  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  }
});

document.addEventListener('keyup', (e) => {
  state.pressedKeys.delete(e.key);
});

// ── Animation Loop ─────────────────────────────

function updateSpriteAnimations(dt) {
  for (const layer of state.layers) {
    if (!layer.sprite.enabled || layer.sprite.frameCount <= 1) continue;
    const s = layer.sprite;
    s._elapsed += dt;
    const frameDuration = 1 / s.animSpeed;
    if (s._elapsed >= frameDuration) {
      s._elapsed -= frameDuration;
      s.currentFrame++;
      if (s.currentFrame >= s.frameCount) {
        s.currentFrame = s.loop ? 0 : s.frameCount - 1;
      }
    }
  }
}

function animationLoop(timestamp) {
  if (!state.playing) return;

  const dt = 1 / state.fps;

  // Process inputs
  processBindings();

  // Apply keyframes if not in rec mode (rec mode captures, doesn't play back)
  if (!state.recMode) {
    applyKeyframesAtFrame(state.currentFrame);
  }

  // Update sprite animations
  updateSpriteAnimations(dt);

  // Render
  renderCanvas();

  // Advance frame
  state.currentFrame++;
  if (state.currentFrame >= state.totalFrames) {
    if (state.recording) {
      stopRecording();
    }
    state.currentFrame = 0;
  }

  // Update UI
  $('#frame-counter').textContent = `Frame: ${state.currentFrame}`;
  $('#time-display').textContent = `${(state.currentFrame / state.fps).toFixed(2)}s`;
  renderTimeline();

  // Schedule next frame
  setTimeout(() => {
    state.animationId = requestAnimationFrame(animationLoop);
  }, 1000 / state.fps - (performance.now() - timestamp));
}

function togglePlay() {
  if (state.playing) {
    stopPlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  state.playing = true;
  $('#btn-play').textContent = '⏸ Pause';
  state.animationId = requestAnimationFrame(animationLoop);
}

function stopPlay() {
  state.playing = false;
  $('#btn-play').textContent = '▶ Play';
  if (state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
}

function stopAll() {
  stopPlay();
  if (state.recording) stopRecording();
  state.currentFrame = 0;
  $('#frame-counter').textContent = 'Frame: 0';
  $('#time-display').textContent = '0.00s';
  renderCanvas();
  renderTimeline();
}

// ── Recording ──────────────────────────────────

function startRecording() {
  const stream = canvas.captureStream(state.fps);
  state.recordedChunks = [];

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  state.mediaRecorder = new MediaRecorder(stream, { mimeType });

  state.mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      state.recordedChunks.push(e.data);
    }
  };

  state.mediaRecorder.onstop = () => {
    showExportModal();
  };

  state.mediaRecorder.start();
  state.recording = true;
  state.currentFrame = 0;
  $('#btn-record').classList.add('recording');
  $('#btn-record').textContent = '⏹ Stop Rec';

  if (!state.playing) startPlay();
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  state.recording = false;
  $('#btn-record').classList.remove('recording');
  $('#btn-record').textContent = '⏺ Rec';
}

function showExportModal() {
  const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);

  const preview = $('#export-preview');
  preview.innerHTML = `<video src="${url}" controls loop style="max-width:100%"></video>`;

  $('#btn-export-webm').onclick = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pixel-animation.webm';
    a.click();
  };

  $('#btn-export-gif').onclick = () => {
    alert('Export GIF nécessite une librairie externe (gif.js). Pour l\'instant, utilisez le format WebM.');
  };

  $('#export-modal').classList.remove('hidden');
}

// ── UI Rendering ───────────────────────────────

function renderAssetList() {
  const container = $('#asset-list');
  container.innerHTML = '';

  for (const asset of state.assets) {
    const div = document.createElement('div');
    div.className = 'asset-thumb';
    div.draggable = true;
    div.dataset.assetId = asset.id;
    div.innerHTML = `
      <img src="${asset.src}" alt="${asset.name}" draggable="false">
      <span class="asset-name">${asset.name}</span>
      <button class="asset-remove" data-id="${asset.id}">×</button>
    `;

    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', asset.id);
    });

    div.querySelector('.asset-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeAsset(asset.id);
    });

    // Double click to create a layer with this asset
    div.addEventListener('dblclick', () => {
      createLayer(asset.id, asset.name);
    });

    container.appendChild(div);
  }
}

function renderLayerList() {
  const container = $('#layer-list');
  container.innerHTML = '';

  // Render in reverse so highest z is on top visually
  const sorted = [...state.layers].sort((a, b) => b.z - a.z);

  for (const layer of sorted) {
    const div = document.createElement('div');
    div.className = `layer-item${layer.id === state.selectedLayerId ? ' selected' : ''}`;
    div.dataset.layerId = layer.id;
    div.innerHTML = `
      <span class="layer-drag">⠿</span>
      <span class="layer-visibility">${layer.visible ? '👁' : '🚫'}</span>
      <span class="layer-name"><input type="text" value="${layer.name}"></span>
      <button class="layer-delete" data-id="${layer.id}">🗑</button>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
        selectLayer(layer.id);
      }
    });

    div.querySelector('.layer-visibility').addEventListener('click', (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      renderLayerList();
      renderCanvas();
    });

    div.querySelector('.layer-name input').addEventListener('change', (e) => {
      layer.name = e.target.value;
    });

    div.querySelector('.layer-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      removeLayer(layer.id);
    });

    container.appendChild(div);
  }
}

function renderLayerProps() {
  const container = $('#layer-props');
  const layer = getLayer(state.selectedLayerId);

  if (!layer) {
    container.innerHTML = '<p class="muted">Sélectionnez un calque</p>';
    return;
  }

  container.innerHTML = `
    <label>X: <input type="number" id="prop-x" value="${Math.round(layer.x)}" step="1"></label>
    <label>Y: <input type="number" id="prop-y" value="${Math.round(layer.y)}" step="1"></label>
    <label>Échelle X: <input type="number" id="prop-sx" value="${layer.scaleX}" step="0.1" min="0.1"></label>
    <label>Échelle Y: <input type="number" id="prop-sy" value="${layer.scaleY}" step="0.1" min="0.1"></label>
    <label>Opacité: <input type="range" id="prop-opacity" value="${layer.opacity}" min="0" max="1" step="0.05"> ${Math.round(layer.opacity * 100)}%</label>
    <label>Z-index:
      <span>
        <button class="btn btn-small" id="prop-z-up">↑</button>
        <button class="btn btn-small" id="prop-z-down">↓</button>
      </span>
    </label>
  `;

  $('#prop-x').addEventListener('change', (e) => { layer.x = parseFloat(e.target.value); renderCanvas(); });
  $('#prop-y').addEventListener('change', (e) => { layer.y = parseFloat(e.target.value); renderCanvas(); });
  $('#prop-sx').addEventListener('change', (e) => { layer.scaleX = parseFloat(e.target.value); renderCanvas(); });
  $('#prop-sy').addEventListener('change', (e) => { layer.scaleY = parseFloat(e.target.value); renderCanvas(); });
  $('#prop-opacity').addEventListener('input', (e) => {
    layer.opacity = parseFloat(e.target.value);
    e.target.parentElement.lastChild.textContent = ` ${Math.round(layer.opacity * 100)}%`;
    renderCanvas();
  });
  $('#prop-z-up').addEventListener('click', () => { moveLayerZ(layer.id, 1); renderCanvas(); });
  $('#prop-z-down').addEventListener('click', () => { moveLayerZ(layer.id, -1); renderCanvas(); });
}

function renderBindingsEditor() {
  const container = $('#bindings-editor');
  const layer = getLayer(state.selectedLayerId);

  if (!layer) {
    container.innerHTML = '<p class="muted">Sélectionnez un calque pour configurer les contrôles</p>';
    return;
  }

  const directions = [
    { key: 'up', label: '↑ Haut' },
    { key: 'down', label: '↓ Bas' },
    { key: 'left', label: '← Gauche' },
    { key: 'right', label: '→ Droite' },
  ];

  container.innerHTML = directions.map(d => {
    const b = layer.bindings[d.key];
    return `
      <div class="binding-row">
        <label>${d.label}:</label>
        <div class="binding-key" tabindex="0" data-dir="${d.key}">${b.key || 'Cliquer...'}</div>
        <input type="number" data-dir="${d.key}" data-axis="speed" value="${Math.abs(b.dx || b.dy)}" min="1" max="50" title="Vitesse (px)">
      </div>
    `;
  }).join('');

  // Key binding listeners
  container.querySelectorAll('.binding-key').forEach(el => {
    el.addEventListener('click', function() {
      this.classList.add('listening');
      this.textContent = '...appuyez...';

      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dir = this.dataset.dir;
        layer.bindings[dir].key = e.key;
        this.textContent = e.key;
        this.classList.remove('listening');
        document.removeEventListener('keydown', handler, true);
      };
      document.addEventListener('keydown', handler, true);
    });
  });

  // Speed listeners
  container.querySelectorAll('input[data-axis="speed"]').forEach(el => {
    el.addEventListener('change', (e) => {
      const dir = e.target.dataset.dir;
      const speed = parseInt(e.target.value) || 4;
      const b = layer.bindings[dir];
      if (dir === 'up') { b.dx = 0; b.dy = -speed; }
      if (dir === 'down') { b.dx = 0; b.dy = speed; }
      if (dir === 'left') { b.dx = -speed; b.dy = 0; }
      if (dir === 'right') { b.dx = speed; b.dy = 0; }
    });
  });
}

function renderSpriteConfig() {
  const container = $('#sprite-config');
  const layer = getLayer(state.selectedLayerId);

  if (!layer) {
    container.innerHTML = '<p class="muted">Sélectionnez un calque avec un sprite sheet</p>';
    return;
  }

  const s = layer.sprite;
  container.innerHTML = `
    <label><input type="checkbox" id="spr-enabled" ${s.enabled ? 'checked' : ''}> Activer sprite sheet</label>
    <label>Largeur frame: <input type="number" id="spr-fw" value="${s.frameWidth}" min="1"></label>
    <label>Hauteur frame: <input type="number" id="spr-fh" value="${s.frameHeight}" min="1"></label>
    <label>Nb frames: <input type="number" id="spr-fc" value="${s.frameCount}" min="1"></label>
    <label>Colonnes: <input type="number" id="spr-cols" value="${s.columns}" min="1"></label>
    <label>Vitesse anim: <input type="number" id="spr-speed" value="${s.animSpeed}" min="1" max="60"> fps</label>
    <label><input type="checkbox" id="spr-loop" ${s.loop ? 'checked' : ''}> Boucle</label>
  `;

  const bind = (sel, prop, parse) => {
    const el = container.querySelector(sel);
    el.addEventListener('change', (e) => {
      s[prop] = parse ? parse(e.target) : parseInt(e.target.value);
    });
  };

  bind('#spr-enabled', 'enabled', (t) => t.checked);
  bind('#spr-fw', 'frameWidth');
  bind('#spr-fh', 'frameHeight');
  bind('#spr-fc', 'frameCount');
  bind('#spr-cols', 'columns');
  bind('#spr-speed', 'animSpeed');
  bind('#spr-loop', 'loop', (t) => t.checked);
}

function renderTimeline() {
  const tc = timelineCanvas;
  const tctx = timelineCtx;
  tc.width = tc.parentElement.clientWidth;
  const w = tc.width;
  const h = tc.height;

  tctx.clearRect(0, 0, w, h);

  // Background
  tctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  tctx.fillRect(0, 0, w, h);

  const pxPerFrame = w / state.totalFrames;

  // Frame markers
  tctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  tctx.lineWidth = 1;
  const step = Math.max(1, Math.floor(10 / pxPerFrame));
  for (let i = 0; i < state.totalFrames; i += step) {
    const x = i * pxPerFrame;
    tctx.beginPath();
    tctx.moveTo(x, 0);
    tctx.lineTo(x, h);
    tctx.stroke();
  }

  // Second markers
  tctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  tctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  tctx.font = '9px sans-serif';
  for (let s = 0; s <= state.totalFrames / state.fps; s++) {
    const x = s * state.fps * pxPerFrame;
    tctx.beginPath();
    tctx.moveTo(x, 0);
    tctx.lineTo(x, h);
    tctx.stroke();
    tctx.fillText(`${s}s`, x + 2, 10);
  }

  // Keyframes
  const colors = ['#7c5cfc', '#fc5c7c', '#5cfc7c', '#fccc5c', '#5ccffc', '#fc5cfc'];
  let colorIdx = 0;
  for (const layerId in state.keyframes) {
    const kfs = state.keyframes[layerId];
    const color = colors[colorIdx % colors.length];
    colorIdx++;

    for (const kf of kfs) {
      const x = kf.frame * pxPerFrame;
      tctx.fillStyle = color;
      tctx.fillRect(x - 2, 15, 4, h - 25);
    }
  }

  // Playhead
  const playX = state.currentFrame * pxPerFrame;
  tctx.strokeStyle = '#fc5c7c';
  tctx.lineWidth = 2;
  tctx.beginPath();
  tctx.moveTo(playX, 0);
  tctx.lineTo(playX, h);
  tctx.stroke();

  // Playhead triangle
  tctx.fillStyle = '#fc5c7c';
  tctx.beginPath();
  tctx.moveTo(playX - 5, 0);
  tctx.lineTo(playX + 5, 0);
  tctx.lineTo(playX, 8);
  tctx.closePath();
  tctx.fill();
}

// ── Canvas Drop Target (drag asset from sidebar) ──

const canvasWrapper = $('.canvas-wrapper');

canvasWrapper.addEventListener('dragover', (e) => {
  e.preventDefault();
  canvasWrapper.classList.add('drop-target');
});

canvasWrapper.addEventListener('dragleave', () => {
  canvasWrapper.classList.remove('drop-target');
});

canvasWrapper.addEventListener('drop', (e) => {
  e.preventDefault();
  canvasWrapper.classList.remove('drop-target');
  const assetId = parseInt(e.dataTransfer.getData('text/plain'));
  const asset = getAsset(assetId);
  if (asset) {
    const layer = createLayer(assetId, asset.name);
    // Place at drop position
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    layer.x = (e.clientX - rect.left) * scaleX;
    layer.y = (e.clientY - rect.top) * scaleY;
    renderCanvas();
  }
});

// ── Timeline Click ─────────────────────────────

timelineCanvas.addEventListener('click', (e) => {
  const rect = timelineCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const frame = Math.round((x / rect.width) * state.totalFrames);
  state.currentFrame = clamp(frame, 0, state.totalFrames - 1);
  applyKeyframesAtFrame(state.currentFrame);
  renderCanvas();
  renderTimeline();
  $('#frame-counter').textContent = `Frame: ${state.currentFrame}`;
  $('#time-display').textContent = `${(state.currentFrame / state.fps).toFixed(2)}s`;
});

// ── Event Wiring ───────────────────────────────

// File input
$('#btn-load-assets').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (e) => addAssets(e.target.files));

// Drop zone
const dropZone = $('#asset-drop-zone');
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    addAssets(e.dataTransfer.files);
  }
});
dropZone.addEventListener('click', () => $('#file-input').click());

// Add layer button
$('#btn-add-layer').addEventListener('click', () => createLayer());

// Playback controls
$('#btn-play').addEventListener('click', togglePlay);
$('#btn-stop').addEventListener('click', stopAll);
$('#btn-record').addEventListener('click', () => {
  if (state.recording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// FPS slider
$('#fps-slider').addEventListener('input', (e) => {
  state.fps = parseInt(e.target.value);
  $('#fps-display').textContent = `${state.fps} FPS`;
});

// Rec mode toggle
$('#btn-rec-mode').addEventListener('click', () => {
  state.recMode = !state.recMode;
  $('#btn-rec-mode').textContent = state.recMode ? '🟢 Mode Lecture' : '🔴 Mode Enregistrement';
  $('#btn-rec-mode').classList.toggle('btn-accent', state.recMode);
});

// Clear keyframes
$('#btn-clear-keyframes').addEventListener('click', () => clearKeyframes());

// Canvas resize
$('#btn-resize-canvas').addEventListener('click', () => {
  const w = parseInt($('#canvas-width').value);
  const h = parseInt($('#canvas-height').value);
  if (w >= 64 && h >= 64) {
    canvas.width = w;
    canvas.height = h;
    $('#canvas-size').textContent = `${w} × ${h}`;
    renderCanvas();
  }
});

// Export modal close
$('#btn-export-close').addEventListener('click', () => {
  $('#export-modal').classList.add('hidden');
  const video = $('#export-preview video');
  if (video) video.pause();
});

// ── Initial render ─────────────────────────────

renderCanvas();
renderTimeline();
renderLayerList();

// Continuous render when not playing (for drag updates)
function idleRender() {
  if (!state.playing) {
    renderCanvas();
  }
  requestAnimationFrame(idleRender);
}
idleRender();

// ── Exports for testing ────────────────────────

if (typeof window !== 'undefined') {
  window.PixelAnimator = {
    state,
    genId,
    clamp,
    loadImageFromFile,
    addAssets,
    removeAsset,
    getAsset,
    createLayer,
    removeLayer,
    getLayer,
    selectLayer,
    moveLayerZ,
    renderCanvas,
    addKeyframe,
    interpolateKeyframes,
    applyKeyframesAtFrame,
    clearKeyframes,
    processBindings,
    startPlay,
    stopPlay,
    togglePlay,
    startRecording,
    stopRecording,
  };
}
