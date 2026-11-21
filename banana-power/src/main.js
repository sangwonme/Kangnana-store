// 무한의 나나 — climb a zig-zag staircase by picking left/right; 5 bananas = 강나나 form dash.
import * as THREE from 'three';
import { createRenderer, createScene, loadProps, Stairs, Decor, Puffs } from './world.js';
import { Hero } from './hero.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const GAUGE_MAX = 5;
const POWER_STEPS = 40;
const POWER_RATE = 16;      // steps per second while dashing
const HOP = 0.1;
const STEP_BONUS = 0.075;
const drainRate = (score) => Math.min(0.5, 0.16 + score * 0.0011);

// ---------------------------------------------------------------------------------------------- setup
const app = $('app');
const renderer = createRenderer($('view'));
const { scene, hemi, sun } = createScene(renderer);
const camera = new THREE.PerspectiveCamera(42, 9 / 16, 0.1, 120);
const sound = new Sound();

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app);
resize();

let best = 0;
try { best = +localStorage.getItem('bp-best') || 0; } catch {}
$('best-title').textContent = best;

const S = { mode: 'loading', cur: 0, score: 0, timer: 1, gauge: 0, started: false, hop: null, idleT: 9,
  dir: 1, lastDir: 0, power: null, dead: null, t: 0, shake: 0, camBlend: 0, fov: 42 };
let stairs, decor, puffs, hero;

// ---------------------------------------------------------------------------------------------- HUD
const slots = $('gauge-slots');
for (let i = 0; i < GAUGE_MAX; i++) slots.appendChild(document.createElement('i'));

function hud() {
  const sc = $('score');
  if (sc.textContent !== String(S.score)) {
    sc.textContent = S.score;
    sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump');
  }
  [...slots.children].forEach((el, i) => el.classList.toggle('on', i < S.gauge));
}

function timerBar() {
  const f = $('timer-fill');
  f.style.transform = `scaleX(${Math.max(0, S.timer)})`;
  f.style.backgroundColor = S.timer > 0.5 ? 'var(--mint)' : S.timer > 0.25 ? 'var(--yellow)' : 'var(--pink)';
}

