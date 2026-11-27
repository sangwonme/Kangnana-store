// 11 담가라! — 초코 분수에 꼬치에 꽂힌 미니 강나나를 점선까지만 담갔다가 빼낸다. 너무 깊으면 퐁당, 엄지척만 올라온다. (PS1 주방)
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toPS1, ps1Material } from '../../../shared/lib/ps1.js';
import { fitHeight } from '../core/assets.js';

let THUMB = null; // assets/photo/dip_thumb.png (Wikimedia Commons)

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

function flowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#4a240e';
  x.fillRect(0, 0, 32, 64);
  for (let i = 0; i < 14; i++) {
    x.fillStyle = i % 2 ? '#6b3818' : '#3a1a08';
    x.fillRect(Math.random() * 32, Math.random() * 64, 2 + Math.random() * 3, 10 + Math.random() * 20);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export default {
  id: 'dip', no: 11, cmd: '담가라!', hint: '드래그 ↓ 점선까지 ↑', bgm: 'bgm_kitchen', layer: 'both',
  duration: 5, timeout: 'lose', sounds: ['splash', 'glug', 'slurp', 'sparkle', 'drop', 'pop', 'sputter', 'splat'],

  async load(A) {
    THUMB = await A.img('assets/photo/dip_thumb.png').catch(() => null);
    await Promise.all([A.glb('kitchen'), A.glb('gangnana_cute')]);
  },

  create(G) {
    const { THREE, scene, camera } = G;
    G.usePS1(240);
    G.renderer.localClippingEnabled = true;
    scene.background = new THREE.Color('#2a2622');
    scene.add(new THREE.HemisphereLight('#fff8e8', '#4a3a30', 2.0));
    const key = new THREE.DirectionalLight('#fff0d8', 1.3);
    key.position.set(1, 3, 2);
    scene.add(key);
    addKitchen(G);

    const O = new THREE.Vector3(-0.5, 0.97, -2.5);
    const world = new THREE.Group();
    world.position.copy(O);
    scene.add(world);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.5), ps1Material({ color: '#8e959e' }));
    top.position.y = -0.02;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.95, 0.46), ps1Material({ color: '#6f757d' }));
    body.position.y = -0.5;
    world.add(top, body);
    camera.near = 0.02;
    camera.position.set(O.x + 0.02, O.y + 0.46, O.z + 0.6);
    camera.lookAt(O.x + 0.02, O.y + 0.14, O.z - 0.02);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // ---- chocolate fountain (lathe) ----
    const steel = ps1Material({ color: '#c4c9d0', side: THREE.DoubleSide });
    const fountain = new THREE.Group();
    fountain.position.set(-0.08, 0, -0.1);
    world.add(fountain);
    const V = (r, y) => new THREE.Vector2(r, y);
    fountain.add(new THREE.Mesh(new THREE.LatheGeometry([V(0, 0), V(0.27, 0), V(0.29, 0.1), V(0.275, 0.1)], 20), steel));
    fountain.add(new THREE.Mesh(new THREE.LatheGeometry([V(0.022, 0.07), V(0.018, 0.4), V(0, 0.42)], 8), steel));
    const tiers = [[0.2, 0.1], [0.3, 0.07], [0.38, 0.045]];
    for (const [y, r] of tiers) fountain.add(new THREE.Mesh(new THREE.LatheGeometry([V(0.02, y - 0.02), V(r * 0.7, y - 0.012), V(r, y)], 14), steel));
    const flowTex = flowTexture(THREE);
    const flowMat = ps1Material({ map: flowTex, side: THREE.DoubleSide });
    // curtains from each tier rim down to the next level
    const levels = [0.08, ...tiers.map((t) => t[0])];
    tiers.forEach(([y, r], i) => {
      const yb = levels[i];
      const g = new THREE.LatheGeometry([V(r * 1.02, y), V(r * 1.12, y - 0.015), V(r * 1.1, yb)], 14);
      fountain.add(new THREE.Mesh(g, flowMat));
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 14), flowMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = y - 0.004;
      fountain.add(pool);
    });
    const poolTex = flowTexture(THREE);
    poolTex.repeat.set(3, 3);
    const poolMat = ps1Material({ map: poolTex, color: '#a06a40' });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.29, 20), poolMat);
    pool.rotation.x = -Math.PI / 2;
    fountain.add(pool);
    const BASE_Y = 0.08;
    pool.position.y = BASE_Y;

    // ---- mini Gangnana on a fondue skewer (+ a chocolate-coat twin clipped at the coat line) ----
    const H = 0.17;
    const DIP_X = 0.06, DIP_Z = 0.06;
    const holder = new THREE.Group();
    holder.position.set(DIP_X, 0.2, DIP_Z);
    world.add(holder);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 5), ps1Material({ color: '#d8b080' }));
    stick.position.y = H * 0.82 + 0.3;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.08, 6), ps1Material({ color: '#c8342a' }));
    handle.position.y = H * 0.82 + 0.5;
    holder.add(stick, handle);
    const coatPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const coatMat = ps1Material({ color: '#4a220c', clippingPlanes: [coatPlane], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    let anims = [];
    let ready = false;
    G.A.instance('gangnana_cute').then(({ root, clips }) => {
      fitHeight(root, H);
      root.traverse((o) => { if (o.isMesh) o.material = toPS1(o.material); });
      const coat = SkeletonUtils.clone(root);
      coat.traverse((o) => { if (o.isMesh) { o.material = coatMat; o.frustumCulled = false; } });
      holder.add(root, coat);
      anims = [G.animate(root, clips), G.animate(coat, clips)];
      play('idle');
      ready = true;
    });
    const play = (name, o) => anims.forEach((a) => a.play(name, o));
    // body width per height (holder-local), so the target ring hugs the model
    const NB = 24;
    let prof = null;
    const computeProfile = () => {
      holder.updateMatrixWorld(true);
      const inv = holder.matrixWorld.clone().invert();
      const bins = Array.from({ length: NB }, () => ({ rx: 0, rz: 0 }));
      const v = new THREE.Vector3();
      holder.traverse((o) => {
        if (!o.isMesh || o.material === coatMat || !o.geometry?.attributes.position) return;
        const pos = o.geometry.attributes.position;
        const step = Math.max(1, Math.floor(pos.count / 2500));
        for (let i = 0; i < pos.count; i += step) {
          if (o.getVertexPosition) o.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
          v.applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          const b = Math.floor((v.y / H) * NB);
          if (b < 0 || b >= NB) continue;
          bins[b].rx = Math.max(bins[b].rx, Math.abs(v.x));
          bins[b].rz = Math.max(bins[b].rz, Math.abs(v.z));
        }
      });
      prof = bins;
    };

    // ---- rules ----
    const target = G.level === 1 ? G.rand(0.38, 0.55) : G.rand(0.28, 0.68); // dip line as fraction of height
    const tolHigh = [0.2, 0.15, 0.16][G.level - 1];
    const tolLow = [0.2, 0.15, 0.16][G.level - 1];
    const slosh = G.level >= 3 ? 0.014 : 0;
    const TOP = 0.21; // holder feet height at rest (local to world group)
    let feet = TOP, maxDepth = 0, coatDepth = 0, state = 'play', stT = 0, grab = null, dipped = false, splashT = 9;
    G.dbg = { target, depth: 0, maxDepth: 0 };

    // sink fx: bubbles + thumbs-up hand
    const bubbles = [];
    const bubMat = ps1Material({ color: '#7a4422' });
    // timeout fail: the fountain surges up under her, she drops off the skewer into the pool
    const geyserGeo = new THREE.CylinderGeometry(0.03, 0.065, 0.34, 10, 1, true);
    geyserGeo.translate(0, 0.17, 0);
    const geyser = new THREE.Mesh(geyserGeo, flowMat);
    geyser.visible = false;
    world.add(geyser);
    const blobs = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(G.rand(0.008, 0.016), 0), bubMat);
      m.visible = false;
      world.add(m);
      blobs.push({ m, v: new THREE.Vector3() });
    }
    const burst = (y, up) => blobs.forEach((b) => {
      b.m.visible = true;
      b.m.position.set(DIP_X + G.rand(-0.02, 0.02), y, DIP_Z + G.rand(-0.02, 0.02));
      b.v.set(G.rand(-0.35, 0.35), G.rand(0.4, 0.9) * up, G.rand(-0.15, 0.35));
    });
    let dropped = false, splashed = false, vy = 0;
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(G.rand(0.006, 0.012), 6, 4), bubMat);
      b.visible = false;
      world.add(b);
      bubbles.push({ b, ph: G.rand(0, 1), x: G.rand(-0.04, 0.04), z: G.rand(-0.02, 0.02) });
    }
    const hand = new THREE.Group();
    if (THUMB) {
      const cv = document.createElement('canvas');
      cv.width = THUMB.naturalWidth; cv.height = THUMB.naturalHeight;
      const x = cv.getContext('2d');
      x.drawImage(THUMB, 0, 0);
      // chocolate coat on the lower part (source-atop keeps the cutout shape), with drips
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = 'rgba(74,34,12,0.92)';
      x.beginPath();
      x.moveTo(0, cv.height);
      x.lineTo(0, cv.height * 0.62);
      for (let i = 0; i <= 8; i++) x.lineTo((cv.width * i) / 8, cv.height * (0.6 + (i % 2 ? 0.1 : -0.02)));
      x.lineTo(cv.width, cv.height);
      x.closePath(); x.fill();
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const w = 0.13, h = (w * cv.height) / cv.width;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ps1Material({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
      m.position.y = h * 0.2;
      hand.add(m);
    } else {
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.026), ps1Material({ color: '#f4f0e8' }));
      hand.add(fist);
    }
    hand.visible = false;
    world.add(hand);

    const surfY = () => BASE_Y + Math.sin(G.t * 3.2 * G.speed) * slosh;
    const ppm = () => { // screen px per meter (vertical) at the dip spot
      world.updateMatrixWorld(true);
      const a = G.toScreen(world.localToWorld(new THREE.Vector3(DIP_X, 0.1, DIP_Z)));
      const b = G.toScreen(world.localToWorld(new THREE.Vector3(DIP_X, 0.2, DIP_Z)));
      return Math.abs(a.y - b.y) / 0.1;
    };

    const sink = () => {
      state = 'sink'; stT = 0;
      G.sfx('splash');
      G.sfx('glug', { vol: 0.8 });
      setTimeout(() => G.sfx('glug', { vol: 0.6, rate: 1.3 }), 450);
      G.shake(8, 0.2);
      G.lose();
    };
    const win = () => {
      state = 'win'; stT = 0;
      G.sfx('slurp', { vol: 0.7 });
      G.sfx('sparkle');
      play('cheer');
      G.win();
    };

    return {
      down(p) { if (state === 'play') grab = { py: p.y, feet }; },
      move(p) {
        if (!grab || !p.down || state !== 'play') return;
        feet = G.clamp(grab.feet - (p.y - grab.py) / ppm(), surfY() - H * 1.2, TOP + 0.03);
      },
      up() { grab = null; },
      timeout() {
        if (state !== 'play') return;
        state = 'stuck'; stT = 0;
        grab = null;
        geyser.visible = true;
        G.sfx('sputter', { vol: 0.9 });
        G.sfx('glug', { rate: 0.7 });
        burst(surfY(), 1.2);
      },
      update(dt) {
        stT += dt;
        splashT += dt;
        flowTex.offset.y += dt * 0.8;
        poolTex.offset.x += dt * 0.05;
        const sy = surfY();
        pool.position.y = sy;
        if (state === 'play') {
          const depth = sy - feet;
          if (depth > 0.004 && !dipped) { dipped = true; splashT = 0; G.sfx('drop', { vol: 0.7 }); }
          maxDepth = Math.max(maxDepth, depth);
          coatDepth = Math.max(coatDepth, depth); // the coat only covers what really went in (never reset)
          G.dbg.depth = depth / H; G.dbg.maxDepth = maxDepth / H;
          if (maxDepth > (target + tolHigh) * H) sink();
          else if (dipped && depth < -0.01) {
            if (maxDepth >= (target - tolLow) * H) win();
            else if (depth < -0.02) { dipped = false; maxDepth = 0; G.sfx('pop', { vol: 0.4 }); } // too shallow: try again
          }
        }
        if (state === 'sink') {
          feet = Math.max(sy - H * 1.6, feet - dt * 0.6);
          const showHand = stT > 0.45;
          hand.visible = showHand;
          if (showHand) {
            const k = Math.min(1, (stT - 0.45) / 0.3);
            hand.position.set(DIP_X + 0.04, sy - 0.08 + k * 0.1, DIP_Z + 0.03);
            hand.rotation.z = Math.sin(stT * 6) * 0.1;
          }
          for (const b of bubbles) {
            b.b.visible = true;
            const ph = (stT * 1.8 + b.ph) % 1;
            b.b.position.set(DIP_X + b.x, sy + ph * 0.04, DIP_Z + b.z);
            b.b.scale.setScalar(ph < 0.9 ? 1 : 0.01);
          }
        }
        if (state === 'stuck') {
          // geyser shoots up, drenches her, then she slips off the skewer and plops into the pool
          const up = Math.min(1, stT / 0.2), down = Math.max(0, (stT - 0.45) / 0.25);
          geyser.position.set(DIP_X, sy - 0.01, DIP_Z);
          geyser.scale.set(1 + Math.sin(stT * 40) * 0.08, Math.max(0.01, up * (1 - down)), 1 + Math.cos(stT * 37) * 0.08);
          geyser.visible = down < 1;
          if (stT > 0.18 && !dropped) {
            dropped = true;
            coatDepth = H * 1.3; // fully coated
            world.attach(stick); world.attach(handle);
            play('fall', { loop: false });
            G.sfx('splat');
            vy = 0.5;
          }
          if (dropped) {
            vy -= 3.2 * dt;
            feet = Math.max(sy - H * 1.6, feet + vy * dt);
            holder.rotation.z = Math.min(1.4, holder.rotation.z + dt * 3);
            if (!splashed && feet < sy - H * 0.3) {
              splashed = true;
              G.sfx('splash');
              G.shake(10, 0.25);
              burst(sy, 1);
            }
          }
          for (const b of blobs) {
            if (!b.m.visible) continue;
            b.v.y -= 3 * dt;
            b.m.position.addScaledVector(b.v, dt);
            if (b.m.position.y < sy) b.m.visible = false;
          }
          // a few bubbles where she sank
          if (splashed) for (const b of bubbles) {
            b.b.visible = true;
            const ph = (stT * 1.8 + b.ph) % 1;
            b.b.position.set(DIP_X + b.x, sy + ph * 0.03, DIP_Z + b.z);
          }
        }
        if (state === 'win') feet = Math.min(TOP + 0.04, feet + dt * 0.4);
        holder.position.y = feet;
        if (state !== 'stuck') holder.rotation.z = state === 'win' ? Math.sin(stT * 12) * 0.12 : 0;
        // coat line follows the deepest point reached
        holder.updateMatrixWorld(true);
        coatPlane.constant = world.localToWorld(new THREE.Vector3(0, feet + Math.max(0, coatDepth), 0)).y;
        if (!ready || coatDepth <= 0) coatPlane.constant = -99;

        // 2D overlay
        const c = G.c2d;
        const lineY = G.toScreen(world.localToWorld(new THREE.Vector3(DIP_X, feet + target * H, DIP_Z))).y;
        const cx = G.toScreen(world.localToWorld(new THREE.Vector3(DIP_X, feet, DIP_Z))).x;
        G.dbg.lineY = lineY;
        G.dbg.ppm = ppm();
        if (state === 'play') {
          // target contour: a dashed ring hugging the body at the target height (back half faint, front half bold)
          if (ready && !prof && G.t > 0.1) computeProfile();
          const hT = target * H;
          let rx = 0.03, rz = 0.025;
          if (prof) {
            const b = Math.min(NB - 1, Math.floor(target * NB));
            for (const k of [b - 1, b, b + 1]) if (prof[k]) { rx = Math.max(prof[k].rx, rx); rz = Math.max(prof[k].rz, rz); }
          }
          rx = rx * 1.12 + 0.004; rz = rz * 1.12 + 0.004;
          const ring = [];
          for (let i = 0; i <= 40; i++) {
            const a = (i / 40) * Math.PI * 2;
            ring.push({ ...G.toScreen(holder.localToWorld(new THREE.Vector3(Math.cos(a) * rx, hT, Math.sin(a) * rz))), front: Math.sin(a) >= 0 });
          }
          const stroke = (front) => {
            c.beginPath();
            let on = false;
            for (const q of ring) {
              if (q.front !== front) { on = false; continue; }
              if (!on) { c.moveTo(q.x, q.y); on = true; } else c.lineTo(q.x, q.y);
            }
            c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 8; c.stroke();
            c.strokeStyle = '#fff'; c.lineWidth = 4; c.stroke();
          };
          c.save();
          c.setLineDash([10, 7]);
          c.lineDashOffset = -G.t * 20;
          c.globalAlpha = 0.4; stroke(false);
          c.globalAlpha = 1; stroke(true);
          c.restore();
          const rightX = Math.max(...ring.map((q) => q.x));
          G.text('여기까지', rightX + 70, lineY, { size: 30, color: '#fff' });
          if (!dipped) G.text('↓', cx - 140, lineY + Math.sin(G.t * 8) * 10, { size: 64, color: '#ffd400' });
          else if (maxDepth >= (target - tolLow) * H) G.text('이제 빼!', 300, 150 + Math.sin(G.t * 12) * 6, { size: 64, color: '#ffd400' });
        }
        if (state === 'win') {
          for (let i = 0; i < 5; i++) {
            const a = stT * 3 + i * 1.256;
            G.text('✦', cx + Math.cos(a) * 90, lineY - 60 + Math.sin(a) * 70, { size: 30, color: '#fff6b0', stroke: null, alpha: 0.5 + 0.5 * Math.sin(stT * 20 + i) });
          }
        }
      },
      dispose() { G.renderer.localClippingEnabled = false; },
    };
  },
};
