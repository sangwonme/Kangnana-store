// 나나섬 — a tiny floating island. Bananas ripen, you tap them into the basket, 동우 naps; spend bananas on cozy things.
// No fail state, no timers to beat. Progress is saved; bananas keep ripening while you're away.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const params = new URLSearchParams(location.search);
const MODELS = '../shared/assets/models/', PROPS = '../shared/assets/props/';
const GROW = 13;           // seconds for a banana to ripen
const SAVE = 'ni-save';

// shop: what you can add, where it goes, what it costs (each purchase costs the next number)
const ITEMS = [
  { id: 'tree', costs: [5, 20, 60], spots: [[-1.7, -0.9], [1.8, -0.7], [0.2, -2.1]] },
  { id: 'flowers', costs: [8, 18, 40], spots: [[-2.2, 0.9], [2.1, 1.0], [-0.9, -2.0]] },
  { id: 'lantern', costs: [14, 32], spots: [[-2.35, -0.75], [2.45, -0.15]] },
  { id: 'pond', costs: [30], spots: [[1.45, 1.45]] },
  { id: 'hammock', costs: [45], spots: [[-2.0, -0.1]] },
  { id: 'hut', costs: [90], spots: [[-0.6, -1.4]] },
  { id: 'friend', costs: [150], spots: [[0.8, 0.6]] },
];
const SIZE = { tree: 2.3, flowers: 0.9, lantern: 1.15, pond: 1.5, hammock: 1.7, hut: 1.7, basket: 0.55 };

// ------------------------------------------------------------------------------------------------ renderer
const app = $('app');
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const hemi = new THREE.HemisphereLight(0xe4f2ff, 0xffe2c8, 1.3);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(5, 9, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.03;
scene.add(hemi, sun);
const camera = new THREE.PerspectiveCamera(36, 9 / 16, 0.1, 100);
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app);
resize();

const world = new THREE.Group();   // the island and everything on it (rotated by dragging)
scene.add(world);

// ------------------------------------------------------------------------------------------------ helpers
function fit(obj, size, by = 'max') {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3());
  const k = size / (by === 'y' ? s.y : Math.max(s.x, s.z));
  obj.scale.multiplyScalar(k);
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
  const g = new THREE.Group(); g.add(obj);
  return g;
}
function soft(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    if (m) { m.roughness = 0.85; m.metalness = 0; m.envMapIntensity = 0.7; }
  });
  return root;
}
function heartTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ff6f91';
  x.beginPath(); x.moveTo(32, 56);
  x.bezierCurveTo(4, 36, 6, 8, 32, 20); x.bezierCurveTo(58, 8, 60, 36, 32, 56); x.fill();
  return new THREE.CanvasTexture(c);
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(255,240,150,.6)'); g.addColorStop(1, 'rgba(255,230,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------------------------------------ state
let save = { n: 0, owned: {}, t: Date.now() };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE) || '{}')); } catch {}
if (params.has('reset')) save = { n: 0, owned: {}, t: Date.now() };
if (params.has('n')) save.n = +params.get('n');
const persist = () => { save.t = Date.now(); try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch {} };

let P, island, surfaceY = 0, ground;   // props + island
const trees = [];       // { root, bananas: [{ mesh, mat, born, ripe, picked }] }
const decor = [];       // placed items
const lanterns = [];
let dongwoo, friend, basket, basketPile = [];
const flying = [];      // bananas flying into the basket
const sprites = [];     // hearts/sparkles
const sound = new Sound();
let started = false, clockT = 0;
const hearts = heartTexture(), glow = glowTexture();