function pop(text, world) {
  const v = world.clone().project(camera);
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = text;
  el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// sky: day -> sunset -> dusk -> night as you climb
const SKY = [
  [0, '#7cc8ff', '#fff0f6'], [120, '#ff9ec0', '#ffe2b0'], [260, '#7b78e0', '#f8b6d6'], [420, '#1f2766', '#6c4fa6'],
].map(([s, a, b]) => [s, new THREE.Color(a), new THREE.Color(b)]);
const skyTop = new THREE.Color(), skyBot = new THREE.Color();
function sky(score) {
  let i = 0;
  while (i < SKY.length - 2 && score > SKY[i + 1][0]) i++;
  const [s0, a0, b0] = SKY[i], [s1, a1, b1] = SKY[i + 1];
  const k = THREE.MathUtils.clamp((score - s0) / (s1 - s0), 0, 1);
  skyTop.lerpColors(a0, a1, k); skyBot.lerpColors(b0, b1, k);
  app.style.setProperty('--sky-top', `#${skyTop.getHexString()}`);
  app.style.setProperty('--sky-bot', `#${skyBot.getHexString()}`);
  scene.fog.color.copy(skyBot);
  const night = THREE.MathUtils.clamp((score - 260) / 160, 0, 1);
  sun.intensity = 2.2 - night * 1.0;
  hemi.intensity = 1.4 - night * 0.4;
}

// ---------------------------------------------------------------------------------------------- movement
function hopTo(i, dur) {
  S.hop = { from: hero.group.position.clone(), to: stairs.pos(i), t: 0, dur, arc: Math.min(0.3, dur * 3) };
  S.idleT = 0;
}

function finishHop() {
  if (!S.hop) return;
  hero.group.position.copy(S.hop.to);
  S.hop = null;
  hero.land();
}

function updateHop(dt) {
  const h = S.hop;
  if (!h) return;
  h.t += dt;
  const k = Math.min(1, h.t / h.dur);
  hero.group.position.lerpVectors(h.from, h.to, k);
  hero.group.position.y += Math.sin(k * Math.PI) * h.arc;
  if (k >= 1) finishHop();
}

function takeBanana(i) {
  const d = stairs.data[i];
  if (!d.banana || d.taken) return;
  d.taken = true;
  const p = stairs.pos(i).add(new THREE.Vector3(0, 0.45, 0));
  puffs.burst(p, { n: 12, color: 0xffe14d, speed: 3, size: 0.09, life: 0.5 });
  sound.play('banana', { vol: 0.8, rate: S.mode === 'power' ? 1.25 : 1 });
  if (S.mode === 'power') {
    S.score += 5;
    pop('+5', p);
    return;
  }
  S.gauge++;
  pop(S.gauge >= GAUGE_MAX ? 'FULL!' : `🍌 ${S.gauge}/${GAUGE_MAX}`, p);
  if (S.gauge >= GAUGE_MAX) startPower();
}

function press(dir) {
  sound.unlock();
  const btn = $(dir < 0 ? 'btn-left' : 'btn-right');
  btn.classList.add('down');
  setTimeout(() => btn.classList.remove('down'), 90);
  if (S.mode !== 'play') return;
  finishHop();
  hero.face(dir);
  if (dir !== stairs.dirAt(S.cur)) return die(dir);
  S.started = true;
  S.cur++;
  S.score++;
  S.timer = Math.min(1, S.timer + STEP_BONUS);
  hopTo(S.cur, HOP);
  sound.play('step', { vol: 0.7, rate: rand(0.92, 1.12) });
  if (S.lastDir && dir !== S.lastDir) sound.play('turn', { vol: 0.3, rate: rand(0.95, 1.1) });
  S.lastDir = dir;
  takeBanana(S.cur);
  hud();
}

// ---------------------------------------------------------------------------------------------- power
function startPower() {
  S.mode = 'power';
  S.power = { phase: 'charge', t: 0, steps: 0, acc: 0, swapped: false };
  $('gauge').classList.add('full');
  sound.play('gauge_full', { vol: 0.8 });
  hero.play('idle', { fade: 0.1 });
}

function swapForm(name) {
  const p = hero.group.position.clone().add(new THREE.Vector3(0, 0.5, 0));
  puffs.burst(p, { n: 26, color: 0xffffff, speed: 3.2, size: 0.22, life: 0.7, up: 0.2 });
  puffs.burst(p, { n: 10, color: 0xffe14d, speed: 4, size: 0.08, life: 0.6 });
  hero.setForm(name);
  hero.land();
  S.shake = 0.25;
}

function updatePower(dt) {
  const P = S.power;
  P.t += dt;
  if (P.phase === 'charge' && P.t > 0.15) {
    P.phase = 'transform'; P.t = 0;
    swapForm('gangnana');
    hero.face(1); hero.yaw = 0.35; // face the camera for the shout
    hero.play('idle', { fade: 0.1 });
    sound.play('transform', { vol: 0.9 });
    sound.play('ppanana', { vol: 1.2 });
    sound.musicVolume(0.25);
    const b = $('banner');
    b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    b.onanimationend = () => { b.hidden = true; };
  } else if (P.phase === 'transform' && P.t > 1.1) {
    P.phase = 'dash'; P.t = 0;
    $('speed').hidden = false;
    sound.play('dash', { vol: 0.8 });
    sound.musicRate(1.18);
    hero.play('run', { fade: 0.1, speed: 1.6 });
  } else if (P.phase === 'dash') {
    S.timer = 1;
    P.acc += dt * POWER_RATE;
    while (P.acc >= 1 && P.steps < POWER_STEPS) {
      P.acc -= 1;
      finishHop();
      const dir = stairs.dirAt(S.cur);
      hero.face(dir);
      S.cur++; S.score++; P.steps++;
      hopTo(S.cur, 1 / POWER_RATE);
      puffs.burst(hero.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), { n: 2, color: 0xfff3a0, speed: 0.6, size: 0.12, life: 0.4, up: 0 });
      takeBanana(S.cur);
      if (P.steps % 4 === 0) sound.play('step', { vol: 0.35, rate: 1.5 });
    }
    hud();
    if (P.steps >= POWER_STEPS && !S.hop) { P.phase = 'revert'; P.t = 0; }
  } else if (P.phase === 'revert' && P.t > 0.12 && !P.swapped) {
    P.swapped = true;
    swapForm('dongwoo');
    $('speed').hidden = true;
    $('gauge').classList.remove('full');
    sound.play('transform', { vol: 0.6, rate: 1.3 });
    sound.musicRate(1);
    sound.musicVolume(0.55);
    S.gauge = 0; S.timer = 1; S.lastDir = 0;
    hero.play('idle', { fade: 0.1 });
    hud();
  } else if (P.phase === 'revert' && P.t > 0.4) {
    S.mode = 'play'; S.power = null;
  }
}

