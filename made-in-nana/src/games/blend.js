// 09 갈아라! — 믹서 위에서 원을 그려 바나나우유를 간다. L3는 화살표 방향으로만. 실패하면 뚜껑이 날아가 동우가 뒤집어쓴다. (PS1 주방)
import { toPS1, ps1Material } from '../../../shared/lib/ps1.js';
import { fitHeight } from '../core/assets.js';

let FACE = null;
let LATTE = null; // assets/photo/blend_latte.png (Wikimedia Commons)

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

function latteTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#e8d2a8';
  x.fillRect(0, 0, 256, 256);
  if (LATTE) x.drawImage(LATTE, -6, -6, 268, 268); // real latte photo (cup rim fills the disc edge)
  if (FACE) {
    // foam-art face: sepia, soft-blended into the milk foam
    x.save();
    x.beginPath(); x.ellipse(128, 132, 70, 80, 0, 0, 7); x.clip();
    x.globalAlpha = 0.8;
    x.globalCompositeOperation = 'multiply';
    x.filter = 'grayscale(1) sepia(0.8) contrast(1.4) brightness(1.25)';
    x.drawImage(FACE, 40, 36, 176, 186);
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default {
  id: 'blend', no: 9, cmd: '갈아라!', hint: '', bgm: 'bgm_kitchen', layer: 'both',
  duration: 5, timeout: 'lose', sounds: ['blend', 'pop', 'splash', 'sparkle', 'splat', 'shared:blender'],

  async load(A) {
    await Promise.all([A.glb('kitchen'), A.glb('dongwoo')]);
    FACE = await A.img('suit_head.png').catch(() => null);
    LATTE = await A.img('assets/photo/blend_latte.png').catch(() => null);
  },

  create(G) {
    const { THREE, scene, camera } = G;
    G.usePS1(240);
    scene.background = new THREE.Color('#2a2622');
    scene.add(new THREE.HemisphereLight('#fff8e8', '#4a3a30', 2.0));
    const key = new THREE.DirectionalLight('#fff0d8', 1.3);
    key.position.set(1, 3, 2);
    scene.add(key);
    addKitchen(G);

    const O = new THREE.Vector3(-0.5, 0.97, -2.45);
    const world = new THREE.Group();
    world.position.copy(O);
    scene.add(world);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.42), ps1Material({ color: '#8e959e' }));
    top.position.y = -0.02;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.95, 0.38), ps1Material({ color: '#6f757d' }));
    body.position.y = -0.5;
    world.add(top, body);
    camera.near = 0.02;
    camera.position.set(O.x, O.y + 0.5, O.z + 0.95);
    camera.lookAt(O.x, O.y + 0.32, O.z - 0.2);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // giant blender
    const blender = new THREE.Group();
    blender.position.set(-0.08, 0, 0.05);
    world.add(blender);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.12, 8), ps1Material({ color: '#2b2e33' }));
    base.position.y = 0.06;
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), ps1Material({ color: '#ff4a3a', emissive: '#661010' }));
    btn.position.set(0, 0.06, 0.09);
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.3, 10, 1, true),
      ps1Material({ color: '#cfe8ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    jar.position.y = 0.27;
    const liqMat = ps1Material({ color: '#f4efdc' });
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.072, 0.2, 10), liqMat);
    liquid.position.y = 0.22;
    const lid = new THREE.Group();
    const lidM = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.03, 10), ps1Material({ color: '#3a7ad0' }));
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.03, 8), ps1Material({ color: '#2a5aa0' }));
    knob.position.y = 0.03;
    lid.add(lidM, knob);
    lid.position.y = 0.435;
    blender.add(base, btn, liquid, jar, lid);
    // banana chunks swirling inside
    const chunks = [];
    const chunkMat = ps1Material({ color: '#f5d020' });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.022, 6), chunkMat);
      blender.add(m);
      chunks.push({ m, a: (i / 9) * 6.28, r: G.rand(0.03, 0.06), y: G.rand(0.16, 0.3), s: G.rand(0.8, 1.2) });
    }
    const center = new THREE.Vector3(0, 0.27, 0);

    // Dongwoo waiting behind the counter (right)
    const dw = new THREE.Group();
    dw.position.set(0.3, -0.97, -0.62);
    dw.rotation.y = -0.35;
    world.add(dw);
    let dwAnim = null, dwHead = null;
    const dwMats = [];
    G.A.instance('dongwoo').then(({ root, clips }) => {
      fitHeight(root, 1.72);
      root.traverse((o) => {
        if (o.isMesh) { o.material = toPS1(o.material); dwMats.push(o.material); }
        if (o.name === 'Head') dwHead = o;
      });
      dw.add(root);
      dwAnim = G.animate(root, clips);
      dwAnim.play('idle');
    });

    // splash drops
    const drops = [];
    const dropMat = ps1Material({ color: '#fbe27a' });
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.018, 0), dropMat);
      m.visible = false;
      world.add(m);
      drops.push({ m, v: new THREE.Vector3() });
    }

    // rules
    const target = [3, 4, 4][G.level - 1];
    const needDir = G.level >= 3 ? G.pick([1, -1]) : 0; // +1 = clockwise on screen
    let turns = 0, wrong = 0, lastA = null, angVel = 0;
    let state = 'play', stT = 0, motor = null;
    let lidFly = null, cup = null;
    G.dbg = { turns: 0, target, needDir, c: null };

    const screenC = () => { world.updateMatrixWorld(true); return G.toScreen(blender.localToWorld(center.clone())); };

    const finishWin = () => {
      state = 'win'; stT = 0;
      motor?.stop(); motor = null;
      G.sfx('blend', { vol: 0.8 });
      G.sfx('sparkle');
      liqMat.color.set('#fbe27a');
      for (const ch of chunks) ch.m.visible = false;
      // cup with latte art slides in
      cup = new THREE.Group();
      const cm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.048, 0.12, 10, 1, true), ps1Material({ color: '#ffffff', side: THREE.DoubleSide }));
      cm.position.y = 0.06;
      const art = new THREE.Mesh(new THREE.CircleGeometry(0.056, 14), ps1Material({ map: latteTexture(THREE) }));
      art.rotation.x = -Math.PI / 2;
      art.position.y = 0.11;
      cup.add(cm, art);
      cup.position.set(0.5, 0, 0.06);
      cup.scale.setScalar(1.7);
      cup.rotation.x = 0.35; // tip the cup toward the camera so the latte art reads
      world.add(cup);
      dwAnim?.play('wave');
      G.win();
    };
    const finishFail = (why) => {
      state = 'fail'; stT = 0;
      motor?.stop(); motor = null;
      G.sfx('pop', { rate: 0.7 });
      G.sfx('splash');
      setTimeout(() => G.sfx('splat'), 380);
      G.shake(14, 0.3);
      lidFly = { from: lid.position.clone() };
      // banana milk erupts toward Dongwoo
      const hp = dwHead ? world.worldToLocal(dwHead.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(0.3, 0.7, -0.6);
      drops.forEach((d, i) => {
        d.m.visible = true;
        d.from = new THREE.Vector3(-0.08 + G.rand(-0.03, 0.03), 0.45, 0.05);
        d.to = hp.clone().add(new THREE.Vector3(G.rand(-0.12, 0.12), G.rand(-0.35, 0.1), 0.12));
        d.delay = i * 0.02;
        d.slide = G.rand(0.02, 0.08);
        d.m.position.copy(d.from);
      });
      G.lose();
    };

    const track = (p) => {
      const c = screenC();
      const dx = p.x - c.x, dy = p.y - c.y;
      if (Math.hypot(dx, dy) < 28) { lastA = null; return; }
      const a = Math.atan2(dy, dx);
      if (lastA !== null) {
        let da = a - lastA;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < 1.6) {
          angVel = angVel * 0.6 + da * 0.4 * 30;
          if (needDir && Math.sign(da) !== needDir) {
            wrong += Math.abs(da) / (Math.PI * 2);
            if (wrong > 0.6) finishFail('dir');
          } else {
            turns += Math.abs(da) / (Math.PI * 2);
            wrong = Math.max(0, wrong - Math.abs(da) / (Math.PI * 2) * 0.5);
          }
        }
      }
      lastA = a;
      if (state === 'play' && turns >= target) finishWin();
    };

    return {
      down(p) {
        if (state !== 'play') return;
        lastA = null;
        track(p);
        if (!motor) motor = G.sfx('shared:blender', { loop: true, vol: 0 });
      },
      move(p) { if (p.down && state === 'play') track(p); },
      up() { lastA = null; },
      timeout() { if (state === 'play') finishFail('time'); },
      update(dt) {
        stT += dt;
        angVel *= Math.pow(0.02, dt);
        const spd = Math.min(1, Math.abs(angVel) / 10);
        motor?.setVol(0.2 + spd * 0.8);
        motor?.setRate(0.8 + spd * 0.5);
        const prog = Math.min(1, turns / target);
        G.dbg.turns = turns; G.dbg.wrong = wrong;

        // contents
        if (state !== 'win') liqMat.color.set('#f4efdc').lerp(new THREE.Color('#fbe27a'), prog);
        for (const ch of chunks) {
          ch.a += (angVel * 0.4 + (state === 'play' ? 0 : 0)) * dt * ch.s;
          ch.m.position.set(Math.cos(ch.a) * ch.r, ch.y + Math.sin(ch.a * 2) * 0.01, Math.sin(ch.a) * ch.r);
          ch.m.rotation.set(ch.a, ch.a * 0.7, 0);
          ch.m.scale.setScalar(Math.max(0.05, 1 - prog * 0.9));
        }
        liquid.rotation.y += angVel * dt * 0.3;
        blender.position.x = -0.08 + (Math.random() - 0.5) * 0.006 * spd; // motor rattle

        if (state === 'win') {
          const k = Math.min(1, stT / 0.35);
          cup.position.x = 0.5 - 0.38 * (1 - (1 - k) * (1 - k));
          blender.position.y = Math.abs(Math.sin(stT * 12)) * 0.01 * (1 - k);
        }
        if (state === 'fail') {
          // lid rockets up, then lands on Dongwoo's head like a hat
          const k = Math.min(1, stT / 0.45);
          if (dwHead) {
            const hp = world.worldToLocal(dwHead.getWorldPosition(new THREE.Vector3()));
            hp.y += 0.4;
            const from = lidFly.from.clone().add(blender.position);
            lid.parent !== world && (world.add(lid), lid.position.copy(from));
            lid.position.lerpVectors(from, hp, k);
            lid.position.y += Math.sin(k * Math.PI) * 0.5;
            lid.rotation.x = k < 1 ? stT * 18 : 0.25;
            lid.rotation.z = k < 1 ? stT * 7 : -0.2;
            G.dbg.lid = lid.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
            G.dbg.head = dwHead.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
          }
          const tint = Math.min(1, Math.max(0, (stT - 0.3) * 3));
          for (const m of dwMats) m.color.setRGB(1, 1, 1).lerp(new THREE.Color('#ffd23a'), tint);
          liquid.scale.y = Math.max(0.35, 1 - stT * 3);
          liquid.position.y = 0.12 + 0.1 * liquid.scale.y;
          for (const d of drops) {
            const q = G.clamp((stT - d.delay) / 0.35, 0, 1);
            if (q < 1) {
              d.m.position.lerpVectors(d.from, d.to, q);
              d.m.position.y += Math.sin(q * Math.PI) * 0.35;
            } else {
              d.m.position.y = d.to.y - (stT - d.delay - 0.35) * d.slide; // dripping down
              d.m.scale.set(1.3, 1.8, 0.6);
            }
          }
        }

        // 2D: guide circle + progress ring + direction arrows
        const c = G.c2d;
        const sc = screenC();
        G.dbg.c = sc;
        const RAD = 135;
        if (state === 'play') {
          c.save();
          c.setLineDash([14, 12]);
          c.lineDashOffset = -G.t * 40 * (needDir || 1);
          c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 6;
          c.beginPath(); c.arc(sc.x, sc.y, RAD, 0, 7); c.stroke();
          c.setLineDash([]);
          c.strokeStyle = '#ffd400'; c.lineWidth = 14; c.lineCap = 'round';
          if (prog > 0) { c.beginPath(); c.arc(sc.x, sc.y, RAD + 22, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); c.stroke(); }
          // arrows on the circle
          const dir = needDir || 1;
          for (let i = 0; i < 3; i++) {
            const a = G.t * 2.2 * dir + (i * Math.PI * 2) / 3;
            const x = sc.x + Math.cos(a) * RAD, y = sc.y + Math.sin(a) * RAD;
            c.save();
            c.translate(x, y);
            c.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
            c.fillStyle = needDir ? '#ff5a5f' : '#fff';
            c.strokeStyle = '#1b1306'; c.lineWidth = 4;
            c.beginPath(); c.moveTo(18, 0); c.lineTo(-12, -16); c.lineTo(-12, 16); c.closePath(); c.fill(); c.stroke();
            c.restore();
          }
          c.restore();
          const left = Math.max(0, Math.ceil(target - turns));
          G.text(`${left}바퀴`, sc.x, sc.y - RAD - 58, { size: 46, color: '#ffd400' });
          if (needDir) G.text(needDir > 0 ? '↻ 이쪽으로!' : '↺ 이쪽으로!', sc.x, sc.y + RAD + 50, { size: 38, color: '#ff5a5f' });
          if (wrong > 0.15) G.text('반대야!', sc.x, sc.y, { size: 54, color: '#ff3b3b', alpha: Math.min(1, wrong * 2) });
        }
        if (state === 'fail' && stT > 0.5) G.text('푸왁!', 140, 200, { size: 70, color: '#fbe27a', alpha: Math.min(1, (stT - 0.5) * 5) });
      },
    };
  },
};
