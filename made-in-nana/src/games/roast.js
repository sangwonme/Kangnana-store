// 08 구워라! — 홀드로 토치를 켜서 바나나 브륄레를 굽는다. 황금 구간에서 떼면 성공. 너무 구우면 옆의 꼬마 강나나가 아프로+숯. (PS1 주방)
import { toPS1, ps1Material } from '../../../shared/lib/ps1.js';
import { fitHeight } from '../core/assets.js';

let AFRO = null; // assets/photo/roast_afro.png (Wikimedia Commons)

async function addKitchen(G) {
  const { THREE } = G;
  const { root } = await G.A.instance('kitchen');
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  root.traverse((o) => {
    if (o.name.startsWith('col_') || o.name === 'prop_torch') { o.visible = false; return; }
    if (o.isMesh) {
      box.setFromObject(o).getSize(size);
      o.material = toPS1(o.material, { affine: Math.max(size.x, size.y, size.z) < 0.9 });
    }
  });
  G.scene.add(root);
  return root;
}

const radius = (t, R) => R * (0.22 + 0.78 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.55));

/** Half banana (cut lengthwise): yellow skin boat + flat sugar top (separate geometries). */
function halfBanana(THREE, curve, R) {
  const n = 24, rs = 6;
  const pos = [], idx = [], top = [], tidx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = curve.getPoint(t), T = curve.getTangent(t);
    const S = new THREE.Vector3().crossVectors(T, up).normalize();
    const r = radius(t, R);
    for (let j = 0; j <= rs; j++) {
      const a = Math.PI + (j / rs) * Math.PI; // lower half only
      const v = c.clone().addScaledVector(S, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r * 0.8);
      pos.push(v.x, v.y, v.z);
    }
    for (const s of [-1, 1]) { const v = c.clone().addScaledVector(S, s * r * 0.92); top.push(v.x, v.y + 0.001, v.z); }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < rs; j++) { const a = i * (rs + 1) + j, b = a + rs + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const a = i * 2;
    tidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  tg.setIndex(tidx);
  tg.computeVertexNormals();
  return { skin: g, top: tg };
}