// ---------------------------------------------------------------------------------------------- lifecycle
function die(dir) {
  S.mode = 'dead';
  finishHop();
  const p = hero.group.position;
  S.dead = { t: 0, v: new THREE.Vector3(dir * 1.6, 3.2, 0.6), at: p.clone() };
  if (!dir) S.dead.v.set(0, 1.5, 0.8);
  hero.face(dir || S.dir);
  hero.play('fall', { once: true, fade: 0.1 });
  sound.play('fall', { vol: 0.9 });
  sound.musicVolume(0.15);
  S.shake = 0.3;
  $('controls').hidden = true;
}

function gameOver() {
  S.mode = 'over';
  const isBest = S.score > best;
  if (isBest) {
    best = S.score;
    try { localStorage.setItem('bp-best', best); } catch {}
  }
  $('final').textContent = S.score;
  $('best-over').textContent = best;
  $('best-title').textContent = best;
  $('newbest').hidden = !isBest;
  $('over').hidden = false;
  $('hud').hidden = true;
  sound.play(isBest && S.score > 0 ? 'record' : 'gameover', { vol: 0.8 });
}

function startGame() {
  sound.unlock();
  sound.play('tap', { vol: 0.7 });
  sound.music('bgm');
  sound.musicRate(1);
  sound.musicVolume(0.55);
  stairs.reset();
  Object.assign(S, { mode: 'play', cur: 0, score: 0, timer: 1, gauge: 0, started: false, hop: null, idleT: 9,
    lastDir: 0, power: null, dead: null });
  hero.setForm('dongwoo');
  hero.group.position.copy(stairs.pos(0));
  hero.group.rotation.set(0, 0, 0);
  hero.face(stairs.dirAt(0));
  hero.play('idle', { fade: 0 });
  $('title').hidden = true;
  $('over').hidden = true;
  $('hud').hidden = false;
  $('controls').hidden = false;
  $('speed').hidden = true;
  $('gauge').classList.remove('full');
  hud(); timerBar(); sky(0);
}

// ---------------------------------------------------------------------------------------------- camera
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const OFF_PLAY = new THREE.Vector3(1.4, 3.0, 9.0), LOOK_PLAY = new THREE.Vector3(0, 2.0, -1.2);
const OFF_TITLE = new THREE.Vector3(0.9, 1.1, 4.8), LOOK_TITLE = new THREE.Vector3(0, 0.62, 0);
const OFF_SHOUT = new THREE.Vector3(0.5, 0.75, 2.6), LOOK_SHOUT = new THREE.Vector3(0, 0.55, 0);
const _o = new THREE.Vector3(), _l = new THREE.Vector3();

function updateCamera(dt, snap) {
  const target = S.mode === 'dead' || S.mode === 'over' ? S.dead.at : hero.group.position;
  S.camBlend += ((S.mode === 'title' || S.mode === 'loading' ? 0 : 1) - S.camBlend) * (1 - Math.exp(-3 * dt));
  _o.lerpVectors(OFF_TITLE, OFF_PLAY, S.camBlend);
  _l.lerpVectors(LOOK_TITLE, LOOK_PLAY, S.camBlend);
  if (S.mode === 'title') _o.x += Math.sin(S.t * 0.4) * 0.6;
  if (S.power && S.power.phase !== 'dash' && S.power.phase !== 'revert') { _o.copy(OFF_SHOUT); _l.copy(LOOK_SHOUT); } // close-up for the shout
  const wantLook = _l.add(target), wantPos = _o.add(target);
  const rate = S.mode === 'power' ? 10 : 7;
  const k = snap ? 1 : 1 - Math.exp(-rate * dt);
  camLook.lerp(wantLook, k);
  camPos.lerp(wantPos, k);
  camera.position.copy(camPos);
  if (S.shake > 0) {
    S.shake = Math.max(0, S.shake - dt);
    camera.position.x += rand(-1, 1) * S.shake * 0.4;
    camera.position.y += rand(-1, 1) * S.shake * 0.4;
  }
  camera.lookAt(camLook);
  const fov = S.power?.phase === 'dash' ? 54 : 42;
  S.fov += (fov - S.fov) * (1 - Math.exp(-6 * dt));
  if (Math.abs(camera.fov - S.fov) > 0.01) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
  // shadow camera follows the player
  sun.position.copy(target).add(new THREE.Vector3(4, 9, 6));
  sun.target.position.copy(target);
}

