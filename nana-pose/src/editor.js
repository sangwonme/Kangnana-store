// Pose editor: edit data/poses.json presets with live character + judged-silhouette preview, export the file.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PoseRig } from '../../shared/lib/rig.js';
import { PoseLib } from './poses.js';
import { Silhouette, MW, MH } from './silhouette.js';

const $ = (id) => document.getElementById(id);
const MODEL = new URLSearchParams(location.search).get('model') || '../shared/assets/models/darknana.glb';
const [gltf, json, overrides] = await Promise.all([
  new GLTFLoader().loadAsync(MODEL),
  fetch('data/poses.json').then((r) => r.json()),
  fetch('data/rig.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
]);

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1813);
scene.add(new THREE.HemisphereLight(0xffffff, 0x333022, 2.2));
const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(2, 4, 3); scene.add(dl);
const grid = new THREE.GridHelper(4, 8, 0x4a4233, 0x2a261d); scene.add(grid);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
const holder = new THREE.Group(); holder.add(gltf.scene); scene.add(holder);
const rig = new PoseRig(gltf.scene, overrides);
const sil = new Silhouette(renderer, gltf.scene, overrides);
let back = false;
const placeCam = () => { camera.position.set(0, 1.2, back ? -4.6 : 4.6); camera.lookAt(0, 1.05, 0); };
placeCam();
$('front').onclick = () => { back = false; placeCam(); };
$('back').onclick = () => { back = true; placeCam(); };

let lib = new PoseLib(json);
const rebuild = () => { lib = new PoseLib(json); };
const slotOf = { full: 'full', upper: 'upper', lower: 'lower', arm: 'armL', leg: 'legL', torso: 'torso' };
const PARTS_BY_CAT = { upper: ['arm', 'armL', 'armR', 'torso', 'head'], lower: ['leg', 'legL', 'legR'], arm: ['arm'], leg: ['leg'], torso: ['torso', 'head'], full: [] };
const LIMB_FIELDS = [['upper', 'a', -180, 380], ['upper', 'f', -90, 90], ['lower', 'a', -180, 380], ['lower', 'f', -90, 90]];
const BODY_FIELDS = { torso: [['lean', -60, 60], ['bend', -60, 60], ['twist', -90, 90]], head: [['tilt', -60, 60], ['nod', -60, 60], ['turn', -90, 90]] };

let cur = null, keyIdx = 0, playing = false, u = 0;
const cats = [...new Set(json.presets.map((p) => p.cat))];
$('cat').innerHTML = cats.map((c) => `<option>${c}</option>`).join('');
$('cat').onchange = () => fillPresets();
function fillPresets(selectId) {
  const list = json.presets.filter((p) => p.cat === $('cat').value);
  $('preset').innerHTML = list.map((p) => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('');
  if (selectId) $('preset').value = selectId;
  select($('preset').value);
}
$('preset').onchange = () => select($('preset').value);

function select(id) {
  cur = json.presets.find((p) => p.id === id);
  keyIdx = 0; u = 0;
  $('name').value = cur?.name || '';
  const dyn = cur?.kind === 'dynamic';
  $('dynbox').style.display = dyn ? '' : 'none';
  if (dyn) {
    $('period').value = cur.period; $('periodv').textContent = cur.period;
    $('interp').value = cur.interp || 'smooth';
    fillKeys();
  }
  // composite full presets: pick the upper/lower presets they're made of
  const comp = $('composite');
  comp.innerHTML = '';
  if (cur && (cur.upper || cur.lower)) {
    for (const k of ['upper', 'lower']) {
      const lab = document.createElement('label'); lab.textContent = k === 'upper' ? '상체 프리셋' : '하체 프리셋';
      const s = document.createElement('select');
      s.innerHTML = json.presets.filter((p) => p.cat === k).map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
      s.value = cur[k];
      s.onchange = () => { cur[k] = s.value; rebuild(); };
      comp.append(lab, s);
    }
  }
  $('part').innerHTML = (PARTS_BY_CAT[cur?.cat] || []).map((p) => `<option>${p}</option>`).join('');
  sliders();
}
$('name').oninput = () => { if (cur) cur.name = $('name').value; };

function fillKeys() {
  $('key').innerHTML = cur.keys.map((k, i) => `<option value="${i}">#${i} u=${k.u}</option>`).join('');
  $('key').value = keyIdx;
}
$('key').onchange = () => { keyIdx = +$('key').value; u = cur.keys[keyIdx].u; $('u').value = Math.min(u, 0.999); sliders(); };
$('period').oninput = () => { cur.period = +$('period').value; $('periodv').textContent = cur.period; rebuild(); };
$('interp').onchange = () => { cur.interp = $('interp').value; rebuild(); };
$('u').oninput = () => { u = +$('u').value; playing = false; $('play').textContent = '▶ 재생'; };
$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? '❚❚ 정지' : '▶ 재생'; };
$('addkey').onclick = () => {
  const k = { u: +u.toFixed(3), parts: structuredClone(cur.keys[keyIdx].parts) };
  cur.keys.push(k); cur.keys.sort((a, b) => a.u - b.u); keyIdx = cur.keys.indexOf(k); fillKeys(); rebuild(); sliders();
};
$('delkey').onclick = () => { if (cur.keys.length > 2) { cur.keys.splice(keyIdx, 1); keyIdx = 0; fillKeys(); rebuild(); sliders(); } };
$('part').onchange = sliders;

