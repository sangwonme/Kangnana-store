// 21 뀌어라! — 탭할 때마다 방귀 추진. 구름 사이를 빠져나가 바나나 별까지. 성공하면 대형 방귀로 대기권 돌파, 실패하면 맥없이 추락. (픽셀)
// Drawn into a 150x200 buffer (1 px = 4 logical px). World units = buffer px.
const LW = 150, LH = 200;
const STAR = [
  '.......kk.......',
  '......kyyk......',
  '......kyyk......',
  '.....kyyyyk.....',
  'kkkkkkyyyykkkkkk',
  'kyyyyyybbyyyyyyk',
  '.kyyyyybbyyyyyk.',
  '..kyyyyybbyyyk..',
  '...kyyyyybbyk...',
  '....kyyyyyyk....',
  '....kyyyyyyk....',
  '...kyyykkyyyk...',
  '...kyykk.kyyk...',
  '..kyk.......kyk.',
  '..kk.........kk.',
];
const PAL = { k: '#3a1838', y: '#ffe14d', b: '#8a5a10' };

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
function pixelate(img, [sx, sy, sw, sh], w, h, { step = 40, gain = 1.05 } = {}) {
  const c = mk(w, h);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h);
  const a = d.data;
  for (let k = 0; k < a.length; k += 4) {
    if (a[k + 3] < 100) { a[k + 3] = 0; continue; }
    a[k + 3] = 255;
    for (let q = 0; q < 3; q++) a[k + q] = Math.min(255, Math.round((a[k + q] * gain) / step) * step);
  }
  x.putImageData(d, 0, 0);
  return c;
}
function disc(x, cx, cy, r, col) {
  x.fillStyle = col;
  cx = Math.round(cx); cy = Math.round(cy);
  for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) {
    const q = r * r - j * j;
    if (q < 0) continue;
    const w = Math.floor(Math.sqrt(q));
    x.fillRect(cx - w, cy + j, 2 * w + 1, 1);
  }
}

let S = null;

