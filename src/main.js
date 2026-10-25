// Magic Window: place portals on real walls (WebXR AR) or in a simulated gallery
// (preview mode) and look through them into living scenes from other eras.
//
// Rendering: every portal has an invisible mask that writes its own stencil id
// into the window opening. Each era scene is a real 3D world placed behind the
// wall and drawn only where the stencil matches, so moving the camera gives
// true window parallax for free.
import * as THREE from 'three';
import { STYLES, makeMask, makeFrame, outline } from './frames.js';
import { createRome } from './eras/rome.js';
import { createConstantinople } from './eras/constantinople.js';
import { createNewYork } from './eras/newyork.js';
import { canvasTex, Builder, G, M } from './util.js';

const $ = s => document.querySelector(s);
const ERA_ORDER = ['rome', 'byz', 'ny'];
const ERA_FACTORY = { rome: createRome, byz: createConstantinople, ny: createNewYork };
const MAX_PORTALS = { preview: 9, ar: 6 };
const params = new URLSearchParams(location.search);

// ---------- error surface (helps when testing on a phone) ----------
function showError(msg) { const e = $('#error'); e.textContent = msg; e.hidden = false; console.error(msg); }
window.addEventListener('error', e => showError('Error: ' + (e.message || e)));
window.addEventListener('unhandledrejection', e => showError('Error: ' + (e.reason?.message || e.reason)));

// ---------- renderer / camera / scenes ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
let quality = 'high';
try { quality = localStorage.getItem('mw-quality') || 'high'; } catch {}
const applyQuality = () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1));
  renderer.xr.setFramebufferScaleFactor(quality === 'high' ? 1 : 0.7);
  $('#btn-quality').textContent = quality === 'high' ? 'HD' : 'Lite';
};
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.setClearColor(0x000000, 0);
$('#stage').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 2000);
const roomScene = new THREE.Scene();
roomScene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7a68, 1.4));
const keyLight = new THREE.DirectionalLight(0xfff0dc, 1.4); keyLight.position.set(1, 3, 2); roomScene.add(keyLight);
const portalsGroup = new THREE.Group(); roomScene.add(portalsGroup);