// ---------------------------------------------------------------------------------------------- loop
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  S.t += dt;
  if (hero) {
    if (S.mode === 'play') {
      if (S.started) {
        S.timer -= drainRate(S.score) * dt;
        if (S.timer <= 0) { S.timer = 0; die(0); }
      }
      S.idleT += dt;
      hero.play(S.idleT < 0.22 ? 'climb' : 'idle', { fade: 0.12, speed: 1.5 });
      timerBar();
    } else if (S.mode === 'power') {
      updatePower(dt);
      timerBar();
    } else if (S.mode === 'dead') {
      const D = S.dead;
      D.t += dt;
      D.v.y -= 14 * dt;
      hero.group.position.addScaledVector(D.v, dt);
      hero.group.rotation.z += dt * 2.5 * Math.sign(D.v.x || 1);
      if (D.t > 1.3) gameOver();
    } else if (S.mode === 'title' && S.t % 7 < dt) {
      hero.play('cheer', { once: true, fade: 0.2 });
      setTimeout(() => S.mode === 'title' && hero.play('idle', { fade: 0.3 }), 2200);
    }
    updateHop(dt);
    hero.update(dt);
    stairs.update(S.cur, S.t);
    puffs.update(dt);
    updateCamera(dt, false);
    decor.update(dt, camLook.x, camLook.y, camLook.z, S.t);
    sky(S.score);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.code;
  if (['ArrowLeft', 'KeyA', 'KeyF'].includes(k)) { e.preventDefault(); press(-1); }
  else if (['ArrowRight', 'KeyD', 'KeyJ'].includes(k)) { e.preventDefault(); press(1); }
  else if ((k === 'Space' || k === 'Enter') && (S.mode === 'title' || S.mode === 'over') && !$('start').disabled) {
    e.preventDefault(); startGame();
  }
});
app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.overlay, #mute')) return;
  if (S.mode !== 'play') return;
  e.preventDefault();
  const r = app.getBoundingClientRect();
  press(e.clientX - r.left < r.width / 2 ? -1 : 1);
});
$('start').addEventListener('click', startGame);
$('retry').addEventListener('click', startGame);
$('mute').addEventListener('click', () => {
  sound.unlock();
  sound.setMuted(!sound.muted);
  $('mute').textContent = sound.muted ? '🔇' : '🔊';
});
$('mute').textContent = sound.muted ? '🔇' : '🔊';
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.ctx.suspend(); else if (S.mode !== 'title' && S.mode !== 'loading') sound.ctx.resume();
});

// ---------------------------------------------------------------------------------------------- boot
requestAnimationFrame(frame);
const start = $('start');
const progress = { props: 0 };
const label = () => { start.textContent = `불러오는 중… ${Math.round(progress.props * 100)}%`; };
const [props, h] = await Promise.all([
  loadProps((p) => { progress.props = p; label(); }),
  Hero.load(),
  sound.load(['bgm', 'step', 'turn', 'banana', 'gauge_full', 'transform', 'dash', 'fall', 'gameover', 'record', 'tap', 'ppanana']),
]);
hero = h;
scene.add(hero.group);
stairs = new Stairs(scene, props);
decor = new Decor(scene, props);
puffs = new Puffs(scene);
hero.group.position.copy(stairs.pos(0));
hero.face(stairs.dirAt(0)); hero.yaw = 0.3;
hero.play('idle', { fade: 0 });
S.mode = 'title';
updateCamera(0, true);
start.disabled = false;
start.textContent = '시작!';

window.game = { S, get stairs() { return stairs; }, get hero() { return hero; }, press, startGame, startPower };
if (params.has('autostart')) startGame();
if (params.has('bot')) {
  // playtest helper: always pick the right direction, ~5 steps/s
  setInterval(() => { if (S.mode === 'play') press(stairs.dirAt(S.cur)); }, 1000 / (+params.get('bot') || 5));
}
