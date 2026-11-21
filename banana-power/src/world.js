// Scene, soft lighting, the zig-zag staircase (instanced), bananas, sky decor and particle puffs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const SX = 1.0;   // horizontal offset between steps
export const SY = 0.55;  // rise per step
export const SZ = 0.35;  // each step recedes a little, so the stair above never covers the head
const PROPS = '../shared/assets/props/';
const rand = (a, b) => a + Math.random() * (b - a);

/** Scale + recentre so the object's footprint/height matches `size`; bottom (or centre) at the origin. */
export function fit(obj, { width, height, center = false }) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const s = box.getSize(new THREE.Vector3());
  const k = height ? height / s.y : width / Math.max(s.x, s.z);
  obj.scale.multiplyScalar(k);
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z;
  obj.position.y -= center ? c.y : box.min.y;
  return obj;
}

function soften(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    m.roughness = 0.9; m.metalness = 0; m.envMapIntensity = 0.7;
    if (m.map) m.map.anisotropy = 4;
  });
}

/** Bake a (fitted) glTF scene into InstancedMeshes, one per source mesh. */
function instanced(root, count) {
  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const im = new THREE.InstancedMesh(geo, o.material, count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    group.add(im); group.parts.push(im);
  });
  group.setMatrixAt = (i, m) => group.parts.forEach((p) => p.setMatrixAt(i, m));
  group.setColorAt = (i, c) => group.parts.forEach((p) => p.setColorAt(i, c));
  group.commit = () => group.parts.forEach((p) => {
    p.instanceMatrix.needsUpdate = true;
    if (p.instanceColor) p.instanceColor.needsUpdate = true;
  });
  return group;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export function createScene(renderer) {
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.fog = new THREE.Fog(0xfff0f6, 22, 70);

  const hemi = new THREE.HemisphereLight(0xdff1ff, 0xffe3c8, 1.4);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -7;
  sun.shadow.camera.right = sun.shadow.camera.top = 7;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(hemi, sun, sun.target);
  return { scene, hemi, sun };
}

export async function loadProps(onProgress) {
  const loader = new GLTFLoader();
  const names = ['step', 'banana', 'cloud', 'island', 'balloon'];
  let done = 0;
  const out = {};
  await Promise.all(names.map(async (n) => {
    out[n] = (await loader.loadAsync(`${PROPS}${n}.glb`)).scene;
    soften(out[n]);
    onProgress?.(++done / names.length);
  }));
  return out;
}

// --------------------------------------------------------------------------------------------------------------
const TINTS = [0xffffff, 0xfff3e6, 0xf2fff0, 0xfff0f6].map((c) => new THREE.Color(c));

export class Stairs {
  static WINDOW = 70;

  constructor(scene, props) {
    const step = props.step.clone();
    fit(step, { width: 0.9 });
    step.scale.y *= 0.6;                    // flatter than the concept block -> reads as floating steps
    step.position.y = 0;
    const g = new THREE.Group(); g.add(step);
    fit(g, { width: 0.9 });
    g.updateMatrixWorld(true);
    this.top = new THREE.Box3().setFromObject(g).max.y; // stand height on a step
    this.mesh = instanced(g, Stairs.WINDOW);
    this.mesh.parts.forEach((p) => { p.castShadow = true; p.receiveShadow = true; });
    scene.add(this.mesh);

    const b = props.banana.clone();
    fit(b, { height: 0.42, center: true });
    this.bananaProto = new THREE.Group(); this.bananaProto.add(b);
    this.bananas = [];
    for (let i = 0; i < 10; i++) {
      const m = this.bananaProto.clone();
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      m.visible = false;
      scene.add(m); this.bananas.push(m);
    }

    // start platform: a fluffy cloud under step 0
    const base = props.cloud.clone();
    fit(base, { width: 2.4 });
    const h = new THREE.Box3().setFromObject(base).getSize(new THREE.Vector3()).y;
    this.baseHolder = new THREE.Group();
    this.baseHolder.add(base);
    this.baseHolder.position.set(0, -h + 0.15, -0.2);
    base.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    scene.add(this.baseHolder);

    this._m = new THREE.Matrix4();
    this.reset();
  }

  reset() {
    this.data = [{ x: 0, banana: false }];
    this.run = 0;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.lastBanana = 0;
    this.run = -3; // first few steps keep one direction
    this.ensure(Stairs.WINDOW + 10);
  }

  ensure(n) {
    while (this.data.length < n) {
      const i = this.data.length;
      // runs of 1-6 in one direction; switching gets a bit more frequent higher up
      const pSwitch = this.run < 1 ? 0 : Math.min(0.62, 0.3 + this.run * 0.06 + Math.min(i, 600) / 3000);
      if (Math.random() < pSwitch) { this.dir = -this.dir; this.run = 0; }
      this.run++;
      const banana = i > 6 && i - this.lastBanana >= 4 && Math.random() < 0.16;
      if (banana) this.lastBanana = i;
      this.data.push({ x: this.data[i - 1].x + this.dir, banana });
    }
  }