// ------------------------------------------------------------------------------------------------ island surface
const ray = new THREE.Raycaster();
function groundAt(x, z) {
  ray.set(new THREE.Vector3(x, 20, z).applyMatrix4(world.matrixWorld), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(ground, true)[0];
  return hit ? world.worldToLocal(hit.point.clone()).y : surfaceY;
}

// ------------------------------------------------------------------------------------------------ bananas
function addTree(x, z, instant) {
  const root = fit(soft(P.btree.clone()), SIZE.tree, 'y');
  root.position.set(x, groundAt(x, z) - 0.03, z);
  root.rotation.y = rand(0, Math.PI * 2);
  world.add(root);
  const t = { root, bananas: [] };
  for (let i = 0; i < 3; i++) {
    const b = P.banana.clone();
    const mat = [];
    b.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.castShadow = true; mat.push(o.material); } });
    const g = fit(b, 0.46, 'y');
    const a = (i / 3) * Math.PI * 2 + 0.5;
    g.position.set(Math.cos(a) * 0.36, SIZE.tree * 0.5, Math.sin(a) * 0.36);
    g.rotation.set(0.3, -a, 0.5);
    g.userData.banana = { tree: t, i };
    root.add(g);
    t.bananas.push({ mesh: g, mat, born: clockT - (instant ? GROW : rand(0, GROW * 0.6)), ripe: false, picked: false });
  }
  trees.push(t);
  if (!instant) pop(root);
  return t;
}

function growBananas(dt) {
  for (const t of trees) for (const b of t.bananas) {
    if (b.picked) continue;
    const k = Math.min(1, (clockT - b.born) / GROW);
    const s = 0.35 + 0.65 * k;
    b.mesh.scale.setScalar(b.ripe ? 1 + Math.sin(clockT * 4 + b.mesh.id) * 0.06 : s);
    const c = new THREE.Color(0x7fc24a).lerp(new THREE.Color(0xffffff), k);
    for (const m of b.mat) m.color.copy(c);
    if (k >= 1 && !b.ripe) {
      b.ripe = true;
      if (started) sound.play('ripen', { vol: 0.35, rate: rand(0.9, 1.2) });
      sparkle(b.mesh.getWorldPosition(new THREE.Vector3()), 0xfff3a0, 4);
    }
  }
}

function harvest(b, by = 'tap') {
  if (!b || b.picked || !b.ripe) return false;
  b.picked = true;
  const from = b.mesh.getWorldPosition(new THREE.Vector3());
  b.mesh.visible = false;
  const fly = P.banana.clone();
  const g = fit(fly, 0.3, 'y');
  scene.add(g);
  g.position.copy(from);
  const to = basket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.35, 0));
  flying.push({ g, from, to, t: 0, dur: 0.75, spin: rand(4, 8), b });
  sound.play('pluck', { vol: 0.7, rate: rand(0.95, 1.15) });
  if (by === 'tap') sparkle(from, 0xffe46b, 6);
  return true;
}

function landBanana(f) {
  scene.remove(f.g);
  save.n++;
  persist();
  sound.play('plop', { vol: 0.6, rate: rand(0.9, 1.1) });
  ui();
  const c = $('count'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  // regrow
  setTimeout(() => { f.b.picked = false; f.b.ripe = false; f.b.born = clockT; f.b.mesh.visible = true; }, 400);
}

function updateFlying(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt / f.dur;
    const k = Math.min(1, f.t);
    f.g.position.lerpVectors(f.from, f.to, k);
    f.g.position.y += Math.sin(k * Math.PI) * 1.4;
    f.g.rotation.z += f.spin * dt;
    if (k >= 1) { flying.splice(i, 1); landBanana(f); }
  }
  // a little pile in the basket
  const show = Math.min(basketPile.length, Math.min(save.n, 99) > 0 ? Math.ceil(Math.min(save.n, 30) / 5) : 0);
  basketPile.forEach((m, i) => { m.visible = i < show; });
}

// ------------------------------------------------------------------------------------------------ sprites (hearts, sparkles)
function sprite(tex, color, at, size, life, vel) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false }));
  s.position.copy(at); s.scale.setScalar(size);
  scene.add(s);
  sprites.push({ s, life, max: life, vel, size });
}
function sparkle(at, color, n) {
  for (let i = 0; i < n; i++) sprite(glow, color, at, rand(0.15, 0.3), rand(0.5, 0.9), new THREE.Vector3(rand(-1, 1), rand(0.5, 1.6), rand(-1, 1)));
}
function heartBurst(at) {
  for (let i = 0; i < 5; i++) sprite(hearts, 0xffffff, at.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0, rand(-0.2, 0.2))), rand(0.22, 0.34), rand(1, 1.5), new THREE.Vector3(rand(-0.3, 0.3), rand(0.7, 1.2), 0));
}
function updateSprites(dt) {
  for (let i = sprites.length - 1; i >= 0; i--) {
    const p = sprites[i];
    p.life -= dt;
    p.s.position.addScaledVector(p.vel, dt);
    p.vel.multiplyScalar(Math.exp(-1.5 * dt));
    p.s.material.opacity = Math.min(1, p.life / p.max * 2);
    if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); sprites.splice(i, 1); }
  }
}
function pop(obj) {
  obj.userData.popT = 0;
  obj.scale.setScalar(0.01);
  popping.push(obj);
}
const popping = [];
function updatePops(dt) {
  for (let i = popping.length - 1; i >= 0; i--) {
    const o = popping[i];
    o.userData.popT += dt * 2.2;
    const t = Math.min(1, o.userData.popT);
    const u = t - 1; // ease-out-back: overshoots a little, then settles
    o.scale.setScalar(Math.max(0.01, 1 + 2.70158 * u * u * u + 1.70158 * u * u));
    if (t >= 1) { o.scale.setScalar(1); popping.splice(i, 1); }
  }
}

