// New York, 1920s: dusk from a high Midtown office window, looking down an
// avenue with an elevated railway, period traffic and setback skyscrapers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, G, M, rng, jitter, makeSky, makeClouds, makeSmoke } from '../util.js';
import { STYLES, makeReveal } from '../frames.js';

const GY = -70;
const LIME = 0xcfc3a9, BRICK = 0x8e4d3c, TAN = 0xa58f70, STEEL = 0x2b3330;
const CELL_U = 3.2, CELL_V = 3.7, CELLS = 8;

// Window texture: colour map (white wall, dark glass) + emissive map (lit panes).
function makeWindowMaps() {
  const S = 512, c = S / CELLS;
  const colorC = document.createElement('canvas'); colorC.width = colorC.height = S;
  const g = colorC.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) {
    g.fillStyle = '#e7e2da'; g.fillRect(i * c, j * c + c - 6, c, 6);          // spandrel line
    g.fillStyle = '#323a45'; g.fillRect(i * c + 17, j * c + 12, 30, 38);
    g.fillStyle = '#4a5562'; g.fillRect(i * c + 17, j * c + 12, 30, 3);
  }
  const emC = document.createElement('canvas'); emC.width = emC.height = S;
  const e = emC.getContext('2d'); e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const lit = new Array(CELLS * CELLS).fill(false), r = rng(1925);
  const hues = ['#ffd38a', '#ffc870', '#ffe2a8', '#f6b860', '#fff0c8'];
  function paint(k) {
    const i = k % CELLS, j = Math.floor(k / CELLS);
    e.fillStyle = '#000'; e.fillRect(i * c + 17, j * c + 12, 30, 38);
    if (lit[k]) { e.fillStyle = r.pick(hues); e.fillRect(i * c + 18, j * c + 13, 28, 36); if (r() < 0.4) { e.fillStyle = 'rgba(0,0,0,0.55)'; e.fillRect(i * c + 18, j * c + 13, 28, 14 + r() * 10); } }
  }
  for (let k = 0; k < lit.length; k++) { lit[k] = r() < 0.38; paint(k); }
  const map = new THREE.CanvasTexture(colorC), emissiveMap = new THREE.CanvasTexture(emC);
  for (const t of [map, emissiveMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
  // keep the overall lit fraction steady while individual windows switch on and off
  function tick() {
    const k = Math.floor(r() * lit.length), on = lit.filter(Boolean).length / lit.length;
    lit[k] = on < 0.42 ? true : (on > 0.5 ? false : !lit[k]);
    paint(k); emissiveMap.needsUpdate = true;
  }
  return { map, emissiveMap, tick };
}

// Box with window-grid UVs scaled to real size, plus a vertex colour.
function windowBox(parts, x, y, z, w, h, d, color, r) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const ou = Math.floor(r() * CELLS) / CELLS, ov = Math.floor(r() * CELLS) / CELLS;
  const span = CELLS;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; let u = uv.getX(i), v = uv.getY(i);
    if (f === 2 || f === 3) { uv.setXY(i, 0.01, 0.01); continue; }
    const fw = f < 2 ? d : w;
    uv.setXY(i, ou + u * fw / CELL_U / span, ov + v * h / CELL_V / span);
  }
  g.translate(x, y + h / 2, z);
  const ng = g.toNonIndexed(), n = ng.attributes.position.count, col = new Float32Array(n * 3), c = color.isColor ? color : new THREE.Color(color);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  parts.push(ng);
}

