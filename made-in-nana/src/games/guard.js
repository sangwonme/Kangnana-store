// 18 [BOSS] 지켜라! — 바나나 바구니로 원숭이 떼와 지원이 몰려온다. 탭해서 쫓아낸다. 목숨 3개(바나나 아이콘).
// 마지막엔 거대 지원을 연타. 다 지켜내면 바나나 바구니가 샤방샤방 빛난다. (큐트3D + 원숭이 사진 빌보드)
import { fitHeight } from '../core/assets.js';

const DURATION = 30;
const GIANT_AT = 22;
const LIVES = 3;
const PER_LIFE = 3; // bananas in the basket per life

// real monkey photo cutouts (Wikimedia Commons, see 사진 출처) as billboards. face: which way the photo looks (-1 left, 1 right)
const PHOTOS = {
  sit: { file: 'assets/photo/guard_monkey_sit.png', face: -1, h: 1.15 },
  walk: { file: 'assets/photo/guard_monkey_walk.png', face: -1, h: 0.95 },
  leap: { file: 'assets/photo/guard_monkey_leap.png', face: -1, h: 0.95 },
  eat: { file: 'assets/photo/guard_monkey_eat.png', face: 1, h: 1.15 },
};
const BANANA_ICON = 'assets/photo/guard_banana.png';
let TEX = {};   // pose -> THREE.Texture (only the photos that exist)
let ICON = null; // HUD life icon (banana photo)