// ------------------------------------------------------------------------------------------------ characters
class Buddy {
  constructor(gltf, height) {
    this.model = cloneSkinned(gltf.scene);
    soft(this.model);
    this.model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.root = fit(this.model, height, 'y');
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = Object.fromEntries(gltf.animations.map((c) => [c.name, this.mixer.clipAction(c)]));
    this.cur = null;
    this.target = null;
    this.state = 'idle';
    this.timer = rand(1, 3);
    world.add(this.root);
    this.play('idle');
  }
  play(name, { once = false, fade = 0.3 } = {}) {
    const a = this.actions[name] || this.actions.idle;
    if (!a) return 0;
    if (this.cur === a && !once) return a.getClip().duration;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (this.cur) a.crossFadeFrom(this.cur, fade, false);
    a.play(); this.cur = a;
    return a.getClip().duration;
  }
  walkTo(x, z, then) {
    this.target = new THREE.Vector3(x, 0, z); this.then = then; this.state = 'walk';
    this.play(this.actions.stroll && Math.random() < 0.4 ? 'stroll' : 'walk');
  }
  update(dt) {
    this.mixer.update(dt);
    const p = this.root.position;
    if (this.state === 'walk') {
      const d = this.target.clone().sub(p).setY(0);
      const dist = d.length();
      if (dist < 0.06) { this.state = 'idle'; this.target = null; this.play('idle'); this.then?.(); return; }
      const step = Math.min(dist, 0.55 * dt);
      p.addScaledVector(d.normalize(), step);
      let dy = Math.atan2(d.x, d.z) - this.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.root.rotation.y += dy * Math.min(1, dt * 6);
    }
    p.y = groundAt(p.x, p.z);
    this.timer -= dt;
  }
  face(x, z) { this.root.rotation.y = Math.atan2(x - this.root.position.x, z - this.root.position.z); }
}

const isNight = () => { const h = params.has('hour') ? +params.get('hour') : new Date().getHours() + new Date().getMinutes() / 60; return h < 6.5 || h >= 19; };

function brain(b, dt) {
  if (b.state !== 'idle' || b.timer > 0 || b.busy) return;
  const r = Math.random();
  const ripe = trees.flatMap((t) => t.bananas.filter((x) => x.ripe && !x.picked));
  const ham = decor.find((d) => d.id === 'hammock');
  if (b === dongwoo && ripe.length && r < 0.35) {
    const pick = ripe[Math.floor(Math.random() * ripe.length)];
    const tp = pick.mesh.parent.position;
    const a = Math.atan2(tp.z, tp.x);
    b.walkTo(tp.x - Math.cos(a) * 0.55, tp.z - Math.sin(a) * 0.55, () => {
      b.face(tp.x, tp.z);
      const d = b.play('pick', { once: true });
      b.busy = true;
      setTimeout(() => { harvest(pick, 'buddy'); }, d * 450);
      setTimeout(() => { b.busy = false; b.play('idle'); b.timer = rand(2, 4); }, d * 1000);
    });
  } else if (r < (isNight() ? 0.75 : 0.5)) {
    // rest: nap in the hammock if there is one, otherwise doze where he is
    const nap = isNight() || Math.random() < 0.4;
    if (b === dongwoo && ham && nap) {
      b.walkTo(ham.root.position.x + 0.5, ham.root.position.z + 0.2, () => { b.face(0, 0); b.play('sleep'); b.timer = rand(10, 18); });
    } else {
      b.play(nap ? 'sleep' : 'doze'); b.timer = rand(7, 14);
    }
  } else {
    const a = rand(0, Math.PI * 2), rr = rand(0.3, 2.0);
    b.walkTo(Math.cos(a) * rr, Math.sin(a) * rr, () => { b.timer = rand(1.5, 4); });
  }
}

