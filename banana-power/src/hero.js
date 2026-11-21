// The player: chibi 동우 and his banana form 강나나, sharing one transform; each form has its own mixer/clips.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fit } from './world.js';

const MODELS = '../shared/assets/models/';
const HEIGHT = 0.85;

class Form {
  constructor(gltf) {
    this.model = gltf.scene;
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      o.material.roughness = 0.75; o.material.metalness = 0; o.material.envMapIntensity = 0.8;
    });
    this.root = new THREE.Group();
    this.root.add(this.model);
    fit(this.root, { height: HEIGHT });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const c of gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
    this.current = null;
  }

  play(name, { fade = 0.15, once = false, speed = 1 } = {}) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = speed;
    if (this.current === a && !once) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    if (this.current && fade > 0) a.crossFadeFrom(this.current, fade, false);
    else if (this.current) this.current.stop();
    a.play();
    this.current = a;
  }
}

export class Hero {
  static async load() {
    const loader = new GLTFLoader();
    const [d, g] = await Promise.all(['dongwoo_cute', 'gangnana_cute'].map((n) => loader.loadAsync(`${MODELS}${n}.glb`)));
    return new Hero(new Form(d), new Form(g));
  }

  constructor(dongwoo, gangnana) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();     // squash & stretch lives here
    this.group.add(this.body);
    this.forms = { dongwoo, gangnana };
    for (const f of Object.values(this.forms)) this.body.add(f.root);
    this.yaw = 0;
    this.squash = 0;
    this.setForm('dongwoo');
  }

  get form() { return this.forms[this.formName]; }

  setForm(name) {
    const prev = this.form?.current?.getClip().name;
    this.formName = name;
    for (const [n, f] of Object.entries(this.forms)) f.root.visible = n === name;
    if (prev) this.play(prev, { fade: 0 });
  }

  play(name, opts) {
    const f = this.form;
    if (!f.actions[name]) name = { climb: 'run', run: 'climb' }[name] || 'idle';
    f.play(name, opts);
  }

  face(dir) { this.yaw = dir * (Math.PI / 2 - 0.45); } // sideways, turned a little toward the camera

  land() { this.squash = 1; }

  update(dt) {
    this.form.mixer.update(dt);
    let d = this.yaw - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * (1 - Math.exp(-28 * dt));
    this.squash = Math.max(0, this.squash - dt * 7);
    const s = Math.sin(this.squash * Math.PI) * 0.12;
    this.body.scale.set(1 + s, 1 - s, 1 + s);
  }
}
