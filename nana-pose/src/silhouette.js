// Silhouette masks: the character rendered flat-white by an orthographic camera that looks along the wall's travel
// axis. Wall holes and judging use this exact same renderer + projection, so what you see is what is judged.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PoseRig } from './rig.js';

// window of the world (x, y at the wall plane) covered by a mask
export const WIN = { x0: -1.6, x1: 1.6, y0: -0.05, y1: 2.45 };
export const MW = 128, MH = 100;

export class Silhouette {
  constructor(renderer, source, overrides) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.holder = new THREE.Group();
    // faces the camera (+Z) like the player character; the mask is seen from the camera side
    this.scene.add(this.holder);
    this.model = cloneSkinned(source);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.model.traverse((o) => { if (o.isMesh) { o.material = this.mat; o.frustumCulled = false; } });
    this.holder.add(this.model);
    this.rig = new PoseRig(this.model, overrides);
    this.cam = new THREE.OrthographicCamera(WIN.x0, WIN.x1, WIN.y1, WIN.y0, 0.1, 40);
    this.cam.position.set(0, 0, 20);
    this.rt = new THREE.WebGLRenderTarget(MW, MH, { depthBuffer: true });
    this.buf = new Uint8Array(MW * MH * 4);
  }

  pose(pose) {
    this.holder.position.y = this.rig.apply(pose);
  }

  /** Render pose -> binary mask (row 0 = bottom). */
  mask(pose, out = new Uint8Array(MW * MH)) {
    this.pose(pose);
    const r = this.renderer;
    const prevRT = r.getRenderTarget(), prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(this.scene, this.cam);
    r.readRenderTargetPixels(this.rt, 0, 0, MW, MH, this.buf);
    r.setRenderTarget(prevRT);
    r.setClearColor(prevColor, prevAlpha);
    for (let i = 0; i < MW * MH; i++) out[i] = this.buf[i * 4] > 127 ? 1 : 0;
    return out;
  }
}

/** Square max-filter (separable). */
export function dilate(src, r) {
  const tmp = new Uint8Array(MW * MH), out = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < MW) v = src[y * MW + xx]; }
      tmp[y * MW + x] = v;
    }
  }
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < MH) v = tmp[yy * MW + x]; }
      out[y * MW + x] = v;
    }
  }
  return out;
}

// Absolute pixel budgets (128x100 mask, body ~1200 px): a single limb in a different place is far above them,
// while the exact pose scores 0/0. Fractions of the whole body let one-limb differences slip through.
export const RULE = { outsidePx: 14, missingPx: 18, dilate: 2 };

/** Does `actual` pass through a wall whose hole is `hole` (= `target` dilated)?
 *  outside: body pixels hitting the wall. missing: hole pixels the body doesn't fill (too-big-hole guard). */
export function judge(actual, target, hole) {
  const near = dilate(actual, RULE.dilate);
  let outside = 0, missing = 0, area = 0, tArea = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i]) { area++; if (!hole[i]) outside++; }
    if (target[i]) { tArea++; if (!near[i]) missing++; }
  }
  return {
    pass: outside <= RULE.outsidePx && missing <= RULE.missingPx,
    outside: area ? outside / area : 1, cover: tArea ? 1 - missing / tArea : 0, outsidePx: outside, missingPx: missing,
  };
}

/** Pixels touching the top/left/right edge -> pose leaves the window (not a fair hole). */
export function touchesEdge(mask) {
  for (let x = 0; x < MW; x++) if (mask[(MH - 1) * MW + x]) return true;
  for (let y = 0; y < MH; y++) if (mask[y * MW] || mask[y * MW + MW - 1]) return true;
  return false;
}

export function sameMask(a, b) {
  let d = 0, n = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) d++; if (a[i] || b[i]) n++; }
  return n ? d / n : 0;
}
