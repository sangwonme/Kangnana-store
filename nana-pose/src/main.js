// 강나나의 멋진 포즈! — pick body-part poses so you fit the hole of the oncoming crusher wall.
// One game clock drives everything; walls are generated from a known answer and judged at their exact hit time.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PoseRig } from './rig.js';
import { PoseLib, PoseState, SLOTS, NEUTRAL_ID } from './poses.js';
import { Silhouette, judge, dilate, touchesEdge, RULE, WIN } from './silhouette.js';
import { Wall, splatTexture } from './wall.js';
import { buildStage } from './stage.js';
import { Sound } from './audio.js';
import { BananaRain } from './bananas.js';

const params = new URLSearchParams(location.search);
const MODEL = params.get('model') || '../shared/assets/models/darknana.glb';
const PROPS = '../shared/assets/props/';
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ------------------------------------------------------------------------------------------------ difficulty
// One fixed layout per difficulty, chosen on the title screen; walls speed up with the score.
const MODES = {
  vez: { key: 'vez', name: '매우매우 쉬움', sub: '포즈 하나 고르기', slots: ['full'], dyn: false, change: [1, 1], travel: [4.6, 3.0], span: 30 },
  easy: { key: 'easy', name: '쉬움', sub: '포즈 두 개 고르기', slots: ['upper', 'lower'], dyn: false, change: [1, 2], travel: [5.0, 3.4], span: 30 },
  normal: { key: 'normal', name: '보통', sub: '움직이는 포즈 등장', slots: ['upper', 'lower'], dyn: true, change: [1, 2], travel: [5.0, 3.4], span: 35 },
  banana: { key: 'banana', name: '바나나 챌린지', sub: '몸통 · 팔 · 다리 따로', slots: ['torso', 'armR', 'armL', 'legR', 'legL'], dyn: true, change: [2, 3], travel: [10.8, 7.6], span: 40 },
};
const levelFor = () => MODES[S.modeKey];
const travelFor = (L, score) => L.travel[0] + (L.travel[1] - L.travel[0]) * clamp01(score / L.span);const DYN_BONUS = 0.7;   // extra seconds to read a moving answer
const WALL_DIST = 24;    // spawn distance
const KEYS = [['1', '2', '3'], ['q', 'w', 'e'], ['a', 's', 'd'], ['z', 'x', 'c'], ['4', '5', '6']];

// ------------------------------------------------------------------------------------------------ renderer / scene
const app = $('app');
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: false });
const RSCALE = 0.6; // chunky pixels: matches the low-fi look and saves fill rate on phones
renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * RSCALE);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.autoClear = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0c09);
scene.fog = new THREE.Fog(0x0b0c09, 9, 32);
scene.add(new THREE.HemisphereLight(0xb8c4a4, 0x2b2318, 0.9));
const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.05, 80);
// a cold spot from the wall side: rims the character's silhouette as seen from behind
const rim = new THREE.SpotLight(0xdfe8ff, 26, 18, 0.55, 0.6, 1.4);
rim.position.set(0, 3.2, -6.5); rim.target.position.set(0, 1.0, 0);
scene.add(rim, rim.target);

function resize() {
  renderer.setSize(app.clientWidth, app.clientHeight, false);
}
new ResizeObserver(resize).observe(app);
resize();

