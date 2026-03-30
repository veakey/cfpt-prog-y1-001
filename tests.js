/* ========================================
   Pixel Art Animator - Test Suite
   ======================================== */

const results = document.getElementById('results');
let passed = 0;
let failed = 0;
let currentSection = '';

function section(name) {
  currentSection = name;
  const h2 = document.createElement('h2');
  h2.textContent = name;
  results.appendChild(h2);
}

function assert(condition, description) {
  const div = document.createElement('div');
  div.className = `test ${condition ? 'pass' : 'fail'}`;
  div.textContent = `${condition ? '✓' : '✗'} ${description}`;
  results.appendChild(div);
  if (condition) {
    passed++;
  } else {
    failed++;
  }
  return condition;
}

function assertEqual(actual, expected, description) {
  const condition = actual === expected;
  if (!assert(condition, description) ) {
    const detail = document.createElement('div');
    detail.className = 'error-detail';
    detail.textContent = `  Attendu: ${JSON.stringify(expected)}, Obtenu: ${JSON.stringify(actual)}`;
    results.appendChild(detail);
  }
}

function assertApprox(actual, expected, tolerance, description) {
  const condition = Math.abs(actual - expected) < tolerance;
  if (!assert(condition, description)) {
    const detail = document.createElement('div');
    detail.className = 'error-detail';
    detail.textContent = `  Attendu: ~${expected} (±${tolerance}), Obtenu: ${actual}`;
    results.appendChild(detail);
  }
}

// Get the app API
const app = window.PixelAnimator;

// Helper to reset state between test groups
function resetState() {
  app.state.assets = [];
  app.state.layers = [];
  app.state.selectedLayerId = null;
  app.state.keyframes = {};
  app.state.currentFrame = 0;
  app.state.playing = false;
  app.state.recording = false;
  app.state.recMode = false;
  app.state.pressedKeys.clear();
}

// ── Unit Tests ─────────────────────────────────

section('Utilitaires');
{
  assertEqual(app.clamp(5, 0, 10), 5, 'clamp: valeur dans l\'intervalle reste inchangée');
  assertEqual(app.clamp(-5, 0, 10), 0, 'clamp: valeur en dessous retourne min');
  assertEqual(app.clamp(15, 0, 10), 10, 'clamp: valeur au dessus retourne max');
  assertEqual(app.clamp(0, 0, 10), 0, 'clamp: valeur égale à min');
  assertEqual(app.clamp(10, 0, 10), 10, 'clamp: valeur égale à max');

  const id1 = app.genId();
  const id2 = app.genId();
  assert(id2 > id1, 'genId: génère des IDs croissants');
}

section('Gestion des Assets');
resetState();
{
  assertEqual(app.state.assets.length, 0, 'État initial: aucun asset');
  assertEqual(app.getAsset(999), undefined, 'getAsset: retourne undefined si non trouvé');

  // Simulate adding an asset manually (can't use File API in tests)
  const fakeImg = new Image();
  fakeImg.width = 32;
  fakeImg.height = 32;
  const fakeAsset = { id: app.genId(), name: 'test.png', img: fakeImg, src: 'data:,' };
  app.state.assets.push(fakeAsset);

  assertEqual(app.state.assets.length, 1, 'Ajout d\'asset: 1 asset après ajout');
  assertEqual(app.getAsset(fakeAsset.id).name, 'test.png', 'getAsset: retrouve l\'asset par id');

  app.removeAsset(fakeAsset.id);
  assertEqual(app.state.assets.length, 0, 'removeAsset: supprime l\'asset');
  assertEqual(app.getAsset(fakeAsset.id), undefined, 'removeAsset: asset introuvable après suppression');
}