// ---------- preview gallery (simulated walls) ----------
const ROOM = { x: 1.8, zBack: 2.8, zEnd: -6.5, h: 3.1 };
const room = new THREE.Group(); roomScene.add(room);
const walls = [];
function roomMat(opts) {
  const m = new THREE.MeshLambertMaterial(opts);
  m.stencilWrite = true; m.stencilRef = 0; m.stencilFunc = THREE.EqualStencilFunc; // never draw over a window opening
  return m;
}
(function buildRoom() {
  const plaster = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e8e1d3'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60},${110 + Math.random() * 50},90,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6); }
  }, { repeat: true });
  plaster.repeat.set(3, 1.5);
  const wood = canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(28, ${38 + Math.random() * 10}%, ${34 + Math.random() * 8}%)`; g.fillRect(0, i * 32, w, 31); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, i * 32 + 31, w, 1); g.fillRect(Math.random() * w, i * 32, 1, 32); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,30,10,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 1); }
  }, { repeat: true });
  wood.repeat.set(2, 6);
  const wallMat = roomMat({ map: plaster });
  const L = ROOM.zBack - ROOM.zEnd, W = ROOM.x * 2, H = ROOM.h, cz = (ROOM.zBack + ROOM.zEnd) / 2;
  const mk = (geo, mat, pos, rotY, isWall, normal) => {
    const m = new THREE.Mesh(geo, mat); m.position.copy(pos); m.rotation.y = rotY; room.add(m);
    if (isWall) { m.userData.normal = normal; walls.push(m); }
    return m;
  };
  mk(new THREE.PlaneGeometry(L, H), wallMat, new THREE.Vector3(-ROOM.x, H / 2, cz), Math.PI / 2, true, new THREE.Vector3(1, 0, 0));
  mk(new THREE.PlaneGeometry(L, H), wallMat, new THREE.Vector3(ROOM.x, H / 2, cz), -Math.PI / 2, true, new THREE.Vector3(-1, 0, 0));
  mk(new THREE.PlaneGeometry(W, H), wallMat, new THREE.Vector3(0, H / 2, ROOM.zEnd), 0, true, new THREE.Vector3(0, 0, 1));
  mk(new THREE.PlaneGeometry(W, H), wallMat, new THREE.Vector3(0, H / 2, ROOM.zBack), Math.PI, true, new THREE.Vector3(0, 0, -1));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), roomMat({ map: wood }));
  floor.position.set(0, 0, cz); floor.userData.floor = true; room.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(Math.PI / 2), roomMat({ color: 0xf4efe6 }));
  ceil.position.set(0, H, cz); room.add(ceil);
  // trim: baseboards, crown moulding, ceiling lamps
  const tb = new Builder();
  for (const sx of [-1, 1]) { tb.box(sx * (ROOM.x - 0.01), 0, cz, 0.03, 0.14, L, 0x5b4636); tb.box(sx * (ROOM.x - 0.03), H - 0.1, cz, 0.08, 0.1, L, 0xf7f2e8); }
  for (const z of [ROOM.zEnd + 0.01, ROOM.zBack - 0.01]) { tb.box(0, 0, z, W, 0.14, 0.03, 0x5b4636); tb.box(0, H - 0.1, z, W, 0.1, 0.08, 0xf7f2e8); }
  room.add(tb.build());
  const lb = new Builder();
  for (let z = 1.5; z > ROOM.zEnd; z -= 2.6) lb.add(G.cyl, 0xfff3d6, M(0, H - 0.04, z, 0, 0.22, 0.04, 0.22));
  room.add(lb.build({ material: new THREE.MeshBasicMaterial({ vertexColors: true }) }));
  const pl = new THREE.PointLight(0xffe6c0, 6, 9, 1.5); pl.position.set(0, H - 0.4, -1); room.add(pl);
  const pl2 = new THREE.PointLight(0xffe6c0, 6, 9, 1.5); pl2.position.set(0, H - 0.4, -4.5); room.add(pl2);
})();

// ---------- eras ----------
const eras = {};
function prepareEra(era) {
  const mats = [];
  era.scene.traverse(o => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) {
      m.stencilWrite = true; m.stencilFunc = THREE.EqualStencilFunc; m.stencilRef = 1;
      m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp;
      mats.push(m);
    }
  });
  era.setRef = ref => { for (const m of mats) m.stencilRef = ref; };
  era.scene.matrixWorldAutoUpdate = true;
  return era;
}

// ---------- portals ----------
const portals = [];
let nextRefs = Array.from({ length: 254 }, (_, i) => i + 1);
function addPortal(eraKey, matrix, { animate = true, toast = true } = {}) {
  const max = MAX_PORTALS[mode];
  if (portals.length >= max) removePortal(portals[0]);
  const ref = nextRefs.shift();
  const anchor = new THREE.Group(); anchor.matrixAutoUpdate = false; anchor.matrix.copy(matrix);
  const visual = new THREE.Group();
  visual.add(makeMask(STYLES[eraKey], ref));
  visual.add(makeFrame(eraKey));
  anchor.add(visual); portalsGroup.add(anchor);
  const p = { era: eraKey, ref, anchor, visual, born: animate ? clock.elapsedTime : -10 };
  portals.push(p);
  visual.traverse(o => { o.userData.portal = p; });
  anchor.updateMatrixWorld(true);
  if (toast) showToast(eras[eraKey]);
  updateCount();
  return p;
}
function removePortal(p) {
  portalsGroup.remove(p.anchor);
  p.anchor.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  portals.splice(portals.indexOf(p), 1);
  nextRefs.unshift(p.ref);
  updateCount();
}
function clearPortals() { while (portals.length) removePortal(portals[0]); }

function poseMatrix(pos, z) {
  const up = new THREE.Vector3(0, 1, 0), x = new THREE.Vector3().crossVectors(up, z).normalize();
  return new THREE.Matrix4().makeBasis(x, up, z).setPosition(pos);
}

// ---------- UI ----------
let selectedEra = 'rome';
function buildPicker() {
  const wrap = $('#eras');
  ERA_ORDER.forEach(k => {
    const s = STYLES[k], btn = document.createElement('button');
    btn.className = 'era'; btn.dataset.era = k;
    btn.innerHTML = `<span class="era-swatch era-${k}"></span><span class="era-text"><b>${{ rome: 'Ancient Rome', byz: 'Constantinople', ny: 'New York' }[k]}</b><small>${s.date}</small></span>`;
    btn.addEventListener('click', () => selectEra(k));
    wrap.appendChild(btn);
  });
  selectEra('rome');
}
function selectEra(k) {
  selectedEra = k;
  document.querySelectorAll('.era').forEach(b => b.classList.toggle('on', b.dataset.era === k));
  rebuildReticle();
}
let toastTimer = 0;
function showToast(era) {
  if (!era) return;
  const t = $('#toast');
  t.innerHTML = `<b>${era.title}</b> <span>${era.date}</span><p>${era.blurb}</p>`;
  t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
}
function setHint(text) { $('#hint').textContent = text; }
function updateCount() { $('#btn-reset').disabled = portals.length === 0; }
function modal(html, buttons) {
  return new Promise(res => {
    const m = $('#modal'); m.querySelector('.modal-body').innerHTML = html;
    const row = m.querySelector('.modal-actions'); row.innerHTML = '';
    buttons.forEach(([label, value, primary]) => {
      const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary';
      b.onclick = () => { m.hidden = true; res(value); }; row.appendChild(b);
    });
    m.hidden = false;
  });
}
// Taps on the UI must not also place a portal in AR
document.querySelectorAll('.ui-block').forEach(el => el.addEventListener('beforexrselect', e => e.preventDefault()));

// ---------- preview controls ----------
let mode = 'preview';
const look = { yaw: 0, pitch: -0.04 }, keys = {};
const glide = { target: null };
camera.position.set(0, 1.6, 1.9);
let drag = null;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', e => { if (mode !== 'preview') return; drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', e => {
  if (!drag || mode !== 'preview') return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  const s = e.pointerType === 'touch' ? 0.006 : 0.004;
  look.yaw += dx * s; look.pitch = THREE.MathUtils.clamp(look.pitch + dy * s, -1.2, 1.2);
});
renderer.domElement.addEventListener('pointerup', e => {
  if (!drag || mode !== 'preview') return;
  const tap = drag.moved < 8; drag = null;
  if (tap) previewTap(e.clientX, e.clientY);
});
renderer.domElement.addEventListener('wheel', e => { if (mode !== 'preview') return; const f = new THREE.Vector3(-Math.sin(look.yaw), 0, -Math.cos(look.yaw)); glide.target = clampRoom(camera.position.clone().addScaledVector(f, -e.deltaY * 0.004)); }, { passive: true });
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
function clampRoom(v) { v.x = THREE.MathUtils.clamp(v.x, -ROOM.x + 0.45, ROOM.x - 0.45); v.z = THREE.MathUtils.clamp(v.z, ROOM.zEnd + 0.45, ROOM.zBack - 0.45); v.y = 1.6; return v; }
function previewTap(cx, cy) {
  ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // tapping an existing window swaps it to the selected era
  const pHits = raycaster.intersectObjects(portals.map(p => p.visual), true);
  const wHits = raycaster.intersectObjects([...walls, ...room.children.filter(c => c.userData.floor)], false);
  if (pHits.length && (!wHits.length || pHits[0].distance <= wHits[0].distance + 0.05)) {
    const p = pHits[0].object.userData.portal;
    if (p && p.era !== selectedEra) { const m = p.anchor.matrix.clone(); removePortal(p); addPortal(selectedEra, m); }
    else if (p) showToast(eras[p.era]);
    return;
  }
  if (!wHits.length) return;
  const h = wHits[0];
  if (h.object.userData.floor) { glide.target = clampRoom(h.point.clone()); return; }
  const n = h.object.userData.normal.clone();
  const pos = h.point.clone().addScaledVector(n, 0.004);
  pos.y = THREE.MathUtils.clamp(pos.y, 1.05, ROOM.h - 1.0);
  // keep the window clear of corners
  if (Math.abs(n.x) > 0.5) pos.z = THREE.MathUtils.clamp(pos.z, ROOM.zEnd + 0.8, ROOM.zBack - 0.8);
  else pos.x = THREE.MathUtils.clamp(pos.x, -ROOM.x + 0.8, ROOM.x - 0.8);
  // too close to an existing window on that wall → replace it
  for (const p of [...portals]) {
    const pp = new THREE.Vector3().setFromMatrixPosition(p.anchor.matrix);
    if (pp.distanceTo(pos) < 1.15) removePortal(p);
  }
  addPortal(selectedEra, poseMatrix(pos, n));
}
function updatePreview(dt) {
  const f = new THREE.Vector3(-Math.sin(look.yaw), 0, -Math.cos(look.yaw)), rgt = new THREE.Vector3(Math.cos(look.yaw), 0, -Math.sin(look.yaw));
  const mv = new THREE.Vector3();
  if (keys['w'] || keys['arrowup']) mv.add(f); if (keys['s'] || keys['arrowdown']) mv.sub(f);
  if (keys['d'] || keys['arrowright']) mv.add(rgt); if (keys['a'] || keys['arrowleft']) mv.sub(rgt);
  if (mv.lengthSq() > 0) { glide.target = null; camera.position.addScaledVector(mv.normalize(), 1.8 * dt); clampRoom(camera.position); }
  if (glide.target) { camera.position.lerp(glide.target, 1 - Math.exp(-dt * 3)); if (camera.position.distanceTo(glide.target) < 0.01) glide.target = null; }
  camera.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
}
function seedPreview() {
  clearPortals();
  addPortal('rome', poseMatrix(new THREE.Vector3(-ROOM.x + 0.004, 1.55, -1.0), new THREE.Vector3(1, 0, 0)), { animate: false, toast: false });
  addPortal('byz', poseMatrix(new THREE.Vector3(ROOM.x - 0.004, 1.55, -3.4), new THREE.Vector3(-1, 0, 0)), { animate: false, toast: false });
  addPortal('ny', poseMatrix(new THREE.Vector3(0, 1.55, ROOM.zEnd + 0.004), new THREE.Vector3(0, 0, 1)), { animate: false, toast: false });
}

// ---------- AR ----------
let hitTestSource = null, lastHit = null, xrSession = null;
const reticle = new THREE.Group(); reticle.matrixAutoUpdate = false; reticle.visible = false; roomScene.add(reticle);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.115, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
const floorReticle = new THREE.Group(); floorReticle.add(ring); floorReticle.matrixAutoUpdate = false; floorReticle.visible = false; roomScene.add(floorReticle);
function rebuildReticle() {
  reticle.clear();
  const col = new THREE.Color(STYLES[selectedEra].accent);
  const o = outline(STYLES[selectedEra], col); o.renderOrder = 10; reticle.add(o);
  const cross = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 24), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true }));
  cross.renderOrder = 10; reticle.add(cross);
}

async function startAR() {
  let ok = false;
  try { ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'); } catch {}
  if (!ok) {
    const inFrame = window.self !== window.top;
    await modal(`<h2>AR isn't available here</h2><p>Magic Window's AR mode needs <b>Chrome on an ARCore-supported Android phone</b>, opened from the app's own HTTPS address${inFrame ? ' (not inside an embedded preview like this one)' : ''}.</p><p>You can still explore every era here in preview mode: drag to look around, tap the floor to walk, tap a wall to hang a window.</p>`, [['Got it', true, true]]);
    return;
  }
  let seen = false; try { seen = localStorage.getItem('mw-safety') === '1'; } catch {}
  if (!seen) {
    const go = await modal(`<h2>Before you start</h2><p>You'll be moving around while looking at your phone. Clear a space, watch for furniture and stairs, and stay aware of people around you.</p><p>Point your phone at a wall and move slowly so it can find the surface.</p>`, [['Cancel', false], ['I\'m ready', true, true]]);
    if (!go) return;
    try { localStorage.setItem('mw-safety', '1'); } catch {}
  }
  try {
    const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: $('#ui') } });
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    xrSession = session; mode = 'ar';
    document.body.classList.add('ar');
    room.visible = false; clearPortals();
    const viewer = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewer });
    session.addEventListener('select', onSelect);
    session.addEventListener('end', onSessionEnd);
    setHint('Slowly scan a wall with your phone…');
  } catch (err) { showError('Could not start AR: ' + err.message); }
}
function onSessionEnd() {
  hitTestSource = null; xrSession = null; mode = 'preview'; lastHit = null;
  document.body.classList.remove('ar'); reticle.visible = floorReticle.visible = false;
  room.visible = true; seedPreview();
  setHint('Drag to look · tap the floor to walk · tap a wall to hang a window');
  onResize();
}
function onSelect() {
  if (!lastHit) { setHint('No surface yet. Keep scanning the wall slowly.'); return; }
  addPortal(selectedEra, lastHit.matrix);
  setHint(`Window placed. Walk side to side to look around inside it.`);
}
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), camPos = new THREE.Vector3();
function updateAR(frame) {
  if (!hitTestSource || !frame) return;
  const ref = renderer.xr.getReferenceSpace(), hits = frame.getHitTestResults(hitTestSource);
  renderer.xr.getCamera().getWorldPosition(camPos);
  let wall = null, any = null;
  for (const h of hits) {
    const pose = h.getPose(ref); if (!pose) continue;
    _m.fromArray(pose.transform.matrix); _m.decompose(_p, _q, _s);
    _n.set(0, 1, 0).applyQuaternion(_q);
    const rec = { pos: _p.clone(), n: _n.clone() };
    if (!any) any = rec;
    if (Math.abs(rec.n.y) < 0.35) { wall = rec; break; }
  }
  if (!any) { reticle.visible = floorReticle.visible = false; lastHit = null; return; }
  let mat;
  if (wall) {
    const z = wall.n.clone(); z.y = 0; z.normalize();
    if (z.dot(camPos.clone().sub(wall.pos)) < 0) z.negate();
    mat = poseMatrix(wall.pos.clone().addScaledVector(z, 0.005), z);
    floorReticle.visible = false;
    setHint('Wall found. Tap to open a window here.');
  } else {
    // no wall under the crosshair: stand the window upright at eye level, facing you
    const z = camPos.clone().sub(any.pos); z.y = 0; z.normalize();
    const pos = any.pos.clone(); pos.y = any.n.y > 0.5 ? camPos.y - 0.05 : pos.y;
    mat = poseMatrix(pos, z);
    floorReticle.matrix.makeTranslation(any.pos.x, any.pos.y, any.pos.z); floorReticle.visible = true;
    setHint('Aim at a wall, or tap to stand the window here.');
  }
  reticle.matrix.copy(mat); reticle.visible = true;
  lastHit = { matrix: mat, isWall: !!wall };
}