export function createNewYork() {
  const scene = new THREE.Scene();
  const root = new THREE.Group(); root.matrixAutoUpdate = false; scene.add(root);
  const r = rng(1929), b = new Builder(), glow = new Builder(), parts = [];

  scene.fog = new THREE.Fog(0xb88a82, 140, 1050);
  root.add(makeSky({ top: 0x1b2850, horizon: 0xf09a5e, bottom: 0x4e4258, sunDir: new THREE.Vector3(0.92, 0.04, -0.38), sunColor: 0xffc27a, glow: 0.9, sunDisc: false }));
  root.add(new THREE.HemisphereLight(0x8c98d0, 0x3a2e30, 0.9));
  const sun = new THREE.DirectionalLight(0xffa868, 1.8); sun.position.set(300, 50, -140); sun.target.position.set(0, GY, -300); root.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x7f8fd0, 0.5); fill.position.set(-200, 120, 200); root.add(fill);

  root.add(makeReveal(STYLES.ny, 0.38, 0xb9ad94));

  // ---- Our facade: exterior ledge with a pigeon ----
  b.box(0, -0.86, -0.62, 3.4, 0.14, 0.55, LIME);
  b.box(0, -0.98, -0.45, 3.6, 0.12, 0.3, 0xbcae92);
  for (const sx of [-1, 1]) b.box(sx * 1.25, -3.5, -0.42, 0.5, 6, 0.1, 0xc2b59a); // pilasters below
  b.box(0, -3.5, -0.38, 8, 2.6, 0.04, 0xbdb096);

  // ---- Streets ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3a3f }));
  ground.position.y = GY; root.add(ground);
  const AVES = [-520, -260, 0, 260, 520], AVE_W = 30, ST_W = 18;
  const STREETS = []; for (let z = -9; z > -1000; z -= 80) STREETS.push(z);

  // City blocks between the avenues and streets
  for (let ai = 0; ai < AVES.length - 1; ai++) {
    const x0 = AVES[ai] + AVE_W / 2, x1 = AVES[ai + 1] - AVE_W / 2;
    for (let si = 0; si < STREETS.length - 1; si++) {
      const z0 = STREETS[si] - ST_W / 2, z1 = STREETS[si + 1] + ST_W / 2; // z0 > z1
      b.box((x0 + x1) / 2, GY, (z0 + z1) / 2, x1 - x0, 0.25, z0 - z1, 0x77736d); // sidewalk slab
      const depth = z0 - z1 - 6, nearAve = x => Math.min(Math.abs(x - 0), 400) ;
      for (const half of [0, 1]) {
        let x = x0 + 3;
        while (x < x1 - 8) {
          const w = Math.min(r.range(14, 34), x1 - 3 - x), cx = x + w / 2, dd = depth / 2 - 1, cz = half ? z1 + 3 + dd / 2 : z0 - 3 - dd / 2;
          const central = 1 - Math.min(1, nearAve(cx) / 400) * 0.55, distK = 1 - Math.min(1, -cz / 1000) * 0.3;
          let h = r.range(18, 60) * central * distK;
          const tower = r() < 0.12 * central;
          const color = jitter(r.pick([BRICK, BRICK, LIME, TAN, 0x9a5a44, 0xbfb39c, 0x7d4a3a]), 0.45, r);
          if (tower) h = r.range(90, 175);
          let bw = w, bd = dd, by = GY;
          const tiers = tower ? 3 + Math.floor(r() * 2) : (h > 40 ? 2 : 1);
          for (let k = 0; k < tiers; k++) {
            const th = k === 0 ? h * (tower ? 0.45 : 0.75) : h * (tower ? 0.55 : 0.25) / (tiers - 1);
            windowBox(parts, cx, by, cz, bw, th, bd, color, r);
            b.box(cx, by + th, cz, bw + 0.6, 0.6, bd + 0.6, 0xd8ccb2);   // cornice
            by += th; bw *= 0.72; bd *= 0.72;
          }
          if (r() < 0.35 && !tower) { // rooftop water tower
            const wx = cx + r.range(-w / 4, w / 4), wz = cz + r.range(-dd / 4, dd / 4);
            for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(wx + lx * 1.1, by + 0.6, wz + lz * 1.1, 0.2, 3, 0.2, 0x3a2e26);
            b.cyl(wx, by + 3.6, wz, 1.8, 3.6, 0x6e5440); b.add(G.cone, 0x4c3a2e, M(wx, by + 7.2, wz, 0, 2, 1.6, 2));
          }
          if (tower && r() < 0.6) b.roof(cx, by, cz, bw * 1.2, bw * 0.9, bd * 1.2, r() < 0.5 ? 0x6f9c87 : 0x8a8a8a);
          x += w + r.range(0, 2);
        }
      }
    }
  }
  // Two landmark towers with deco crowns
  const hero = (x, z, w, h, color, crown) => {
    let bw = w, by = GY;
    const tiers = [0.55, 0.2, 0.12, 0.08];
    tiers.forEach(f => { windowBox(parts, x, by, z, bw, h * f, bw, color, r); by += h * f; b.box(x, by, z, bw + 0.8, 0.8, bw + 0.8, 0xe0d6c0); bw *= 0.78; });
    if (crown === 'spire') {
      for (let k = 0; k < 5; k++) { const s = bw * (1 - k * 0.17); b.add(G.dome, 0xc9cfd4, M(x, by + k * 4, z, 0, s / 2, 5, s / 2)); glow.box(x, by + k * 4 + 2.4, z, s * 1.02, 0.5, s * 1.02, 0xfff1c0); }
      b.add(G.cone, 0xd5dade, M(x, by + 20, z, 0, 1.4, 34, 1.4));
    } else {
      b.roof(x, by, z, bw * 1.1, bw * 1.3, bw * 1.1, 0xb59a52);
      glow.add(G.sphere, 0xffd47a, M(x, by + bw * 1.3, z, 0, 1, 1, 1));
    }
  };
  hero(-110, -335, 30, 270, 0xbdb7ab, 'spire');
  hero(140, -560, 34, 230, 0xa99a80, 'pyramid');

  // Streetlamps along our avenue
  for (let z = -18; z > -900; z -= 26) for (const sx of [-1, 1]) {
    b.box(sx * 15.8, GY, z, 0.25, 5.5, 0.25, 0x1e2422);
    glow.add(G.sphere, 0xffe3a0, M(sx * 15.8, GY + 5.8, z, 0, 0.45, 0.45, 0.45));
  }
  // Elevated railway over the avenue's left lanes
  const ELX = -10, ELY = GY + 9;
  b.box(ELX, ELY, -470, 7.5, 1.3, 960, STEEL);
  for (const dx of [-1.7, 1.7]) b.box(ELX + dx, ELY + 1.3, -470, 0.2, 0.2, 960, 0x6a6a66);
  for (let z = -12; z > -950; z -= 18) for (const dx of [-3.3, 3.3]) { b.box(ELX + dx, GY, z, 0.5, 9, 0.5, STEEL); b.box(ELX, ELY - 0.6, z, 7.5, 0.6, 0.6, STEEL); }

  const statics = b.build(); root.add(statics);
  const glowMesh = glow.build({ material: new THREE.MeshBasicMaterial({ vertexColors: true }) }); root.add(glowMesh);
  const win = makeWindowMaps();
  const bldMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: win.map, emissiveMap: win.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.1 });
  const bld = new THREE.Mesh(mergeGeometries(parts), bldMat); bld.matrixAutoUpdate = false; root.add(bld);

  // ---- Motion ----
  // Pigeon on the ledge
  const pigeon = new THREE.Group();
  const pb = new Builder();
  pb.add(G.sphere, 0x7c8088, M(0, 0.09, 0, 0, 0.09, 0.075, 0.13)); pb.add(G.box, 0x5e626a, M(0, 0.1, 0.13, 0, 0.08, 0.03, 0.12, -0.4));
  pb.box(-0.025, 0, 0, 0.012, 0.03, 0.012, 0xc06a5a); pb.box(0.025, 0, 0, 0.012, 0.03, 0.012, 0xc06a5a);
  const pBody = pb.build(); pigeon.add(pBody);
  const head = new THREE.Group(); const hb = new Builder(); hb.add(G.sphere, 0x6a7380, M(0, 0, 0, 0, 0.05, 0.05, 0.05)); hb.add(G.cone, 0xd0a060, M(0, 0, -0.07, 0, 0.012, 0.03, 0.012, -Math.PI / 2)); head.add(hb.build()); head.position.set(0, 0.18, -0.1); pigeon.add(head);
  pigeon.position.set(0.55, -0.72, -0.75); pigeon.rotation.y = 0.6; root.add(pigeon);

  // Trains on the El
  const carGeo = (() => { const tb = new Builder(); tb.box(0, 0, 0, 2.7, 3, 14, 0x3e5a40); tb.box(0, 3, 0, 2.4, 0.35, 13.6, 0x2a3a2c); tb.box(0, -0.5, -5, 2, 0.5, 2, 0x111111); tb.box(0, -0.5, 5, 2, 0.5, 2, 0x111111); return tb.build().geometry; })();
  const carWinGeo = new THREE.BoxGeometry(2.74, 0.8, 12).translate(0, 1.9, 0);
  const trains = [];
  for (const [dx, dir, off] of [[-1.7, -1, 0], [1.7, 1, 480]]) {
    const tg = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const car = new THREE.Mesh(carGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      car.position.z = k * 14.6; tg.add(car);
      const w = new THREE.Mesh(carWinGeo, new THREE.MeshBasicMaterial({ color: 0xffd98c })); w.position.z = k * 14.6; tg.add(w);
    }
    tg.position.set(ELX + dx, ELY + 1.5, 0); root.add(tg);
    trains.push({ g: tg, dir, off, v: 15 });
  }

  // Automobiles: instanced bodies + lamps
  const cb = new Builder();
  cb.box(0, 0.35, 0, 1.7, 0.9, 4.2, 0xffffff); cb.box(0, 1.25, 0.5, 1.6, 0.95, 2.1, 0xffffff);
  const carBodyGeo = cb.build().geometry;
  const lb = new Builder();
  for (const sx of [-0.6, 0.6]) { lb.box(sx, 0.75, -2.15, 0.28, 0.28, 0.1, 0xfff0c0); lb.box(sx, 0.7, 2.13, 0.22, 0.18, 0.06, 0xff2a18); }
  const lampGeo = lb.build().geometry;
  const lanes = [
    { axis: 'z', at: -3, dir: -1, n: 13, v: 10 }, { axis: 'z', at: 3.5, dir: 1, n: 13, v: 9 },
    { axis: 'z', at: 9.5, dir: 1, n: 10, v: 11.5 }, { axis: 'z', at: -10, dir: -1, n: 9, v: 8.5 },
    { axis: 'x', at: -7, dir: 1, n: 7, v: 9 }, { axis: 'x', at: -11.5, dir: -1, n: 7, v: 10 },
    { axis: 'x', at: -167, dir: 1, n: 6, v: 9 }, { axis: 'x', at: -327, dir: -1, n: 6, v: 9 },
  ];
  const nCars = lanes.reduce((a, l) => a + l.n, 0);
  const bodies = new THREE.InstancedMesh(carBodyGeo, new THREE.MeshLambertMaterial({ flatShading: true }), nCars);
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), nCars);
  bodies.frustumCulled = lamps.frustumCulled = false;
  const cars = []; const cc = new THREE.Color();
  lanes.forEach(l => { for (let i = 0; i < l.n; i++) { cars.push({ l, off: i / l.n + r.range(-0.02, 0.02) }); bodies.setColorAt(cars.length - 1, cc.set(r.pick([0x141414, 0x141414, 0x141414, 0x1f3a2a, 0x4a1a1a, 0x1c2440, 0xd9a92a, 0xd9a92a]))); } });
  root.add(bodies, lamps);

  // Biplane circling over the skyline
  const plane = new THREE.Group();
  const bp = new Builder();
  bp.box(0, -0.5, 0, 1, 1, 7, 0xb8392c); bp.box(0, 0.5, -1.2, 10, 0.15, 1.6, 0xe6dccb); bp.box(0, -0.6, -1.2, 9, 0.15, 1.5, 0xe6dccb);
  bp.box(0, -0.2, 3.2, 3.4, 0.12, 0.9, 0xe6dccb); bp.box(0, -0.2, 3.3, 0.12, 1.4, 0.9, 0xb8392c);
  for (const sx of [-3.5, 3.5]) bp.box(sx, -0.55, -1.2, 0.08, 1.1, 0.08, 0x333333);
  plane.add(bp.build()); plane.scale.setScalar(1.3); root.add(plane);

  const steam = makeSmoke({ sources: [new THREE.Vector3(42, GY + 66, -95), new THREE.Vector3(-60, GY + 58, -170), new THREE.Vector3(70, GY + 80, -250), new THREE.Vector3(-30, GY + 48, -60)], perSource: 14, rise: 1.6, spread: 1.2, size: 6, color: 0xf0e2d8, opacity: 0.35, life: 10 });
  root.add(steam.points);
  const clouds = makeClouds({ count: 9, seed: 21, color: 0xe7a184, emissive: 0x6a3a40, speed: 3, yMin: 140, yMax: 260 });
  root.add(clouds.group);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0);
  let tickAcc = 0;
  function update(t, dt) {
    // trains
    for (const tr of trains) {
      const L = 1000, k = ((t * tr.v + tr.off) % L + L) % L;
      tr.g.position.z = tr.dir < 0 ? 40 - k : -960 + k;
    }
    // cars
    cars.forEach((c, i) => {
      const l = c.l, L = l.axis === 'z' ? 980 : 820, k = ((c.off * L + t * l.v) % L + L) % L;
      if (l.axis === 'z') { p.set(l.at, GY, l.dir < 0 ? 30 - k : -950 + k); q.setFromAxisAngle(yAxis, l.dir < 0 ? 0 : Math.PI); }
      else { p.set(l.dir > 0 ? -410 + k : 410 - k, GY, l.at); q.setFromAxisAngle(yAxis, l.dir > 0 ? -Math.PI / 2 : Math.PI / 2); }
      m4.compose(p, q, s1); bodies.setMatrixAt(i, m4); lamps.setMatrixAt(i, m4);
    });
    bodies.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true;
    // biplane
    const a = t * 0.06;
    plane.position.set(Math.cos(a) * 190, 55 + Math.sin(t * 0.3) * 6, -300 + Math.sin(a) * 120);
    plane.rotation.set(0, -a + Math.PI, 0.35);
    // pigeon head bob
    head.position.z = -0.1 - Math.max(0, Math.sin(t * 3)) * 0.04;
    head.rotation.y = Math.sin(t * 0.7) * 0.6;
    steam.update(dt); clouds.update(dt);
    tickAcc += dt; while (tickAcc > 0.35) { tickAcc -= 0.35; win.tick(); }
  }
  return { key: 'ny', scene, root, update, title: 'New York', date: '1920s', blurb: 'Dusk over Midtown. The El rattles down the avenue and office lights flicker on.' };
}