section('Gestion des Calques');
resetState();
{
  assertEqual(app.state.layers.length, 0, 'État initial: aucun calque');

  const layer1 = app.createLayer(null, 'Fond');
  assert(layer1 !== null && layer1 !== undefined, 'createLayer: retourne un calque');
  assertEqual(layer1.name, 'Fond', 'createLayer: nom correct');
  assertEqual(layer1.x, 0, 'createLayer: position x initiale = 0');
  assertEqual(layer1.y, 0, 'createLayer: position y initiale = 0');
  assertEqual(layer1.opacity, 1, 'createLayer: opacité initiale = 1');
  assertEqual(layer1.visible, true, 'createLayer: visible par défaut');
  assertEqual(layer1.scaleX, 1, 'createLayer: échelle X = 1');
  assertEqual(layer1.scaleY, 1, 'createLayer: échelle Y = 1');
  assert(layer1.bindings !== undefined, 'createLayer: bindings initialisés');
  assert(layer1.sprite !== undefined, 'createLayer: sprite config initialisée');
  assertEqual(layer1.sprite.enabled, false, 'createLayer: sprite désactivé par défaut');

  const layer2 = app.createLayer(null, 'Perso');
  assertEqual(app.state.layers.length, 2, 'Deux calques créés');
  assert(layer2.z > layer1.z, 'Z-index: second calque au dessus du premier');

  assertEqual(app.getLayer(layer1.id).name, 'Fond', 'getLayer: retrouve par id');
  assertEqual(app.getLayer(999999), undefined, 'getLayer: retourne undefined si non trouvé');

  // Selection
  app.selectLayer(layer1.id);
  assertEqual(app.state.selectedLayerId, layer1.id, 'selectLayer: sélectionne le calque');
  app.selectLayer(layer2.id);
  assertEqual(app.state.selectedLayerId, layer2.id, 'selectLayer: change la sélection');

  // Z-order
  const z1Before = layer1.z;
  const z2Before = layer2.z;
  app.moveLayerZ(layer1.id, 1);
  assert(layer1.z > z1Before || layer1.z !== z1Before, 'moveLayerZ: déplace le calque vers le haut');

  // Remove
  app.removeLayer(layer2.id);
  assertEqual(app.state.layers.length, 1, 'removeLayer: supprime le calque');
  assertEqual(app.getLayer(layer2.id), undefined, 'removeLayer: calque introuvable après suppression');

  // Remove selected layer
  const selectedBefore = app.state.selectedLayerId;
  app.removeLayer(layer1.id);
  assertEqual(app.state.layers.length, 0, 'removeLayer: supprime le dernier calque');
}

section('Système de Keyframes');
resetState();
{
  const layer = app.createLayer(null, 'TestKF');
  const lid = layer.id;

  // Add keyframes
  layer.x = 0; layer.y = 0;
  app.addKeyframe(lid, 0);

  layer.x = 100; layer.y = 50;
  app.addKeyframe(lid, 30);

  assertEqual(app.state.keyframes[lid].length, 2, 'addKeyframe: 2 keyframes ajoutés');
  assertEqual(app.state.keyframes[lid][0].frame, 0, 'addKeyframe: premier keyframe à frame 0');
  assertEqual(app.state.keyframes[lid][1].frame, 30, 'addKeyframe: second keyframe à frame 30');

  // Interpolation
  const interp0 = app.interpolateKeyframes(lid, 0);
  assertEqual(interp0.x, 0, 'interpolation: frame 0, x = 0');
  assertEqual(interp0.y, 0, 'interpolation: frame 0, y = 0');

  const interp30 = app.interpolateKeyframes(lid, 30);
  assertEqual(interp30.x, 100, 'interpolation: frame 30, x = 100');
  assertEqual(interp30.y, 50, 'interpolation: frame 30, y = 50');

  const interp15 = app.interpolateKeyframes(lid, 15);
  assertApprox(interp15.x, 50, 0.1, 'interpolation: frame 15, x ≈ 50 (milieu)');
  assertApprox(interp15.y, 25, 0.1, 'interpolation: frame 15, y ≈ 25 (milieu)');

  const interp10 = app.interpolateKeyframes(lid, 10);
  assertApprox(interp10.x, 33.33, 0.5, 'interpolation: frame 10, x ≈ 33.33 (1/3)');

  // Before first keyframe
  const interpBefore = app.interpolateKeyframes(lid, -5);
  assertEqual(interpBefore.x, 0, 'interpolation: avant premier KF, retourne premier KF');

  // After last keyframe
  const interpAfter = app.interpolateKeyframes(lid, 100);
  assertEqual(interpAfter.x, 100, 'interpolation: après dernier KF, retourne dernier KF');

  // No keyframes
  const noKF = app.interpolateKeyframes(999999, 10);
  assertEqual(noKF, null, 'interpolation: retourne null si pas de keyframes');

  // Replace keyframe at same frame
  layer.x = 200;
  app.addKeyframe(lid, 30);
  assertEqual(app.state.keyframes[lid].length, 2, 'addKeyframe: remplacement ne duplique pas');
  assertEqual(app.state.keyframes[lid][1].x, 200, 'addKeyframe: valeur mise à jour');

  // Apply keyframes
  app.applyKeyframesAtFrame(15);
  assertApprox(layer.x, 100, 0.5, 'applyKeyframesAtFrame: applique l\'interpolation au calque');

  // Clear keyframes
  app.clearKeyframes(lid);
  assertEqual(app.state.keyframes[lid].length, 0, 'clearKeyframes: supprime les keyframes du calque');

  // Clear all keyframes
  layer.x = 0;
  app.addKeyframe(lid, 0);
  app.clearKeyframes();
  assertEqual(app.state.keyframes[lid].length, 0, 'clearKeyframes(): supprime tous les keyframes');
}