// film grain tile
{
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d'), img = x.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

// ------------------------------------------------------------------------------------------------ state
const bestOf = (k) => { try { return +localStorage.getItem(`np-best-${k}`) || 0; } catch { return 0; } };
let best = 0;
const clock = { t: 0, running: false };
const S = { mode: 'loading', modeKey: params.get('mode') in MODES ? params.get('mode') : 'vez', score: 0, level: null, config: {}, nextSpawn: 0, shake: 0, paused: false };
let W = null; // the active wall's data
let lib, state, rig, sil, wall, stage, holder, mixer, actions, sound, bananas;
const floorSplats = [];

// ------------------------------------------------------------------------------------------------ walls
function changeLevel(L, t) {
  S.level = L;
  // everything back to neutral (blended), then one neutral preset per new slot
  state.setSlot('full', NEUTRAL_ID.full, t);
  S.config = {};
  for (const s of L.slots) { S.config[s] = NEUTRAL_ID[SLOTS[s].cat]; state.setSlot(s, S.config[s], t); }
  {
    const el = $('level');
    el.innerHTML = `<small>${L.sub}</small>${L.name}`;
    el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    el.onanimationend = () => { el.hidden = true; };
    sound.play('alarm', { vol: 0.7 });
    setTimeout(() => S.mode === 'play' && sound.play('vo_ready', { vol: 1 }), 900);
  }
}

function candidates(slot, L) {
  return lib.cat[SLOTS[slot].cat].filter((p) => p.id !== 'f_stand' && (L.dyn || !lib.isDynamic(p.id)));
}

/** Build a wall whose answer is known first: pick the answer config, then cut the hole from its pose at hitT. */
function spawnWall(t0) {
  const L = levelFor();
  for (let attempt = 0; attempt < 40; attempt++) {
    const k = Math.min(L.slots.length, randInt(...L.change));
    const answer = { ...S.config };
    for (const slot of shuffle([...L.slots]).slice(0, k)) {
      const c = candidates(slot, L).filter((p) => p.id !== S.config[slot]);
      answer[slot] = pickOne(c).id;
    }
    const dyn = Object.values(answer).some((id) => lib.isDynamic(id));
    const hitT = t0 + travelFor(L, S.score) + (dyn ? DYN_BONUS : 0);
    const target = sil.mask(lib.configPose(answer, hitT));
    if (touchesEdge(target)) continue;
    const hole = dilate(target, RULE.dilate);
    // must not be passable without doing anything
    if (judge(sil.mask(lib.configPose(S.config, hitT)), target, hole).pass) continue;
    const options = {};
    if (L.slots.length === 1) {
      const slot = L.slots[0];
      const ds = [];
      for (const p of shuffle(candidates(slot, L))) {
        if (p.id === answer[slot] || ds.length >= 2) continue;
        if (!judge(sil.mask(lib.configPose({ [slot]: p.id }, hitT)), target, hole).pass) ds.push(p.id);
      }
      if (ds.length < 2) continue;
      options[slot] = shuffle([answer[slot], ...ds]);
    } else {
      for (const slot of L.slots) {
        const set = new Set([S.config[slot], answer[slot]]);
        for (const p of shuffle(candidates(slot, L))) { if (set.size >= 3) break; set.add(p.id); }
        const order = lib.cat[SLOTS[slot].cat].map((p) => p.id);
        options[slot] = [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      }
    }
    W = { spawnT: t0, hitT, target, hole, answer, options, judged: false, passed: false, ticks: 0, dyn };
    wall.setMask(hole);
    wall.clearSplats();
    wall.group.visible = true;
    wall.group.position.set(0, 0, -WALL_DIST);
    buildPanel();
    return true;
  }
  return false;
}

function updateWall(t, dt) {
  if (!W) return;
  const travel = W.hitT - W.spawnT, speed = WALL_DIST / travel;
  const remain = W.hitT - t;
  if (!W.judged) {
    wall.group.position.set(0, 0, -remain * speed);
  } else if (W.passed) {
    // after a pass the crusher drops into the floor right where it met the player
    const a = t - W.hitT;
    wall.group.position.set(0, -a * a * 28 - a * 3, Math.min(0.5, a * speed * 0.3));
  }
  const near = clamp01(1 - remain / travel);
  sound.loopVolume('grind', W.judged ? 0 : 0.15 + 0.75 * near * near);
  wall.light.intensity = remain < 2 && !W.judged ? (Math.sin(t * 14) > 0 ? 14 : 2) : 0;
  wall.glowMat.opacity = W.passed ? Math.max(0, 0.95 - (t - W.hitT) * 3) : 0.95;
  if (!W.judged && remain < 1.6) {
    const tick = Math.floor((1.6 - remain) / 0.4);
    if (tick > W.ticks - 1) { W.ticks = tick + 1; sound.play('tick', { vol: 0.6, rate: 1 + tick * 0.08 }); }
  }
  if (!W.judged && t >= W.hitT) judgeWall();
  if (W.passed && t > W.hitT + 1.0) { wall.group.visible = false; W = null; }
}

function judgeWall() {
  W.judged = true;
  // the player's pose exactly at the hit time (choices made after hitT are ignored)
  const pose = state.poseAt(W.hitT);
  const r = judge(sil.mask(pose), W.target, W.hole);
  window.lastJudge = r;
  if (r.pass) onPass(); else onFail(r);
}

function onPass() {
  W.passed = true;
  S.score++;
  if (S.score > best) { best = S.score; S.newBest = true; try { localStorage.setItem(`np-best-${S.modeKey}`, best); } catch {} }
  hud(true);
  stage.drawBoard(S.score, best);
  sound.play('pass', { vol: 0.9 });
  if (Math.random() < 0.35) sound.play('applause', { vol: 0.45 });
  if (S.score % 5 === 0) setTimeout(() => sound.play('vo_pass', { vol: 1 }), 250);
  showStamp('통과', 'pass');
  S.nextSpawn = W.hitT + 0.8;
}

function onFail(r) {
  S.mode = 'dead';
  S.deadT = 0;
  $('panel').hidden = true;
  $('pause').hidden = true;
  wall.group.position.z = 0.02;
  // squashed banana-man: banana juice on the wall and floor, a shower of mini bananas
  for (let i = 0; i < 6; i++) wall.splat(rand(-0.6, 0.6), rand(0.4, 1.9), rand(0.5, 1.1));
  const fs = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: splatTexture(), transparent: true, depthWrite: false }));
  fs.rotation.x = -Math.PI / 2; fs.position.set(rand(-0.2, 0.2), 0.012, 1.0); fs.rotation.z = Math.random() * 6;
  scene.add(fs); floorSplats.push(fs);
  bananas.burst(new THREE.Vector3(0, 1.1, 0.25), 46);
  // ragdoll-ish: hand the body to the canned "hit and fly" clip; turned so the wall knocks him toward the camera
  rig.reset();
  holder.position.y = 0;
  holder.rotation.y = Math.PI;
  mixer.stopAllAction();
  const a = actions.hit;
  if (a) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 1.25; a.play(); }
  sound.play('crash', { vol: 1 });
  setTimeout(() => sound.play('buzzer', { vol: 0.7 }), 200);
  setTimeout(() => sound.play('vo_fail', { vol: 1 }), 700);
  sound.loopVolume('grind', 0);
  sound.loopVolume('bgm', 0, 0.3);
  S.shake = 0.6;
  const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  showStamp('탈락', 'fail');
  console.log('fail', JSON.stringify(r));
}

