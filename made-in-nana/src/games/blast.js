// 26 쏴라! — 꾹 눌러 장풍을 모았다가, 간이화장실 위로 강나나가 고개를 내밀 때 손을 떼서 맞힌다.
// 맞은 강나나는 밤하늘의 별이 된다. 시간 안에 못 맞히면 화장실마다 강나나가 튀어나와 킥킥댄다. (실사 컷인 + 3D + 만화 집중선)
import { fitHeight } from '../core/assets.js';

const PHOTO = 'assets/photo/';
const BALL = { x: 230, y: 600 };               // where the energy ball sits in the charge graphic
const CH_BALL = { u: 0.31, v: 0.65 };          // ball centre inside blast_charge.png (Meshy, bg removed)
const MIN_CHARGE = 0.22;
let IMG = null;

export default {
  id: 'blast', no: 26, cmd: '쏴라!', hint: '꾹 모았다가 → 나오면 떼기!', bgm: 'bgm_spooky', layer: 'both',
  duration: 5, afterglow: 1.6, timeout: 'lose',
  sounds: ['hadoken', 'whoosh', 'bonk', 'sparkle', 'rumble', 'pop', 'c8_boom', 'squeak', 'shared:door_open'],

  async load(A) {
    const [bl, ch] = await Promise.all([
      A.img('blast.jpg'), A.img('blast_charge.png'), A.glb('gangnana_cute'),
      A.texture(`${PHOTO}blast_alley.jpg`), A.texture(`${PHOTO}blast_toilet_y.png`), A.texture(`${PHOTO}blast_toilet_o.png`),
      A.glb('dongwoo_cute'),
    ]);
    IMG = { bl, ch };
  },

  create(G) {
    const { THREE, A, scene, camera } = G;
    const c = G.c2d;
    const L = G.level;

    // ---- 3D: a night alley (photo) with three portable toilets (photo cutouts)
    A.texture(`${PHOTO}blast_alley.jpg`).then((t) => {
      t.repeat.set(0.5, 1);
      t.offset.set(0.25, 0);
      scene.background = t;
    });
    scene.add(new THREE.HemisphereLight('#c9b8ff', '#2a1838', 2.2));
    const key = new THREE.DirectionalLight('#ffe2b0', 2.6);
    key.position.set(-2, 4, 6);
    scene.add(key);
    const rim = new THREE.PointLight('#ff4fa0', 12, 8);
    rim.position.set(1.5, 3.2, -1);
    scene.add(rim);
    camera.position.set(0, 1.3, 6.5);
    camera.lookAt(0, 1.25, 0);

    const XS = [-1.45, 0, 1.45];
    const BASE = 0.35;
    const toilets = XS.map((x, i) => {
      const file = i === 1 ? 'blast_toilet_o.png' : 'blast_toilet_y.png';
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.1 }));
      A.texture(PHOTO + file).then((t) => {
        m.material.map = t;
        m.material.needsUpdate = true;
        const h = 2.05;
        m.scale.set(h * t.image.width / t.image.height * (i === 2 ? -1 : 1), h, 1);
      });
      m.position.set(x, BASE + 1.025, 0.2);
      m.renderOrder = 2;
      scene.add(m);
      return { m, x, shake: 0 };
    });
    // sidewalk strip under the toilets so they do not float
    const curb = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.4), new THREE.MeshLambertMaterial({ color: '#3a3346' }));
    curb.rotation.x = -Math.PI / 2;
    curb.position.set(0, BASE, 0.6);
    scene.add(curb);

    // pop-up actors hiding behind the toilets
    const mk = async (name, h) => {
      const { root, clips } = await A.instance(name);
      fitHeight(root, h);
      const g = new THREE.Group();
      g.add(root);
      g.visible = false;
      g.name = name;
      scene.add(g);
      const anim = G.animate(root, clips);
      anim.play('idle');
      return { g, anim, h };
    };
    let dark = null, decoy = null;
    mk('gangnana_cute', 1.2).then((a) => { dark = a; }); // the target: a Gangnana hiding in the toilets
    if (L >= 3) mk('dongwoo_cute', 1.25).then((a) => { decoy = a; });

    // ---- pop schedule
    const win = Math.max(0.6, [1.5, 1.05, 0.8][L - 1] / G.speed);
    let pop = null; // {who:'dark'|'decoy', slot, t, phase:'warn'|'up'|'hold'|'down', rise}
    let nextPop = 1.0 / Math.sqrt(G.speed);
    let lastSlot = -1;
    let popCount = 0;
    const startPop = () => {
      let slot;
      do slot = Math.floor(G.rand(0, 3)); while (slot === lastSlot);
      lastSlot = slot;
      const who = L >= 3 && popCount > 0 && Math.random() < 0.4 ? 'decoy' : 'dark';
      popCount++;
      pop = { who, slot, t: 0, phase: 'warn', rise: 0 };
      toilets[slot].shake = 0.3;
      G.sfx('bonk', { vol: 0.25, rate: 0.6 });
    };
    const actor = () => (pop ? (pop.who === 'dark' ? dark : decoy) : null);
    const isOut = () => pop && pop.rise > 0.45 && pop.phase !== 'warn';

    // ---- input: hold to charge, release to fire
    let charging = false;
    let charge = 0;
    let rumble = null;
    let state = 'play'; // play | shot | hit | miss | giggle
    let shot = null;    // {from, to, t, target}
    let tt = 0;
    let missT = 0;
    const motes = []; // energy particles streaming into the ball
    let flash = 0;
    const gigglers = []; // fail gag: a Gangnana in every toilet
    let lines = [];
    const makeLines = (n = 56) => {
      lines = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + G.rand(-0.05, 0.05), r: G.rand(0.55, 0.85), w: G.rand(0.008, 0.03) }));
    };
    makeLines();
    let linesT = 0;
    const tmp = new THREE.Vector3();
    const headScreen = (a) => G.toScreen(tmp.copy(a.g.position).setY(a.g.position.y + a.h * 0.8));

    const fire = () => {
      charging = false;
      rumble?.stop();
      rumble = null;
      if (charge < MIN_CHARGE) { charge = 0; G.sfx('pop', { vol: 0.4, rate: 1.6 }); missT = 0.4; return; }
      const a = actor();
      const out = isOut() && a;
      let to;
      if (out) to = headScreen(a);
      else to = G.toScreen(tmp.set(toilets[1].x, BASE + 1.2, 0.2));
      shot = { from: { x: BALL.x, y: BALL.y }, to, t: 0, target: out ? pop.who : null, size: 40 + Math.min(1, charge) * 60 };
      state = 'shot';
      G.sfx('hadoken');
      G.shake(8, 0.2);
      charge = 0;
    };

    const giggle = () => {
      state = 'giggle';
      tt = 0;
      charging = false;
      rumble?.stop();
      pop = null;
      G.sfx('shared:door_open', { vol: 0.8 });
      toilets.forEach((T, i) => {
        T.shake = 0.5;
        A.instance('gangnana_cute').then(({ root, clips }) => {
          fitHeight(root, 1.2);
          const g = new THREE.Group();
          g.add(root);
          g.position.set(T.x, BASE, -0.45);
          scene.add(g);
          const anim = G.animate(root, clips);
          anim.play('cheer', { timeScale: 1.4 });
          gigglers.push({ g, i, h: 1.2 });
        });
        [0, 0.12, 0.24].forEach((d) => setTimeout(() => G.result && G.sfx('squeak', { vol: 0.5, rate: 1.7 + i * 0.25 + d }), (0.15 + i * 0.12 + d) * 1000));
      });
    };

    // ---- drawing helpers
    const drawLines = (cx, cy, alpha, col = '255,255,255') => {
      c.save();
      c.fillStyle = `rgba(${col},${alpha})`;
      for (const l of lines) {
        const r0 = l.r * 420;
        c.beginPath();
        c.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0);
        c.lineTo(cx + Math.cos(l.a - l.w) * 900, cy + Math.sin(l.a - l.w) * 900);
        c.lineTo(cx + Math.cos(l.a + l.w) * 900, cy + Math.sin(l.a + l.w) * 900);
        c.closePath();
        c.fill();
      }
      c.restore();
    };
    const ball = (x, y, r, hot) => {
      const g = c.createRadialGradient(x, y, r * 0.05, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, hot ? '#fffbd0' : '#fff27a');
      g.addColorStop(0.65, 'rgba(255,190,0,0.85)');
      g.addColorStop(1, 'rgba(255,120,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    };
    const star = (x, y, r, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      c.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.42 : r; const a = i * Math.PI / 5 - Math.PI / 2; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath();
      c.shadowColor = '#fff59d'; c.shadowBlur = 30;
      c.fillStyle = '#fff59d'; c.fill();
      c.restore();
    };
    // charge graphic (no Gangnana while charging): a glowing palm with energy streaming in
    const drawCharge = (k, fade = 1, ox = 0) => {
      c.save();
      c.globalAlpha = fade;
      c.translate(ox, 0);
      const vg = c.createRadialGradient(BALL.x, BALL.y, 40, BALL.x, BALL.y, 420);
      vg.addColorStop(0, `rgba(255,200,60,${0.35 + 0.35 * k})`);
      vg.addColorStop(0.45, 'rgba(60,20,80,0.5)');
      vg.addColorStop(1, 'rgba(10,0,20,0)');
      c.fillStyle = vg;
      c.fillRect(0, 0, 600, 800);
      // streaks pulled into the ball
      c.globalCompositeOperation = 'lighter';
      for (const m of motes) {
        const x = BALL.x + Math.cos(m.a) * m.r, y = BALL.y + Math.sin(m.a) * m.r;
        const x2 = BALL.x + Math.cos(m.a) * (m.r + 26 + k * 30), y2 = BALL.y + Math.sin(m.a) * (m.r + 26 + k * 30);
        c.strokeStyle = `rgba(255,${200 + Math.floor(m.h * 55)},120,${Math.min(1, m.r / 60)})`;
        c.lineWidth = 3 + m.h * 4;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
      const im = IMG.ch;
      const sc = 0.9 + 0.2 * k + Math.sin(G.t * (18 + k * 30)) * (0.015 + 0.03 * k);
      const w = im.width * sc, h = im.height * sc;
      const jx = (Math.random() - 0.5) * 6 * k, jy = (Math.random() - 0.5) * 6 * k;
      c.drawImage(im, BALL.x - CH_BALL.u * w + jx, BALL.y - CH_BALL.v * h + jy, w, h);
      // hot core + shock rings
      c.globalCompositeOperation = 'lighter';
      ball(BALL.x + jx, BALL.y + jy, 40 + 65 * k + Math.sin(G.t * 40) * 6, k > 0.25);
      for (let i = 0; i < 2; i++) {
        const ph = (G.t * (1.5 + k * 2.5) + i / 2) % 1;
        c.strokeStyle = `rgba(255,240,170,${(1 - ph) * 0.8})`;
        c.lineWidth = 6;
        c.beginPath(); c.arc(BALL.x, BALL.y, 260 * (1 - ph) + 30, 0, Math.PI * 2); c.stroke();
      }
      if (flash > 0) { c.fillStyle = `rgba(255,255,230,${flash})`; c.fillRect(0, 0, 600, 800); }
      c.restore();
    };
    // impact cut-in: slanted band with a zoomed face crop
    const drawCutIn = (k) => {
      const y0 = 250, y1 = 470;
      const slide = (1 - Math.min(1, k * 4)) * 600;
      c.save();
      c.beginPath();
      c.moveTo(-slide, y0 + 40); c.lineTo(600 - slide + 200, y0 - 20); c.lineTo(600 - slide + 200, y1 - 50); c.lineTo(-slide, y1 + 10); c.closePath();
      c.fillStyle = '#fff'; c.fill();
      c.save();
      c.clip();
      c.drawImage(IMG.bl, 60, 380, 414, 220, -slide, y0 - 30, 600 * 1.15, 220 * (600 * 1.15 / 414));
      c.restore();
      c.lineWidth = 9; c.strokeStyle = '#1b1306'; c.stroke();
      c.restore();
    };

    return {
      get debug() { return { state, charging, charge, pop: pop && { who: pop.who, phase: pop.phase, rise: pop.rise } }; }, // read by playtests
      down() {
        if (state !== 'play') return;
        charging = true;
        charge = 0;
        rumble = G.sfx('rumble', { loop: true, vol: 0.55 });
      },
      up() { if (charging && state === 'play') fire(); },
      timeout(r) { if (r === 'lose' && state !== 'hit') giggle(); },
      update(dt) {
        tt += dt;
        linesT -= dt;
        if (linesT <= 0) { linesT = 0.06; makeLines(); }
        if (charging) {
          const before = charge;
          charge += dt * G.speed;
          rumble?.setRate(0.7 + Math.min(1.6, charge * 1.6));
          if (before < MIN_CHARGE && charge >= MIN_CHARGE) { flash = 0.5; G.sfx('sparkle', { vol: 0.5, rate: 1.4 }); }
          for (let i = 0; i < 3 + Math.min(1, charge) * 5; i++) motes.push({ a: G.rand(0, Math.PI * 2), r: G.rand(220, 360), h: Math.random(), sp: G.rand(500, 900) });
        }
        flash = Math.max(0, flash - dt * 3);
        for (let i = motes.length - 1; i >= 0; i--) {
          const m = motes[i];
          m.r -= m.sp * dt * (1 + Math.min(1, charge));
          m.a += dt * 2;
          if (m.r < 30 || !charging) motes.splice(i, 1);
        }
        missT = Math.max(0, missT - dt);

        // pops
        if (state === 'play' || state === 'shot') {
          if (!pop) {
            nextPop -= dt;
            if (nextPop <= 0 && dark) startPop();
          } else if (pop.phase !== 'laugh') {
            pop.t += dt;
            if (pop.phase === 'warn' && pop.t > 0.28 / Math.sqrt(G.speed)) { pop.phase = 'up'; pop.t = 0; }
            else if (pop.phase === 'up') { pop.rise = Math.min(1, pop.rise + dt * 7 * G.speed); if (pop.rise >= 1) { pop.phase = 'hold'; pop.t = 0; } }
            else if (pop.phase === 'hold' && pop.t > win && state === 'play') { pop.phase = 'down'; }
            else if (pop.phase === 'down') {
              pop.rise = Math.max(0, pop.rise - dt * 5 * G.speed);
              if (pop.rise <= 0) { pop = null; nextPop = G.rand(0.35, 0.6) / G.speed; }
            }
          }
        }
        for (const t of toilets) {
          t.shake = Math.max(0, t.shake - dt);
          t.m.rotation.z = Math.sin(G.t * 60) * 0.04 * (t.shake > 0 ? 1 : 0);
        }
        for (const a of [dark, decoy]) {
          if (!a) continue;
          const active = pop && actor() === a && state !== 'hit';
          if (state === 'hit' && a === dark) continue;
          a.g.visible = !!active;
          if (active) {
            const T = toilets[pop.slot];
            // rises from behind the toilet roof, leaning out
            a.g.position.set(T.x, BASE + G.lerp(0, 2.05 - a.h + (a === dark ? 0.85 : 0.8), pop.rise), -0.45);
            a.g.rotation.z = state === 'miss' && a === decoy ? Math.sin(G.t * 40) * 0.25 : Math.sin(G.t * 4) * 0.08; // decoy: zapped and shaking
          }
        }

        // the shot
        if (state === 'shot') {
          shot.t += dt / 0.3;
          if (shot.t >= 1) {
            if (shot.target === 'dark') {
              state = 'hit';
              tt = 0;
              dark.anim.play('fall');
              dark.g.userData.v = new THREE.Vector3(G.rand(-1, 1), 7, -10);
              G.sfx('c8_boom', { vol: 0.8 });
              G.shake(22, 0.45);
              G.win();
            } else if (shot.target === 'decoy') {
              state = 'miss';
              tt = 0;
              G.sfx('bonk');
              G.shake(10, 0.3);
              G.lose();
            } else {
              // hit the toilet: splat, and she pops out somewhere else to laugh at you
              state = 'play';
              missT = 0.6;
              toilets[1].shake = 0.4;
              G.sfx('bonk', { rate: 0.7 });
              G.shake(6, 0.2);
            }
          }
        }
        for (const q of gigglers) {
          // pop up out of every toilet at once and giggle (bobbing, rocking)
          const k = Math.min(1, Math.max(0, (tt - q.i * 0.08) / 0.18));
          q.g.position.y = BASE + G.lerp(0, 2.05 - q.h + 0.9, k) + Math.abs(Math.sin(tt * 16 + q.i)) * 0.08;
          q.g.rotation.z = Math.sin(tt * 12 + q.i * 2) * 0.15;
        }
        if (state === 'hit') {
          const o = dark.g;
          const v = o.userData.v;
          if (tt > 0.12) { // short freeze on impact
            v.y -= 6 * dt;
            o.position.addScaledVector(v, dt);
            o.rotation.z += dt * 14;
            o.rotation.x += dt * 9;
          }
          if (tt > 1.0) o.visible = false;
        }

        // ---------------- 2D overlay
        const shakeX = missT > 0 ? Math.sin(missT * 60) * 8 : 0;
        if (state === 'hit' && tt < 0.1) {
          // impact frame: black / white flash
          c.fillStyle = tt < 0.05 ? '#000' : '#fff';
          c.fillRect(0, 0, 600, 800);
          drawLines(shot.to.x, shot.to.y, 1, tt < 0.05 ? '255,255,255' : '0,0,0');
          return;
        }
        if (charging) drawCharge(Math.min(1, charge / 0.9));
        else if (state === 'shot') {
          drawCharge(1, Math.max(0, 1 - shot.t * 2));
          // the real photo only on a real hit: centre cut-in while the blast flies
          if (shot.target === 'dark') drawCutIn(shot.t * 0.3);
        } else if (state === 'play') drawCharge(0, 0.75 + Math.sin(G.t * 5) * 0.1, shakeX);
        if (state === 'hit') {
          if (tt < 0.8) drawLines(300, 360, 0.5);
          if (tt > 0.1 && tt < 0.5) drawCutIn(0.3 + tt);
          if (tt > 1.0) {
            star(430, 90, 26 + Math.sin(tt * 30) * 8, tt * 3);
            if (!dark.g.userData.twinkled) { dark.g.userData.twinkled = true; G.sfx('sparkle'); }
          }
        }
        if (state === 'shot') {
          const k = Math.min(1, shot.t);
          const x = G.lerp(shot.from.x, shot.to.x, k), y = G.lerp(shot.from.y, shot.to.y, k);
          c.save();
          c.strokeStyle = 'rgba(255,240,150,0.6)';
          c.lineWidth = shot.size;
          c.lineCap = 'round';
          c.beginPath(); c.moveTo(shot.from.x, shot.from.y); c.lineTo(x, y); c.stroke();
          c.restore();
          ball(x, y, shot.size, true);
        }
        // taunting / reactions
        if (pop && pop.rise > 0.6 && state === 'play' && pop.who === 'decoy') {
          const s = headScreen(decoy);
          G.bubble('쏘지 마!', G.clamp(s.x + 90, 90, 510), s.y - 70, { size: 28, tail: [s.x + 20, s.y - 20] });
        }
        if (state === 'giggle' && tt > 0.25) {
          for (const q of gigglers) {
            const s = G.toScreen(tmp.copy(q.g.position).setY(q.g.position.y + q.h));
            G.bubble('킥킥킥', s.x + (q.i - 1) * 8, s.y - 55 + Math.sin(tt * 20 + q.i) * 4, { size: 28, tail: [s.x, s.y - 8] });
          }
        }
      },
      dispose() { rumble?.stop(); },
    };
  },
};
