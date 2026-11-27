// 07 썰어라! — 도마 위 바나나를 점선대로 스와이프해서 썬다. 단면에 꼬마 강나나 얼굴. 빗나가면 "아야!" 반창고. (PS1 주방)
import { toPS1, ps1Material } from '../../../shared/lib/ps1.js';

let FACE = null; // suit_head.png

/** Kitchen env, PS1 materials, col_* hidden. */
async function addKitchen(G) {
  const { THREE } = G;
  const { root } = await G.A.instance('kitchen');
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  root.traverse((o) => {
    if (o.name.startsWith('col_')) { o.visible = false; return; }
    if (o.isMesh) {
      box.setFromObject(o).getSize(size);
      o.material = toPS1(o.material, { affine: Math.max(size.x, size.y, size.z) < 0.9 });
    }
  });
  G.scene.add(root);
  return root;
}

/** Banana body between curve params t0..t1 (angular PS1 tube with tapered, brown tips). */
function bananaGeo(THREE, curve, t0, t1, R, n = 22, rs = 6) {
  const pos = [], col = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  const yellow = new THREE.Color('#f5d020'), brown = new THREE.Color('#4a3a1a'), green = new THREE.Color('#b9c23a');
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * (i / n);
    const c = curve.getPoint(t), T = curve.getTangent(t);
    const S = new THREE.Vector3().crossVectors(T, up).normalize();
    const r = radius(t, R);
    const k = t < 0.05 || t > 0.95 ? brown : t > 0.85 ? green : yellow;
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * Math.PI * 2;
      const v = c.clone().addScaledVector(S, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r * 0.9);
      pos.push(v.x, v.y, v.z);
      col.push(k.r, k.g, k.b);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < rs; j++) {
    const a = i * (rs + 1) + j, b = a + rs + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const radius = (t, R) => R * (0.22 + 0.78 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.55));

function faceTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.beginPath(); x.arc(64, 64, 64, 0, 7); x.fill();
  x.fillStyle = '#fbfaf2';
  x.beginPath(); x.arc(64, 64, 52, 0, 7); x.fill();
  if (FACE) {
    x.save(); x.beginPath(); x.arc(64, 66, 40, 0, 7); x.clip();
    x.drawImage(FACE, 14, 14, 100, 100);
    x.restore();
  }
  x.strokeStyle = '#c9a200'; x.lineWidth = 4;
  x.beginPath(); x.arc(64, 64, 60, 0, 7); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default {
  id: 'slice', no: 7, cmd: '썰어라!', hint: '점선대로 슥!', bgm: 'bgm_kitchen', layer: 'both',
  duration: 5, timeout: 'lose', sounds: ['slice', 'whoosh', 'squeak', 'sparkle', 'pop', 'boing'],

  async load(A) {
    await A.glb('kitchen');
    FACE = await A.img('suit_head.png').catch(() => null);
  },

  create(G) {
    const { THREE, scene, camera } = G;
    G.usePS1(240);
    scene.background = new THREE.Color('#2a2622');
    scene.add(new THREE.HemisphereLight('#fff8e8', '#4a3a30', 2.2));
    const lamp = new THREE.PointLight('#fff2d0', 3, 3, 1.2);
    lamp.position.set(-0.7, 1.6, -2.6);
    scene.add(lamp);
    addKitchen(G);

    // cutting board on the prep table
    const O = new THREE.Vector3(-0.72, 0.87, -2.88);
    const world = new THREE.Group();
    world.position.copy(O);
    scene.add(world);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.025, 0.27), ps1Material({ color: '#c8925a' }));
    board.position.y = 0.0125;
    world.add(board);
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.002, 0.23), ps1Material({ color: '#b27e4a' }));
    groove.position.y = 0.026;
    world.add(groove);
    camera.near = 0.02;
    camera.position.set(O.x, O.y + 0.4, O.z + 0.34);
    camera.lookAt(O.x, O.y + 0.02, O.z - 0.06);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // banana: mover (slides on the board) > roller (wobble) > meshes
    const R = 0.021;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.12, R, 0.025), new THREE.Vector3(0, R, -0.06), new THREE.Vector3(0.12, R, 0.025));
    const mat = ps1Material({ vertexColors: true });
    const mover = new THREE.Group();
    mover.position.y = 0.025;
    world.add(mover);
    const roller = new THREE.Group();
    mover.add(roller);
    const segs = new THREE.Group(); // banana pieces (rebuilt after every cut)
    roller.add(segs);

    // straight cut lines: L1 one square cut, L2 two tilted cuts in a row, L3 two cuts while the banana runs
    const nCuts = G.level >= 2 ? 2 : 1;
    const us = nCuts === 1 ? [G.rand(0.4, 0.6)] : [G.rand(0.28, 0.4), G.rand(0.6, 0.72)];
    const UP = new THREE.Vector3(0, 1, 0);
    const L = 0.075;
    const lines = us.map((u) => {
      const C = curve.getPoint(u), T = curve.getTangent(u);
      const S = new THREE.Vector3().crossVectors(T, UP).normalize();
      const tilt = G.level >= 2 ? G.pick([-1, 1]) * G.rand(0.2, 0.45) : 0;
      const dir = S.applyAxisAngle(UP, tilt);
      const pts = [];
      for (let i = 0; i <= 16; i++) pts.push(C.clone().setY(R * 2.1).addScaledVector(dir, -L + (2 * L * i) / 16));
      return pts;
    });
    let cutIdx = 0;
    const done = [];
    const GAP = 0.016;
    const segX = (u) => (done.filter((d) => d < u).length - done.length / 2) * GAP;

    const capGeo = (u) => new THREE.CircleGeometry(radius(u, R) * 0.98, 12);
    const capMat = new THREE.MeshBasicMaterial({ map: faceTexture(THREE), side: THREE.DoubleSide }); // unlit: the slice reads clearly white
    let segList = [];
    const rebuild = (animate) => {
      const old = new Map(segList.map((g) => [g.userData.t0, g.position.x]));
      segs.clear();
      segList = [];
      const b = [0, ...[...done].sort((x, y) => x - y), 1];
      for (let k = 0; k < b.length - 1; k++) {
        const t0 = b[k], t1 = b[k + 1];
        const piv = new THREE.Group();
        const p0 = curve.getPoint(t0);
        const m = new THREE.Mesh(bananaGeo(THREE, curve, t0, t1, R, Math.max(6, Math.round(30 * (t1 - t0)))), mat);
        m.position.copy(p0).negate();
        piv.add(m);
        if (k > 0) { // left end is a cut
          const cap = new THREE.Mesh(capGeo(t0), capMat);
          cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(t0).negate());
          piv.add(cap);
          piv.userData.cap = cap;
        }
        if (k < b.length - 2) {
          const cap = new THREE.Mesh(capGeo(t1), capMat);
          cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(t1));
          cap.position.copy(curve.getPoint(t1)).sub(p0);
          piv.add(cap);
        }
        piv.position.copy(p0);
        piv.userData = { ...piv.userData, t0, tx: p0.x + segX((t0 + t1) / 2) };
        piv.position.x = animate && old.has(t0) ? old.get(t0) : animate ? p0.x : piv.userData.tx;
        segs.add(piv);
        segList.push(piv);
      }
    };
    rebuild(false);

    // L3: the banana tries to escape
    const run = G.level >= 3;
    const runPh = G.rand(0, 6.28);
    const runDir = G.pick([-1, 1]);

    const toScr = (v) => G.toScreen(mover.localToWorld(v.clone()));
    let lineScr = [];
    const centerScr = () => { const a = []; for (let i = 0; i <= 20; i++) a.push({ u: i / 20, ...toScr(curve.getPoint(i / 20)) }); return a; };

    const nearest = (p, poly) => {
      let best = { d: 1e9, s: 0 }, acc = 0;
      const lens = [];
      for (let i = 0; i < poly.length - 1; i++) lens.push(Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].y - poly[i].y));
      const total = lens.reduce((a, b) => a + b, 0) || 1;
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i], b = poly[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
        const k = G.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
        const d = Math.hypot(a.x + dx * k - p.x, a.y + dy * k - p.y);
        if (d < best.d) best = { d, s: (acc + lens[i] * k) / total };
        acc += lens[i];
      }
      return best;
    };

    let swipe = null; // {pts:[{x,y,d,s}]}
    const trails = []; // fading knife trails
    let state = 'play', stT = 0;
    let reveal = null, hurt = null, failU = 0.5;
    G.dbg = { tol: 0, last: null };

    const decideSwipe = () => {
      const pts = swipe.pts;
      swipe = null;
      const near = pts.filter((p) => p.d < 95);
      if (near.length < 2) { G.sfx('whoosh', { vol: 0.5 }); return; }
      const cov = Math.max(...near.map((p) => p.s)) - Math.min(...near.map((p) => p.s));
      const mean = near.reduce((a, p) => a + p.d, 0) / near.length;
      const tol = [46, 36, 42][G.level - 1];
      G.dbg.last = { cov: +cov.toFixed(2), mean: +mean.toFixed(1) };
      G.dbg.tol = tol;
      if (cov < 0.45) { G.sfx('whoosh', { vol: 0.5 }); return; }
      G.sfx('slice');
      if (mean <= tol) doCut();
      else {
        // where did the knife actually hit the banana?
        const cs = centerScr();
        let best = 1e9;
        for (const p of pts) for (const q of cs) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < best) { best = d; failU = q.u; } }
        doHurt('아야!');
      }
    };

    const doCut = () => {
      done.push(us[cutIdx]);
      cutIdx++;
      rebuild(true);
      if (cutIdx < nCuts) { G.sfx('pop', { vol: 0.5 }); return; }
      state = 'cut'; stT = 0;
      // the piece right of the last cut stands up and shows its face to the camera
      const uLast = us[nCuts - 1];
      const piv = segList.find((g) => g.userData.t0 === uLast);
      roller.rotation.x = 0;
      roller.updateMatrixWorld(true);
      piv.position.x = piv.userData.tx;
      const Z = mover.worldToLocal(camera.position.clone()).sub(piv.position).normalize();
      const inv = mover.getWorldQuaternion(new THREE.Quaternion()).invert();
      const Y = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(inv);
      const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
      Y.crossVectors(Z, X);
      const M = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      reveal = { piv, from: piv.position.clone(), toCam: Z.clone(), dir: curve.getTangent(uLast), q: M.multiply(piv.userData.cap.quaternion.clone().invert()) };
      G.sfx('sparkle', { vol: 0.7 });
      G.win();
    };

    const doHurt = (msg) => {
      state = 'hurt'; stT = 0;
      hurt = { msg };
      const c = curve.getPoint(failU);
      // band-aid across the wound
      const aid = new THREE.Group();
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.06), ps1Material({ color: '#e8b48a' }));
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.018), ps1Material({ color: '#fff0e0' }));
      aid.add(strip, pad);
      aid.position.copy(c).setY(c.y + radius(failU, R) * 0.9);
      aid.rotation.y = Math.atan2(curve.getTangent(failU).x, curve.getTangent(failU).z) + Math.PI / 2 + 0.4;
      aid.scale.setScalar(0.01);
      roller.add(aid);
      hurt.aid = aid;
      // the banana has a face now
      const face = new THREE.Group();
      const eyeM = ps1Material({ color: '#111' });
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 6, 4), eyeM);
        e.position.set(0.017 * s, 0, 0);
        face.add(e);
      }
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0018, 4, 8, Math.PI), eyeM);
      mouth.position.set(0, 0, -0.01);
      mouth.rotation.x = -Math.PI / 2;
      face.add(mouth);
      const fu = failU < 0.5 ? 0.72 : 0.28;
      const fc = curve.getPoint(fu);
      face.position.copy(fc).setY(fc.y + radius(fu, R) * 0.9 + 0.002);
      face.rotation.y = Math.atan2(curve.getTangent(fu).x, curve.getTangent(fu).z) - Math.PI / 2;
      roller.add(face);
      G.sfx('squeak');
      setTimeout(() => G.sfx('boing', { vol: 0.6 }), 250);
      G.shake(10, 0.25);
      G.lose();
    };

    const addPoint = (p) => {
      if (!swipe) return;
      const n = nearest(p, lineScr);
      swipe.pts.push({ x: p.x, y: p.y, d: n.d, s: n.s });
      if (swipe.pts.length > 80) swipe.pts.shift();
    };

    return {
      down(p) { if (state !== 'play') return; swipe = { pts: [] }; addPoint(p); },
      move(p) {
        if (!swipe || !p.down) return;
        const last = swipe.pts[swipe.pts.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < 4) return;
        addPoint(p);
      },
      up(p) {
        if (!swipe) return;
        addPoint(p);
        trails.push({ pts: swipe.pts.map((q) => ({ x: q.x, y: q.y })), t: 0 });
        decideSwipe();
      },
      timeout() {
        if (state !== 'play') return;
        failU = 0.5;
        doHurt(null); // timeout: band-aid + face, no text
      },
      update(dt) {
        stT += dt;
        // L3 escape: slides around the board and rolls
        if (run && state === 'play') {
          const k = G.t * 1.6 * G.speed + runPh;
          mover.position.x = Math.sin(k) * 0.05 * runDir;
          mover.position.z = Math.sin(k * 1.7) * 0.04;
          roller.rotation.x = Math.sin(k * 3.1) * 0.35;
          mover.rotation.y = Math.sin(k * 0.8) * 0.25;
        }
        // pieces slide apart after each cut
        for (const g of segList) if (g !== reveal?.piv) g.position.x += (g.userData.tx - g.position.x) * Math.min(1, dt * 14);
        if (state === 'cut') {
          const k = Math.min(1, stT / 0.35);
          const e = 1 - (1 - k) * (1 - k);
          const b = reveal;
          b.piv.position.copy(b.from).addScaledVector(b.dir, -0.03 * e).addScaledVector(b.toCam, 0.1 * e);
          b.piv.scale.setScalar(1 + 1.3 * e);
          b.piv.quaternion.identity().slerp(b.q, e);
          if (stT > 0.4) b.piv.rotation.z += Math.sin(stT * 14) * 0.004; // tiny wave hello
          roller.rotation.x *= 0.8;
        }
        if (state === 'hurt') {
          const k = Math.min(1, stT / 0.25);
          hurt.aid.scale.setScalar(0.01 + 0.99 * (k < 1 ? k * 1.2 : 1));
          roller.rotation.x = Math.sin(stT * 50) * 0.08 * Math.max(0, 1 - stT);
        }

        // 2D: dotted line + knife trail
        mover.updateMatrixWorld(true);
        const lx = segX(us[Math.min(cutIdx, nCuts - 1)]);
        lineScr = lines[Math.min(cutIdx, nCuts - 1)].map((v) => toScr(v.clone().setX(v.x + lx)));
        G.dbg.line = lineScr;
        const c = G.c2d;
        if (state === 'play') {
          c.save();
          c.lineCap = 'round';
          c.beginPath();
          lineScr.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
          c.setLineDash([16, 12]);
          c.lineDashOffset = -G.t * 30;
          c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 11; c.stroke();
          c.strokeStyle = '#fff'; c.lineWidth = 6; c.stroke();
          c.restore();
          const s0 = lineScr[0];
          G.text('✂', s0.x - 22, s0.y - 18, { size: 40, color: '#fff' });
        }
        const drawTrail = (pts, alpha) => {
          if (pts.length < 2) return;
          c.save();
          c.globalAlpha = alpha;
          c.lineCap = c.lineJoin = 'round';
          c.beginPath();
          pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
          c.strokeStyle = 'rgba(180,230,255,.6)'; c.lineWidth = 16; c.stroke();
          c.strokeStyle = '#fff'; c.lineWidth = 5; c.stroke();
          c.restore();
        };
        if (swipe) drawTrail(swipe.pts, 1);
        for (const tr of trails) { tr.t += dt; drawTrail(tr.pts, Math.max(0, 1 - tr.t * 3)); }

        if (state === 'hurt' && hurt.msg) {
          const s = toScr(curve.getPoint(failU));
          const a = Math.min(1, stT * 5);
          G.bubble(hurt.msg, s.x, s.y - 130, { size: 46, color: '#ff3b3b', tail: [s.x - 5, s.y - 30], alpha: a, r: 30, pad: 22 });
        }
      },
    };
  },
};
