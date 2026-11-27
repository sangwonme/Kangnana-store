// Pose library + time-based evaluation. Everything here is a pure function of game time t:
// the same t always gives the same pose (rendering, wall-hole generation and judging all call these).
import { NEUTRAL } from '../../shared/lib/rig.js';

export const PARTS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];
export const SLOTS = {
  full: { label: '전신', parts: PARTS, cat: 'full' },
  upper: { label: '상체', parts: ['torso', 'head', 'armL', 'armR'], cat: 'upper' },
  lower: { label: '하체', parts: ['legL', 'legR'], cat: 'lower' },
  torso: { label: '몸통', parts: ['torso', 'head'], cat: 'torso' },
  // he faces the camera, so labels follow the screen side (his right arm is on the screen's left)
  armL: { label: '팔 ▶', parts: ['armL'], cat: 'arm' },
  armR: { label: '◀ 팔', parts: ['armR'], cat: 'arm' },
  legL: { label: '다리 ▶', parts: ['legL'], cat: 'leg' },
  legR: { label: '◀ 다리', parts: ['legR'], cat: 'leg' },
};
export const NEUTRAL_ID = { full: 'f_stand', upper: 'n_upper', lower: 'n_lower', torso: 'n_torso', arm: 'n_arm', leg: 'n_leg' };
export const TRANS = 0.12; // seconds a part takes to blend into a newly chosen preset

const LIMB = (p) => p.startsWith('arm') || p.startsWith('leg');
const lerp = (a, b, s) => a + (b - a) * s;

/** Fill a (possibly partial) part param object with the neutral values. */
function full(part, src) {
  const n = NEUTRAL[part];
  if (LIMB(part)) {
    return {
      upper: { a: src?.upper?.a ?? n.upper.a, f: src?.upper?.f ?? n.upper.f },
      lower: { a: src?.lower?.a ?? n.lower.a, f: src?.lower?.f ?? n.lower.f },
    };
  }
  const o = {};
  for (const k of Object.keys(n)) o[k] = src?.[k] ?? n[k];
  return o;
}

export function lerpPart(part, A, B, s) {
  if (LIMB(part)) {
    return {
      upper: { a: lerp(A.upper.a, B.upper.a, s), f: lerp(A.upper.f, B.upper.f, s) },
      lower: { a: lerp(A.lower.a, B.lower.a, s), f: lerp(A.lower.f, B.lower.f, s) },
    };
  }
  const o = {};
  for (const k of Object.keys(A)) o[k] = lerp(A[k], B[k], s);
  return o;
}

function pick(parts, part) {
  if (!parts) return undefined;
  return parts[part] ?? (part.startsWith('arm') ? parts.arm : part.startsWith('leg') ? parts.leg : undefined);
}

export class PoseLib {
  constructor(json) {
    this.list = json.presets;
    this.byId = new Map(this.list.map((p) => [p.id, p]));
    this.cat = {};
    for (const p of this.list) {
      p.kind ??= 'static';
      (this.cat[p.cat] ??= []).push(p);
    }
  }

  get(id) { return this.byId.get(id); }

  isDynamic(id) {
    const p = this.get(id);
    if (!p) return false;
    if (p.upper || p.lower) return this.isDynamic(p.upper) || this.isDynamic(p.lower);
    return p.kind === 'dynamic';
  }

  /** Full params of `part` for preset `id` at game time t. id null -> neutral. */
  params(id, part, t) {
    const p = id && this.get(id);
    if (!p) return full(part);
    if (p.upper || p.lower) {
      const sub = part.startsWith('leg') ? p.lower : p.upper;
      return this.params(sub, part, t);
    }
    if (p.kind !== 'dynamic') return full(part, pick(p.parts, part));
    // dynamic: phase locked to the global game clock
    const local = (t * (p.speed ?? 1)) / p.period + (p.phase ?? 0);
    const u = local - Math.floor(local);
    const keys = p.keys;
    let k = keys.length - 1;
    while (k > 0 && keys[k].u > u) k--;
    const a = keys[k];
    const b = keys[k + 1] ?? { u: 1, parts: keys[0].parts };
    let s = (u - a.u) / Math.max(1e-6, b.u - a.u);
    if (p.interp === 'step') s = 0;
    else if (p.interp !== 'linear') s = s * s * (3 - 2 * s);
    return lerpPart(part, full(part, pick(a.parts, part)), full(part, pick(b.parts, part)), s);
  }

  /** Pose of a slot configuration { slot: presetId } at time t (no transitions). */
  configPose(config, t) {
    const pose = {};
    for (const part of PARTS) pose[part] = full(part);
    for (const [slot, id] of Object.entries(config)) {
      for (const part of SLOTS[slot].parts) pose[part] = this.params(id, part, t);
    }
    return pose;
  }
}

/** Per-part history of preset choices with timestamps -> exact pose at any time, including blends. */
export class PoseState {
  constructor(lib) {
    this.lib = lib;
    this.reset();
  }

  reset(config = {}) {
    this.tracks = {};
    for (const part of PARTS) this.tracks[part] = [{ ts: -1e9, id: null }];
    for (const [slot, id] of Object.entries(config)) this.setSlot(slot, id, -1e9);
  }

  setSlot(slot, id, ts) {
    for (const part of SLOTS[slot].parts) {
      const h = this.tracks[part];
      if (h[h.length - 1].ts === ts) h.pop();
      h.push({ ts, id });
      while (h.length > 16) h.shift();
    }
  }

  partAt(part, t) {
    const h = this.tracks[part];
    let i = h.length - 1;
    while (i > 0 && h[i].ts > t) i--;   // choices made after t don't exist yet at t
    return this.evalIdx(part, h, i, t);
  }

  evalIdx(part, h, i, t) {
    const e = h[i];
    const p = this.lib.params(e.id, part, t);
    const dt = t - e.ts;
    if (i > 0 && dt < TRANS) {
      const s = dt / TRANS;
      return lerpPart(part, this.evalIdx(part, h, i - 1, t), p, s * s * (3 - 2 * s));
    }
    return p;
  }

  poseAt(t) {
    const pose = {};
    for (const part of PARTS) pose[part] = this.partAt(part, t);
    return pose;
  }
}
