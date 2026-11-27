// 22 치워라! — 강나나가 달려오기 전에 길 위의 바나나 껍질을 화면 밖으로 치운다. 실패하면 공중 3회전 후 완벽한 착지, 심사위원 "9.8". (픽셀)
// Logic runs in logical px (600x800); drawing goes into a 150x200 buffer (1 px = 4 logical px).
const LW = 150, LH = 200, P = 4;
const GROUND = 640; // logical y of the path surface
const PAL = { k: '#2a1a08', y: '#ffd400', Y: '#c9a200', b: '#6b3e14', s: '#f1b48a', h: '#2a1a08', e: '#000', m: '#b0303a', w: '#f4f4f4' };
const BODY = [
  '.......bb.......',
  '.......kk.......',
  '......kyyk......',
  '.....kyyyyk.....',
  '....kyyyyyyk....',
  '....kyyyhhhhk...',
  '...kyyyhsssssk..',
  '...kyyyssesesk..',
  '...kyyysssssk...',
  '...kyyyssmssk...',
  '...kyyyysssk....',
  '...kyyyyyyyk....',
  '..kyyyyyyyyyk...',
  '..kYyyyyyyyyk...',
  '..kYyyyyyyyyk...',
  '..kYYyyyyyyk....',
  '...kYYyyyyk.....',
  '....kYYYYk......',
  '.....kbbk.......',
];
const PEEL = [
  '.kk..........kk.',
  'kyyk........kyyk',
  'kyyyk......kyyyk',
  '.kyyyk....kyyyk.',
  '..kyyyk..kyyyk..',
  '...kyyybbyyyk...',
  '...kyyyyyyyyk...',
  '....kYYYYYYk....',
  '.....kkkkkk.....',
];

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}
function sprite(rows) {
  const c = mk(rows[0].length, rows.length);
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, j, 1, 1); } }));
  return c;
}
function pixelate(img, [sx, sy, sw, sh], w, h, { oval = false, step = 36, gain = 1.15, keyWhite = false } = {}) {
  const c = mk(w, h);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h);
  const a = d.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4;
    const dx = ((i + 0.5) / w) * 2 - 1, dy = ((j + 0.5) / h) * 2 - 1;
    if (a[k + 3] < 110 || (oval && dx * dx + dy * dy > 1) || (keyWhite && Math.min(a[k], a[k + 1], a[k + 2]) > 215)) { a[k + 3] = 0; continue; }
    a[k + 3] = 255;
    for (let q = 0; q < 3; q++) a[k + q] = Math.min(255, Math.round((a[k + q] * gain) / step) * step);
  }
  x.putImageData(d, 0, 0);
  return c;
}
/** 1-px line of pixels (Bresenham-ish via sampling). */
function line(x, x0, y0, x1, y1, col, th = 1) {
  x.fillStyle = col;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) x.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), th, th);
}

let S = null;

