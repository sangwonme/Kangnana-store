// 15 돌려라! — 바나나 보트 모터의 프로펠러 둘레로 원을 그려 시동을 건다. L3는 화살표 방향으로만. (큐트3D)
import { fitHeight } from '../core/assets.js';

const TAU = Math.PI * 2;

// yellow banana tube along a curve, tapered toward both ends, brown tips
function bananaBoat(THREE) {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.78, -1.75), new THREE.Vector3(0, 0.34, -1.25), new THREE.Vector3(0, 0.14, -0.4),
    new THREE.Vector3(0, 0.14, 0.5), new THREE.Vector3(0, 0.3, 1.2), new THREE.Vector3(0, 0.6, 1.55),
  ]);
  const SEG = 40, RAD = 12;
  const geo = new THREE.TubeGeometry(curve, SEG, 0.36, RAD, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    const c = curve.getPointAt(u);
    const k = Math.max(0.22, Math.pow(Math.sin(Math.PI * u), 0.55));
    for (let j = 0; j <= RAD; j++) {
      const idx = i * (RAD + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#ffd84a' })));
  const brown = new THREE.MeshLambertMaterial({ color: '#6b4220' });
  for (const [u, dir] of [[0, -1], [1, 1]]) {
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).multiplyScalar(dir);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.085, 0.22, 8), brown);
    tip.position.copy(p).addScaledVector(t, 0.08);
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t);
    g.add(tip);
  }
  // brown ripe spots + grab handles
  for (const [z, x] of [[-0.6, 0.27], [0.3, -0.3], [0.9, 0.25]]) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), brown);
    s.position.set(x * 1.05, 0.33, z);
    s.lookAt(x * 4, 0.6, z);
    g.add(s);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), new THREE.MeshLambertMaterial({ color: '#e84a5f' }));
  handle.position.set(0, 0.48, -0.75);
  g.add(handle);
  return g;
}

function motor(THREE) {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: '#e84a5f' });
  const grey = new THREE.MeshLambertMaterial({ color: '#4a4f5a' });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.36), red);
  head.position.set(0, 0.82, 1.78);
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.38), grey);
  cap.position.set(0, 1.07, 1.78);
  g.add(cap);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.62, 8), grey);
  shaft.position.set(0, 0.36, 1.84);
  g.add(shaft);
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10), grey);
  gear.rotation.x = Math.PI / 2;
  gear.position.set(0, 0.12, 1.9);
  g.add(gear);
  const prop = new THREE.Group();
  prop.position.set(0, 0.12, 2.08);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), grey);
  prop.add(hub);
  const bladeMat = new THREE.MeshLambertMaterial({ color: '#ffe680' });
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / 3) * TAU;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6), bladeMat);
    b.scale.set(0.55, 1, 0.18);
    b.position.y = 0.18;
    b.rotation.y = 0.5;
    arm.add(b);
    prop.add(arm);
  }
  g.add(prop);
  return { g, head, prop };
}

