// Skeleton-agnostic pose solver.
// Bones are found by name only for hands, feet and head; arm/leg chains, neck and spine are walked from the hierarchy,
// so renamed / re-rigged / hand-edited models keep working. Unresolvable joints can be named in data/rig.json.
// Poses are limb DIRECTIONS in the model's body frame (model faces +Z, its left is +X, up +Y), solved against the
// model's own bind pose -> T-pose and A-pose rigs, any bone axis convention.
import * as THREE from 'three';

const LEFT = (n) => /left/i.test(n) || /(^|[_.\s:-])l([_.\s:-]|$)/i.test(n) || /^l[A-Z]/.test(n);
const RIGHT = (n) => /right/i.test(n) || /(^|[_.\s:-])r([_.\s:-]|$)/i.test(n) || /^r[A-Z]/.test(n);
const FINGER = /finger|thumb|index|middle|ring|pinky|little|toe|end|nub|twist|top|front|tip/i;

function findBone(bones, re, side) {
  const c = bones.filter((b) => re.test(b.name) && !FINGER.test(b.name) && (!side || (side === 'L' ? LEFT(b.name) && !RIGHT(b.name) : RIGHT(b.name) && !LEFT(b.name))));
  c.sort((a, b) => a.name.length - b.name.length);
  return c[0] || null;
}

/** Resolve the joints we pose. overrides: { handL: 'BoneName', footR: ..., head: ..., hips: ... } */
export function mapSkeleton(root, overrides = {}) {
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o); });
  const byName = (n) => bones.find((b) => b.name === n) || null;
  const get = (key, re, side) => (overrides[key] && byName(overrides[key])) || findBone(bones, re, side);
  const handL = get('handL', /hand|wrist/i, 'L'), handR = get('handR', /hand|wrist/i, 'R');
  const footL = get('footL', /foot|ankle/i, 'L'), footR = get('footR', /foot|ankle/i, 'R');
  const head = get('head', /head/i);
  const missing = [];
  const need = { handL, handR, footL, footR, head };
  for (const [k, v] of Object.entries(need)) if (!v) missing.push(k);
  if (missing.length) return { ok: false, missing, bones: bones.map((b) => b.name) };

  const up = (b, k) => (overrides[k] && byName(overrides[k])) || b.parent;
  const arm = (hand, s) => {
    const lower = up(hand, `forearm${s}`), upper = up(lower, `upperarm${s}`);
    return { upper, lower, end: hand };
  };
  const leg = (foot, s) => {
    const lower = up(foot, `shin${s}`), upper = up(lower, `thigh${s}`);
    return { upper, lower, end: foot };
  };
  const m = { armL: arm(handL, 'L'), armR: arm(handR, 'R'), legL: leg(footL, 'L'), legR: leg(footR, 'R'), head };
  m.neck = (overrides.neck && byName(overrides.neck)) || head.parent;
  m.hips = (overrides.hips && byName(overrides.hips)) || commonAncestor(m.legL.upper, m.legR.upper);
  m.spine = [];
  for (let b = m.neck.parent; b && b !== m.hips && b.isBone; b = b.parent) m.spine.unshift(b);
  m.ok = true;
  m.all = bones;
  return m;
}

function commonAncestor(a, b) {
  const s = new Set();
  for (let x = a; x; x = x.parent) s.add(x);
  for (let x = b; x; x = x.parent) if (s.has(x)) return x;
  return null;
}

// ------------------------------------------------------------------------------------------ pose parameters
// arm/leg segment: { a, f } degrees. a: 0 = straight down, 90 = straight out to that side, 180 = up, negative = across
// the body. f: tilt toward the front. Directions are absolute (body frame), so a pose reads the same on every rig.
// torso: { lean (toward the character's left), bend (forward), twist }  head: { tilt, nod, turn }
export const NEUTRAL = {
  torso: { lean: 0, bend: 0, twist: 0 },
  head: { tilt: 0, nod: 0, turn: 0 },
  armL: { upper: { a: 10, f: 0 }, lower: { a: 7, f: 3 } },
  armR: { upper: { a: 10, f: 0 }, lower: { a: 7, f: 3 } },
  legL: { upper: { a: 3, f: 0 }, lower: { a: 2, f: 0 } },
  legR: { upper: { a: 3, f: 0 }, lower: { a: 2, f: 0 } },
};