section('Opacity & Scale Interpolation');
resetState();
{
  const layer = app.createLayer(null, 'OpacityTest');
  const lid = layer.id;

  layer.x = 0; layer.y = 0; layer.opacity = 1; layer.scaleX = 1; layer.scaleY = 1;
  app.addKeyframe(lid, 0);

  layer.opacity = 0; layer.scaleX = 2; layer.scaleY = 3;
  app.addKeyframe(lid, 20);

  const interp = app.interpolateKeyframes(lid, 10);
  assertApprox(interp.opacity, 0.5, 0.01, 'interpolation opacity: milieu = 0.5');
  assertApprox(interp.scaleX, 1.5, 0.01, 'interpolation scaleX: milieu = 1.5');
  assertApprox(interp.scaleY, 2, 0.01, 'interpolation scaleY: milieu = 2');
}

section('Bindings et Input');
resetState();
{
  const layer = app.createLayer(null, 'BindTest');
  layer.bindings.up.key = 'ArrowUp';
  layer.bindings.down.key = 'ArrowDown';
  layer.bindings.left.key = 'ArrowLeft';
  layer.bindings.right.key = 'ArrowRight';

  layer.x = 100;
  layer.y = 100;

  // Simulate pressing ArrowRight
  app.state.pressedKeys.add('ArrowRight');
  app.processBindings();
  assertEqual(layer.x, 104, 'binding right: x += 4');
  assertEqual(layer.y, 100, 'binding right: y inchangé');

  app.state.pressedKeys.clear();
  app.state.pressedKeys.add('ArrowUp');
  app.processBindings();
  assertEqual(layer.y, 96, 'binding up: y -= 4');

  app.state.pressedKeys.clear();
  app.state.pressedKeys.add('ArrowDown');
  app.processBindings();
  assertEqual(layer.y, 100, 'binding down: y += 4');

  app.state.pressedKeys.clear();
  app.state.pressedKeys.add('ArrowLeft');
  app.processBindings();
  assertEqual(layer.x, 100, 'binding left: x -= 4');

  // Multiple keys
  app.state.pressedKeys.clear();
  app.state.pressedKeys.add('ArrowRight');
  app.state.pressedKeys.add('ArrowDown');
  app.processBindings();
  assertEqual(layer.x, 104, 'multi-key: x += 4 (droite)');
  assertEqual(layer.y, 104, 'multi-key: y += 4 (bas)');

  app.state.pressedKeys.clear();

  // Custom speed
  layer.bindings.right.dx = 10;
  layer.x = 0;
  app.state.pressedKeys.add('ArrowRight');
  app.processBindings();
  assertEqual(layer.x, 10, 'binding custom speed: x += 10');

  app.state.pressedKeys.clear();

  // Invisible layer should not process bindings
  layer.visible = false;
  layer.x = 0;
  app.state.pressedKeys.add('ArrowRight');
  app.processBindings();
  assertEqual(layer.x, 0, 'binding: calque invisible ne bouge pas');

  app.state.pressedKeys.clear();
  layer.visible = true;

  // No key bound
  layer.bindings.up.key = null;
  layer.y = 50;
  app.state.pressedKeys.add('ArrowUp');
  app.processBindings();
  assertEqual(layer.y, 50, 'binding: pas de touche configurée = pas de mouvement');

  app.state.pressedKeys.clear();
}