export default {
  id: 'spin', no: 15, cmd: '돌려라!', hint: '프로펠러 주위로 원 그리기', bgm: 'bgm_island', layer: 'both',
  duration: 5, timeout: 'lose', sounds: ['motor', 'sputter', 'splash', 'whoosh'],

  async load(A) {
    await Promise.all(['gangnana_cute', 'btree'].map((n) => A.glb(n)));
  },

  create(G) {
    const { THREE, A, scene, camera } = G;
    scene.background = new THREE.Color('#8fd8ff');
    scene.fog = new THREE.Fog('#8fd8ff', 16, 40);
    scene.add(new THREE.HemisphereLight('#ffffff', '#9fd8e8', 2.2));
    const sun = new THREE.DirectionalLight('#fff4d8', 2);
    sun.position.set(3, 8, 5);
    scene.add(sun);
    camera.position.set(1.9, 2.2, 5.6);
    camera.lookAt(0, 0.55, 0.3);

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: '#2fb6d8' }));
    sea.rotation.x = -Math.PI / 2;
    scene.add(sea);
    const foamMat = new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.7 });
    const foam = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.scale.set(0.55, 1.8, 1);
    foam.position.y = 0.02;
    scene.add(foam);
    const beach = new THREE.Mesh(new THREE.CircleGeometry(3.5, 24), new THREE.MeshLambertMaterial({ color: '#f3d9a0' }));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(-5, 0.03, -11);
    scene.add(beach);
    A.instance('btree').then(({ root }) => { fitHeight(root, 4); root.position.set(-5, 0, -11); scene.add(root); });

    const boat = new THREE.Group();
    boat.rotation.y = 0.12;
    scene.add(boat);
    boat.add(bananaBoat(THREE));
    const mot = motor(THREE);
    boat.add(mot.g);

    // passenger
    const rider = new THREE.Group();
    rider.position.set(0, 0.18, 0.05);
    boat.add(rider);
    let anim = null;
    let model = null;
    A.instance('gangnana_cute').then(({ root, clips }) => {
      fitHeight(root, 1.15);
      root.rotation.y = 0.5;
      model = root;
      rider.add(root);
      anim = G.animate(root, clips);
      anim.play('idle');
    });

    // smoke puffs + spray
    const puffs = [];
    const puffGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const puff = (at, color = '#9aa0a8', n = 3, up = 1.2, grow = 3) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(puffGeo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85 }));
        m.position.copy(at).add(new THREE.Vector3(G.rand(-0.1, 0.1), G.rand(0, 0.1), G.rand(-0.1, 0.1)));
        scene.add(m);
        puffs.push({ m, grow, v: new THREE.Vector3(G.rand(-0.4, 0.4), up * G.rand(0.6, 1.2), G.rand(-0.2, 0.4)), life: 0.6 });
      }
    };

    const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: '#1b1306' }));
    rope.frustumCulled = false;
    rope.visible = false;
    scene.add(rope);

    const L = G.level;
    const need = [2, 3, 3][L - 1];
    const dir = L >= 3 ? G.pick([1, -1]) : 0; // screen: +1 clockwise
    let eff = 0;      // radians turned in the counted direction
    let net = 0;      // signed, for drawing the propeller
    let prevA = null;
    let turns = 0;
    let wrongAcc = 0;
    let state = 'idle';
    let tt = 0;
    let spinV = 0;    // propeller angular speed (after start / for the fail)
    let motorSfx = null;
    const tmp = new THREE.Vector3();
    const propScreen = () => G.toScreen(mot.prop.getWorldPosition(tmp));

    const start = () => {
      state = 'go';
      tt = 0;
      motorSfx = G.sfx('motor', { loop: true, vol: 0.8 });
      G.sfx('whoosh');
      // the rider falls off the back and gets towed
      const w = rider.getWorldPosition(new THREE.Vector3());
      scene.attach(rider);
      rider.position.copy(w);
      anim?.play('fall');
      G.win();
    };

    const fail = () => {
      state = 'wound';
      tt = 0;
      G.sfx('sputter', { rate: 0.7 });
      const w = rider.getWorldPosition(new THREE.Vector3());
      scene.attach(rider);
      rider.position.copy(w);
      rider.userData.from = w.clone();
      anim?.play('idle', { timeScale: 3 });
    };

    return {
      down(p) {
        const c = propScreen();
        prevA = Math.atan2(p.y - c.y, p.x - c.x);
      },
      move(p) {
        if (!p.down || state !== 'idle') return;
        const c = propScreen();
        const dx = p.x - c.x, dy = p.y - c.y, r = Math.hypot(dx, dy);
        if (r < 22 || r > 360) { prevA = null; return; }
        const a = Math.atan2(dy, dx);
        if (prevA != null) {
          let d = a - prevA;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          net += d;
          if (dir) {
            if (d * dir > 0) eff += Math.abs(d);
            else {
              eff = Math.max(0, eff - Math.abs(d) * 0.5);
              wrongAcc += Math.abs(d);
              if (wrongAcc > 2.5) { wrongAcc = -99; G.sfx('sputter', { vol: 0.5, rate: 1.5 }); G.caption('반대야!', 0.8); }
            }
          } else eff = Math.abs(net);
          const n = Math.floor(eff / TAU);
          if (n > turns) {
            turns = n;
            if (turns >= need) start();
            else {
              G.sfx('sputter', { vol: 0.8, rate: 0.9 + turns * 0.15 });
              puff(mot.head.getWorldPosition(tmp).clone().add(new THREE.Vector3(0, 0.35, 0)));
            }
          }
        }
        prevA = a;
      },
      up() { prevA = null; },
      timeout(r) { if (r === 'lose') fail(); },
      update(dt) {
        tt += dt;
        const bob = Math.sin(G.t * 2.4) * 0.04;
        if (state === 'idle') {
          boat.position.y = bob;
          boat.rotation.z = Math.sin(G.t * 1.7) * 0.03;
          mot.prop.rotation.z = -net;
          mot.head.position.x = turns ? Math.sin(G.t * 60) * 0.01 * turns : 0;
        } else if (state === 'go') {
          // boat blasts off toward the horizon, rider skims behind on his back
          spinV = Math.min(60, spinV + dt * 120);
          mot.prop.rotation.z -= spinV * dt;
          const v = 2 + tt * 16;
          boat.position.z -= v * dt * G.speed;
          boat.position.y = 0.06 + Math.sin(tt * 30) * 0.03;
          boat.rotation.x = -0.12;
          motorSfx?.setRate(1 + tt * 0.6);
          const stern = mot.prop.getWorldPosition(tmp);
          const target = stern.clone().add(new THREE.Vector3(0, 0, 2.3));
          rider.position.lerp(target.setY(0.12), Math.min(1, dt * 9));
          rider.rotation.x = Math.max(-1.35, rider.rotation.x - dt * 7); // falls on his back
          rider.rotation.z = Math.sin(tt * 18) * 0.15;
          if (Math.random() < 0.6) puff(rider.position.clone().add(new THREE.Vector3(0, 0.05, 0.3)), '#ffffff', 2, 2.2, 1);
          if (tt > 0.25 && !rider.userData.splashed) { rider.userData.splashed = true; G.sfx('splash'); }
          foam.visible = false;
          // tow rope
          const pos = rope.geometry.attributes.position;
          const hands = rider.position.clone().add(new THREE.Vector3(0, 0.25, -0.3));
          pos.setXYZ(0, stern.x, stern.y + 0.5, stern.z);
          pos.setXYZ(1, hands.x, hands.y, hands.z);
          pos.needsUpdate = true;
          rope.visible = true;
        } else if (state === 'wound') {
          // the propeller grabs his stem: he is reeled in head first and spins
          spinV = Math.min(40, spinV + dt * 90);
          mot.prop.rotation.z += spinV * dt;
          boat.position.y = bob;
          const pp = mot.prop.getWorldPosition(tmp);
          const k = Math.min(1, tt / 0.25);
          const target = pp.clone().add(new THREE.Vector3(0, 0, -1.15));
          rider.position.lerpVectors(rider.userData.from, target, k);
          rider.rotation.set(G.lerp(0, Math.PI / 2, k), 0, 0); // head toward the propeller
          if (model) model.rotation.y += spinV * dt * 0.6;
          if (tt > 0.3) {
            const s = G.toScreen(pp);
          }
          if (Math.random() < 0.3) puff(mot.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.35, 0)), '#555a62', 1);
        }
        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          p.life -= dt;
          p.m.position.addScaledVector(p.v, dt);
          p.m.scale.setScalar(1 + (0.6 - p.life) * p.grow);
          p.m.material.opacity = Math.max(0, p.life / 0.6) * 0.85;
          if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); }
        }

        // 2D guide: dashed circle around the propeller, turn pips, L3 direction arrow
        if (state === 'idle') {
          const c = G.c2d, s = propScreen(), R = 95;
          c.save();
          c.lineWidth = 7;
          c.strokeStyle = 'rgba(255,255,255,0.85)';
          c.setLineDash([16, 14]);
          c.lineDashOffset = -G.t * 60 * (dir || 1);
          c.beginPath(); c.arc(s.x, s.y, R, 0, TAU); c.stroke();
          c.setLineDash([]);
          if (dir) {
            // big arrow along the circle
            const a0 = G.t * 3 * dir;
            const a1 = a0 + 1.6 * dir;
            c.strokeStyle = '#ff5a5f';
            c.lineWidth = 14;
            c.lineCap = 'round';
            c.beginPath(); c.arc(s.x, s.y, R + 30, a0, a1, dir < 0); c.stroke();
            const hx = s.x + Math.cos(a1) * (R + 30), hy = s.y + Math.sin(a1) * (R + 30);
            const tx = -Math.sin(a1) * dir, ty = Math.cos(a1) * dir;
            c.fillStyle = '#ff5a5f';
            c.beginPath();
            c.moveTo(hx + tx * 30, hy + ty * 30);
            c.lineTo(hx - ty * 22, hy + tx * 22);
            c.lineTo(hx + ty * 22, hy - tx * 22);
            c.fill();
          }
          for (let i = 0; i < need; i++) {
            const x = s.x + (i - (need - 1) / 2) * 34, y = s.y + R + 70;
            c.fillStyle = i < turns ? '#ffd400' : 'rgba(255,255,255,0.6)';
            c.strokeStyle = '#1b1306';
            c.lineWidth = 4;
            c.beginPath(); c.arc(x, y, 12, 0, TAU); c.fill(); c.stroke();
          }
          c.restore();
        }
        if (state === 'go' && tt > 0.2) {
        }
      },
      dispose() { motorSfx?.stop(); },
    };
  },
};
