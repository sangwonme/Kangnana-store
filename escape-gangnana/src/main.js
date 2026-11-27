import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PS1Post } from '../../shared/lib/ps1.js';
import { loadWorld, flicker } from './world.js';
import { Player } from './player.js';
import { Character } from './character.js';
import { Sound } from './audio.js';
import { Opening } from './opening.js';
import { Reader, addReadables } from './readables.js';
import { Interact } from './interact.js';
import { Cooking } from './cooking.js';
import { Events } from './events.js';
import { Delivery } from './delivery.js';
import { runFlow } from './flow.js';
import { Debug } from './debug.js';
import { TitleScene } from './title.js';
import { isTouch, setupTouch, goFullscreen } from './touch.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------- renderer ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('debug') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040405);
scene.fog = new THREE.Fog(0x040405, 4, 14);
const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 60);
scene.add(camera);
const post = new PS1Post(renderer, { height: +(params.get('res') || 240) });
post.enabled = !params.has('nops1');
const title = new TitleScene();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h);
  title.resize(w / h);
}
addEventListener('resize', resize);
resize();

// ---------- game state ----------
const game = {
  started: false,
  paused: false,
  time: 0,
  shiftMinutes: null, // in-game clock, starts at 22:00 after the opening
  player: new Player(camera, canvas),
  sound: new Sound(camera),
  world: null,
  dongwoo: null,
  clockStopped: false,
  finale: false,
  speed: +(params.get('speed') || 1), // debug: speeds up everything
  power: 1,                           // 0 = blackout
  fadeTarget: 1,
  camera,
  scene,
  post,
  timers: [],
  tweens: [],
  /** Wait in game seconds (pauses with the game). */
  wait(s) { return new Promise((r) => this.timers.push({ t: s, r })); },
  /** Run fn(k) every frame for seconds, k: 0→1. */
  tween(seconds, fn) { return new Promise((r) => this.tweens.push({ t: 0, d: seconds, fn, r })); },
  startShift() {
    this.shiftMinutes = 22 * 60;
    $('hud').hidden = false;
    if (params.get('beat') !== 'free') runFlow(this, +(params.get('beat') || 0)); // beat=free: sandbox, no scripted flow
  },
};
window.game = game; // debug handle

// title scene renders while the game loads
let titleT = 0, mainLoop = false;
const titleClock = new THREE.Clock();
(function titleLoop() {
  if (mainLoop) return;
  titleT += titleClock.getDelta();
  title.update(titleT);
  post.uniforms.fade.value = Math.min(1, titleT / 1.5);
  post.render(title.scene, title.camera, titleT);
  requestAnimationFrame(titleLoop);
})();

const loader = new GLTFLoader();
const loading = $('start');
const [world, dongwoo, gangnana, rider, riderX] = await Promise.all([
  loadWorld(scene, loader, (e) => { if (e.total) loading.textContent = `불러오는 중… ${Math.round((e.loaded / e.total) * 100)}%`; }),
  Character.load(loader, '../shared/assets/models/dongwoo.glb'),
  Character.load(loader, '../shared/assets/models/gangnana.glb', { fallbackColor: 0xf2cf22 }),
  Character.load(loader, '../shared/assets/models/rider.glb', { fallbackColor: 0x1a1c22 }),
  Character.load(loader, '../shared/assets/models/rider_banana.glb', { fallbackColor: 0x1a1c22 }),
  game.sound.load(),
]);
game.world = world;
game.dongwoo = dongwoo;
game.gangnana = gangnana;
game.rider = rider;
game.player.colliders = world.colliders;
game.player.onStep = () => game.sound.play(`footstep_tile_${1 + Math.floor(Math.random() * 4)}`, 0.35, 0.9 + Math.random() * 0.15);

const spawn = world.pos('spawn_player');
const dStart = world.pos('dongwoo_start');
game.player.place(spawn, dStart.clone().setY(1.5));
dongwoo.root.position.copy(dStart);
dongwoo.faceTo(spawn);
dongwoo.play('idle', { fade: 0 });
scene.add(dongwoo.root);

