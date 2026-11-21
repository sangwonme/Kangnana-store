// First-person controller: pointer-lock mouse look, WASD, circle-vs-AABB collision, head bob, footsteps.
import * as THREE from 'three';

const EYE = 1.6;
const RADIUS = 0.28;
const SPEED = 1.7;

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.canMove = false;
    this.canLook = true;
    this.colliders = [];
    this.keys = new Set();
    this.bob = 0;
    this.stepDist = 0;
    this.onStep = null;
    this.lastLook = 0;
    this.locks = new Set(); // reader / choice / timed actions freeze the player
    this.joy = new THREE.Vector2(); // mobile joystick, -1..1 (y down = backward)

    addEventListener('keydown', (e) => { if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      this.lookBy(e.movementX, e.movementY);
    });
  }

  /** Rotate the view by a pixel delta (mouse or touch drag). */
  lookBy(dx, dy) {
    if (!this.canLook || this.locks.size) return;
    this.lastLook = performance.now();
    this.yaw -= dx * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022, -1.35, 1.35);
  }

  place(position, lookAt) {
    this.pos.copy(position).setY(0);
    if (lookAt) {
      const d = lookAt.clone().sub(this.pos);
      this.yaw = Math.atan2(-d.x, -d.z);
    }
    this.pitch = 0;
    this.apply(0);
  }

  /** Smoothly turn the view toward a point (used by cutscenes). */
  lookToward(target, dt, rate = 3) {
    const d = target.clone().sub(this.camera.position);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    let dy = yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = 1 - Math.exp(-rate * dt);
    this.yaw += dy * k;
    this.pitch += (pitch - this.pitch) * k;
  }

  collide(p) {
    for (const b of this.colliders) {
      if (b.max.y < 0.15 || b.min.y > EYE) continue; // floor plates / overhead shelves
      const cx = THREE.MathUtils.clamp(p.x, b.min.x, b.max.x);
      const cz = THREE.MathUtils.clamp(p.z, b.min.z, b.max.z);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = RADIUS - d;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
        } else {
          // center inside box: push out along the shallowest axis
          const ox = Math.min(p.x - b.min.x, b.max.x - p.x), oz = Math.min(p.z - b.min.z, b.max.z - p.z);
          if (ox < oz) p.x = p.x - b.min.x < b.max.x - p.x ? b.min.x - RADIUS : b.max.x + RADIUS;
          else p.z = p.z - b.min.z < b.max.z - p.z ? b.min.z - RADIUS : b.max.z + RADIUS;
        }
      }
    }
  }

  update(dt) {
    let moving = false;
    if (this.canMove && !this.locks.size) {
      const f = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
      const s = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
      const jf = -this.joy.y, js = this.joy.x;
      const F = THREE.MathUtils.clamp(f + jf, -1, 1), S = THREE.MathUtils.clamp(s + js, -1, 1);
      if (Math.hypot(F, S) > 0.15) {
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        const mag = Math.min(1, Math.hypot(F, S));
        const v = new THREE.Vector3(-sin * F + cos * S, 0, -cos * F - sin * S).normalize().multiplyScalar(SPEED * dt * mag);
        const before = this.pos.clone();
        this.pos.add(v);
        this.collide(this.pos);
        const moved = before.distanceTo(this.pos);
        moving = moved > 1e-4;
        this.stepDist += moved;
        if (this.stepDist > 0.62) {
          this.stepDist = 0;
          this.onStep?.();
        }
      }
    }
    this.bob = moving ? this.bob + dt * 9 : this.bob * 0.9;
    this.apply(dt, moving);
  }

  apply(dt, moving = false) {
    const bobY = moving ? Math.sin(this.bob) * 0.03 : 0;
    this.camera.position.set(this.pos.x, EYE + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
