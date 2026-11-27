// 17 미끄러져라! — 바나나 껍질에 올라탄 강나나를 컬링처럼 밀어 과녁(튜브) 한가운데 세운다. 지나치면 바다에 둥둥. (큐트3D)
import { fitHeight } from '../core/assets.js';

const START_Z = 2.4;
const JUDGES = []; // photo cutouts (Wikimedia Commons, see 사진 출처)

// red/white striped swim ring
function swimRing(THREE, R) {
  const geo = new THREE.TorusGeometry(R, 0.15, 8, 40);
  const pos = geo.attributes.position;
  const col = [];
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i));
    const red = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0;
    col.push(...(red ? [1, 0.33, 0.37] : [1, 1, 1]));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.13;
  return m;
}

export default {
  id: 'slide', no: 17, cmd: '미끄러져라!', hint: '초록에서 탭!', bgm: 'bgm_island', layer: 'both',
  duration: 5, timeout: 'lose', sounds: ['slip', 'splash', 'whoosh', 'sparkle', 'thud'],

  async load(A) {
    await Promise.all([
      ...['gangnana_cute', 'peel', 'btree'].map((n) => A.glb(n)),
      ...['crab', 'gull', 'pelican'].map((n, i) => A.img(`assets/photo/slide_judge_${n}.png`).then((im) => { JUDGES[i] = im; }, () => {})),
    ]);
  },

  create(G) {
    const { THREE, A, scene, camera } = G;
    const L = G.level;
    const D = [5.2, 6.0, 6.2][L - 1];         // distance to the target centre
    const R = [1.5, 1.1, 0.9][L - 1];         // ring radius = success radius (generous)
    const tx = L === 1 ? 0 : G.rand(-0.6, 0.6);
    const tz = START_Z - D;
    const seaZ = tz - R - 1.6;

    scene.background = new THREE.Color('#8fd8ff');
    scene.fog = new THREE.Fog('#8fd8ff', 16, 34);
    scene.add(new THREE.HemisphereLight('#ffffff', '#e8c890', 2.2));
    const sun = new THREE.DirectionalLight('#fff4d8', 2);
    sun.position.set(3, 8, 5);
    scene.add(sun);
    camera.position.set(0, 3.4, 6.6);
    camera.lookAt(0, 0, -1.6);

    const sand = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshLambertMaterial({ color: '#f3d9a0' }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.z = seaZ + 15;
    scene.add(sand);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshLambertMaterial({ color: '#2fb6d8' }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.01, seaZ - 20);
    scene.add(sea);
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.35), new THREE.MeshBasicMaterial({ color: '#e8fbff' }));
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(0, 0.02, seaZ);
    scene.add(surf);
    // the slide lane, the house (bullseye) and the ring
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, START_Z - seaZ + 0.5), new THREE.MeshLambertMaterial({ color: '#f8e6bd' }));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.005, (START_Z + seaZ) / 2);
    scene.add(lane);
    const house = new THREE.Group();
    house.position.set(tx, 0, tz);
    scene.add(house);
    const disc = (r0, r1, color, y) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32), new THREE.MeshLambertMaterial({ color }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      house.add(m);
    };
    disc(0, R, '#7fd0ff', 0.012);
    disc(0, R * 0.55, '#ffffff', 0.014);
    disc(0, 0.28, '#ff5a5f', 0.016);
    house.add(swimRing(THREE, R));

    for (const [x, z, s] of [[-3, -1, 1], [3.2, -2.5, -1]]) {
      A.instance('btree').then(({ root }) => { fitHeight(root, 4.2); root.position.set(x, 0, z); root.scale.x *= s; scene.add(root); });
    }

    // friction zones (L3): puddle = slippery, rough sand = sticky
    const zones = [];
    if (L >= 3) {
      const z1 = START_Z - G.rand(1.2, 1.8), z2 = START_Z - G.rand(3.3, 3.9);
      const slick = G.pick([0, 1]);
      [[z1, slick ? 'slick' : 'rough'], [z2, slick ? 'rough' : 'slick']].forEach(([z, kind]) => {
        const len = 1.1;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, len),
          new THREE.MeshLambertMaterial({ color: kind === 'slick' ? '#5cc8f0' : '#c9a066', transparent: kind === 'slick', opacity: 0.8 }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(0, 0.02, z);
        scene.add(m);
        if (kind === 'rough') {
          for (let i = 0; i < 14; i++) {
            const b = new THREE.Mesh(new THREE.SphereGeometry(G.rand(0.05, 0.1), 6, 4), new THREE.MeshLambertMaterial({ color: '#a8824a' }));
            b.position.set(G.rand(-1.2, 1.2), 0.02, z + G.rand(-0.5, 0.5));
            b.scale.y = 0.5;
            scene.add(b);
          }
        }
        zones.push({ z0: z - len / 2, z1: z + len / 2, k: kind === 'slick' ? 0.3 : 2.6, kind });
      });
    }

    // Gangnana on a peel
    const rider = new THREE.Group();
    rider.position.set(0, 0, START_Z);
    scene.add(rider);
    const body = new THREE.Group();
    body.position.y = 0.07;
    rider.add(body);
    let anim = null;
    let peel = null;
    A.instance('peel').then(({ root }) => {
      fitHeight(root, 0.22);
      peel = new THREE.Group();
      peel.add(root);
      rider.add(peel);
    });
    A.instance('gangnana_cute').then(({ root, clips }) => {
      fitHeight(root, 1.15);
      root.rotation.y = Math.PI; // faces the target (away from the camera)
      body.add(root);
      anim = G.animate(root, clips);
      anim.play('idle');
    });

    const drops = [];
    const dropGeo = new THREE.SphereGeometry(0.045, 6, 4);
    const dropMat = new THREE.MeshLambertMaterial({ color: '#e8fbff' });
    const splash = (at, n = 14) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(dropGeo, dropMat);
        m.position.copy(at);
        scene.add(m);
        drops.push({ m, v: new THREE.Vector3(G.rand(-1.5, 1.5), G.rand(2, 4.5), G.rand(-1.5, 1.5)) });
      }
    };

    const a0 = 5.5 * G.speed * G.speed; // base deceleration
    let state = 'ready';
    const vel = new THREE.Vector2();    // (x, -z) speed
    let tt = 0;
    let verdict = '';
    const fric = (z) => { for (const zn of zones) if (z > zn.z0 && z < zn.z1) return zn.k; return 1; };

    // power meter: the needle swings 0..1; power p launches him so he would stop p*DMAX away on plain sand.
    // the green band is computed by simulating the slide (so it stays honest over the L3 friction zones)
    const DMAX = (START_Z - seaZ) + 1.2;
    const v0 = (p) => Math.sqrt(2 * a0 * Math.max(0.05, p) * DMAX);
    const stopAt = (p) => { // distance travelled before stopping (Infinity = into the sea)
      let z = START_Z, v = v0(p);
      const h = 1 / 240;
      while (v > 0) { v = Math.max(0, v - a0 * fric(z) * h); z -= v * h; if (z < seaZ) return Infinity; }
      return START_Z - z;
    };
    const TABLE = Array.from({ length: 201 }, (_, i) => stopAt(i / 200));
    const band = (tol) => {
      const idx = TABLE.map((d, i) => (Math.abs(d - D) <= tol ? i : -1)).filter((i) => i >= 0);
      return idx.length ? [idx[0] / 200, idx[idx.length - 1] / 200] : [0.5, 0.5];
    };
    const GREEN = band(R * 0.95);
    const GOLD = band(0.3);
    const SEA = (TABLE.findIndex((d) => d === Infinity) + 201) % 201 / 200 || 1;
    const PERIOD = [2.2, 1.5, 1.15][L - 1];
    let phase = 0;
    let power = 0;
    const ghost = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.85, depthWrite: false }));
    ghost.rotation.x = -Math.PI / 2;
    ghost.position.y = 0.03;
    ghost.visible = false;
    scene.add(ghost);

    const launch = () => {
      const v = v0(power);
      const dir = new THREE.Vector2(tx, D).normalize(); // auto-aim at the ring
      vel.set(dir.x * v, dir.y * v);
      state = 'slide';
      tt = 0;
      ghost.visible = false;
      anim?.play('idle', { timeScale: 2 });
      G.sfx('slip');
      G.sfx('whoosh', { vol: 0.6 });
    };

    const drawMeter = () => {
      const c = G.c2d, x = 540, y0 = 640, y1 = 220, w = 44;
      const Y = (p) => G.lerp(y0, y1, p);
      c.save();
      c.fillStyle = 'rgba(27,19,6,0.6)';
      c.beginPath(); c.roundRect(x - w / 2 - 8, y1 - 12, w + 16, y0 - y1 + 24, 18); c.fill();
      c.fillStyle = '#e9e2cf'; c.fillRect(x - w / 2, y1, w, y0 - y1);
      c.fillStyle = '#2fb6d8'; c.fillRect(x - w / 2, y1, w, Y(SEA) - y1);           // overshoot = sea
      c.fillStyle = '#5bd46b'; c.fillRect(x - w / 2, Y(GREEN[1]), w, Y(GREEN[0]) - Y(GREEN[1]));
      c.fillStyle = '#ffd400'; c.fillRect(x - w / 2, Y(GOLD[1]), w, Math.max(4, Y(GOLD[0]) - Y(GOLD[1])));
      c.lineWidth = 4; c.strokeStyle = '#1b1306'; c.strokeRect(x - w / 2, y1, w, y0 - y1);
      // needle
      const ny = Y(power);
      const inGreen = power >= GREEN[0] && power <= GREEN[1];
      c.fillStyle = inGreen ? '#fff' : '#ff5a5f';
      c.beginPath(); c.moveTo(x - w / 2 - 34, ny - 16); c.lineTo(x - w / 2 - 4, ny); c.lineTo(x - w / 2 - 34, ny + 16); c.closePath();
      c.fill(); c.stroke();
      c.fillRect(x - w / 2, ny - 3, w, 6);
      c.restore();
      G.text('파워', x, y0 + 34, { size: 26, color: '#fff' });
      if (inGreen) G.text('지금!', x - 100, ny, { size: 40, color: '#5bd46b' });
    };

    const judge = () => {
      const d = Math.hypot(rider.position.x - tx, rider.position.z - tz);
      tt = 0;
      if (d <= R) {
        state = d <= 0.3 ? 'perfect' : 'good';
        anim?.play('cheer');
        G.sfx('sparkle');
        G.win();
      } else {
        state = 'flop';
        verdict = rider.position.z > tz ? '…모자라' : '…지나쳤다';
        anim?.play('fall');
        G.sfx('thud');
        G.lose();
      }
    };

    // perfect: three beach-animal judges (photo cutouts) pop up from the bottom holding "10.0" cards
    const drawJudges = () => {
      const c = G.c2d;
      const k = Math.min(1, tt / 0.3);
      for (let i = 0; i < 3; i++) {
        const x = 110 + i * 190;
        const rise = Math.min(1, Math.max(0, (tt - i * 0.1) / 0.25));
        const base = 800 + 10 - rise * 10;
        const im = JUDGES[i];
        const h = 170, w = im ? h * im.width / im.height : 120;
        const top = base - h * (0.2 + 0.8 * rise) + Math.sin(G.t * 9 + i) * 3;
        // stick + card first (behind), then the animal in front of it
        const cy = top - 70 + Math.sin(G.t * 7 + i * 2) * 5, rot = Math.sin(G.t * 5 + i) * 0.08;
        c.save();
        c.translate(x, cy);
        c.rotate(rot);
        c.fillStyle = '#8a5a2b';
        c.fillRect(-5, 20, 10, 110);
        c.shadowColor = 'rgba(0,0,0,0.3)';
        c.shadowBlur = 8;
        c.shadowOffsetY = 4;
        c.fillStyle = '#fffdf5';
        c.beginPath(); c.roundRect(-62, -42, 124, 72, 8); c.fill();
        c.restore();
        G.text('10.0', x, cy - 6, { size: 48 * k, color: '#e8323c', stroke: null });
        if (im) c.drawImage(im, x - w / 2, top, w, h);
      }
    };

    return {
      down() { if (state === 'ready') launch(); },
      timeout(r) {
        if (state === 'ready' || state === 'slide') {
          state = 'flop';
          tt = 0;
          anim?.play('fall');
          G.sfx('slip');
          verdict = '…미끄러지라니까';
        }
      },
      update(dt) {
        tt += dt;
        if (state === 'slide') {
          const k = fric(rider.position.z);
          const sp = vel.length();
          const nsp = Math.max(0, sp - a0 * k * dt);
          if (sp > 0) vel.multiplyScalar(nsp / sp);
          rider.position.x += vel.x * dt;
          rider.position.z -= vel.y * dt;
          body.rotation.z = Math.sin(tt * 20) * 0.08 * Math.min(1, nsp / 3);
          if (rider.position.z < seaZ) {
            state = 'sea';
            tt = 0;
            rider.userData.v = vel.y;
            anim?.play('fall');
            G.sfx('whoosh');
            G.lose();
          } else if (nsp <= 0.02) judge();
        } else if (state === 'sea') {
          // flies off the beach, splash, then floats like a banana
          if (tt < 0.35) {
            rider.position.z -= rider.userData.v * 0.6 * dt;
            rider.position.y = Math.sin((tt / 0.35) * Math.PI) * 0.8 - (tt / 0.35) * 0.3;
            body.rotation.x -= dt * 6;
          } else {
            if (!rider.userData.splashed) {
              rider.userData.splashed = true;
              splash(rider.position.clone().setY(0.1), 18);
              G.sfx('splash');
              if (peel) peel.visible = false;
              anim?.play('idle', { timeScale: 0.3 });
            }
            rider.position.y = -0.12 + Math.sin(tt * 4) * 0.05;
            body.rotation.set(Math.PI / 2, 0, 0); // on his back, face up
            rider.rotation.y += dt * 0.8;
          }
        } else if (state === 'flop') {
          // the peel shoots forward, he lands on his bum
          if (peel) { peel.position.z -= dt * 6; peel.rotation.y += dt * 12; }
          const k = Math.min(1, tt / 0.25);
          body.rotation.x = k * 1.25;
          body.position.y = 0.07 + Math.sin(k * Math.PI) * 0.4 - k * 0.05;
        } else if (state === 'good' || state === 'perfect') {
          body.position.y = 0.07 + Math.abs(Math.sin(tt * 8)) * 0.2;
          rider.rotation.y = Math.sin(tt * 6) * 0.3;
        }
        // camera trails him once he overshoots the target, so the sea gag is close up
        if (state === 'slide' || state === 'sea') {
          const fz = Math.min(6.6, rider.position.z + (state === 'sea' ? 3.4 : 5.2));
          camera.position.z += (fz - camera.position.z) * Math.min(1, dt * 4);
          camera.position.y += ((state === 'sea' ? 2.6 : 3.4) - camera.position.y) * Math.min(1, dt * 3);
          camera.lookAt(rider.position.x * 0.5, 0, Math.min(-1.6, camera.position.z - (state === 'sea' ? 3.6 : 8.2)));
        }
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          d.v.y -= 9 * dt;
          d.m.position.addScaledVector(d.v, dt);
          if (d.m.position.y < -0.1) { scene.remove(d.m); drops.splice(i, 1); }
        }

        // power meter + projected stop point
        if (state === 'ready') {
          phase += dt / PERIOD;
          power = 1 - Math.abs(1 - 2 * (phase % 1));
          drawMeter();
          if (L <= 2) {
            const d = TABLE[Math.round(power * 200)];
            ghost.visible = d !== Infinity;
            if (ghost.visible) {
              ghost.position.set(tx * (d / D), 0.03, START_Z - d);
              ghost.material.color.set(Math.abs(d - D) <= R ? '#5bd46b' : '#ff5a5f');
            }
          }
          if (G.t > 0.5 && G.t < 2.2) G.text('초록일 때 탭!', 300, 160, { size: 44, color: '#fff' });
        }
        for (const zn of zones) {
          if (state !== 'ready') break;
          const s = G.toScreen(new THREE.Vector3(1.6, 0, (zn.z0 + zn.z1) / 2));
          G.text(zn.kind === 'slick' ? '미끌' : '까끌', Math.min(560, s.x + 10), s.y, { size: 28, color: zn.kind === 'slick' ? '#bff0ff' : '#ffe0b0' });
        }
        if (state === 'perfect') drawJudges();
      },
    };
  },
};