  /** world position of the standing point on step i */
  pos(i, out = new THREE.Vector3()) {
    this.ensure(i + 2);
    return out.set(this.data[i].x * SX, i * SY + this.top, -i * SZ);
  }

  dirAt(i) { this.ensure(i + 2); return this.data[i + 1].x - this.data[i].x; }

  update(cur, t) {
    const from = Math.max(0, cur - 16);
    this.ensure(from + Stairs.WINDOW + 2);
    const m = this._m, p = new THREE.Vector3();
    let b = 0;
    for (let k = 0; k < Stairs.WINDOW; k++) {
      const i = from + k;
      const d = this.data[i];
      p.set(d.x * SX, i * SY, -i * SZ);
      m.makeTranslation(p.x, p.y, p.z);
      this.mesh.setMatrixAt(k, m);
      this.mesh.setColorAt(k, TINTS[(i * 7 + (d.x & 3)) & 3]);
      if (d.banana && !d.taken && i > cur && b < this.bananas.length) {
        const ban = this.bananas[b++];
        ban.visible = true;
        ban.position.set(p.x, p.y + this.top + 0.38 + Math.sin(t * 3 + i) * 0.06, p.z);
        ban.rotation.set(0.25, t * 2.2 + i, 0.15);
      }
    }
    for (; b < this.bananas.length; b++) this.bananas[b].visible = false;
    this.mesh.commit();
    this.baseHolder.visible = cur < 30;
  }
}

// --------------------------------------------------------------------------------------------------------------
/** Slowly drifting clouds / islands / balloons that recycle around the camera. */
export class Decor {
  constructor(scene, props) {
    this.items = [];
    const add = (proto, n, cfg) => {
      for (let i = 0; i < n; i++) {
        const o = new THREE.Group();
        const m = proto.clone();
        fit(m, { width: rand(...cfg.size), center: true });
        o.add(m);
        o.userData = { ...cfg, vx: rand(-0.25, 0.25) * cfg.drift, spin: rand(-0.15, 0.15) };
        scene.add(o);
        this.items.push(o);
      }
    };
    add(props.cloud, 14, { size: [2.5, 5], z: [-32, -8], drift: 1 });
    add(props.cloud, 4, { size: [1.6, 2.6], z: [3, 5], drift: 1.4 }); // a few close ones in front
    add(props.island, 4, { size: [3, 5], z: [-48, -30], drift: 0.3 });
    add(props.balloon, 3, { size: [1.6, 2.4], z: [-28, -16], drift: 0.6, rise: true });
    this.placed = false;
  }

  place(o, cx, cy, cz, anywhere) {
    const u = o.userData;
    const z = cz + rand(...u.z);
    const spread = 6 + Math.abs(z - cz) * 0.55;
    o.position.set(cx + rand(-spread, spread), anywhere ? cy + rand(-10, 16) : cy + rand(12, 22), z);
    // keep the close-front clouds out of the middle of the view
    if (z > cz) o.position.x = cx + (Math.random() < 0.5 ? -1 : 1) * rand(2.2, 3.5);
    o.rotation.y = rand(0, Math.PI * 2);
  }

  update(dt, cx, cy, cz, t) {
    for (const o of this.items) {
      if (!this.placed) this.place(o, cx, cy, cz, true);
      const u = o.userData;
      o.position.x += u.vx * dt;
      o.rotation.y += u.spin * dt;
      if (u.rise) o.position.y += 0.15 * dt + Math.sin(t + o.id) * 0.002;
      if (o.position.y < cy - 14 || Math.abs(o.position.x - cx) > 30 || o.position.z > cz + 8) this.place(o, cx, cy, cz, false);
    }
    this.placed = true;
  }
}

// --------------------------------------------------------------------------------------------------------------
/** Pooled soft puff/sparkle particles. */
export class Puffs {
  constructor(scene) {
    this.pool = [];
    const geo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, fog: false }));
      m.visible = false; m.renderOrder = 5;
      scene.add(m);
      this.pool.push({ m, life: 0, max: 1, v: new THREE.Vector3(), s: 0.1 });
    }
  }

  burst(pos, { n = 16, color = 0xffffff, speed = 2.5, size = 0.18, life = 0.6, up = 0.5 } = {}) {
    let k = 0;
    for (const p of this.pool) {
      if (p.life > 0) continue;
      if (k++ >= n) break;
      p.m.position.copy(pos);
      p.v.set(rand(-1, 1), rand(-0.3, 1) + up, rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.5, 1));
      p.max = p.life = life * rand(0.7, 1.2);
      p.s = size * rand(0.6, 1.3);
      p.m.material.color.set(color);
      p.m.visible = true;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      p.m.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(Math.exp(-3 * dt));
      p.m.scale.setScalar(p.s * (0.4 + 0.9 * Math.sin(k * Math.PI)));
      p.m.material.opacity = Math.min(1, k * 1.6);
      if (p.life <= 0) p.m.visible = false;
    }
  }
}
