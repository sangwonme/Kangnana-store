// 동우 군단 — drag left/right; gates multiply your crowd of 동우s; dodge peels and hammers; smash the giant banana boss.
// Each level is generated from its number, and the boss HP is derived from the best possible gate choices, so it's always winnable.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const MODELS = '../shared/assets/models/', PROPS = '../shared/assets/props/';
const HALF = 3.2;          // half track width
const SPEED = 8.5;
const MAXV = 300;          // most 동우s drawn at once (the counter can go higher)
const SPACING = 0.17;
const SAVE = 'da-save';

// ------------------------------------------------------------------------------------------------ renderer
const app = $('app');
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.fog = new THREE.Fog(0xd8efff, 40, 95);
scene.add(new THREE.HemisphereLight(0xeaf6ff, 0xffd9e8, 1.4));
const sun = new THREE.DirectionalLight(0xfff3df, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 10, bottom: -10, near: 1, far: 40 });
sun.shadow.bias = -0.001;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 160);
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app);
resize();

// ------------------------------------------------------------------------------------------------ utils
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = (a, b) => a + Math.random() * (b - a);
function fit(obj, size, by = 'y') {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(size / (by === 'y' ? s.y : Math.max(s.x, s.z)));
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
  const g = new THREE.Group(); g.add(obj);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) { o.material.roughness = 0.8; o.material.metalness = 0; } } });
  return g;
}
function label(text, bg, fg = '#fff', w = 256, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.font = `bold ${h * 0.62}px Jua, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 12; x.strokeStyle = '#2b2140'; x.strokeText(text, w / 2, h / 2 + 4);
  x.fillStyle = fg; x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function popText(text, world, cls) {
  const v = world.clone().project(camera);
  const el = document.createElement('div');
  el.className = `pop ${cls}`; el.textContent = text;
  el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 900);
}
function flash(color = '#fff') { const f = $('flash'); f.style.background = color; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
const bump = (id) => { const e = $(id); e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); };

/** A pre-baked low-poly crowd frame (tools/games/bake_crowd.py) -> one geometry, feet at 0, facing away from the camera. */
function crowdFrame(root, height) {
  root.updateMatrixWorld(true);
  let geo = null, mat = null;
  root.traverse((o) => { if (o.isMesh && !geo) { geo = o.geometry.clone().applyMatrix4(o.matrixWorld); mat = o.material; } });
  geo.computeBoundingBox();
  const b = geo.boundingBox, s = height / (b.max.y - b.min.y);
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.scale(s, s, s);
  geo.rotateY(Math.PI);   // run away from the camera
  mat.roughness = 0.8; mat.metalness = 0;
  return { geo, mat };
}

// ------------------------------------------------------------------------------------------------ state
let save = { level: 1, bank: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE) || '{}')); } catch {}
if (params.has('level')) save.level = +params.get('level');
const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch {} };
const S = { mode: 'title', count: 1, x: 0, tx: 0, z: 0, t: 0, hp: 0, bossZ: 0, tick: 0, reward: 0, shake: 0 };
let P, crowdA, crowdB, level = null, track = null;
const clones = [];      // { p: Vector3 (world xz), phase }
const sound = new Sound();
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ level generation
const apply = (op, c) => (op.k === '+' ? c + op.v : op.k === 'x' ? c * op.v : op.k === '-' ? Math.max(0, c - op.v) : Math.ceil(c / op.v));
const opText = (op) => ({ '+': '+', x: '×', '-': '−', '/': '÷' }[op.k] + op.v);
const isGood = (op) => op.k === '+' || op.k === 'x';

function makeLevel(n) {
  const r = rng(n * 7919 + 13);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const rows = [];
  const len = 120 + Math.min(n, 20) * 6;
  let z = -16, k = 0;
  while (z > -len) {
    const kind = k % 2 === 0 ? 'gate' : pick(['coins', 'peel', 'hammer', 'coins', 'peel']);
    if (kind === 'gate') {
      const good = () => (r() < 0.55 ? { k: '+', v: Math.round(4 + r() * 8 + n * 1.5) } : { k: 'x', v: r() < 0.8 ? 2 : 3 });
      const bad = () => (r() < 0.6 ? { k: '-', v: Math.round(5 + r() * 10 + n * 1.2) } : { k: '/', v: 2 });
      let ops = r() < 0.7 - Math.min(0.3, n * 0.02) ? [good(), good()] : [good(), bad()];
      if (r() < 0.5) ops.reverse();
      if (k === 0) ops = [{ k: '+', v: 5 + n }, { k: 'x', v: 2 }];
      rows.push({ type: 'gate', z, ops });
    } else if (kind === 'coins') {
      rows.push({ type: 'coins', z, x: (r() * 2 - 1) * 2.2 });
    } else if (kind === 'peel') {
      const cnt = 1 + Math.floor(r() * Math.min(3, 1 + n / 3));
      for (let i = 0; i < cnt; i++) rows.push({ type: 'peel', z: z - i * 2.5, x: (r() * 2 - 1) * 2.4 });
    } else {
      rows.push({ type: 'hammer', z, side: r() < 0.5 ? -1 : 1, speed: 1.6 + r() * 0.8 + n * 0.05, phase: r() * 6.28 });
    }
    z -= 13 + r() * 3;
    k++;
  }
  // best achievable crowd (ignoring hazards) -> boss HP that a good run beats with room to spare
  let best = 1;
  for (const row of rows) if (row.type === 'gate') best = Math.max(apply(row.ops[0], best), apply(row.ops[1], best));
  const hp = Math.max(8, Math.round(best * Math.min(0.7, 0.42 + n * 0.025)));
  return { n, rows, bossZ: z - 12, hp, best };
}

// ------------------------------------------------------------------------------------------------ track building
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#fff6fa'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#ffd6e6'; x.fillRect(0, 0, 64, 32);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function buildTrack(L) {
  if (track) scene.remove(track.group);
  const g = new THREE.Group();
  const len = -L.bossZ + 40;
  const tex = stripeTexture(); tex.repeat.set(1, len / 4);
  const road = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.6, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  road.position.set(0, -0.3, -len / 2 + 14); road.receiveShadow = true;
  g.add(road);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, len), new THREE.MeshStandardMaterial({ color: 0xff8fb8, roughness: 0.7 }));
    rail.position.set(s * (HALF + 0.15), 0.05, road.position.z); rail.castShadow = true;
    g.add(rail);
  }
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.6, 40), new THREE.MeshStandardMaterial({ color: 0xffe58a, roughness: 0.8 }));
  arena.position.set(0, -0.3, L.bossZ); arena.receiveShadow = true;
  g.add(arena);
  const rows = [];
  for (const row of L.rows) {
    const o = { ...row, done: false, group: new THREE.Group() };
    o.group.position.z = row.z;
    if (row.type === 'gate') {
      o.panels = row.ops.map((op, i) => {
        const good = isGood(op);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF - 0.1, 2.2), new THREE.MeshBasicMaterial({
          map: label(opText(op), good ? 'rgba(63,168,255,0.55)' : 'rgba(255,90,110,0.55)'), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        m.position.set((i === 0 ? -1 : 1) * HALF / 2, 1.3, 0);
        o.group.add(m);
        return m;
      });
      for (const x of [-HALF, 0, HALF]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        post.position.set(x, 1.3, 0); post.castShadow = true;
        o.group.add(post);
      }
    } else if (row.type === 'coins') {
      o.coins = [];
      for (let i = 0; i < 6; i++) {
        const b = P.banana.clone(); b.position.set(row.x, 0.5, -i * 0.9);
        o.group.add(b); o.coins.push({ m: b, got: false });
      }
    } else if (row.type === 'peel') {
      const p = P.peel.clone(); p.position.x = row.x; p.rotation.y = Math.random() * 6;
      o.group.add(p);
    } else {
      const pivot = new THREE.Group(); pivot.position.set(row.side * HALF, 0, 0);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x8a6bff }));
      post.position.y = 0.6; pivot.add(post);
      const arm = new THREE.Group(); arm.position.y = 0.55; pivot.add(arm);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: 0xff5a6e }));
      bar.position.x = 1.8; bar.castShadow = true; arm.add(bar);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0xffd93b }));
      head.rotation.z = Math.PI / 2; head.position.x = 3.4; head.castShadow = true; arm.add(head);
      o.group.add(pivot); o.arm = arm; o.pivotX = row.side * HALF;
    }
    g.add(o.group);
    rows.push(o);
  }
  const boss = P.boss.clone();
  boss.position.set(0, 0, L.bossZ - 1.5);
  g.add(boss);
  scene.add(g);
  track = { group: g, rows, boss, bossScale: 1 };
}

// ------------------------------------------------------------------------------------------------ crowd
const slot = (i) => { const r = SPACING * Math.sqrt(i) * 1.9, a = i * 2.39996; return [Math.cos(a) * r, Math.sin(a) * r]; };
const radius = () => SPACING * Math.sqrt(Math.min(S.count, MAXV)) * 1.9 + 0.25;
function syncClones() {
  const n = Math.min(S.count, MAXV);
  while (clones.length < n) clones.push({ p: new THREE.Vector3(S.x + rand(-0.2, 0.2), 0, S.z + rand(-0.2, 0.2)), phase: Math.random() });
  if (clones.length > n) clones.length = n;
}
function kill(i, fx = true) {
  const c = clones[i];
  if (!c) return;
  if (fx) burst(c.p.clone().setY(0.4), 0xffffff, 3, 0.12);
  clones[i] = clones[clones.length - 1];
  clones.pop();
  const ratio = S.count > MAXV ? S.count / MAXV : 1;
  S.count = Math.max(0, Math.round(S.count - ratio));
}
function updateCrowd(dt) {
  syncClones();
  const k = 1 - Math.exp(-9 * dt);
  let ia = 0, ib = 0;   // only existing 동우s are drawn (InstancedMesh.count), split between the two run frames
  for (let i = 0; i < clones.length; i++) {
    const c = clones[i];
    const [ox, oz] = slot(i);
    c.p.x += (S.x + ox - c.p.x) * k;
    c.p.z += (S.z + oz - c.p.z) * k;
    const run = S.mode === 'run' || S.mode === 'boss';
    const f = run ? (S.t * 5 + c.phase) % 1 : 0;
    const bob = run ? Math.abs(Math.sin((S.t * 5 + c.phase) * Math.PI)) * 0.08 : 0;
    _m.compose(_v.set(c.p.x, bob, c.p.z), _q.identity(), _s.setScalar(1));
    if (f < 0.5) crowdA.setMatrixAt(ia++, _m); else crowdB.setMatrixAt(ib++, _m);
  }
  crowdA.count = ia; crowdB.count = ib;
  crowdA.instanceMatrix.needsUpdate = crowdB.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------ particles
const parts = [];
const partGeo = new THREE.SphereGeometry(1, 8, 6);
function burst(at, color, n, size = 0.15) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(at); m.scale.setScalar(size * rand(0.6, 1.3));
    scene.add(m);
    parts.push({ m, v: new THREE.Vector3(rand(-3, 3), rand(2, 6), rand(-3, 3)), life: rand(0.4, 0.8), g: 14 });
  }
}
function bananaShower(at, n) {
  for (let i = 0; i < n; i++) {
    const m = P.banana.clone(); m.position.copy(at).add(new THREE.Vector3(rand(-1, 1), rand(0, 2), rand(-1, 1)));
    scene.add(m);
    parts.push({ m, v: new THREE.Vector3(rand(-7, 7), rand(6, 14), rand(-2, 7)), life: rand(1.4, 2.2), g: 16, spin: rand(-12, 12) });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    p.v.y -= p.g * dt;
    p.m.position.addScaledVector(p.v, dt);
    if (p.spin) { p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt; }
    if (p.m.position.y < 0 && p.v.y < 0) { p.m.position.y = 0; p.v.y *= -0.35; p.v.x *= 0.6; p.v.z *= 0.6; }
    if (p.m.material?.opacity !== undefined && !p.spin) p.m.material.opacity = Math.min(1, p.life * 3);
    if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); }
  }
}

// ------------------------------------------------------------------------------------------------ gameplay
function startLevel() {
  level = makeLevel(save.level);
  buildTrack(level);
  Object.assign(S, { mode: 'run', count: 1, x: 0, tx: 0, z: 0, hp: level.hp, bossZ: level.bossZ, tick: 0, reward: 0 });
  clones.length = 0;
  $('lv').textContent = save.level;
  $('result').hidden = true; $('title').hidden = true;
  $('crowd').hidden = false; $('hp').hidden = false;
  $('hp').textContent = level.hp;
  sound.loop('bgm', 0); sound.loopVolume('bgm', 0.5, 0.3);
  sound.loop('saw', 0);
  sound.play('tap', { vol: 0.7 });
}

function crowdText() {
  const c = $('crowd');
  if (c.textContent !== String(S.count)) { c.textContent = S.count; c.classList.remove('big'); void c.offsetWidth; c.classList.add('big'); }
}

function passGate(row) {
  row.done = true;
  const side = S.x < 0 ? 0 : 1;
  const op = row.ops[side];
  const before = S.count;
  S.count = apply(op, S.count);
  const at = new THREE.Vector3(S.x, 2.2, row.z);
  const good = S.count >= before;
  popText(opText(op), at, good ? 'good' : 'bad');
  sound.play(good ? 'good' : 'bad', { vol: 0.8, rate: good ? 1 + Math.min(0.5, S.count / 400) : 1 });
  row.panels[side].material.opacity = 0.15;
  if (good) { flash('rgba(120,200,255,.6)'); burst(at, 0x8dd8ff, 14, 0.12); }
  else { flash('rgba(255,90,110,.5)'); S.shake = 0.25; for (let i = clones.length - 1; i >= Math.min(S.count, MAXV); i--) burst(clones[i].p.clone().setY(0.4), 0xff9db0, 2, 0.1); }
  syncClones();
  crowdText();
  if (S.count <= 0) lose();
}

function hazards(dt) {
  for (const row of track.rows) {
    if (Math.abs(row.z - S.z) > 6) continue;
    if (row.type === 'gate' && !row.done && S.z <= row.z) passGate(row);
    else if (row.type === 'coins') {
      for (const c of row.coins) {
        if (c.got) continue;
        const wz = row.z + c.m.position.z;
        if (Math.abs(wz - S.z) < 0.8 && Math.abs(row.x - S.x) < radius() + 0.3) {
          c.got = true; c.m.visible = false; save.bank++; S.reward++;
          $('bn').textContent = save.bank; bump('bank');
          sound.play('step', { vol: 0.35, rate: 1 + (S.reward % 12) * 0.06 });
        }
      }
    } else if (row.type === 'peel') {
      for (let i = clones.length - 1; i >= 0; i--) {
        const c = clones[i];
        if (Math.hypot(c.p.x - row.x, c.p.z - row.z) < 0.7) { kill(i); sound.play('pop', { vol: 0.5, rate: rand(0.9, 1.3) }); }
      }
    } else if (row.type === 'hammer') {
      const a = row.phase + S.t * row.speed;
      row.arm.rotation.y = a;
      // bar segment in world xz (pivot at the rail, length 3.8)
      const dx = Math.cos(a), dz = -Math.sin(a);   // the arm's local +x after rotation.y = a
      const ax = row.pivotX, az = row.z;
      for (let i = clones.length - 1; i >= 0; i--) {
        const c = clones[i];
        const px = c.p.x - ax, pz = c.p.z - az;
        const tt = Math.max(0, Math.min(3.8, px * dx + pz * dz));
        if (Math.hypot(px - dx * tt, pz - dz * tt) < 0.42) { kill(i); sound.play('pop', { vol: 0.5, rate: rand(0.9, 1.3) }); }
      }
    }
  }
  // keep the arms spinning even when far
  for (const row of track.rows) if (row.type === 'hammer') row.arm.rotation.y = row.phase + S.t * row.speed;
  const near = track.rows.some((r) => r.type === 'hammer' && Math.abs(r.z - S.z) < 10);
  sound.loopVolume('saw', near ? 0.35 : 0, 0.2);
  crowdText();
  if (S.count <= 0 && S.mode === 'run') lose();
}

function bossFight(dt) {
  S.tick -= dt;
  if (S.tick > 0) return;
  S.tick = 0.05;
  const d = Math.max(1, Math.ceil(Math.min(S.count, S.hp) / 30));
  S.count = Math.max(0, S.count - d); S.hp -= d;
  // trim the drawn crowd to the new count (the count itself is already updated)
  for (let i = clones.length - 1; i >= Math.min(S.count, MAXV); i--) burst(clones[i].p.clone().setY(0.4), 0xffffff, 2, 0.12);
  syncClones();
  $('hp').textContent = Math.max(0, S.hp);
  crowdText();
  track.bossScale = 0.88;
  if (Math.random() < 0.35) sound.play('boss_hit', { vol: 0.6, rate: rand(0.9, 1.2) });
  burst(new THREE.Vector3(rand(-1.5, 1.5), rand(1, 3.5), S.bossZ + 0.5), 0xffe066, 2, 0.14);
  if (S.hp <= 0) win();
  else if (S.count <= 0) lose();
}

function win() {
  S.mode = 'result';
  const bonus = S.count * 2 + 10;
  save.bank += bonus; S.reward += bonus;
  save.level++;
  persist();
  track.boss.visible = false;
  bananaShower(new THREE.Vector3(0, 2.5, S.bossZ), 60);
  flash('rgba(255,230,120,.9)'); S.shake = 0.6;
  sound.loopVolume('saw', 0); sound.play('win', { vol: 0.9 }); sound.play('ppanana', { vol: 1.1 });
  setTimeout(() => sound.play('coins', { vol: 0.8 }), 500);
  $('hp').hidden = true;
  setTimeout(() => showResult(true), 1300);
}

function lose() {
  S.mode = 'result';
  S.count = 0; clones.length = 0;
  persist();
  sound.loopVolume('saw', 0); sound.play('lose', { vol: 0.8 });
  flash('rgba(255,90,110,.6)'); S.shake = 0.4;
  setTimeout(() => showResult(false), 900);
}

function showResult(won) {
  $('res-big').textContent = won ? '👑' : '💥';
  $('gain').textContent = `+${S.reward}`;
  $('res-gain').hidden = !won && S.reward === 0;
  $('next').textContent = won ? '▶' : '↻';
  $('result').hidden = false;
  $('crowd').hidden = true;
  $('bn').textContent = save.bank;
  if (won) {
    // count the reward up for the dopamine
    let shown = 0; const target = S.reward, el = $('gain');
    const iv = setInterval(() => { shown = Math.min(target, shown + Math.ceil(target / 25)); el.textContent = `+${shown}`; if (shown >= target) clearInterval(iv); }, 40);
  }
}

// ------------------------------------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(0, 7, 10), camLook = new THREE.Vector3(0, 0, -6);
function updateCamera(dt) {
  const boss = S.mode === 'boss' || (S.mode === 'result' && S.z < S.bossZ + 12);
  const want = boss ? new THREE.Vector3(S.x * 0.3, 7.5, S.z + 11) : new THREE.Vector3(S.x * 0.35, 7.2, S.z + 9.5);
  const look = boss ? new THREE.Vector3(0, 1.5, S.bossZ) : new THREE.Vector3(S.x * 0.3, 0, S.z - 7);
  const k = 1 - Math.exp(-5 * dt);
  camPos.lerp(want, k); camLook.lerp(look, k);
  camera.position.copy(camPos);
  if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt); camera.position.x += rand(-1, 1) * S.shake * 0.5; camera.position.y += rand(-1, 1) * S.shake * 0.5; }
  camera.lookAt(camLook);
  sun.position.set(camLook.x + 4, 12, camLook.z + 8); sun.target.position.copy(camLook);
}

function placeLabels() {
  const v = new THREE.Vector3(S.x, 1.3 + Math.min(1.2, radius() * 0.3), S.z).project(camera);
  const c = $('crowd'); c.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; c.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
  if (track) {
    const h = new THREE.Vector3(0, 5.6, S.bossZ - 1.5).project(camera);
    const e = $('hp'); e.style.left = `${(h.x * 0.5 + 0.5) * 100}%`; e.style.top = `${(-h.y * 0.5 + 0.5) * 100}%`;
    e.style.visibility = h.z < 1 ? 'visible' : 'hidden';
  }
}

// ------------------------------------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  S.t += dt;
  if (P) {
    if (S.mode === 'run') {
      S.z -= SPEED * dt;
      S.x += (S.tx - S.x) * (1 - Math.exp(-14 * dt));
      hazards(dt);
      if (S.z <= S.bossZ + 5 && S.mode === 'run') { S.mode = 'boss'; sound.play('clash', { vol: 0.8 }); }
    } else if (S.mode === 'boss') {
      S.z += ((S.bossZ + 3) - S.z) * (1 - Math.exp(-3 * dt));
      S.x += (0 - S.x) * (1 - Math.exp(-4 * dt));
      bossFight(dt);
    }
    if (track) {
      track.bossScale += (1 - track.bossScale) * (1 - Math.exp(-10 * dt));
      track.boss.scale.set(1 / track.bossScale, track.bossScale, 1 / track.bossScale);
      track.boss.rotation.y = Math.sin(S.t * 2) * 0.15;
      for (const row of track.rows) if (row.coins) for (const c of row.coins) c.m.rotation.y += dt * 3;
    }
    updateCrowd(dt);
    updateParts(dt);
    updateCamera(dt);
    placeLabels();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------------------------------------ input
let drag = null;
app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#mute, #result')) return;
  sound.unlock();
  if (S.mode === 'title' && P) startLevel();
  drag = e.clientX;
});
addEventListener('pointermove', (e) => {
  if (drag === null || S.mode !== 'run') return;
  const w = app.clientWidth;
  S.tx += ((e.clientX - drag) / w) * HALF * 2.6;
  drag = e.clientX;
  const lim = HALF - Math.min(radius(), HALF - 0.4);
  S.tx = Math.max(-lim, Math.min(lim, S.tx));
});
addEventListener('pointerup', () => { drag = null; });
addEventListener('keydown', (e) => {
  if (S.mode === 'title' && P && (e.key === ' ' || e.key === 'Enter')) { startLevel(); return; }
  if (S.mode === 'run' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    S.tx += e.key === 'ArrowLeft' ? -1.6 : 1.6;
    const lim = HALF - Math.min(radius(), HALF - 0.4);
    S.tx = Math.max(-lim, Math.min(lim, S.tx));
  }
});
$('next').addEventListener('click', () => { sound.unlock(); startLevel(); });
$('mute').addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.muted); $('mute').textContent = sound.muted ? '🔇' : '🔊'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) sound.ctx.suspend(); else sound.ctx.resume(); });

// ------------------------------------------------------------------------------------------------ boot
$('mute').textContent = sound.muted ? '🔇' : '🔊';
$('bn').textContent = save.bank;
$('lv').textContent = save.level;
const gl = new GLTFLoader();
const prop = (n) => gl.loadAsync(`${PROPS}${n}.glb`).then((g) => g.scene);
const scn = (n) => gl.loadAsync(`${MODELS}${n}.glb`).then((g) => g.scene);
const [c0, c1, banana, peel, boss, cloud, island] = await Promise.all([
  scn('dongwoo_crowd_0'), scn('dongwoo_crowd_1'), prop('banana'), prop('peel'), prop('boss'), prop('cloud'), prop('island'),
  sound.load(['bgm', 'good', 'bad', 'pop', 'saw', 'clash', 'boss_hit', 'win', 'lose', 'coins', 'step', 'tap', 'ppanana']),
]);
P = { banana: fit(banana, 0.5), peel: fit(peel, 1.2, 'max'), boss: fit(boss, 5.2) };
const fa = crowdFrame(c0, 0.62), fb = crowdFrame(c1, 0.62);
crowdA = new THREE.InstancedMesh(fa.geo, fa.mat, MAXV);
crowdB = new THREE.InstancedMesh(fb.geo, fb.mat, MAXV);
for (const c of [crowdA, crowdB]) { c.castShadow = true; c.frustumCulled = false; c.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(c); }
for (let i = 0; i < 10; i++) {
  const c = fit(cloud.clone(), rand(4, 8), 'max');
  c.position.set((Math.random() < 0.5 ? -1 : 1) * rand(HALF + 6, 24), rand(-10, 3), rand(-160, 10)); // never over the track
  scene.add(c);
}
for (let i = 0; i < 5; i++) {
  const c = fit(island.clone(), rand(5, 9), 'max');
  c.position.set((Math.random() < 0.5 ? -1 : 1) * rand(12, 22), rand(-14, -4), rand(-150, -10));
  scene.add(c);
}
// a preview track behind the title
level = makeLevel(save.level); buildTrack(level); syncClones();

window.game = {
  S, save, get level() { return level; }, startLevel,
  info: () => ({ mode: S.mode, lv: save.level, count: S.count, hp: S.hp, z: +S.z.toFixed(1), bank: save.bank, best: level?.best }),
  /** test helper: steer through the better gate of the next row */
  autopilot() {
    setInterval(() => {
      if (S.mode !== 'run') return;
      const g = track.rows.find((r) => r.type === 'gate' && !r.done);
      if (g) S.tx = apply(g.ops[0], S.count) >= apply(g.ops[1], S.count) ? -1.6 : 1.6;
    }, 100);
  },
};
if (params.has('autostart')) startLevel();
if (params.has('bot')) window.game.autopilot();
