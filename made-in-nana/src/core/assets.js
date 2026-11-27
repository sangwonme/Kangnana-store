// Cached loaders. Models come from ../shared/assets, images from assets/img (this game) unless a path is given.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const SHARED = '../shared/assets/';
const MODEL_DIRS = { models: ['gangnana', 'gangnana_cute', 'darknana', 'dongwoo', 'dongwoo_cozy', 'dongwoo_cute', 'dongwoo_crowd_0',
  'dongwoo_crowd_1', 'jiwon', 'kbs', 'kkr', 'rider', 'rider_banana'], env: ['kitchen'] };
const gltf = new GLTFLoader();
const cache = new Map();

function once(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function modelUrl(name) {
  if (name.includes('/')) return name;
  for (const [dir, names] of Object.entries(MODEL_DIRS)) if (names.includes(name)) return `${SHARED}${dir}/${name}.glb`;
  return `${SHARED}props/${name}.glb`;
}

export const A = {
  THREE,
  /** Load a glb template once: {scene, animations}. name = 'gangnana' | 'banana' | 'kitchen' | full url. */
  glb(name) { return once(`glb:${name}`, () => gltf.loadAsync(modelUrl(name))); },

  /** Fresh copy of a loaded model (skinned-safe). Returns {root, animations, clips:{name:clip}}. */
  async instance(name) {
    const g = await A.glb(name);
    const root = SkeletonUtils.clone(g.scene);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = false;
      o.frustumCulled = false;
      // own materials (games recolor them freely); geometry stays shared with the cached template and is never disposed
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      o.geometry.userData.keep = true;
    });
    const clips = Object.fromEntries(g.animations.map((c) => [c.name, c]));
    return { root, animations: g.animations, clips };
  },

  img(path) {
    const url = path.includes('/') ? path : `assets/img/${path}`;
    return once(`img:${url}`, () => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`img ${url}`));
      im.src = url;
    }));
  },

  texture(path) {
    return once(`tex:${path}`, async () => {
      const t = new THREE.Texture(await A.img(path));
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    });
  },
};

/** Normalize a model: scale so its height is `h`, put its feet at y=0 and center x/z. */
export function fitHeight(root, h) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const s = h / (size.y || 1);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box.min.y;
  return root;
}