section('Animation directionnelle - Sprite Sheet Rows');
resetState();
{
  const layer = app.createLayer(null, 'DirSpriteTest');
  layer.sprite.enabled = true;
  layer.sprite.frameWidth = 32;
  layer.sprite.frameHeight = 32;
  layer.sprite.frameCount = 16; // 4 rows × 4 columns
  layer.sprite.columns = 4;
  layer.sprite.animSpeed = 8;

  // Configure: row 0 = idle, row 1 = left, row 2 = right, row 3 = up
  layer.bindings.idle.spriteRow = 0;
  layer.bindings.left.spriteRow = 1;
  layer.bindings.left.key = 'ArrowLeft';
  layer.bindings.right.spriteRow = 2;
  layer.bindings.right.key = 'ArrowRight';
  layer.bindings.up.spriteRow = 3;
  layer.bindings.up.key = 'ArrowUp';

  // No keys pressed → idle
  app.state.pressedKeys.clear();
  app.processBindings();
  assertEqual(layer._dirAnim.activeDir, null, 'dir sprite: pas de touche = idle');
  assertEqual(layer.sprite.currentFrame, 0, 'dir sprite: idle → frame 0 (row 0, col 0)');

  // Press right → row 2
  app.state.pressedKeys.add('ArrowRight');
  app.processBindings();
  assertEqual(layer._dirAnim.activeDir, 'right', 'dir sprite: direction = right');
  // After first processBindings with new dir, frameIndex should be 0, so frame = row 2 * 4 + 0 = 8
  assertEqual(layer.sprite.currentFrame, 8, 'dir sprite: right → frame 8 (row 2, col 0)');

  // Press left → should switch to row 1
  app.state.pressedKeys.clear();
  app.state.pressedKeys.add('ArrowLeft');
  app.processBindings();
  assertEqual(layer._dirAnim.activeDir, 'left', 'dir sprite: direction changée à left');
  assertEqual(layer.sprite.currentFrame, 4, 'dir sprite: left → frame 4 (row 1, col 0)');

  // Release → back to idle
  app.state.pressedKeys.clear();
  app.processBindings();
  assertEqual(layer._dirAnim.activeDir, null, 'dir sprite: retour idle');
  assertEqual(layer.sprite.currentFrame, 0, 'dir sprite: idle → frame 0');
}

section('Animation directionnelle - Images séparées');
resetState();
{
  // Create fake assets for each direction
  const mkAsset = (name) => {
    const img = new Image();
    img.width = 32; img.height = 32;
    const asset = { id: app.genId(), name, img, src: 'data:,' };
    app.state.assets.push(asset);
    return asset;
  };

  const idleImg = mkAsset('idle.png');
  const walkL1 = mkAsset('walk-left-1.png');
  const walkL2 = mkAsset('walk-left-2.png');
  const walkL3 = mkAsset('walk-left-3.png');
  const walkR1 = mkAsset('walk-right-1.png');
  const walkR2 = mkAsset('walk-right-2.png');

  const layer = app.createLayer(idleImg.id, 'DirAssetTest');

  // Configure idle and directional assets
  layer.bindings.idle.assetIds = [idleImg.id];
  layer.bindings.left.key = 'a';
  layer.bindings.left.assetIds = [walkL1.id, walkL2.id, walkL3.id];
  layer.bindings.right.key = 'd';
  layer.bindings.right.assetIds = [walkR1.id, walkR2.id];

  // No key pressed → idle asset
  app.state.pressedKeys.clear();
  app.processBindings();
  assertEqual(layer.assetId, idleImg.id, 'dir assets: idle → image idle');

  // Press left → first walk left image
  app.state.pressedKeys.add('a');
  app.processBindings();
  assertEqual(layer.assetId, walkL1.id, 'dir assets: left → première image de marche gauche');

  // Release → back to idle
  app.state.pressedKeys.clear();
  app.processBindings();
  assertEqual(layer.assetId, idleImg.id, 'dir assets: release → retour à idle');

  // Press right → first walk right image
  app.state.pressedKeys.add('d');
  app.processBindings();
  assertEqual(layer.assetId, walkR1.id, 'dir assets: right → première image de marche droite');

  app.state.pressedKeys.clear();
}