export default {
  id: 'guard', no: 18, cmd: '지켜라!', hint: '다가오는 놈들을 탭!', bgm: 'bgm_boss', layer: 'both',
  boss: true, duration: DURATION, timeout: 'win', afterglow: 2.4,
  sounds: ['monkey', 'bonk', 'sparkle', 'c8_coin', 'slurp', 'boing', 'thud'],

  async load(A) {
    TEX = {};
    await Promise.all([
      ...['jiwon', 'banana', 'basket', 'btree', 'hut'].map((n) => A.glb(n)),
      ...Object.entries(PHOTOS).map(([k, p]) => A.texture(p.file).then((t) => { TEX[k] = t; }, () => {})),
      A.img(BANANA_ICON).then((im) => { ICON = im; }, () => {}),
    ]);
  },

  create(G) {
    const { THREE, A, scene, camera } = G;
    G.showTimer = false;
    const L = G.level;
    scene.background = new THREE.Color('#8fd8ff');
    scene.fog = new THREE.Fog('#8fd8ff', 18, 40);
    scene.add(new THREE.HemisphereLight('#ffffff', '#e8c890', 2.2));
    const sun = new THREE.DirectionalLight('#fff4d8', 2);
    sun.position.set(3, 8, 5);
    scene.add(sun);
    camera.position.set(0, 9.6, 7.4);
    camera.lookAt(0, 0, 0.2);

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: '#2fb6d8' }));
    sea.rotation.x = -Math.PI / 2;
    scene.add(sea);
    const sand = new THREE.Mesh(new THREE.CircleGeometry(7.5, 40), new THREE.MeshLambertMaterial({ color: '#f3d9a0' }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = 0.01;
    scene.add(sand);

    const STASH = new THREE.Vector3(0.3, 0, 0.6);

    // ---- props
    const bananas = []; // meshes in the basket; visible count = lives * PER_LIFE
    A.instance('basket').then(({ root }) => {
      fitHeight(root, 0.75);
      root.position.add(STASH);
      scene.add(root);
    });
    A.instance('banana').then(({ root }) => {
      fitHeight(root, 0.55);
      root.position.y -= 0.275;
      const t = new THREE.Group();
      t.add(root);
      for (let i = 0; i < LIVES * PER_LIFE; i++) {
        const b = t.clone();
        const a = i * 2.4, r = 0.12 + (i % 4) * 0.07;
        b.position.set(STASH.x + Math.cos(a) * r, 0.62 + Math.floor(i / 4) * 0.12, STASH.z + Math.sin(a) * r);
        b.rotation.set(G.rand(0, 6), G.rand(0, 6), Math.PI / 2);
        b.userData.home = b.position.clone();
        scene.add(b);
        bananas.push(b);
      }
      showStock();
    });
    const blockers = []; // hut + palm: no enemy lane may pass behind them on screen
    let lanesReady = false;
    A.instance('btree').then(({ root }) => { fitHeight(root, 4); root.position.set(3.3, 0, -3.3); scene.add(root); blockers.push(root); pickLanes(); });
    A.instance('hut').then(({ root }) => { fitHeight(root, 2); root.position.set(-3.5, 0, -2.6); root.rotation.y = 0.8; scene.add(root); blockers.push(root); pickLanes(); });

    // ---- monkeys (photo billboards)
    const runPoses = ['sit', 'walk', 'leap'].filter((k) => TEX[k]);
    const shadowGeo = new THREE.CircleGeometry(0.42, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false });
    // show a pose on a monkey's sprite, mirrored so it looks where it is heading
    const pose = (m, k) => {
      const ph = PHOTOS[k], t = TEX[k] || TEX[runPoses[0]];
      if (!t) return;
      m.pose = k;
      m.mat.map = t;
      m.mat.needsUpdate = true;
      const img = t.image;
      m.sprite.scale.set(ph.h * img.width / img.height, ph.h, 1);
    };
    const faceTo = (m, dx) => {
      const ph = PHOTOS[m.pose];
      const sx = Math.abs(m.sprite.scale.x);
      // camera looks down -z, so world x ~ screen x
      m.sprite.scale.x = (dx * ph.face >= 0 ? 1 : -1) * sx;
    };
    const monkeys = []; // {kind:'monkey'|'jiwon', obj, state, speed, t, ...}
    const tmp = new THREE.Vector3();

    // approach lanes: every 15 degrees around the basket, minus any lane whose path (feet to head height) crosses the
    // screen box of the hut or the palm. Until both are loaded only the front half (always in plain view) is used.
    const RX = 6.4, RZ = 5.6;
    const laneStart = (a) => new THREE.Vector3(STASH.x + Math.cos(a) * RX, 0, STASH.z + Math.sin(a) * RZ);
    const ALL = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
    let lanes = ALL.filter((a) => Math.sin(a) > 0.2);
    const screenBox = (obj) => {
      const b = new THREE.Box3().setFromObject(obj);
      const xs = [], ys = [];
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const q = G.toScreen(new THREE.Vector3(x, y, z));
        xs.push(q.x); ys.push(q.y);
      }
      return { x0: Math.min(...xs) - 30, x1: Math.max(...xs) + 30, y0: Math.min(...ys) - 30, y1: Math.max(...ys) + 30 };
    };
    const laneClear = (a, boxes) => {
      const p0 = laneStart(a);
      for (let k = 0; k <= 30; k++) {
        const t = k / 30;
        for (const h of [0, 0.7, 1.5]) {
          const q = G.toScreen(new THREE.Vector3(G.lerp(p0.x, STASH.x, t), h, G.lerp(p0.z, STASH.z, t)));
          if (boxes.some((b) => q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1)) return false;
        }
      }
      return true;
    };
    function pickLanes() {
      if (blockers.length < 2) return;
      const boxes = blockers.map(screenBox);
      const ok = ALL.filter((a) => laneClear(a, boxes));
      if (ok.length >= 4) lanes = ok;
      lanesReady = true;
    }
    const spawnPos = () => laneStart(G.pick(lanes) + G.rand(-0.04, 0.04));

    const spawnMonkey = (speed) => {
      const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05 });
      const sprite = new THREE.Sprite(mat);
      sprite.center.set(0.5, 0.02);
      const obj = new THREE.Group();
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      shadow.scale.y = 0.55;
      obj.add(shadow, sprite);
      const pos = spawnPos();
      obj.position.copy(pos);
      scene.add(obj);
      const m = { kind: 'monkey', obj, sprite, shadow, mat, state: 'run', speed, t: G.rand(0, 5) };
      pose(m, G.pick(runPoses.length ? runPoses : ['eat']));
      faceTo(m, STASH.x - pos.x);
      monkeys.push(m);
      if (Math.random() < 0.35) G.sfx('monkey', { vol: 0.35, rate: G.rand(0.9, 1.3) });
    };

    // 지원 (3D) walking in for the bananas
    const makeJiwon = async (h) => {
      const { root, clips } = await A.instance('jiwon');
      fitHeight(root, h);
      const obj = new THREE.Group();
      obj.add(root);
      obj.name = h > 2 ? 'giant' : 'jiwon';
      scene.add(obj);
      const anim = G.animate(root, clips);
      anim.play('walk', { timeScale: 1.4 });
      return { obj, anim, h };
    };
    const spawnJiwon = async (speed) => {
      const j = await makeJiwon(1.5);
      if (G.result) { scene.remove(j.obj); return; }
      j.obj.position.copy(spawnPos());
      monkeys.push({ kind: 'jiwon', obj: j.obj, anim: j.anim, state: 'run', speed: speed * 0.8, t: 0 });
    };

    // ---- giant 지원 (final wave)
    let giant = null; // {obj, anim, hp, max, state, t, steal}
    const spawnGiant = async () => {
      const j = await makeJiwon(3.6);
      if (G.result) { scene.remove(j.obj); return; }
      j.obj.position.set(STASH.x + 0.3, 0, -3.2);
      j.anim.play('walk', { timeScale: 0.6 });
      const hp = [14, 18, 22][L - 1];
      giant = { obj: j.obj, anim: j.anim, hp, max: hp, state: 'walk', t: 0, steal: 0, flash: 0 };
      G.sfx('thud', { rate: 0.6 });
      G.shake(10, 0.5);
    };

    // ---- state
    let lives = LIVES;
    let lifeFlash = 0;
    let spawnT = 1.0;
    let wave = 1;
    let phase = 'play'; // play | eat (win gag) | lost
    let tt = 0;
    const glints = [];  // win gag: sparkles around the basket
    const hits = [];    // tap impact bursts {x, y, t}

    function showStock() { bananas.forEach((b, i) => { b.visible = i < lives * PER_LIFE; }); }

    const loseLife = () => {
      if (phase !== 'play') return;
      lives = Math.max(0, lives - 1);
      lifeFlash = 0.6;
      showStock();
      G.shake(8, 0.25);
      if (lives <= 0 && !G.result) {
        phase = 'lost';
        tt = 0;
        G.lose();
      }
    };

    const startEat = () => {
      phase = 'eat';
      tt = 0;
      for (const m of monkeys) {
        if (m.state !== 'run') continue;
        m.state = 'flee';
        if (m.sprite) faceTo(m, m.obj.position.x - STASH.x);
      }
      if (giant && giant.state !== 'gone') giant.state = 'flee';
      G.sfx('sparkle');
    };

    const screenOf = (m) => G.toScreen(tmp.copy(m.obj.position).setY(m.kind === 'jiwon' ? 0.8 : 0.6));

    return {
      get debug() { return { lanes, lanesReady, RX, RZ, stash: STASH.toArray(), boxes: blockers.map(screenBox) }; }, // read by playtests
      down(p) {
        if (phase !== 'play') return;
        // giant first: generous box around his body
        if (giant && (giant.state === 'walk' || giant.state === 'eat')) {
          const c = G.toScreen(tmp.copy(giant.obj.position).setY(1.8));
          if (Math.abs(p.x - c.x) < 150 && Math.abs(p.y - c.y) < 200) {
            giant.hp--;
            giant.flash = 0.12;
            giant.obj.position.z -= 0.22;
            G.sfx('bonk', { rate: G.rand(0.8, 1.3) });
            G.shake(5, 0.1);
            hits.push({ x: p.x, y: p.y, t: 0 });
            if (giant.hp <= 0) {
              giant.state = 'gone';
              giant.t = 0;
              G.sfx('boing', { rate: 0.6 });
              G.sfx('sparkle');
              G.win();
              startEat();
            }
            return;
          }
        }
        let best = null, bd = 85;
        for (const m of monkeys) {
          if (m.state !== 'run' && m.state !== 'flee') continue;
          const s = screenOf(m);
          const d = Math.hypot(s.x - p.x, s.y - p.y);
          if (d < bd) { bd = d; best = m; }
        }
        if (!best) return;
        hits.push({ x: p.x, y: p.y, t: 0 });
        G.sfx('bonk', { rate: G.rand(0.9, 1.4) });
        const wasCarry = best.state === 'flee' && best.carry;
        if (best.kind === 'jiwon') {
          best.state = 'shooed'; // turns tail and runs
          best.t = 0;
          best.anim.play('walk', { timeScale: 3 });
        } else {
          best.state = 'shoo';
          best.t = 0;
          if (TEX.leap) pose(best, 'leap');
          best.shadow.visible = false;
          best.v = new THREE.Vector3(best.obj.position.x - STASH.x, 0, best.obj.position.z - STASH.z).normalize().multiplyScalar(5).setY(7);
        }
        if (wasCarry && lives < LIVES) { // got the banana back
          lives++;
          showStock();
          G.sfx('c8_coin', { vol: 0.6 });
        }
      },

      timeout() { startEat(); },

      update(dt) {
        tt += dt;
        const T = G.t;
        lifeFlash = Math.max(0, lifeFlash - dt);

        // ---- spawning
        if (phase === 'play') {
          const newWave = T < 9 ? 1 : T < 16 ? 2 : T < GIANT_AT ? 3 : 4;
          if (newWave !== wave) {
            wave = newWave;
            if (wave === 4) spawnGiant();
          }
          const base = [1.6, 1.3, 1.05][L - 1];
          const interval = base * [1, 1, 0.75, 0.55, 1.5][wave];
          const speed = [1.15, 1.35, 1.55][L - 1] * (wave >= 3 ? 1.2 : 1) * G.speed;
          spawnT -= dt;
          const alive = monkeys.filter((m) => m.state === 'run').length;
          if (spawnT <= 0 && alive < 6) {
            spawnT = interval * G.rand(0.7, 1.2);
            if (wave >= 2 && Math.random() < 0.25) spawnJiwon(speed);
            else spawnMonkey(speed);
            if (wave === 3 && Math.random() < 0.4) spawnMonkey(speed);
          }
        }

        // ---- monkeys + 지원
        for (let i = monkeys.length - 1; i >= 0; i--) {
          const m = monkeys[i];
          m.t += dt;
          const o = m.obj;
          const toStash = tmp.set(STASH.x - o.position.x, 0, STASH.z - o.position.z);
          const dist = toStash.length();
          if (m.state === 'run') {
            toStash.normalize();
            o.position.addScaledVector(toStash, m.speed * dt);
            if (m.kind === 'monkey') {
              m.sprite.position.y = Math.abs(Math.sin(m.t * 9)) * 0.25;
              m.mat.rotation = Math.sin(m.t * 9) * 0.08;
            } else o.rotation.y = Math.atan2(toStash.x, toStash.z);
            if (dist < 0.85) {
              m.state = 'flee';
              m.carry = true;
              if (m.kind === 'monkey') { pose(m, 'eat'); faceTo(m, m.obj.position.x - STASH.x); G.sfx('monkey', { vol: 0.7, rate: G.rand(1.1, 1.4) }); }
              else G.sfx('slurp', { vol: 0.7 });
              loseLife();
            }
          } else if (m.state === 'flee' || m.state === 'shooed') {
            if (phase === 'lost' && m.kind === 'monkey') { // victory dance around the empty basket
              const a = m.t * 2 + i;
              o.position.set(STASH.x + Math.cos(a) * 1.3, 0, STASH.z + Math.sin(a) * 1.1);
              m.sprite.position.y = Math.abs(Math.sin(m.t * 10)) * 0.4;
              faceTo(m, -Math.sin(a));
              continue;
            }
            toStash.normalize().multiplyScalar(-1);
            o.position.addScaledVector(toStash, m.speed * (m.state === 'shooed' ? 2.4 : 1.5) * dt);
            if (m.kind === 'monkey') m.sprite.position.y = Math.abs(Math.sin(m.t * 12)) * 0.3;
            else { o.rotation.y = Math.atan2(toStash.x, toStash.z); o.position.y = m.state === 'shooed' ? Math.abs(Math.sin(m.t * 14)) * 0.15 : 0; }
            if (dist > 8) { scene.remove(o); monkeys.splice(i, 1); }
          } else if (m.state === 'shoo') {
            m.v.y -= 12 * dt;
            o.position.addScaledVector(m.v, dt);
            m.mat.rotation += dt * 9 * Math.sign(m.sprite.scale.x);
            if (m.t > 1.2) { scene.remove(o); monkeys.splice(i, 1); }
          }
        }

        // ---- giant
        if (giant) {
          const g = giant;
          g.t += dt;
          const o = g.obj;
          g.flash = Math.max(0, g.flash - dt);
          o.scale.setScalar(1 + g.flash * 0.6);
          if (g.state === 'walk' || g.state === 'eat') {
            const dz = STASH.z - 0.9 - o.position.z;
            if (dz > 0.05) {
              o.position.z += Math.min(dz, 0.55 * G.speed * dt);
              g.state = 'walk';
            } else if (g.state !== 'eat') {
              g.state = 'eat';
              g.anim.play('look');
            }
            if (g.state === 'eat' && phase === 'play') {
              g.steal -= dt;
              if (g.steal <= 0) { g.steal = 0.9; G.sfx('slurp', { vol: 0.8 }); loseLife(); }
            }
            o.rotation.z = Math.sin(g.t * 5) * 0.05;
          } else if (g.state === 'gone') {
            o.position.y += dt * 9;
            o.position.z -= dt * 6;
            o.rotation.z += dt * 8;
          } else if (g.state === 'flee') {
            o.position.z -= dt * 3;
            o.rotation.y = Math.PI;
          }
        }

        // ---- win gag: the camera leans in and the banana basket shines (샤방샤방)
        if (phase === 'eat') {
          const z = Math.min(1, tt / 0.6);
          const e = z * z * (3 - 2 * z);
          camera.position.set(G.lerp(0, STASH.x, e), G.lerp(9.6, 4.4, e), G.lerp(7.4, STASH.z + 4.4, e));
          camera.lookAt(G.lerp(0, STASH.x, e), G.lerp(0, 0.55, e), G.lerp(0.2, STASH.z, e));
          bananas.forEach((b, i) => {
            if (!b.visible) return;
            b.position.y = b.userData.home.y + Math.max(0, Math.sin(tt * 6 + i)) * 0.06 * z;
          });
          if (tt > 0.3 && Math.random() < dt * 14) {
            glints.push({ a: G.rand(0, Math.PI * 2), r: G.rand(20, 150), t: 0, s: G.rand(14, 34) });
            if (Math.random() < 0.35) G.sfx('sparkle', { vol: 0.35, rate: G.rand(1.1, 1.8) });
          }
        }

        // ---- 2D: tap bursts, lives, giant HP (no text)
        const c = G.c2d;
        if (phase === 'eat' && tt > 0.25) {
          const s = G.toScreen(tmp.copy(STASH).setY(0.7));
          const al = Math.min(1, (tt - 0.25) * 3);
          // spotlight: dim everything except the basket so the shine reads
          const vig = c.createRadialGradient(s.x, s.y, 90, s.x, s.y, 520);
          vig.addColorStop(0, 'rgba(30,15,0,0)');
          vig.addColorStop(1, `rgba(30,15,0,${0.55 * al})`);
          c.fillStyle = vig;
          c.fillRect(0, 0, 600, 800);
          c.save();
          c.globalCompositeOperation = 'lighter';
          c.translate(s.x, s.y);
          // slowly turning god-rays
          c.rotate(tt * 0.6);
          for (let i = 0; i < 12; i++) {
            c.rotate(Math.PI / 6);
            const g = c.createLinearGradient(0, 0, 0, -520);
            g.addColorStop(0, `rgba(255,230,140,${0.22 * al})`);
            g.addColorStop(1, 'rgba(255,240,170,0)');
            c.fillStyle = g;
            c.beginPath(); c.moveTo(-14, 0); c.lineTo(-70, -520); c.lineTo(70, -520); c.lineTo(14, 0); c.closePath(); c.fill();
          }
          c.restore();
          c.save();
          c.globalCompositeOperation = 'lighter';
          const glow = c.createRadialGradient(s.x, s.y - 20, 10, s.x, s.y - 20, 160);
          glow.addColorStop(0, `rgba(255,240,180,${(0.28 + Math.sin(tt * 6) * 0.06) * al})`);
          glow.addColorStop(1, 'rgba(255,230,120,0)');
          c.fillStyle = glow;
          c.fillRect(s.x - 170, s.y - 190, 340, 340);
          // four-point glints popping around the basket
          for (let i = glints.length - 1; i >= 0; i--) {
            const q = glints[i];
            q.t += dt;
            const k = Math.sin(Math.min(1, q.t / 0.5) * Math.PI);
            const x = s.x + Math.cos(q.a) * q.r, y = s.y + Math.sin(q.a) * q.r * 0.7 - 20;
            const r = q.s * k;
            c.fillStyle = `rgba(255,255,240,${k})`;
            c.beginPath();
            c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r * 0.35, y); c.quadraticCurveTo(x, y, x, y + r);
            c.quadraticCurveTo(x, y, x - r * 0.35, y); c.quadraticCurveTo(x, y, x, y - r);
            c.moveTo(x - r, y); c.quadraticCurveTo(x, y, x, y - r * 0.35); c.quadraticCurveTo(x, y, x + r, y);
            c.quadraticCurveTo(x, y, x, y + r * 0.35); c.quadraticCurveTo(x, y, x - r, y);
            c.fill();
            if (q.t > 0.5) glints.splice(i, 1);
          }
          c.restore();
        }
        for (let i = hits.length - 1; i >= 0; i--) {
          const h = hits[i];
          h.t += dt;
          const r = 20 + h.t * 140, a = Math.max(0, 1 - h.t / 0.3);
          c.save();
          c.globalAlpha = a;
          c.strokeStyle = '#fff6a0';
          c.lineWidth = 6;
          for (let k = 0; k < 8; k++) {
            const ang = k * Math.PI / 4 + 0.3;
            c.beginPath();
            c.moveTo(h.x + Math.cos(ang) * r * 0.5, h.y + Math.sin(ang) * r * 0.5);
            c.lineTo(h.x + Math.cos(ang) * r, h.y + Math.sin(ang) * r);
            c.stroke();
          }
          c.restore();
          if (h.t > 0.3) hits.splice(i, 1);
        }
        for (let i = 0; i < LIVES; i++) {
          const alive = i < lives;
          const x = 300 - 88 + i * 62, y = 16; // top centre (the practice button sits top-left)
          const sh = !alive && i === lives && lifeFlash > 0 ? Math.sin(lifeFlash * 60) * 6 : 0;
          c.save();
          c.globalAlpha = alive ? 1 : 0.25;
          if (!alive) c.filter = 'grayscale(1)';
          if (ICON) {
            const k = Math.min(54 / ICON.width, 46 / ICON.height);
            c.drawImage(ICON, x + sh, y, ICON.width * k, ICON.height * k);
          }
          c.restore();
        }
        if (lifeFlash > 0) {
          c.save();
          c.strokeStyle = `rgba(255,60,60,${lifeFlash})`;
          c.lineWidth = 18;
          c.strokeRect(0, 0, 600, 800);
          c.restore();
        }
        if (giant && (giant.state === 'walk' || giant.state === 'eat')) {
          const s = G.toScreen(tmp.copy(giant.obj.position).setY(3.9));
          c.save();
          c.fillStyle = '#1b1306';
          c.fillRect(s.x - 80, s.y - 14, 160, 18);
          c.fillStyle = '#ff5a5f';
          c.fillRect(s.x - 77, s.y - 11, 154 * (giant.hp / giant.max), 12);
          c.restore();
        }
      },
    };
  },
};