export default {
  id: 'roast', no: 8, cmd: '구워라!', hint: '꾹 누르고 황금색에서 떼기', bgm: 'bgm_kitchen', layer: 'both',
  duration: 5, timeout: 'lose', sounds: ['torch', 'burnt', 'pop', 'sparkle', 'shared:sizzle_loop', 'shared:torch_ignite'],

  async load(A) {
    await Promise.all([A.glb('kitchen'), A.glb('gangnana_cute')]);
    AFRO = await A.img('assets/photo/roast_afro.png').catch(() => null);
  },

  create(G) {
    const { THREE, scene, camera } = G;
    G.usePS1(240);
    scene.background = new THREE.Color('#2a2622');
    scene.add(new THREE.HemisphereLight('#fff8e8', '#4a3a30', 2.0));
    const key = new THREE.DirectionalLight('#fff0d8', 1.2);
    key.position.set(1, 3, 2);
    scene.add(key);
    addKitchen(G);

    // our own clean steel counter in front of the (cluttered) prep table
    const O = new THREE.Vector3(-0.5, 0.97, -2.5);
    const world = new THREE.Group();
    world.position.copy(O);
    scene.add(world);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.42), ps1Material({ color: '#8e959e' }));
    top.position.y = -0.02;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.95, 0.38), ps1Material({ color: '#8a8f96' }));
    body.position.y = -0.5;
    world.add(top, body);
    camera.near = 0.02;
    camera.position.set(O.x + 0.03, O.y + 0.42, O.z + 0.52);
    camera.lookAt(O.x + 0.03, O.y + 0.05, O.z - 0.03);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // plate (turntable at L3)
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.012, 16), ps1Material({ color: '#e4ecf8' }));
    plate.position.set(-0.04, 0.006, 0);
    world.add(plate);
    const spin = new THREE.Group();
    spin.position.set(-0.04, 0.012, 0);
    world.add(spin);
    const R = 0.022;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.11, R * 0.8, 0.02), new THREE.Vector3(0, R * 0.8, -0.045), new THREE.Vector3(0.11, R * 0.8, 0.02));
    const hb = halfBanana(THREE, curve, R);
    const skinMat = ps1Material({ color: '#f2cc2a', side: THREE.DoubleSide });
    const topMat = ps1Material({ color: '#fff3c4' });
    spin.add(new THREE.Mesh(hb.skin, skinMat), new THREE.Mesh(hb.top, topMat));

    // torch (upper left, nozzle aimed at the banana's middle)
    const torch = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 8), ps1Material({ color: '#d8342c' }));
    can.position.y = 0.055;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.03, 8), ps1Material({ color: '#333' }));
    head.position.y = 0.125;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), ps1Material({ color: '#888' }));
    nozzle.position.y = 0.17;
    const flame = new THREE.Group();
    flame.position.y = 0.205;
    const fo = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 7), new THREE.MeshBasicMaterial({ color: '#4aa8ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    const fi = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.04, 6), new THREE.MeshBasicMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    fo.position.y = 0.035; fi.position.y = 0.02;
    flame.add(fo, fi);
    flame.visible = false;
    torch.add(can, head, nozzle, flame);
    const torchRest = new THREE.Vector3(-0.25, 0.19, 0.05);
    torch.position.copy(torchRest);
    torch.rotation.z = -2.25; // nozzle points down-right toward the banana
    world.add(torch);
    const glow = new THREE.PointLight('#7ab8ff', 0, 0.5, 1.5);
    glow.position.set(-0.04, 0.06, 0);
    world.add(glow);

    // mini Gangnana standing next to the plate
    const nana = new THREE.Group();
    nana.position.set(0.13, 0, -0.1);
    nana.rotation.y = -0.35;
    world.add(nana);
    let nanaAnim = null, nanaHead = null, nanaFront = null;
    const nanaMats = [];
    const afro = new THREE.Group();
    afro.visible = false;
    scene.add(afro);
    const eyes = new THREE.Group(); // white cartoon eyes on the charcoal face
    eyes.visible = false;
    scene.add(eyes);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      e.position.x = s * 0.013;
      e.scale.y = 1.4;
      eyes.add(e);
    }
    if (AFRO) { // real afro wig photo cutout, singed dark
      const t = new THREE.Texture(AFRO);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: '#b0a090', alphaTest: 0.3 }));
      const w = 0.22;
      sp.scale.set(w, (w * AFRO.naturalHeight) / AFRO.naturalWidth, 1);
      afro.add(sp);
      afro.userData.sprite = true;
    } else {
      const m = ps1Material({ color: '#1a120c' });
      for (let i = 0; i < 14; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(G.rand(0.022, 0.03), 0), m);
        const a = (i / 14) * Math.PI * 2 * 2.3;
        b.position.set(Math.cos(a) * 0.04, 0.02 + (i % 3) * 0.014, Math.sin(a) * 0.04);
        afro.add(b);
      }
    }
    G.A.instance('gangnana_cute').then(({ root, clips }) => {
      fitHeight(root, 0.2);
      root.traverse((o) => {
        if (o.isMesh) { o.material = toPS1(o.material); nanaMats.push(o.material); }
        if (o.name === 'Head') nanaHead = o;
        if (o.name === 'headfront') nanaFront = o;
      });
      nana.add(root);
      nanaAnim = G.animate(root, clips);
      nanaAnim.play('idle');
    });

    // smoke puffs (overcook)
    const smoke = [];
    const smokeMat = ps1Material({ color: '#8a8a8a', transparent: true, opacity: 0.7 });
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.018, 0), smokeMat);
      s.visible = false;
      world.add(s);
      smoke.push({ s, v: new THREE.Vector3(G.rand(-0.06, 0.06), G.rand(0.12, 0.25), G.rand(-0.04, 0.06)) });
    }

    // gauge rules
    const width = [0.22, 0.15, 0.17][G.level - 1];
    const z0 = G.rand(0.5, 0.64), z1 = z0 + width;
    const rate = [0.5, 0.56, 0.8][G.level - 1] * G.speed;
    const turn = G.level >= 3;
    let d = 0, holding = false, state = 'play', stT = 0, nudge = 0;
    let sTorch = null, sSizzle = null;
    G.dbg = { z0, z1, d: 0 };

    const COL = [[0, '#fff3c4'], [0.45, '#f2d27a'], [z0 + width * 0.5, '#d08a2a'], [z1 + 0.04, '#6a3410'], [1, '#141008']];
    const crustColor = (v) => {
      for (let i = 1; i < COL.length; i++) if (v <= COL[i][0]) {
        const k = (v - COL[i - 1][0]) / (COL[i][0] - COL[i - 1][0] || 1);
        return new THREE.Color(COL[i - 1][1]).lerp(new THREE.Color(COL[i][1]), k);
      }
      return new THREE.Color(COL[COL.length - 1][1]);
    };

    const stopFire = () => {
      holding = false;
      flame.visible = false;
      glow.intensity = 0;
      sTorch?.stop(); sSizzle?.stop();
      sTorch = sSizzle = null;
    };
    const finishWin = () => {
      state = 'win'; stT = 0;
      stopFire();
      G.sfx('sparkle');
      G.sfx('pop', { vol: 0.6 });
      nanaAnim?.play('cheer');
      G.win();
    };
    const finishBurn = () => {
      state = 'burn'; stT = 0;
      stopFire();
      d = 1;
      G.sfx('burnt');
      G.sfx('pop', { rate: 0.6 });
      G.shake(16, 0.35);
      afro.visible = true;
      afro.scale.setScalar(0.01);
      eyes.visible = true;
      for (const m of nanaMats) m.color.set('#2a2622');
      smoke.forEach((p, i) => { p.s.visible = true; p.s.position.set(0.13 + G.rand(-0.03, 0.03), 0.12, -0.1); p.delay = i * 0.04; });
      G.lose();
    };

    return {
      down() {
        if (state !== 'play') return;
        holding = true;
        flame.visible = true;
        G.sfx('shared:torch_ignite', { vol: 0.8 });
        sTorch = G.sfx('torch', { loop: true, vol: 0.6 });
        sSizzle = G.sfx('shared:sizzle_loop', { loop: true, vol: 0 });
      },
      up() {
        if (!holding || state !== 'play') return;
        stopFire();
        if (d >= z0 - 0.01 && d <= z1 + 0.02) finishWin();
        else { nudge = 1; G.sfx('pop', { vol: 0.3, rate: 1.4 }); }
      },
      timeout() {
        if (state !== 'play') return;
        stopFire();
        state = 'raw'; stT = 0;
        nanaAnim?.play('fall', { loop: false });
      },
      update(dt) {
        stT += dt;
        nudge = Math.max(0, nudge - dt * 2);
        if (turn && state === 'play') spin.rotation.y += dt * 2.4 * G.speed;
        // flame hits the banana only when it lies under the nozzle (L3 turntable)
        const cover = turn ? Math.pow(Math.abs(Math.cos(spin.rotation.y)), 1.5) : 1;
        if (holding && state === 'play') {
          d = Math.min(1, d + rate * dt * (0.15 + 0.85 * cover));
          if (d > z1 + 0.06) finishBurn();
          sSizzle?.setVol(0.25 + d * 0.6);
        }
        G.dbg.d = d;
        topMat.color.copy(crustColor(d));
        skinMat.color.set('#f2cc2a').lerp(new THREE.Color('#3a2a10'), Math.max(0, d - 0.55) * 1.4);
        // torch leans in while firing
        torch.position.lerpVectors(torchRest, new THREE.Vector3(-0.235, 0.175, 0.05), holding ? 1 : 0);
        if (holding) {
          flame.scale.set(1 + Math.random() * 0.25, 0.9 + Math.random() * 0.35, 1);
          glow.intensity = 0.6 + Math.random() * 0.3;
        }

        // afro grows + smoke
        if (nanaHead) {
          nanaHead.getWorldPosition(afro.position);
          afro.position.y += 0.012;
          if (afro.userData.sprite) { // sit behind the head so the charcoal face stays in front
            afro.position.addScaledVector(afro.position.clone().sub(camera.position).normalize(), 0.035);
            afro.position.y += 0.03;
          }
        }
        if (nanaFront && eyes.visible) {
          nanaFront.getWorldPosition(eyes.position);
          eyes.quaternion.copy(nana.quaternion);
          eyes.translateZ(0.004);
          eyes.scale.y = Math.sin(stT * 3) > 0.92 ? 0.1 : 1; // blink
        }
        if (state === 'burn') {
          const k = Math.min(1, stT / 0.2);
          afro.scale.setScalar(0.01 + k * (1.05 + Math.sin(stT * 20) * 0.04));
          for (const p of smoke) {
            if ((p.delay -= dt) > 0) continue;
            p.s.position.addScaledVector(p.v, dt);
            p.s.scale.setScalar(1 + stT * 2);
          }
          smokeMat.opacity = Math.max(0, 0.7 - stT * 0.6);
        }
        if (state === 'win') nana.position.y = Math.abs(Math.sin(stT * 10)) * 0.02;

        // 2D gauge (right edge)
        const c = G.c2d;
        const gx = 520, gy = 170, gw = 46, gh = 420;
        c.save();
        c.fillStyle = 'rgba(20,14,6,.75)';
        c.beginPath(); c.roundRect(gx - 8, gy - 8, gw + 16, gh + 16, 14); c.fill();
        c.fillStyle = '#444';
        c.fillRect(gx, gy, gw, gh);
        const yOf = (v) => gy + gh * (1 - v);
        c.fillStyle = '#ffd34a';
        c.fillRect(gx, yOf(z1), gw, yOf(z0) - yOf(z1));
        c.fillStyle = '#ff4a2a';
        c.fillRect(gx, gy, gw, yOf(z1 + 0.06) - gy);
        const grad = c.createLinearGradient(0, gy + gh, 0, gy);
        grad.addColorStop(0, '#fff3c4'); grad.addColorStop(0.6, '#d08a2a'); grad.addColorStop(1, '#2a1408');
        c.fillStyle = grad;
        c.globalAlpha = 0.85;
        c.fillRect(gx + 10, yOf(d), gw - 20, gy + gh - yOf(d));
        c.globalAlpha = 1;
        c.strokeStyle = '#fff'; c.lineWidth = 4;
        c.strokeRect(gx, gy, gw, gh);
        // marker
        const my = yOf(d);
        c.fillStyle = '#fff';
        c.beginPath(); c.moveTo(gx - 6, my); c.lineTo(gx - 30, my - 14); c.lineTo(gx - 30, my + 14); c.fill();
        c.restore();
        G.text('★', gx + gw / 2, (yOf(z0) + yOf(z1)) / 2, { size: 34, color: '#fff', stroke: '#a86a00' });
        G.text('탐', gx + gw / 2, gy + 26, { size: 26, color: '#fff' });
        if (nudge > 0) G.text('더!', gx - 70, my, { size: 44, color: '#ffd400', alpha: nudge });
        if (state === 'play' && !holding && d === 0) G.text('꾹~', 300, 620, { size: 56, color: '#fff', alpha: 0.6 + 0.4 * Math.sin(G.t * 8) });
      },
    };
  },
};