const opening = new Opening(game);
const interact = new Interact(scene, world.root);
const reader = new Reader(game.player);
addReadables(interact, reader, game.sound);
const cooking = new Cooking(game, { scene, interact, reader });
const events = new Events(game);
const delivery = new Delivery(game, rider, riderX);
Object.assign(game, { interact, reader, cooking, events, delivery });
cooking.onServed = (t, pack) => delivery.request(pack, !!t.anomalyRider);
cooking.onCostumeOff = () => events.costumeReaction();
const debug = new Debug(game);
game.debug = debug;
/** The E key / mobile action button. */
function action() {
  if (!game.started || game.paused || cooking.naming) return;
  if (game.shiftMinutes === null) return; // not during the opening cutscene
  if (reader.open) reader.close();
  else interact.use();
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat && !(e.target instanceof HTMLInputElement)) action();
});
$('name-ok').addEventListener('click', () =>
  $('name-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
const syncTouch = isTouch
  ? setupTouch(game, { action, actionLabel: () => (reader.open ? '닫기' : interact.target?.label() ?? null) })
  : null;
if (isTouch) {
  // phones have no pointer lock: pause when the app goes to the background
  document.addEventListener('visibilitychange', () => {
    if (!game.started || cooking.ended || !document.hidden) return;
    game.paused = true;
    $('paused').hidden = false;
    game.sound.listener.context.suspend();
  });
}
loading.disabled = false;
loading.textContent = '시작하기';

// ---------- start / pause ----------
function begin() {
  if (game.started) return;
  game.started = true;
  $('title').hidden = true;
  $('crosshair').hidden = false;
  post.uniforms.fade.value = 0; // fade in from black into the kitchen
  $('hud').hidden = true;
  game.sound.resume();
  game.sound.play('ui_start', 0.6);
  game.sound.loop('amb_fridge_hum', 0.35);
  game.sound.loop('amb_fluorescent', 0.18);
  game.sound.loop('amb_street_night', 0.15);
  if (!params.has('autostart')) {
    goFullscreen();
    if (!isTouch) canvas.requestPointerLock();
  }
  if (params.has('skip')) {
    dongwoo.root.visible = false;
    game.player.canMove = true;
    game.startShift();
  } else {
    opening.run();
  }
}
$('start').addEventListener('click', begin);
canvas.addEventListener('click', () => {
  if (isTouch) return;
  if (reader.open) { reader.close(); return; } // while pointer-locked, clicks land on the canvas
  if (game.started && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (!game.started || params.has('autostart')) return;
  game.paused = document.pointerLockElement !== canvas && !debug.open;
  if (cooking.ended) { game.paused = false; $('paused').hidden = true; return; }
  $('paused').hidden = !game.paused;
  game.sound.listener.context[game.paused ? 'suspend' : 'resume']();
});
$('paused').addEventListener('click', () => {
  goFullscreen();
  if (!isTouch) { canvas.requestPointerLock(); return; }
  game.paused = false;
  $('paused').hidden = true;
  game.sound.listener.context.resume();
});

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  mainLoop = true;
  const dt = Math.min(clock.getDelta(), 0.05) * game.speed;
  if (!game.started) {
    titleT += dt;
    title.update(titleT);
    post.uniforms.fade.value = 1;
    post.render(title.scene, title.camera, titleT);
    requestAnimationFrame(frame);
    return;
  }
  if (game.started && !game.paused) {
    game.time += dt;
    for (const t of game.timers.slice()) {
      if ((t.t -= dt) <= 0) { game.timers.splice(game.timers.indexOf(t), 1); t.r(); }
    }
    for (const tw of game.tweens.slice()) {
      tw.t += dt;
      tw.fn(Math.min(1, tw.t / tw.d));
      if (tw.t >= tw.d) { game.tweens.splice(game.tweens.indexOf(tw), 1); tw.r(); }
    }
    opening.update(dt);
    game.player.update(dt);
    if (game.shiftMinutes !== null) {
      interact.enabled = !reader.open && !cooking.action && !cooking.naming && !cooking.ended && !game.finale;
      interact.update(dt, camera);
      cooking.update(dt);
    }
    for (const c of [dongwoo, gangnana, rider, riderX]) c.update(dt);
    events.update(dt);
    // lights follow the power level (blackouts / flickers)
    const pw = game.power;
    flicker(world.lights.kitchen, 9 * pw, game.time);
    for (const l of world.lights.hall) l.intensity = 2.2 * pw;
    world.lights.hemi.intensity = 0.04 + 0.31 * pw;
    for (const { m, base } of world.lights.bulbs) m.emissiveIntensity = base * pw;
    if (game.shiftMinutes !== null && !game.clockStopped) {
      game.shiftMinutes += dt / 2; // 1 in-game minute = 2 real seconds
      if (!game.finale) game.shiftMinutes = Math.min(game.shiftMinutes, 25 * 60 + 59); // stuck at 01:59 until the end
      const m = Math.floor(game.shiftMinutes) % (24 * 60);
      $('clock').textContent = `:`;
    }
    if (debug.open) debug.state();
    syncTouch?.();
  }
  const fade = post.uniforms.fade;
  fade.value += Math.sign(game.fadeTarget - fade.value) * Math.min(Math.abs(game.fadeTarget - fade.value), dt / 2.2);
  post.render(scene, camera, game.time);
  requestAnimationFrame(frame);
}frame();

if (params.has('autostart')) begin();