const D2R = Math.PI / 180;
export function segDir(seg, side, out = new THREE.Vector3()) {
  const a = (seg.a ?? 0) * D2R, f = (seg.f ?? 0) * D2R;
  return out.set(side * Math.sin(a) * Math.cos(f), -Math.cos(a) * Math.cos(f), Math.sin(f)).normalize();
}

// ------------------------------------------------------------------------------------------ solver
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Euler();

export class PoseRig {
  /** model: the glTF scene (contains the SkinnedMesh + bones). It is posed in its own space. */
  constructor(model, overrides) {
    this.model = model;
    this.map = mapSkeleton(model, overrides);
    if (!this.map.ok) throw new Error(`rig: missing ${this.map.missing.join(', ')} (bones: ${this.map.bones.join(', ')})`);
    this.bind = this.map.all.map((b) => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
    this.update();
    this.bindFoot = Math.min(this.modelPos(this.map.legL.end).y, this.modelPos(this.map.legR.end).y);
    this.rootOffset = 0;
  }

  reset() {
    for (const [b, p, q, s] of this.bind) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(s); }
    this.update();
  }

  update() {
    this.model.updateMatrixWorld(true);
    _inv.copy(this.model.matrixWorld).invert();
  }

  modelMatrix(o, out = _m) { return out.multiplyMatrices(_inv, o.matrixWorld); }
  modelPos(o, out = new THREE.Vector3()) { return out.setFromMatrixPosition(this.modelMatrix(o)); }
  modelQuat(o, out = new THREE.Quaternion()) { this.modelMatrix(o).decompose(_p, out, _s); return out; }

  /** Rotate bone b about its own origin by q (expressed in model space). */
  rotateModel(b, q) {
    const pq = this.modelQuat(b.parent, new THREE.Quaternion());
    const bq = _q2.copy(pq).multiply(b.quaternion);       // bone orientation in model space
    bq.premultiply(q);
    b.quaternion.copy(pq.invert().multiply(bq));
    b.updateMatrixWorld(true);
  }

  aim(seg, target) {
    const from = this.modelPos(seg.bone, _a), to = this.modelPos(seg.child, _b);
    _d.subVectors(to, from).normalize();
    _q.setFromUnitVectors(_d, target);
    this.rotateModel(seg.bone, _q);
  }

  /** Apply a full parameter pose. Returns the vertical offset that keeps the lowest foot on its bind height. */
  apply(pose) {
    this.reset();
    const M = this.map;
    const t = pose.torso, h = pose.head;
    if (t && (t.lean || t.bend || t.twist) && M.spine.length) {
      const n = M.spine.length;
      _q.setFromEuler(_e.set((t.bend || 0) * D2R / n, (t.twist || 0) * D2R / n, -(t.lean || 0) * D2R / n, 'YXZ'));
      const qq = _q.clone();
      for (const b of M.spine) this.rotateModel(b, qq);
    }
    if (h && (h.tilt || h.nod || h.turn)) {
      _q.setFromEuler(_e.set((h.nod || 0) * D2R * 0.5, (h.turn || 0) * D2R * 0.5, -(h.tilt || 0) * D2R * 0.5, 'YXZ'));
      const qq = _q.clone();
      this.rotateModel(M.neck, qq);
      this.rotateModel(M.head, qq);
    }
    for (const [k, side] of [['armL', 1], ['armR', -1], ['legL', 1], ['legR', -1]]) {
      const p = pose[k], c = M[k];
      if (!p) continue;
      if (p.upper) this.aim({ bone: c.upper, child: c.lower }, segDir(p.upper, side, new THREE.Vector3()));
      if (p.lower) this.aim({ bone: c.lower, child: c.end }, segDir(p.lower, side, new THREE.Vector3()));
    }
    const foot = Math.min(this.modelPos(M.legL.end, _a).y, this.modelPos(M.legR.end, _b).y);
    this.rootOffset = this.bindFoot - foot;
    return this.rootOffset;
  }
}