function gameOver() {
  S.mode = 'over';
  $('final').textContent = S.score;
  $('best-over').textContent = best;
  $('over-mode').textContent = S.level.name;
  fillModes();
  $('newbest').hidden = !S.newBest;
  $('over').hidden = false;
  $('hud').hidden = true;
  $('stamp').hidden = true;
  if (S.newBest) sound.play('record', { vol: 0.8 });
}

function showStamp(text, cls) {
  const el = $('stamp');
  el.textContent = text; el.className = cls; el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  if (cls === 'pass') el.onanimationend = () => { el.hidden = true; };
  else el.onanimationend = null;
}

function hud(bump) {
  const s = $('score');
  s.textContent = String(S.score).padStart(3, '0');
  if (bump) { s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
  $('best').textContent = `최고 ${best}`;
}

// ------------------------------------------------------------------------------------------------ control panel
let chips = [];
function buildPanel() {
  const panel = $('panel');
  panel.innerHTML = '';
  chips = [];
  const slots = S.level.slots;
  slots.forEach((slot, r) => {
    const row = document.createElement('div');
    row.className = 'row' + (slots.length === 1 ? ' big-row' : '');
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.innerHTML = `${SLOTS[slot].label}${isTouch ? '' : `<kbd>${KEYS[r].join(' ').toUpperCase()}</kbd>`}`;
    row.appendChild(lbl);
    W.options[slot].forEach((id, c) => {
      const p = lib.get(id);
      const b = document.createElement('button');
      b.className = 'chip';
      b.innerHTML = `<span class="ico"></span><span class="nm">${lib.isDynamic(id) ? '<i>∿</i> ' : ''}${p.name}</span>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(slot, id); });
      row.appendChild(b);
      chips.push({ el: b, ico: b.firstChild, slot, id, key: KEYS[r][c] });
    });
    panel.appendChild(row);
  });
  panel.hidden = false;
  markSelected();
}

function markSelected() { for (const c of chips) c.el.classList.toggle('sel', S.config[c.slot] === c.id); }

function choose(slot, id) {
  sound.unlock();
  if (S.mode !== 'play' || S.paused || !W || W.judged) return;
  if (S.config[slot] === id) return;
  S.config[slot] = id;
  state.setSlot(slot, id, clock.t);
  sound.play('pose', { vol: 0.8, rate: rand(0.9, 1.15) });
  markSelected();
}

// live silhouette icons, drawn straight into the canvas under each chip
const iconCam = new THREE.OrthographicCamera(WIN.x0, WIN.x1, WIN.y1, WIN.y0, 0.1, 40);
iconCam.position.set(0, 0, 20);
const ICON_BG = new THREE.Color(0x1d1913), PANEL_BG = new THREE.Color(0x0d0b08), CLEAR = new THREE.Color(0x0b0c09);
function drawIcons() {
  if ($('panel').hidden || !chips.length) return;
  const cr = renderer.domElement.getBoundingClientRect();
  renderer.setScissorTest(true);
  // the panel backdrop is painted here (a DOM background would sit on top of the icons)
  const pr = $('panel').getBoundingClientRect();
  const py = cr.bottom - pr.bottom;
  renderer.setViewport(0, py, cr.width, pr.height); renderer.setScissor(0, py, cr.width, pr.height);
  renderer.setClearColor(PANEL_BG, 1); renderer.clear();
  for (const c of chips) {
    const r = c.ico.getBoundingClientRect();
    const x = r.left - cr.left, y = cr.bottom - r.bottom;
    renderer.setViewport(x, y, r.width, r.height);
    renderer.setScissor(x, y, r.width, r.height);
    renderer.setClearColor(ICON_BG, 1);
    renderer.clear();
    const cfg = S.level.slots.length === 1 ? { [c.slot]: c.id } : { ...S.config, [c.slot]: c.id };
    sil.mat.color.setHex(S.config[c.slot] === c.id ? 0xe0b52a : 0xcfc6ae);
    sil.pose(lib.configPose(cfg, clock.t));
    renderer.render(sil.scene, iconCam);
  }
  renderer.setScissorTest(false);
  const s = renderer.getSize(new THREE.Vector2());
  renderer.setViewport(0, 0, s.x, s.y);
  renderer.setClearColor(CLEAR, 1);
  sil.mat.color.setHex(0xffffff);
}

// ------------------------------------------------------------------------------------------------ camera
const CAM = {
  // high and looking down: the far wall's hole shows above the head, then slides down onto the body as it arrives
  play: { pos: new THREE.Vector3(0, 3.7, 5.6), look: new THREE.Vector3(0, 0.7, -3.5) },
  title: { pos: new THREE.Vector3(0.6, 1.15, 5.4), look: new THREE.Vector3(0, 0.5, 0) },
  near: { pos: new THREE.Vector3(0, 3.3, 4.6) },
};
const camPos = CAM.title.pos.clone(), camLook = CAM.title.look.clone();
const _wp = new THREE.Vector3();
function updateCamera(dt) {
  let want = S.mode === 'title' || S.mode === 'loading' ? CAM.title : CAM.play;
  if (want === CAM.play && camera.aspect > 0.62) {   // short 3D view above a tall panel: come closer
    const k = clamp01((camera.aspect - 0.62) / 0.5);
    want = { pos: _wp.copy(CAM.play.pos).lerp(CAM.near.pos, k), look: CAM.play.look };
  }
  const k = 1 - Math.exp(-3 * dt);
  camPos.lerp(want.pos, k); camLook.lerp(want.look, k);
  camera.position.copy(camPos);
  if (S.mode === 'title') camera.position.x += Math.sin(performance.now() / 2600) * 0.25;
  if (S.shake > 0) {
    S.shake = Math.max(0, S.shake - dt);
    camera.position.x += rand(-1, 1) * S.shake * 0.25;
    camera.position.y += rand(-1, 1) * S.shake * 0.25;
  }
  camera.lookAt(camLook);
}

// ------------------------------------------------------------------------------------------------ lifecycle
function startGame(modeKey = S.modeKey) {
  S.modeKey = modeKey;
  best = bestOf(modeKey);
  sound.unlock();
  sound.play('ui', { vol: 0.8 });
  if (!sound.loops.bgm) {
    sound.play('start', { vol: 0.9 });
    setTimeout(() => sound.play('vo_title', { vol: 1 }), 500);
  }
  sound.loop('bgm', 0); sound.loop('ambient', 0); sound.loop('grind', 0);
  sound.loopVolume('bgm', 0.5, 0.5); sound.loopVolume('ambient', 0.6, 0.5);
  mixer.stopAllAction();
  rig.reset();
  clearMess();
  clock.t = 0; clock.running = true;
  S.score = +params.get('score') || 0;
  S.newBest = false;
  S.level = null; S.paused = false; S.mode = 'play';
  state.reset();
  changeLevel(levelFor(), 0);
  S.nextSpawn = 1.2;
  $('title').hidden = true; $('over').hidden = true; $('paused').hidden = true; $('stamp').hidden = true;
  $('hud').hidden = false; $('pause').hidden = false; $('panel').hidden = true;
  hud(false);
  stage.drawBoard(S.score, best);
}

function clearMess() {
  for (const s of floorSplats) scene.remove(s);
  floorSplats.length = 0;
  bananas.clear();
  wall.group.visible = false;
  W = null;
  holder.rotation.y = 0;
}

function toTitle() {
  S.mode = 'title';
  clearMess();
  mixer.stopAllAction();
  rig.reset();
  actions.idle?.reset().play();
  $('over').hidden = true; $('hud').hidden = true; $('stamp').hidden = true;
  $('title').hidden = false;
  fillModes();
}

/** Difficulty buttons on the title screen, each with its own best score. */
function fillModes() {
  const box = $('modes');
  box.innerHTML = '';
  for (const m of Object.values(MODES)) {
    const b = document.createElement('button');
    b.className = 'mode' + (m.key === 'banana' ? ' hard' : '');
    b.innerHTML = `<b>${m.name}</b><span>${m.sub}</span><em>최고 ${bestOf(m.key)}</em>`;
    b.addEventListener('click', () => startGame(m.key));
    box.appendChild(b);
  }
}

function setPaused(p) {
  if (S.mode !== 'play') return;
  S.paused = p;
  clock.running = !p;
  $('paused').hidden = !p;
  if (p) sound.ctx.suspend(); else sound.ctx.resume();
}

// ------------------------------------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (clock.running) clock.t += dt;   // single game clock; frame drops just mean a bigger step of the same clock
  const t = clock.t;
  if (rig) {
    if (S.mode === 'play' && !S.paused) {
      if (!W && t >= S.nextSpawn) spawnWall(t);
      updateWall(t, dt);
      holder.position.y = rig.apply(state.poseAt(t));
    } else if (S.mode === 'dead') {
      S.deadT += dt;
      mixer.update(dt);
      if (S.deadT > 1.8) gameOver();
    } else if (S.mode === 'title' || S.mode === 'over') {
      mixer.update(dt);
    }
    bananas.update(dt);
    stage.update(dt, now / 1000);
    updateCamera(dt);
  }
  // the 3D view only uses the area above the control panel
  const w = app.clientWidth, h = app.clientHeight;
  const ph = $('panel').hidden ? 0 : Math.min(h * 0.6, $('panel').getBoundingClientRect().height);
  const aspect = w / Math.max(1, h - ph);
  if (Math.abs(camera.aspect - aspect) > 1e-3) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  renderer.setClearColor(CLEAR, 1);
  renderer.clear();
  renderer.setViewport(0, ph, w, h - ph);
  renderer.render(scene, camera);
  renderer.setViewport(0, 0, w, h);
  if (S.mode === 'play') drawIcons();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------------------------------------ input
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if ((k === ' ' || k === 'enter') && (S.mode === 'title' || S.mode === 'over') && lib) { e.preventDefault(); startGame(); return; }
  if (k === 'escape' || k === 'p') { setPaused(!S.paused); return; }
  for (const c of chips) if (c.key === k) { choose(c.slot, c.id); return; }
});
$('retry').addEventListener('click', () => startGame());
$('menu').addEventListener('click', toTitle);
$('pause').addEventListener('click', () => setPaused(true));
$('resume').addEventListener('click', () => setPaused(false));
$('mute').addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.muted); $('mute').textContent = sound.muted ? '🔇' : '🔊'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// ------------------------------------------------------------------------------------------------ boot
sound = new Sound();
$('mute').textContent = sound.muted ? '🔇' : '🔊';
const texLoader = new THREE.TextureLoader();
const loadTex = (n) => texLoader.loadAsync(`assets/tex/${n}.jpg`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
const gl = new GLTFLoader();
const loadProp = (n) => gl.loadAsync(`${PROPS}${n}.glb`).then((g) => g.scene).catch(() => null);
const [gltf, json, overrides, tex, props] = await Promise.all([
  gl.loadAsync(MODEL),
  fetch('data/poses.json').then((r) => r.json()),
  fetch('data/rig.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  Promise.all(['concrete', 'tile', 'rust', 'wallpaper'].map(loadTex)).then(([concrete, tile, rust, wallpaper]) => ({ concrete, tile, rust, wallpaper })),
  Promise.all(['chair', 'sneaker', 'fixture', 'beacon', 'cctv', 'banana'].map(loadProp)).then(([chair, sneaker, fixture, beacon, cctv, banana]) => ({ chair, sneaker, fixture, beacon, cctv, banana })),
  sound.load(['bgm', 'ambient', 'grind', 'pose', 'pass', 'applause', 'crash', 'buzzer', 'tick', 'alarm', 'start', 'ui', 'record', 'vo_pass', 'vo_fail', 'vo_title', 'vo_ready']),
]);

lib = new PoseLib(json);
state = new PoseState(lib);
sil = new Silhouette(renderer, gltf.scene, overrides);
const model = gltf.scene;
model.traverse((o) => {
  if (!o.isMesh) return;
  o.castShadow = true; o.frustumCulled = false;
  o.material.roughness = 1; o.material.metalness = 0;
});
holder = new THREE.Group(); // faces the camera; the walls come from behind him
holder.add(model);
scene.add(holder);
rig = new PoseRig(model, overrides);
mixer = new THREE.AnimationMixer(model);
actions = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
actions.idle?.play();
stage = buildStage(scene, tex, props);
stage.drawBoard(0, best);
wall = new Wall(tex, props);
scene.add(wall.group);
bananas = new BananaRain(scene, props.banana);

S.mode = 'title';
fillModes();

window.game = {
  S, clock, get W() { return W; }, lib, state, choose, startGame,
  /** test hook: select the answer for the current wall right now */
  solve() { if (W) for (const [s, id] of Object.entries(W.answer)) choose(s, id); },
};
if (params.has('autostart')) startGame();
if (params.has('bot')) {
  setInterval(() => {
    if (S.mode === 'play' && W && !W.judged && clock.t > W.spawnT + 0.6) window.game.solve();
    if (S.mode === 'over' && params.has('loop')) startGame();
  }, 200);
}