section('getActiveDirection');
resetState();
{
  const layer = app.createLayer(null, 'ActiveDirTest');
  layer.bindings.right.key = 'ArrowRight';

  app.state.pressedKeys.clear();
  app.processBindings();
  assertEqual(app.getActiveDirection(layer), null, 'getActiveDirection: null quand idle');

  app.state.pressedKeys.add('ArrowRight');
  app.processBindings();
  assertEqual(app.getActiveDirection(layer), 'right', 'getActiveDirection: right quand touche pressée');

  app.state.pressedKeys.clear();
  app.processBindings();
  assertEqual(app.getActiveDirection(layer), null, 'getActiveDirection: retour à null');
}

section('Bindings idle config');
resetState();
{
  const layer = app.createLayer(null, 'IdleTest');

  // idle binding should exist by default
  assert(layer.bindings.idle !== undefined, 'idle binding: existe par défaut');
  assertEqual(layer.bindings.idle.spriteRow, null, 'idle binding: spriteRow null par défaut');
  assert(Array.isArray(layer.bindings.idle.assetIds), 'idle binding: assetIds est un tableau');
  assertEqual(layer.bindings.idle.assetIds.length, 0, 'idle binding: assetIds vide par défaut');
}

section('Saut - Configuration par défaut');
resetState();
{
  const layer = app.createLayer(null, 'JumpDefaultTest');

  // Jump binding exists
  assert(layer.bindings.jump !== undefined, 'jump binding: existe par défaut');
  assertEqual(layer.bindings.jump.key, null, 'jump binding: pas de touche par défaut');
  assert(Array.isArray(layer.bindings.jump.assetIds), 'jump binding: assetIds est un tableau');
  assertEqual(layer.bindings.jump.spriteRow, null, 'jump binding: spriteRow null par défaut');

  // Jump config
  assertEqual(layer.jump.height, 80, 'jump config: hauteur = 80px par défaut');
  assertEqual(layer.jump.duration, 0.5, 'jump config: durée = 0.5s par défaut');
  assertEqual(layer.jump.hSpeed, 0, 'jump config: drift horizontal = 0 par défaut');

  // Jump state
  assertEqual(layer._jump.active, false, 'jump state: inactif par défaut');
  assertEqual(layer._jump.elapsed, 0, 'jump state: elapsed = 0');
}

section('Saut - Arc parabolique');
resetState();
{
  const layer = app.createLayer(null, 'JumpArcTest');
  layer.bindings.jump.key = ' ';
  layer.jump.height = 100;
  layer.jump.duration = 1.0; // 1 seconde
  layer.y = 200; // position au sol

  app.state.fps = 30;

  // Trigger jump
  app.state.pressedKeys.add(' ');
  app.processBindings();

  assert(app.isJumping(layer), 'saut: actif après appui');
  assertEqual(layer._jump.originY, 200, 'saut: originY sauvegardé');

  // Release key (jump continues)
  app.state.pressedKeys.clear();

  // Simulate several frames to reach peak (~halfway)
  // dt = 1/30 ≈ 0.033s, after 15 frames ≈ 0.5s = half duration
  for (let i = 0; i < 14; i++) {
    app.processBindings();
  }

  // At ~t=0.5, sin(π*0.5) = 1, so y should be near originY - height = 100
  assert(layer.y < 200, 'saut: y diminue pendant la montée (sprite monte)');
  assert(layer.y < 150, 'saut: y proche du sommet vers mi-parcours');

  // Continue until jump ends (~30 frames total for 1s at 30fps)
  for (let i = 0; i < 20; i++) {
    app.processBindings();
  }

  // Jump should be finished and y back to origin
  assertEqual(layer._jump.active, false, 'saut: inactif après la fin');
  assertEqual(layer.y, 200, 'saut: retour à la position d\'origine');
}

section('Saut - Ne peut pas sauter pendant un saut');
resetState();
{
  const layer = app.createLayer(null, 'JumpDoubleTest');
  layer.bindings.jump.key = ' ';
  layer.jump.height = 50;
  layer.jump.duration = 0.5;
  layer.y = 100;

  // Start jump
  app.state.pressedKeys.add(' ');
  app.processBindings();
  assert(app.isJumping(layer), 'double saut: premier saut actif');

  const yAfterFirst = layer.y;

  // Try to jump again while in air — should not restart
  app.processBindings();
  assert(app.isJumping(layer), 'double saut: toujours en saut');
  // originY should still be 100, not the mid-air position
  assertEqual(layer._jump.originY, 100, 'double saut: originY n\'a pas changé');

  app.state.pressedKeys.clear();
}