export default {
  id: 'fart', no: 21, cmd: '뀌어라!', hint: '탭 = 뿡!', bgm: 'bgm_chip', layer: '2d',
  duration: 5, timeout: 'lose', sounds: ['fart_1', 'fart_2', 'fart_3', 'fart_4', 'fart_5', 'bonk', 'sparkle', 'whoosh', 'c8_coin'],

  async load(A) {
    const suit = await A.img('suit.png');
    S = { nana: pixelate(suit, [0, 0, 799, 900], 28, 32), star: sprite(STAR), buf: mk(LW, LH) };
    // sunset sky with city skyline, drawn once (the city strip is tiled for parallax)
    const sky = S.sky = mk(LW, LH);
    const x = sky.getContext('2d');
    const bands = ['#1d1240', '#2b1b4f', '#43215f', '#5a2a7a', '#7a3380', '#a0407f', '#c75079', '#e86a6a', '#f88a64', '#ffb36b'];
    bands.forEach((col, i) => { x.fillStyle = col; x.fillRect(0, i * 20, LW, 20); });
    x.fillStyle = '#fff6c8';
    for (let i = 0; i < 26; i++) x.fillRect((i * 53) % LW, (i * 29) % 70, 1, 1);
    const city = S.city = mk(LW, 40);
    const cx = city.getContext('2d');
    let px = 0;
    for (let i = 0; px < LW; i++) {
      const w = 8 + ((i * 7) % 9), h = 12 + ((i * 13) % 22);
      cx.fillStyle = '#3a1838'; cx.fillRect(px, 40 - h, w, h);
      cx.fillStyle = '#ffd36b';
      for (let wy = 40 - h + 3; wy < 38; wy += 4) for (let wx = px + 2; wx < px + w - 2; wx += 3) if ((wx * 7 + wy * 3) % 5 === 0) cx.fillRect(wx, wy, 1, 1);
      px += w + 1;
    }
  },

  create(G) {
    const c = G.c2d;
    const b = S.buf.getContext('2d');
    const sp = G.speed, L = G.level;
    const VX = 46 * sp, GRAV = 330 * sp * sp, THRUST = -108 * sp, MAXFALL = 170 * sp;
    const SX = 36; // Gangnana's screen x
    const gapH = [72, 58, 62][L - 1];
    const wallX = L === 1 ? [88, 146] : [78, 122, 166];
    const walls = [];
    let cy = G.rand(80, 120);
    for (const wx of wallX) {
      cy = G.clamp(cy + G.rand(-45, 45), 55, 145);
      // pre-render the cloud column (gap centered at y=220 of a 34x440 canvas)
      const col = mk(34, 440);
      const cx2 = col.getContext('2d');
      const pf = Array.from({ length: 30 }, (_, i) => ({ dy: i * 7, dx: G.rand(-3, 3), r: G.rand(8, 11) }));
      [['#7a3b6b', 1.5, 0], ['#f0a8c0', 0, 0], ['#ffe6ee', -2, -1.5]].forEach(([cl, grow, off]) => {
        for (const p of pf) {
          disc(cx2, 17 + p.dx + off, 220 - gapH / 2 - 6 - p.dy + off, p.r + grow, cl);
          disc(cx2, 17 + p.dx + off, 220 + gapH / 2 + 6 + p.dy + off, p.r + grow, cl);
        }
      });
      walls.push({ x: wx, cy, ph: G.rand(0, 6.28), amp: L === 3 ? 16 : 0, col });
    }
    const starX = 196;
    const me = { x: SX, y: 100, vy: 0, rot: 0, dead: false, started: false, deadT: 0, winT: -1 };
    const puffs = [];
    let skyOff = 0;
    const st = { me, walls, gapH };

    const gapOf = (w) => w.cy + Math.sin(G.t * 1.7 * sp + w.ph) * w.amp;

    const fart = (big = false) => {
      G.sfx(`fart_${1 + Math.floor(Math.random() * 5)}`, { vol: big ? 1 : 0.8, rate: big ? 0.55 : G.rand(0.9, 1.25) });
      for (let i = 0; i < (big ? 30 : 6); i++) {
        puffs.push({ x: SX - 1 + G.rand(-2, 2), y: me.y + 14, vx: G.rand(-30, 10) - VX * 0.7, vy: G.rand(20, 60) * (big ? 2 : 1), r: G.rand(2, big ? 7 : 4), t: 0 });
      }
    };

    const die = (why) => {
      if (me.dead || G.result) return;
      me.dead = true;
      me.vy = -40;
      G.sfx('bonk');
      setTimeout(() => G.sfx(`fart_${1 + Math.floor(Math.random() * 5)}`, { vol: 0.5, rate: 0.6 }), 250);
      G.shake(10, 0.25);
      G.lose();
    };

    return {
      st,
      down() {
        if (me.dead || G.result) return;
        me.started = true;
        me.vy = THRUST;
        fart();
      },
      update(dt) {
        const t = G.t;
        if (me.winT >= 0) {
          me.winT += dt;
          me.vy = Math.max(me.vy - 900 * dt, -260);
          me.y += me.vy * dt;
          if (me.y < 60) { skyOff += -me.vy * dt; me.y = 60; }
          if (Math.random() < 0.8) puffs.push({ x: SX + G.rand(-2, 2), y: me.y + 15, vx: G.rand(-15, 15), vy: G.rand(60, 120), r: G.rand(3, 7), t: 0 });
        } else if (me.dead) {
          me.deadT += dt;
          me.vy = Math.min(me.vy + 260 * dt, 200);
          me.y += me.vy * dt;
          me.rot += 9 * dt;
        } else {
          if (t > 0.55 / sp) me.x += VX * dt;
          if (!me.started && t > 1.2 / sp) me.started = true;
          if (me.started) {
            me.vy = Math.min(me.vy + GRAV * dt, MAXFALL);
            me.y += me.vy * dt;
          } else me.y = 100 + Math.sin(t * 5) * 3;
          if (me.y < 8) { me.y = 8; me.vy = Math.max(0, me.vy); }
          me.rot = G.clamp(me.vy / 400, -0.35, 0.5);
          for (const w of walls) {
            const g = gapOf(w);
            if (Math.abs(me.x - w.x) < 12 && (me.y - 5 < g - gapH / 2 || me.y + 6 > g + gapH / 2)) { die('cloud'); break; }
          }
          if (me.y > 194) die('floor');
          if (!me.dead && me.x >= starX - 8) {
            me.winT = 0;
            me.vy = -60;
            fart(true);
            G.sfx('sparkle'); G.sfx('c8_coin');
            G.shake(14, 0.6);
            G.win();
          }
        }
        const cam = me.x - SX;
        for (const p of puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 0.94; p.r += dt * 6; }
        for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t > 0.8) puffs.splice(i, 1);

        // ---- draw (sky scrolls down after the win = flying up into space)
        b.drawImage(S.sky, 0, skyOff * 0.4);
        if (skyOff > 0) {
          const h = skyOff * 0.4 + 1;
          b.fillStyle = '#0b0620'; b.fillRect(0, 0, LW, h);
          b.fillStyle = '#fff';
          for (let i = 0; i < 24; i++) b.fillRect((i * 41) % LW, (i * 67) % h, 1, 1);
        }
        const co = ((cam * 0.3) % LW + LW) % LW;
        b.drawImage(S.city, -co, 160 + skyOff); b.drawImage(S.city, LW - co, 160 + skyOff);
        for (const w of walls) {
          const sx = w.x - cam;
          if (sx < -20 || sx > LW + 20) continue;
          const g = gapOf(w);
          b.drawImage(w.col, Math.round(sx - 17), Math.round(g - 220 + skyOff));
        }
        const starSX = starX - cam;
        if (me.winT < 0 && starSX < LW + 10) {
          const s = 1 + Math.floor((t * 4) % 2) * 0.12;
            disc(b, starSX, 100, 15 + Math.sin(t * 8) * 2, 'rgba(255,240,120,.35)');
          b.drawImage(S.star, Math.round(starSX - 8 * s), Math.round(100 - 7.5 * s), Math.round(16 * s), Math.round(15 * s));
        }
        for (const p of puffs) disc(b, p.x, p.y, p.r, p.t < 0.25 ? '#fff2a0' : p.t < 0.5 ? '#ffd84a' : 'rgba(220,170,40,.6)');
        // Gangnana (T-pose = airplane)
        b.save();
        b.translate(Math.round(SX), Math.round(me.y));
        b.rotate(me.rot);
        b.drawImage(S.nana, -14, -15);
        b.restore();

        c.imageSmoothingEnabled = false;
        c.drawImage(S.buf, 0, 0, G.W, G.H);
      },
      timeout() { me.dead = true; me.vy = 0; G.sfx('fart_2', { vol: 0.5, rate: 0.6 }); },
    };
  },
};