export default {
  id: 'clear', no: 22, cmd: '치워라!', hint: '껍질을 휙! 던져', bgm: 'bgm_chip', layer: '2d',
  duration: 5, timeout: 'win', afterglow: 1.6, sounds: ['slip', 'whoosh', 'stomp', 'peel', 'c8_jump', 'c8_coin', 'tap', 'sparkle'],

  async load(A) {
    const [dw, kbs, kkr] = await Promise.all([A.img('dongwoo.png'), A.img('kbs.png'), A.img('kkr.jpg')]);
    S = {
      body: sprite(BODY), peel: sprite(PEEL), buf: mk(LW, LH), runner: mk(24, 30),
      dongwoo: pixelate(dw, [238, 12, 94, 108], 12, 14, { keyWhite: true }),
      judges: [pixelate(kbs, [151, 37, 50, 66], 9, 11, { oval: true }), pixelate(dw, [238, 12, 94, 108], 9, 11, { oval: true, keyWhite: true }),
        pixelate(kkr, [150, 84, 58, 64], 9, 11, { oval: true })],
    };
    const bg = S.bg = mk(LW, LH);
    const x = bg.getContext('2d');
    ['#8fd3ff', '#9fdcff', '#b2e5ff', '#c6edff', '#d9f4ff', '#e6f8ff'].forEach((c, i) => { x.fillStyle = c; x.fillRect(0, i * 24, LW, 24); });
    x.fillStyle = '#fff';
    for (const [cx, cy] of [[18, 20], [96, 34], [128, 12]]) { x.fillRect(cx, cy, 18, 4); x.fillRect(cx + 4, cy - 3, 9, 3); }
    x.fillStyle = '#5fb04a';
    for (let i = 0; i < LW; i++) { const h = 22 + Math.round(Math.sin(i * 0.07) * 6 + Math.sin(i * 0.19) * 3); x.fillRect(i, 140 - h, 1, h); }
    x.fillStyle = '#4b9a3a'; x.fillRect(0, 128, LW, 22);
    x.fillStyle = '#7a5230'; // fence
    for (let i = 2; i < LW; i += 10) x.fillRect(i, 140, 2, 10);
    x.fillRect(0, 142, LW, 1); x.fillRect(0, 146, LW, 1);
    x.fillStyle = '#d9a066'; x.fillRect(0, 150, LW, 10); // path
    x.fillStyle = '#c08a52';
    for (let i = 0; i < LW; i += 6) x.fillRect(i + ((i / 6) % 2) * 3, 154, 2, 1);
    x.fillStyle = '#8a5a2a'; x.fillRect(0, 160, LW, 2);
    x.fillStyle = '#6b4220'; x.fillRect(0, 162, LW, LH - 162);
    x.fillStyle = '#5a361a';
    for (let i = 0; i < 60; i++) x.fillRect((i * 37) % LW, 166 + ((i * 23) % 32), 2, 1);
  },

  create(G) {
    const c = G.c2d;
    const b = S.buf.getContext('2d');
    const rc = S.runner.getContext('2d');
    const sp = G.speed, L = G.level;
    const RUN = 175 * sp;
    const T0 = 0.8 / sp;
    const nana = { x: -60, y: GROUND, state: 'run', ph: 0, vy: 0, rot: 0, t: 0, hat: null };
    const peels = [];
    const addPeel = (x, y, state = 'ground') => { const p = { x, y, state, vx: 0, vy: 0, rot: 0, vr: 0, t: 0 }; peels.push(p); return p; };
    // initial peels, spread out on the path
    const n0 = [3, 4, 2][L - 1];
    const xs = [];
    for (let tries = 0; xs.length < n0 && tries < 200; tries++) {
      const x = G.rand(210, 560);
      if (xs.every((o) => Math.abs(o - x) > 70)) xs.push(x);
    }
    xs.forEach((x) => addPeel(x, GROUND - 12));
    // L3: Dongwoo eats bananas and keeps tossing peels ahead of Gangnana
    const dong = { on: L === 3, x: 520, next: 1.0 / sp, eatT: 0, throwT: -1, done: L !== 3, said: false };
    let held = null, vel = { x: 0, y: 0 }, last = null;
    let landT = -1, winT = -1;
    const st = { nana, peels, dong };

    const allClear = () => dong.done && peels.every((p) => p.state === 'fly' || p.state === 'gone' || p.state === 'stepped');

    const fling = (p, vx, vy) => {
      const sp2 = Math.hypot(vx, vy);
      if (sp2 < 500) { // a tap or a lazy drag: still yeet it, up and away from the runner
        vx = p.x > 300 ? 900 : -700; vy = -900;
      } else if (sp2 < 1000) { vx *= 1000 / sp2; vy *= 1000 / sp2; }
      Object.assign(p, { state: 'fly', vx, vy: Math.min(vy, -200), vr: G.rand(-14, 14) });
      G.sfx('whoosh', { vol: 0.6, rate: G.rand(1, 1.3) });
      if (allClear() && !G.result) win();
    };

    const win = () => {
      winT = 0;
      G.sfx('c8_coin');
      G.win();
    };

    const drawRunner = (pose) => {
      rc.clearRect(0, 0, 24, 30);
      const bob = pose === 'run' ? (Math.floor(nana.ph * 4) % 2) : 0;
      rc.drawImage(S.body, 4, bob);
      const q = Math.floor(nana.ph * 4) % 4; // 4 run frames
      const sw = pose === 'run' ? [0.75, 0.25, -0.75, -0.25][q] : 0;
      const legs = pose === 'land' ? [[-0.25, 0.25]] : [[sw, -sw]];
      for (const [a1, a2] of legs) {
        for (const [hx, a] of [[10, a1], [13, a2]]) {
          const fx = hx + Math.sin(a) * 9, fy = 17 + bob + Math.cos(a) * 9;
          line(rc, hx, 17 + bob, fx, fy, '#f4f4f4', 2);
          rc.fillStyle = '#888'; rc.fillRect(Math.round(fx), Math.round(fy) + 1, 3, 2);
        }
      }
      // arms
      if (pose === 'land' || pose === 'cheer') { line(rc, 8, 12, 3, 4, '#f4f4f4', 2); line(rc, 16, 12, 21, 4, '#f4f4f4', 2); }
      else line(rc, 12, 12 + bob, 12 + sw * 6, 17 + bob, '#f4f4f4', 2);
      if (nana.hat) rc.drawImage(S.peel, 3, -4);
    };

    const drawDongwoo = () => {
      const dx = Math.round(dong.x / P) - 6, dy = 106;
      b.fillStyle = '#a0672e'; b.fillRect(dx - 3, dy + 34, 20, 10); b.fillStyle = '#7a4a1e'; b.fillRect(dx - 3, dy + 38, 20, 1); // crate
      b.fillStyle = '#1b1b1b'; b.fillRect(dx, dy + 12, 12, 12); b.fillStyle = '#2a2a2a'; b.fillRect(dx + 1, dy + 24, 10, 8);
      b.fillStyle = '#f4f4f4'; b.fillRect(dx, dy + 32, 5, 2); b.fillRect(dx + 7, dy + 32, 5, 2);
      b.fillStyle = '#e0b090';
      const throwing = dong.throwT >= 0 && dong.throwT < 0.25;
      if (throwing) line(b, dx, dy + 14, dx - 8, dy + 8, '#e0b090', 2);
      else { line(b, dx, dy + 14, dx + 3, dy + 10, '#e0b090', 2); b.drawImage(S.peel, dx - 1, dy + 6, 8, 5); }
      b.drawImage(S.dongwoo, dx, dy - 1 + (Math.sin(dong.eatT * 18) > 0 && !throwing ? 1 : 0));
    };

    return {
      st,
      down(p) {
        let best = null, bd = 70;
        for (const q of peels) {
          if (q.state !== 'ground' && q.state !== 'toss') continue;
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < bd) { bd = d; best = q; }
        }
        if (!best) return;
        held = best;
        held.state = 'held';
        held.ox = held.x - p.x; held.oy = held.y - p.y;
        vel = { x: 0, y: 0 };
        last = { x: p.x, y: p.y, t: performance.now() };
        G.sfx('peel', { vol: 0.5 });
      },
      move(p) {
        if (!held) return;
        const now = performance.now();
        const dt = Math.max(1, now - last.t) / 1000;
        vel.x = G.lerp(vel.x, (p.x - last.x) / dt, 0.5);
        vel.y = G.lerp(vel.y, (p.y - last.y) / dt, 0.5);
        last = { x: p.x, y: p.y, t: now };
        held.x = p.x + held.ox; held.y = p.y + held.oy;
      },
      up() {
        if (!held) return;
        const p = held;
        held = null;
        // dragged far off the path counts as cleared too
        fling(p, vel.x, vel.y);
      },
      update(dt) {
        const t = G.t;
        // Dongwoo
        if (dong.on) {
          dong.eatT += dt;
          if (dong.throwT >= 0) dong.throwT += dt;
          if (!dong.done && t > dong.next && !G.result) {
            const lo = Math.max(nana.x + 210, 220);
            if (lo > 560) { dong.done = true; if (allClear()) win(); } else {
              const tx = G.rand(lo, 560);
              const q = addPeel(dong.x - 20, 470, 'toss');
              Object.assign(q, { x0: q.x, y0: q.y, tx, tt: 0, dur: 0.55 / sp });
              dong.throwT = 0;
              dong.next = t + 0.55 / sp;
              G.sfx('c8_jump', { vol: 0.5 });
              if (!dong.said) { dong.said = true; G.caption('동우: (냠냠) 휙~', 1.2); }
            }
          }
        }
        // peels
        for (const q of peels) {
          if (q.state === 'toss') {
            q.tt += dt;
            const k = Math.min(1, q.tt / q.dur);
            q.x = G.lerp(q.x0, q.tx, k);
            q.y = G.lerp(q.y0, GROUND - 12, k) - Math.sin(k * Math.PI) * 140;
            q.rot += dt * 12;
            if (k >= 1) { q.state = 'ground'; q.rot = 0; G.sfx('tap', { vol: 0.4 }); }
          } else if (q.state === 'fly') {
            q.vy += 900 * dt;
            q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
            if (q.x < -80 || q.x > 680 || q.y < -150 || q.y > 900) q.state = 'gone';
          }
        }
        // Gangnana
        if (nana.state === 'run') {
          if (t > T0) { nana.x += RUN * (winT >= 0 ? 1.4 : 1) * dt; nana.ph += dt * 2.6 * sp; }
          if (!G.result || G.result === 'win') {
            for (const q of peels) {
              if (q.state === 'ground' && !G.result && Math.abs(q.x - (nana.x + 6)) < 18) {
                q.state = 'stepped';
                nana.state = 'slip'; nana.t = 0; nana.slipPeel = q;
                q.vx = -300; q.vy = -200; q.vr = 20;
                G.sfx('slip'); G.sfx('whoosh', { vol: 0.7, rate: 0.8 });
                G.lose();
                break;
              }
            }
          }
        } else if (nana.state === 'slip') {
          nana.t += dt;
          const FLY = 0.62;
          const k = Math.min(1, nana.t / FLY);
          nana.y = GROUND - (1600 / FLY) * nana.t + (1600 / FLY / FLY) * nana.t * nana.t;
          nana.x += 120 * dt;
          nana.rot = -k * Math.PI * 6; // triple backflip
          const sq = nana.slipPeel;
          sq.vy += 900 * dt; sq.x += sq.vx * dt; sq.y += sq.vy * dt; sq.rot += sq.vr * dt;
          if (k >= 1) {
            nana.state = 'land'; nana.y = GROUND; nana.rot = 0; landT = 0;
            G.sfx('stomp'); G.shake(6, 0.15);
          }
        }
        if (landT >= 0) {
          const before = landT;
          landT += dt;
          if (before < 0.2 && landT >= 0.2) G.sfx('sparkle');
        }
        if (winT >= 0) {
          winT += dt;
          if (winT > 0.15 && !nana.hat && !nana.hatFall) { nana.hatFall = { t: 0 }; }
          if (nana.hatFall && !nana.hat) {
            nana.hatFall.t += dt;
            if (nana.hatFall.t > 0.5) { nana.hat = true; G.sfx('tap'); }
          }
        }

        // ---- draw
        b.drawImage(S.bg, 0, 0);
        if (dong.on) drawDongwoo();
        for (const q of peels) {
          if (q.state === 'gone' || (q.state === 'stepped' && nana.state !== 'slip' && nana.state !== 'land')) continue;
          const lift = q.state === 'held' ? 1.3 : 1;
          b.save();
          b.translate(Math.round(q.x / P), Math.round(q.y / P));
          if (q.rot) b.rotate(q.rot);
          b.drawImage(S.peel, -8 * lift, -5 * lift, 16 * lift, 9 * lift);
          b.restore();
          if (q.state === 'ground' && !G.result) { // danger blink
            const d = q.x - nana.x;
            if (d > 0 && d < 160 && Math.floor(t * 10) % 2) { b.fillStyle = '#ff3030'; b.fillRect(Math.round(q.x / P) - 1, Math.round(q.y / P) - 10, 2, 4); b.fillRect(Math.round(q.x / P) - 1, Math.round(q.y / P) - 5, 2, 1); }
          }
        }
        const pose = nana.state === 'land' ? 'land' : nana.state === 'slip' ? 'cheer' : 'run';
        drawRunner(pose);
        b.save();
        b.translate(Math.round(nana.x / P), Math.round(nana.y / P) - 14);
        if (nana.rot) b.rotate(nana.rot);
        b.drawImage(S.runner, -12, -15);
        b.restore();
        if (nana.hatFall && !nana.hat) {
          const k = Math.min(1, nana.hatFall.t / 0.5);
          b.save();
          b.translate(Math.round(G.lerp(nana.x / P + 40, nana.x / P, k)), Math.round(G.lerp(-10, nana.y / P - 32, k)));
          b.rotate((1 - k) * 8);
          b.drawImage(S.peel, -8, -5);
          b.restore();
        }
        // judges
        if (landT > 0) {
          const k = Math.min(1, landT / 0.2);
          const jy = Math.round(200 - k * 46);
          b.fillStyle = '#3a2a5a'; b.fillRect(20, jy + 18, 110, 40);
          b.fillStyle = '#f4f4f4'; b.fillRect(20, jy + 18, 110, 1);
          S.judges.forEach((j, i) => {
            const jx = 34 + i * 38;
            b.fillStyle = '#222'; b.fillRect(jx, jy + 11, 9, 8);
            b.drawImage(j, jx, jy);
            b.fillStyle = '#e0b090'; b.fillRect(jx + 9, jy + 4, 2, 8);
            b.fillStyle = '#fff'; b.fillRect(jx + 7, jy - 10, 18, 12);
            b.fillStyle = '#222'; b.fillRect(jx + 7, jy + 2, 18, 1);
          });
        }

        c.imageSmoothingEnabled = false;
        c.drawImage(S.buf, 0, 0, G.W, G.H);
        if (landT > 0) {
          const k = Math.min(1, landT / 0.2);
          const jy = Math.round(200 - k * 46);
          for (let i = 0; i < 3; i++) G.text(i === 1 ? '9.9' : '9.8', (34 + i * 38 + 16) * P, (jy - 4) * P, { size: 34, color: '#d02030', stroke: null });
        }
      },
      timeout(r) { if (r === 'win') { winT = 0; G.sfx('c8_coin'); } },
    };
  },
};
