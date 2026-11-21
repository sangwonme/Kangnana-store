// Fail effect: a burst of mini bananas that tumble, bounce on the floor and settle.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

export class BananaRain {
  constructor(scene, proto, count = 60) {
    this.items = [];
    if (!proto) return;
    const p = proto.clone();
    const box = new THREE.Box3().setFromObject(p), size = box.getSize(new THREE.Vector3());
    p.scale.multiplyScalar(0.2 / Math.max(size.x, size.y, size.z));     // ~20 cm bananas
    p.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(p.scale.x));
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const m = p.clone();
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(m);
      g.visible = false;
      scene.add(g);
      this.items.push({ g, v: new THREE.Vector3(), w: new THREE.Vector3(), live: false });
    }
  }

  burst(at, n) {
    let k = 0;
    for (const b of this.items) {
      if (k++ >= n) break;
      b.live = true;
      b.g.visible = true;
      b.g.position.copy(at).add(new THREE.Vector3(rand(-0.25, 0.25), rand(-0.4, 0.4), rand(-0.1, 0.1)));
      const a = rand(0, Math.PI * 2);
      b.v.set(Math.cos(a) * rand(0.5, 2.6), rand(1.5, 5), rand(0.8, 3.2)); // outward, up, toward the camera
      b.w.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
      b.g.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    }
  }

  update(dt) {
    for (const b of this.items) {
      if (!b.live) continue;
      b.v.y -= 9.8 * dt;
      b.g.position.addScaledVector(b.v, dt);
      b.g.rotation.x += b.w.x * dt; b.g.rotation.y += b.w.y * dt; b.g.rotation.z += b.w.z * dt;
      if (b.g.position.y < 0.04) {
        b.g.position.y = 0.04;
        b.v.y = Math.abs(b.v.y) * 0.35;
        b.v.x *= 0.6; b.v.z *= 0.6; b.w.multiplyScalar(0.5);
        if (b.v.lengthSq() < 0.05) b.live = false;
      }
    }
  }

  clear() { for (const b of this.items) { b.live = false; b.g.visible = false; } }
}
