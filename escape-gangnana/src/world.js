// Loads the kitchen/hall environment (or a placeholder), collects anchors + colliders, sets up lights.
import * as THREE from 'three';
import { toPS1, ps1Material } from '../../shared/lib/ps1.js';

const DEFAULT_ANCHORS = {
  spawn_player: [0, 0, -2.8],
  dongwoo_start: [0, 0, -1.4],
  dongwoo_path_1: [0, 0, 0.4],
  dongwoo_path_2: [1.2, 0, 3.0],
  dongwoo_path_3: [1.2, 0, 6.6],
  light_kitchen: [0, 2.5, -1.8],
  light_hall_1: [-1, 2.6, 2.5],
  light_hall_2: [1, 2.6, 4.5],
};

function placeholder() {
  const root = new THREE.Group();
  const box = (name, w, h, d, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
    m.name = name;
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  // kitchen
  box('floor_k', 2.4, 0.02, 3.6, 0, -0.01, -1.8, 0x7a2a22);
  box('ceiling_k', 2.4, 0.02, 3.6, 0, 2.6, -1.8, 0xdddddd);
  box('col_wall_l', 0.1, 2.6, 3.6, -1.25, 1.3, -1.8, 0x3a3b3d);
  box('col_wall_r', 0.1, 2.6, 3.6, 1.25, 1.3, -1.8, 0x3a3b3d);
  box('col_wall_b', 2.4, 2.6, 0.1, 0, 1.3, -3.65, 0x3a3b3d);
  box('col_prep', 2.0, 0.9, 0.6, 0, 0.45, -3.3, 0xa8acb0);
  // hall
  box('floor_h', 6, 0.02, 7, 0, -0.01, 3.5, 0x4a3a30);
  box('col_hall_l', 0.1, 2.8, 7, -3, 1.4, 3.5, 0x6b4a3a);
  box('col_hall_r', 0.1, 2.8, 7, 3, 1.4, 3.5, 0x6b4a3a);
  box('col_front_l', 2.2, 2.8, 0.1, -1.9, 1.4, 7, 0x6b4a3a);
  box('col_front_r', 1.4, 2.8, 0.1, 2.3, 1.4, 7, 0x6b4a3a);
  const door = new THREE.Group();
  door.name = 'front_door';
  door.position.set(0.7, 0, 7);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.35 }));
  glass.position.set(0.5, 1.05, 0);
  door.add(glass);
  root.add(door);
  for (const [name, p] of Object.entries(DEFAULT_ANCHORS)) {
    const e = new THREE.Object3D();
    e.name = name;
    e.position.fromArray(p);
    root.add(e);
  }
  return root;
}

export async function loadWorld(scene, loader, onProgress) {
  let root;
  try {
    root = (await loader.loadAsync('../shared/assets/env/kitchen.glb', onProgress)).scene;
  } catch (e) {
    console.warn('kitchen.glb not found, using placeholder', e);
    root = placeholder();
  }
  scene.add(root);
  root.updateMatrixWorld(true);

  const anchors = {};
  const colliders = [];
  root.traverse((o) => {
    if (o.name.startsWith('col_')) {
      colliders.push(new THREE.Box3().setFromObject(o));
      o.visible = false;
      return;
    }
    if (o.isMesh) {
      // big triangles (walls, floor, ceiling) warp badly with affine mapping; keep it for small props only
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      const big = Math.max(size.x, size.y, size.z) > 0.9;
      o.material = toPS1(o.material, { affine: !big });
    }
    if (o.name) anchors[o.name] = o;
  });
  // anything the env didn't provide falls back to defaults
  for (const [name, p] of Object.entries(DEFAULT_ANCHORS)) {
    if (!anchors[name]) {
      const e = new THREE.Object3D();
      e.name = name;
      e.position.fromArray(p);
      root.add(e);
      e.updateMatrixWorld(true);
      anchors[name] = e;
    }
  }

  const pos = (name) => anchors[name].getWorldPosition(new THREE.Vector3());

  // --- lighting: cold fluorescent kitchen, dim warm hall ---
  const hemi = new THREE.HemisphereLight(0x8090a0, 0x200808, 0.35);
  scene.add(hemi);
  const kitchen = new THREE.PointLight(0xe8f2ff, 9, 9, 1.6);
  kitchen.position.copy(pos('light_kitchen'));
  scene.add(kitchen);
  const hall = [];
  for (const n of ['light_hall_1', 'light_hall_2']) {
    const l = new THREE.PointLight(0xffb070, 2.2, 7, 1.8);
    l.position.copy(pos(n));
    scene.add(l);
    hall.push(l);
  }
  // fluorescent tube visual (env provides `kitchen_light_tube`; placeholder otherwise)
  let tube = root.getObjectByName('kitchen_light_tube');
  if (!tube) {
    tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.08),
      ps1Material({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 1.5 }));
    tube.position.copy(pos('light_kitchen')).setY(pos('light_kitchen').y + 0.05);
    scene.add(tube);
  }
  const tubeMats = [];
  tube.traverse((o) => o.isMesh && tubeMats.push(...[o.material].flat()));
  kitchen.userData.tube = tubeMats.map((m) => ({ m, base: m.emissiveIntensity }));
  const bulbs = [];
  root.traverse((o) => o.isMesh && /hall_lamp.*bulb/.test(o.name) && bulbs.push(...[o.material].flat().map((m) => ({ m, base: m.emissiveIntensity }))));

  return { ps1Material, root, anchors, colliders, pos, lights: { kitchen, hall, hemi, bulbs }, door: root.getObjectByName('front_door') };
}

/** Occasional fluorescent flicker; the tube mesh dims together with the light. */
export function flicker(light, base, t) {
  const n = Math.sin(t * 2.1) * Math.sin(t * 7.3) * Math.sin(t * 0.37);
  const k = n > 0.82 ? (Math.random() < 0.5 ? 0.15 : 0.9) : 1;
  light.intensity = base * k;
  for (const { m, base: b } of light.userData.tube || []) m.emissiveIntensity = b * k;
}
