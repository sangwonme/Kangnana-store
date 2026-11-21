// Animated character wrapper (glTF + AnimationMixer) with a placeholder fallback and waypoint walking.
import * as THREE from 'three';
import { toPS1, ps1Material } from './ps1.js';
import { makeHood } from './cooking.js';

function placeholderBody(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.95, 4, 8), ps1Material({ color }));
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), ps1Material({ color: 0xd8b49a }));
  head.position.y = 1.58;
  g.add(body, head);
  return g;
}

export class Character {
  static async load(loader, url, { fallbackColor = 0x111111 } = {}) {
    try {
      const gltf = await loader.loadAsync(url);
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.material = toPS1(o.material);
          o.frustumCulled = false; // skinned bounds are unreliable
        }
      });
      return new Character(gltf.scene, gltf.animations);
    } catch (e) {
      console.warn(`${url} not found, using placeholder`, e);
      const c = new Character(placeholderBody(fallbackColor), []);
      c.placeholder = true;
      return c;
    }
  }

  constructor(model, clips) {
    this.root = new THREE.Group();
    this.root.add(model);
    this.mouth = new THREE.Object3D();
    this.mouth.position.y = 1.55;
    this.root.add(this.mouth);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
    this.current = null;
    this.path = null;
    this.onStep = null;
    this.stepDist = 0;
  }

  has(name) { return !!this.actions[name]; }

  /** Cross-fade to a clip. once=true plays it a single time then returns to `then`. */
  play(name, { fade = 0.35, once = false, then = 'idle' } = {}) {
    const next = this.actions[name];
    if (!next) return 0;
    if (this.current === next && !once) return next.getClip().duration;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
    if (once && this.actions[then]) {
      const d = next.getClip().duration;
      clearTimeout(this._onceTimer);
      this._onceTimer = setTimeout(() => this.current === next && this.play(then, { fade }), (d - fade) * 1000);
    }
    return next.getClip().duration;
  }

  faceTo(point, dt = 0, rate = 6) {
    const d = point.clone().sub(this.root.position);
    const target = Math.atan2(d.x, d.z); // glTF forward = +Z
    if (!dt) { this.root.rotation.y = target; return; }
    let dy = target - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * (1 - Math.exp(-rate * dt));
  }

  /** Walk through world-space waypoints; resolves when the last one is reached. */
  walk(points, speed = 1.4) {
    this.play(this.has('walk') ? 'walk' : 'idle', { fade: 0.25 });
    return new Promise((resolve) => { this.path = { points: points.slice(), speed, resolve }; });
  }

  /** Hold a single frame of a clip (e.g. kneeling pose). */
  freeze(name, t = 0) {
    const a = this.actions[name];
    if (!a) return;
    this.play(name, { fade: 0 });
    a.time = t;
    a.paused = true;
    this.frozen = a;
  }

  unfreeze() {
    if (this.frozen) { this.frozen.paused = false; this.frozen = null; }
  }

  /** Banana hat that follows the head bone (bones live under a 0.01-scaled armature, so we don't parent to them). */
  setHat(on) {
    if (on && !this.hat) {
      this.hat = makeHood(0.75);
      this.root.parent?.add(this.hat);
      this.head = this.root.getObjectByName('Head');
    }
    this.hatOn = on;
  }

  update(dt) {
    this.mixer.update(dt);
    if (this.hat) {
      this.hat.visible = !!this.hatOn && this.root.visible;
      if (this.head) this.head.getWorldPosition(this.hat.position).y -= 0.08;
      else this.hat.position.copy(this.root.position).setY(1.62);
      this.hat.rotation.y = this.root.rotation.y;
    }
    if (!this.path) return;
    const target = this.path.points[0];
    const pos = this.root.position;
    const to = target.clone().sub(pos).setY(0);
    const dist = to.length();
    const step = this.path.speed * dt;
    this.faceTo(target, dt, 8);
    if (dist <= step) {
      pos.copy(target).setY(pos.y);
      this.path.points.shift();
      this.path.onWaypoint?.(this.path.points.length);
      if (!this.path.points.length) {
        const r = this.path.resolve;
        this.path = null;
        this.play('idle', { fade: 0.3 });
        r();
      }
    } else {
      pos.addScaledVector(to.divideScalar(dist), step);
    }
    this.stepDist += Math.min(step, dist);
    if (this.stepDist > 0.6) { this.stepDist = 0; this.onStep?.(); }
  }
}