section('Saut - Drift horizontal');
resetState();
{
  const layer = app.createLayer(null, 'JumpDriftTest');
  layer.bindings.jump.key = ' ';
  layer.bindings.right.key = 'd';
  layer.jump.height = 50;
  layer.jump.duration = 0.5;
  layer.jump.hSpeed = 3;
  layer.x = 100;
  layer.y = 200;

  app.state.fps = 30;

  // Jump + move right
  app.state.pressedKeys.add(' ');
  app.state.pressedKeys.add('d');
  app.processBindings();

  assert(layer.x > 100, 'saut drift: x augmente vers la droite');
  assert(app.isJumping(layer), 'saut drift: saut actif');

  app.state.pressedKeys.clear();
}

section('Saut - isJumping');
resetState();
{
  const layer = app.createLayer(null, 'IsJumpingTest');
  assertEqual(app.isJumping(layer), false, 'isJumping: false quand pas de saut');

  layer._jump.active = true;
  assertEqual(app.isJumping(layer), true, 'isJumping: true quand saut actif');

  layer._jump.active = false;
  assertEqual(app.isJumping(layer), false, 'isJumping: false après fin du saut');
}

section('Sprite Sheet Configuration');
resetState();
{
  const layer = app.createLayer(null, 'SpriteTest');
  const s = layer.sprite;

  assertEqual(s.enabled, false, 'sprite: désactivé par défaut');
  assertEqual(s.frameWidth, 32, 'sprite: largeur frame par défaut = 32');
  assertEqual(s.frameHeight, 32, 'sprite: hauteur frame par défaut = 32');
  assertEqual(s.frameCount, 1, 'sprite: 1 frame par défaut');
  assertEqual(s.columns, 1, 'sprite: 1 colonne par défaut');
  assertEqual(s.animSpeed, 8, 'sprite: vitesse animation = 8 fps');
  assertEqual(s.loop, true, 'sprite: boucle activée par défaut');
  assertEqual(s.currentFrame, 0, 'sprite: frame courante = 0');
}

section('Playback State');
resetState();
{
  assertEqual(app.state.playing, false, 'État initial: pas en lecture');
  assertEqual(app.state.recording, false, 'État initial: pas en enregistrement');
  assertEqual(app.state.currentFrame, 0, 'État initial: frame 0');
  assertEqual(app.state.fps, 30, 'État initial: 30 fps');
}

// ── Functional Tests ───────────────────────────

section('Test Fonctionnel: Workflow complet');
resetState();
{
  // 1. Create an asset (simulated)
  const fakeImg = new Image();
  fakeImg.width = 64;
  fakeImg.height = 64;
  const bgAsset = { id: app.genId(), name: 'background.png', img: fakeImg, src: 'data:,' };
  app.state.assets.push(bgAsset);

  const charImg = new Image();
  charImg.width = 32;
  charImg.height = 32;
  const charAsset = { id: app.genId(), name: 'character.png', img: charImg, src: 'data:,' };
  app.state.assets.push(charAsset);

  assertEqual(app.state.assets.length, 2, 'Workflow: 2 assets chargés');

  // 2. Create layers
  const bgLayer = app.createLayer(bgAsset.id, 'Background');
  const charLayer = app.createLayer(charAsset.id, 'Character');

  assertEqual(app.state.layers.length, 2, 'Workflow: 2 calques créés');
  assert(bgLayer.assetId === bgAsset.id, 'Workflow: fond lié au bon asset');
  assert(charLayer.assetId === charAsset.id, 'Workflow: perso lié au bon asset');

  // 3. Configure bindings
  charLayer.bindings.right.key = 'd';
  charLayer.bindings.left.key = 'a';
  charLayer.bindings.up.key = 'w';
  charLayer.bindings.down.key = 's';

  assertEqual(charLayer.bindings.right.key, 'd', 'Workflow: binding droite = d');

  // 4. Set initial positions
  bgLayer.x = 0; bgLayer.y = 0;
  charLayer.x = 100; charLayer.y = 200;

  // 5. Record keyframes
  app.addKeyframe(bgLayer.id, 0);
  app.addKeyframe(charLayer.id, 0);

  charLayer.x = 300; charLayer.y = 150;
  app.addKeyframe(charLayer.id, 60);

  charLayer.x = 500; charLayer.y = 200;
  app.addKeyframe(charLayer.id, 120);

  assertEqual(app.state.keyframes[charLayer.id].length, 3, 'Workflow: 3 keyframes pour le perso');

  // 6. Verify animation at frame 60
  app.applyKeyframesAtFrame(60);
  assertEqual(charLayer.x, 300, 'Workflow: perso à x=300 à frame 60');

  // 7. Verify interpolation at frame 30
  app.applyKeyframesAtFrame(30);
  assertApprox(charLayer.x, 200, 0.5, 'Workflow: perso à x≈200 à frame 30 (interpolé)');

  // 8. Layer visibility toggle
  bgLayer.visible = false;
  assertEqual(bgLayer.visible, false, 'Workflow: fond masqué');
  bgLayer.visible = true;

  // 9. Layer z-order
  assert(charLayer.z > bgLayer.z, 'Workflow: perso au dessus du fond');
}