// ---------- render loop ----------
const clock = new THREE.Clock();
const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere(), tmpV = new THREE.Vector3(), camWorld = new THREE.Vector3();
let fpsEl = params.has('fps') ? $('#fps') : null, fpsAcc = 0, fpsN = 0;
if (fpsEl) fpsEl.hidden = false;

function portalVisible(p, cam) {
  sphere.center.setFromMatrixPosition(p.anchor.matrixWorld); sphere.radius = 1.4;
  if (!frustum.intersectsSphere(sphere)) return false;
  cam.getWorldPosition(camWorld);
  tmpV.set(0, 0, 1).transformDirection(p.anchor.matrixWorld);
  return tmpV.dot(camWorld.sub(sphere.center)) > -0.05;
}

function render(time, frame) {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  if (mode === 'preview') updatePreview(dt); else updateAR(frame);

  // portal opening animation
  for (const p of portals) {
    const k = THREE.MathUtils.clamp((t - p.born) / 0.7, 0, 1), e = 1 - Math.pow(1 - k, 3);
    p.visual.scale.set(0.02 + 0.98 * e, 0.02 + 0.98 * e, 1);
  }
  const used = new Set(portals.map(p => p.era));
  for (const k of used) eras[k].update(t, dt);

  renderer.autoClear = true;
  renderer.render(roomScene, camera);
  renderer.autoClear = false;

  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(projView);
  for (const p of portals) {
    if (!portalVisible(p, cam)) continue;
    const era = eras[p.era];
    era.root.matrix.copy(p.anchor.matrixWorld); era.root.matrixWorldNeedsUpdate = true;
    era.setRef(p.ref);
    renderer.render(era.scene, camera);
  }
  if (fpsEl) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fpsEl.textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = fpsN = 0; } }
}