/** the parts object being edited (static preset, or the selected key of a dynamic one) */
const target = () => (cur.kind === 'dynamic' ? cur.keys[keyIdx].parts : (cur.parts ??= {}));

function sliders() {
  const box = $('sliders');
  box.innerHTML = '';
  if (!cur || !$('part').value) return;
  const part = $('part').value;
  const add = (label, get, set, min, max) => {
    const row = document.createElement('div'); row.className = 'sl';
    const v = document.createElement('span'); v.textContent = get();
    const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = 1; r.value = get();
    r.oninput = () => { set(+r.value); v.textContent = r.value; rebuild(); };
    const l = document.createElement('span'); l.textContent = label;
    row.append(l, r, v); box.appendChild(row);
  };
  const T = target();
  if (BODY_FIELDS[part]) {
    for (const [f, min, max] of BODY_FIELDS[part]) add(f, () => T[part]?.[f] ?? 0, (v) => { (T[part] ??= {})[f] = v; }, min, max);
  } else {
    const def = part.startsWith('arm') ? { upper: { a: 10, f: 0 }, lower: { a: 7, f: 3 } } : { upper: { a: 3, f: 0 }, lower: { a: 2, f: 0 } };
    for (const [seg, f, min, max] of LIMB_FIELDS) {
      add(`${seg === 'upper' ? '윗' : '아랫'}.${f}`, () => T[part]?.[seg]?.[f] ?? T.arm?.[seg]?.[f] ?? T.leg?.[seg]?.[f] ?? def[seg][f],
        (v) => { ((T[part] ??= {})[seg] ??= {})[f] = v; }, min, max);
    }
  }
}

$('dup').onclick = () => {
  const c = structuredClone(cur); c.id = `${cur.id}_${Date.now() % 10000}`; c.name = `${cur.name} 복제`;
  json.presets.splice(json.presets.indexOf(cur) + 1, 0, c); rebuild(); fillPresets(c.id);
};
$('del').onclick = () => {
  if (!confirm(`${cur.name} 삭제?`)) return;
  json.presets.splice(json.presets.indexOf(cur), 1); rebuild(); fillPresets();
};
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify(json, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'poses.json'; a.click();
};

const sctx = $('sil').getContext('2d'), img = sctx.createImageData(MW, MH);
let last = performance.now(), frameN = 0;
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  const v = $('view');
  renderer.setSize(v.clientWidth, v.clientHeight, false);
  camera.aspect = v.clientWidth / v.clientHeight; camera.updateProjectionMatrix();
  if (cur) {
    if (cur.kind === 'dynamic' && playing) { u = (u + dt / cur.period) % 1; $('u').value = u; }
    $('uv').textContent = u.toFixed(2);
    const t = cur.kind === 'dynamic' ? u * cur.period : 0;
    const pose = lib.configPose({ [slotOf[cur.cat]]: cur.id }, t);
    holder.position.y = rig.apply(pose);
    if (frameN++ % 3 === 0) {
      const m = sil.mask(pose);
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const val = m[(MH - 1 - y) * MW + x] ? 230 : 34, o = (y * MW + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = val; img.data[o + 3] = 255;
      }
      sctx.putImageData(img, 0, 0);
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
fillPresets();
requestAnimationFrame(frame);
window.editorReady = true;