// ------------------------------------------------------------------------------------------------ shop
function owned(id) { return save.owned[id] || 0; }
function costOf(it) { return it.costs[owned(it.id)]; }
function buildShop() {
  const shop = $('shop');
  shop.innerHTML = '';
  for (const it of ITEMS) {
    const b = document.createElement('button');
    b.className = 'item';
    b.dataset.id = it.id;
    b.innerHTML = `<img src="assets/icons/${it.id}.png" alt=""><span></span>`;
    b.addEventListener('click', () => buy(it));
    shop.appendChild(b);
  }
  ui();
}
function ui() {
  $('n').textContent = save.n;
  for (const b of $('shop').children) {
    const it = ITEMS.find((i) => i.id === b.dataset.id), c = costOf(it);
    b.classList.toggle('done', c === undefined);
    if (c === undefined) continue;
    b.querySelector('span').textContent = c;
    b.classList.toggle('poor', save.n < c);
    b.classList.toggle('ready', save.n >= c);
  }
}
function buy(it) {
  sound.unlock();
  const c = costOf(it);
  if (c === undefined) return;
  if (save.n < c) { sound.play('nope', { vol: 0.7 }); return; }
  save.n -= c;
  const [x, z] = it.spots[owned(it.id)];
  save.owned[it.id] = owned(it.id) + 1;
  persist();
  place(it.id, x, z, false);
  sound.play('build', { vol: 0.8 });
  ui();
}
function place(id, x, z, instant) {
  let root;
  if (id === 'tree') { root = addTree(x, z, instant).root; }
  else if (id === 'friend') {
    friend = new Buddy(P.gangnana, 0.9);
    friend.root.position.set(x, groundAt(x, z), z);
    root = friend.root;
    if (!instant) { friend.play('cheer', { once: true }); setTimeout(() => friend.play('idle'), 2500); }
  } else {
    root = fit(soft(P[id].clone()), SIZE[id], id === 'lantern' ? 'y' : 'max');
    root.position.set(x, groundAt(x, z) - 0.02, z);
    root.rotation.y = Math.atan2(-x, -z) + Math.PI; // face the middle of the island
    world.add(root);
    if (id === 'lantern') {
      const l = new THREE.PointLight(0xffc56b, 0, 3.5, 1.6);
      l.position.set(0, SIZE.lantern * 0.62, 0.25);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffd27a, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.copy(l.position); s.scale.setScalar(0.9);
      root.add(l, s);
      lanterns.push({ l, s });
    }
  }
  decor.push({ id, root });
  if (!instant && id !== 'tree') pop(root);
  sparkle(root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0)), 0xffffff, 8);
}