section('Test Fonctionnel: Multi-calques et keyframes');
resetState();
{
  // Create 3 layers
  const l1 = app.createLayer(null, 'Layer1');
  const l2 = app.createLayer(null, 'Layer2');
  const l3 = app.createLayer(null, 'Layer3');

  // Set keyframes for each
  l1.x = 0; app.addKeyframe(l1.id, 0);
  l1.x = 100; app.addKeyframe(l1.id, 30);

  l2.x = 50; app.addKeyframe(l2.id, 0);
  l2.x = 200; app.addKeyframe(l2.id, 30);

  l3.x = 100; app.addKeyframe(l3.id, 0);
  l3.x = 0; app.addKeyframe(l3.id, 30);

  // Apply at midpoint
  app.applyKeyframesAtFrame(15);
  assertApprox(l1.x, 50, 0.5, 'Multi-calque: L1 x≈50 à frame 15');
  assertApprox(l2.x, 125, 0.5, 'Multi-calque: L2 x≈125 à frame 15');
  assertApprox(l3.x, 50, 0.5, 'Multi-calque: L3 x≈50 à frame 15');

  // Remove middle layer
  app.removeLayer(l2.id);
  assertEqual(app.state.layers.length, 2, 'Multi-calque: suppression OK');
  assertEqual(app.state.keyframes[l2.id], undefined, 'Multi-calque: keyframes supprimés avec le calque');
}

section('Test Fonctionnel: Canvas rendering (smoke test)');
resetState();
{
  // Should not throw with no layers
  let noError = true;
  try {
    app.renderCanvas();
  } catch (e) {
    noError = false;
  }
  assert(noError, 'renderCanvas: pas d\'erreur avec 0 calques');

  // Should not throw with layers but no assets
  app.createLayer(null, 'Empty');
  try {
    app.renderCanvas();
  } catch (e) {
    noError = false;
  }
  assert(noError, 'renderCanvas: pas d\'erreur avec calque sans asset');
}

section('Test Fonctionnel: Rec Mode');
resetState();
{
  const layer = app.createLayer(null, 'RecTest');
  layer.bindings.right.key = 'ArrowRight';
  layer.x = 0;
  layer.y = 0;

  app.state.recMode = true;
  app.state.playing = true;
  app.state.currentFrame = 10;

  app.state.pressedKeys.add('ArrowRight');
  app.processBindings();

  assertEqual(layer.x, 4, 'Rec mode: mouvement appliqué');
  assert(app.state.keyframes[layer.id].length > 0, 'Rec mode: keyframe auto-enregistré');
  assertEqual(app.state.keyframes[layer.id][0].frame, 10, 'Rec mode: keyframe à la bonne frame');

  app.state.pressedKeys.clear();
  app.state.recMode = false;
  app.state.playing = false;
}

// ── Summary ────────────────────────────────────

const summary = document.createElement('div');
summary.className = `summary ${failed === 0 ? 'all-pass' : 'has-fail'}`;
summary.textContent = `${passed + failed} tests — ${passed} passés, ${failed} échoués`;
results.appendChild(summary);

console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