function onResize() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ---------- boot ----------
async function boot() {
  buildPicker(); applyQuality();
  const status = $('#loading-status');
  const names = { rome: 'Ancient Rome', byz: 'Constantinople', ny: 'New York' };
  for (const k of ERA_ORDER) {
    status.textContent = `Building ${names[k]}…`;
    await new Promise(r => setTimeout(r, 30));
    eras[k] = prepareEra(ERA_FACTORY[k]());
  }
  // warm up shaders so the first frame doesn't stutter
  status.textContent = 'Opening windows…';
  await new Promise(r => setTimeout(r, 30));
  seedPreview();
  for (const k of ERA_ORDER) renderer.compile(eras[k].scene, camera);
  renderer.setAnimationLoop(render);
  $('#loading').classList.add('done');
  setHint('Drag to look · tap the floor to walk · tap a wall to hang a window');

  let arOk = false; try { arOk = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'); } catch {}
  $('#btn-ar').classList.toggle('muted', !arOk);
  $('#btn-ar').addEventListener('click', () => (mode === 'ar' ? xrSession?.end() : startAR()));
  $('#btn-reset').addEventListener('click', () => { clearPortals(); if (mode === 'preview') setHint('Tap a wall to hang a window'); });
  $('#btn-quality').addEventListener('click', () => { quality = quality === 'high' ? 'lite' : 'high'; try { localStorage.setItem('mw-quality', quality); } catch {} applyQuality(); onResize(); });
  $('#btn-exit').addEventListener('click', () => xrSession?.end());
}
boot().catch(err => showError('Startup failed: ' + err.message));

// Installable app: register the offline service worker when served from the real site
if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
// test hooks (used by automated checks)
window.__mw = { camera, look, portals, eras, setView(x, z, yaw, pitch = 0) { camera.position.set(x, 1.6, z); look.yaw = yaw; look.pitch = pitch; glide.target = null; } };