// ------------------------------------------------------------------------------------------------ day / night, clouds, fireflies
const SKY = { day: ['#9fd8ff', '#ffeef4'], dusk: ['#ffb3a7', '#ffe2b8'], night: ['#1d2457', '#5a4b8f'] };
let clouds = [], flies;
const cloudTint = new THREE.Color(1, 1, 1), NIGHT_CLOUD = new THREE.Color(0x6a6fa8), WHITE = new THREE.Color(1, 1, 1);
function sky(dt) {
  const n = isNight();
  const h = params.has('hour') ? +params.get('hour') : new Date().getHours();
  const tone = n ? 'night' : (h >= 17.5 || h < 8) ? 'dusk' : 'day';
  if (sky.tone !== tone) {
    sky.tone = tone;
    app.style.setProperty('--top', SKY[tone][0]); app.style.setProperty('--bot', SKY[tone][1]);
    app.style.setProperty('--stars', n ? 1 : 0);
    sound.loopVolume('day', started && !n ? 0.5 : 0, 1.5); sound.loopVolume('night', started && n ? 0.5 : 0, 1.5);
  }
  const k = 1 - Math.exp(-dt * 1.5);
  sun.intensity += ((n ? 0.25 : tone === 'dusk' ? 1.6 : 2.2) - sun.intensity) * k;
  hemi.intensity += ((n ? 0.45 : 1.3) - hemi.intensity) * k;
  hemi.color.lerp(new THREE.Color(n ? 0x8a93ff : 0xe4f2ff), k);
  for (const L of lanterns) { L.l.intensity += ((n ? 3 : 0) - L.l.intensity) * k; L.s.material.opacity += ((n ? 0.9 : 0) - L.s.material.opacity) * k; }
  if (flies) {
    flies.visible = n;
    const p = flies.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, Math.sin(clockT * 0.3 + i * 1.7) * 2.2, surfaceY + 0.4 + Math.sin(clockT * 0.9 + i) * 0.3 + (i % 3) * 0.3, Math.cos(clockT * 0.25 + i * 2.3) * 2.2);
    }
    p.needsUpdate = true;
  }
  cloudTint.lerp(n ? NIGHT_CLOUD : WHITE, k);
  for (const c of clouds) {
    c.traverse((o) => { if (o.isMesh) o.material.color.copy(cloudTint); });
    c.position.x += c.userData.v * dt;
    if (c.position.x > 9) c.position.x = -9;
  }
}

// ------------------------------------------------------------------------------------------------ input: drag to turn, tap to interact
let drag = null, yaw = 0.25, yawV = 0;
const pointer = new THREE.Vector2();
app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#shop, #mute, #title')) return;
  drag = { x: e.clientX, y: e.clientY, moved: 0, last: e.clientX };
});
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.last;
  drag.last = e.clientX;
  drag.moved += Math.abs(dx);
  yawV = dx * 0.006;
  yaw += yawV;
});
addEventListener('pointerup', (e) => {
  if (!drag) return;
  const tap = drag.moved < 8;
  drag = null;
  if (tap) tapAt(e.clientX, e.clientY);
});

function tapAt(cx, cy) {
  if (!started) return;
  sound.unlock();
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  // generous banana hit test: nearest ripe banana to the ray
  let best = null, bd = 0.45;
  for (const t of trees) for (const b of t.bananas) {
    if (b.picked || !b.ripe) continue;
    const d = ray.ray.distanceToPoint(b.mesh.getWorldPosition(new THREE.Vector3()));
    if (d < bd) { bd = d; best = b; }
  }
  if (best) { harvest(best); return; }
  for (const bud of [dongwoo, friend]) {
    if (!bud) continue;
    const c = bud.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.45, 0));
    if (ray.ray.distanceToPoint(c) < 0.5) { petBuddy(bud); return; }
  }
  // an unripe banana: give it a little shake
  for (const t of trees) for (const b of t.bananas) {
    if (b.picked || b.ripe) continue;
    if (ray.ray.distanceToPoint(b.mesh.getWorldPosition(new THREE.Vector3())) < 0.4) { b.born -= 1.5; sparkle(b.mesh.getWorldPosition(new THREE.Vector3()), 0xb8f07a, 3); sound.play('tap', { vol: 0.4 }); return; }
  }
}

function petBuddy(b) {
  sound.play('pet', { vol: 0.8, rate: rand(0.95, 1.1) });
  heartBurst(b.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.0, 0)));
  if (b.busy) return;
  b.state = 'idle'; b.target = null; b.busy = true;
  b.face(camera.position.x, camera.position.z);
  const d = b.play(Math.random() < 0.5 && b.actions.wave ? 'wave' : (b.actions.joy ? 'joy' : 'cheer'), { once: true, fade: 0.15 });
  setTimeout(() => { b.busy = false; b.play('idle'); b.timer = rand(1, 3); }, Math.min(d, 2.6) * 1000);
}

// ------------------------------------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clockT += dt;
  if (!drag) { yawV *= Math.exp(-3 * dt); yaw += yawV; }
  world.rotation.y = yaw;
  world.position.y = Math.sin(clockT * 0.6) * 0.06;  // the island floats
  world.updateMatrixWorld(true);
  if (island) {
    growBananas(dt);
    updateFlying(dt);
    for (const b of [dongwoo, friend]) if (b) { b.update(dt); if (started) brain(b, dt); }
    updateSprites(dt);
    updatePops(dt);
    sky(dt);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
camera.position.set(0, 7.2, 17.5);
camera.lookAt(0, 0.4, 0);
requestAnimationFrame(frame);

// ------------------------------------------------------------------------------------------------ boot
const gl = new GLTFLoader();
const load = (p) => gl.loadAsync(p);
const prop = (n) => load(`${PROPS}${n}.glb`).then((g) => g.scene);
const [isle, btree, hammock, hut, pond, lantern, flowers, bask, banana, cloud, dw, gn] = await Promise.all([
  prop('isle'), prop('btree'), prop('hammock'), prop('hut'), prop('pond'), prop('lantern'), prop('flowers'), prop('basket'),
  prop('banana'), prop('cloud'), load(`${MODELS}dongwoo_cozy.glb`), load(`${MODELS}gangnana_cute.glb`),
  sound.load(['bgm', 'day', 'night', 'ripen', 'pluck', 'plop', 'build', 'pet', 'tap', 'nope']),
]);
P = { btree, hammock, hut, pond, lantern, flowers, banana, gangnana: gn };

island = fit(soft(isle), 6.8);
world.add(island);
ground = island;
island.position.y = -new THREE.Box3().setFromObject(island).getSize(new THREE.Vector3()).y + 0.6;
world.updateMatrixWorld(true);
surfaceY = 0;
surfaceY = groundAt(0, 0);

basket = fit(soft(bask), SIZE.basket);
basket.position.set(0.55, groundAt(0.55, 1.15), 1.15);
world.add(basket);
for (let i = 0; i < 6; i++) {
  const m = fit(P.banana.clone(), 0.22, 'y');
  m.position.set(rand(-0.1, 0.1), 0.12 + Math.floor(i / 3) * 0.06, rand(-0.08, 0.08));
  m.rotation.set(rand(0, 1), rand(0, 6), 1.4);
  basket.add(m); basketPile.push(m);
}

dongwoo = new Buddy(dw, 0.95);
dongwoo.root.position.set(-0.2, surfaceY, 0.6);

for (let i = 0; i < 7; i++) {
  const c = fit(cloud.clone(), rand(2, 4));
  c.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  c.position.set(rand(-9, 9), rand(-3, 5), rand(-12, -4));
  c.userData.v = rand(0.1, 0.3);
  scene.add(c); clouds.push(c);
}
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(14 * 3), 3));
  flies = new THREE.Points(g, new THREE.PointsMaterial({ map: glow, color: 0xfff2a0, size: 0.35, transparent: true, depthWrite: false }));
  world.add(flies);
}

// the starter tree, then everything bought before; offline time ripens everything that had time to grow
addTree(1.2, 0.2, true);
for (const it of ITEMS) for (let i = 0; i < owned(it.id); i++) place(it.id, ...it.spots[i], true);
const away = (Date.now() - (save.t || Date.now())) / 1000;
for (const t of trees) for (const b of t.bananas) if (away > GROW) b.born = clockT - GROW;
buildShop();

$('mute').textContent = sound.muted ? '🔇' : '🔊';
$('mute').addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.muted); $('mute').textContent = sound.muted ? '🔇' : '🔊'; });
const begin = () => {
  if (started) return;
  started = true;
  sound.unlock();
  sound.loop('bgm', 0); sound.loop('day', 0); sound.loop('night', 0);
  sound.loopVolume('bgm', 0.55, 1);
  sky.tone = null;
  $('title').hidden = true;
  sound.play('tap', { vol: 0.6 });
};
$('go').disabled = false;
$('go').addEventListener('click', begin);
document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); sound.ctx.suspend(); } else if (started) sound.ctx.resume(); });
window.game = {
  save, trees, harvest, camera, get dongwoo() { return dongwoo; }, buy: (id) => buy(ITEMS.find((i) => i.id === id)), begin,
  get sprites() { return sprites.length; },
  /** test helper: tap the screen where an object is */
  tapObject(o, dy = 0.45) {
    const v = o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0)).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    const x = r.left + (v.x * 0.5 + 0.5) * r.width, y = r.top + (-v.y * 0.5 + 0.5) * r.height;
    app.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
    dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y }));
    return [Math.round(x), Math.round(y)];
  },
};
if (params.has('autostart')) begin();
