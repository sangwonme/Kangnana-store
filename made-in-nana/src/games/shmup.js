// 24 [BOSS] 물리쳐라! — 바나나 우주선 강나나 vs 옥수수 탈을 쓴 거대 옥수수 범수수. 드래그로 이동, 자동 발사, 3번 맞으면 끝.
// 페이즈 1 옥수수 알 탄막 → 2 껍질(잎)이 터지며 알이 팝콘 10알로 튀어 공격 → 3 최종형태 '봄수수'(폭탄 목걸이)가 불붙은 폭탄을 던진다.
// 클리어하면 목걸이 폭탄이 연쇄 폭발하고 그을린 범수수만 남는다. 지면 우주선이 대폭발. 글자 없이 그림으로만. (픽셀)
// Logic + drawing in a 150x200 buffer (1 px = 4 logical px).
const LW = 150, LH = 200, P = 4;
const HP_MAX = 200, P2_AT = 135, P3_AT = 65;
const PAL = { k: '#1a1030', y: '#ffd400', Y: '#c9a200', o: '#f0b030', l: '#3cb33c', L: '#1d6b1d', w: '#fff8e0', c: '#e8d49a', R: '#e8c98a', b: '#7a4a1e', g: '#9aa0b0', G: '#5a6070', r: '#ff5030', x: '#2a2a33', O: '#ff8a00' };
const SHIP = [
  '......k......',
  '.....kyk.....',
  '....kyyyk....',
  '...kyyyyyk...',
  '...k.....k...',
  '..ky.....yk..',
  '..ky.....yk..',
  '.kyy.....yyk.',
  'kyyyyyyyyyyyk',
  'kYyyyyyyyyyYk',
  'kYk.kyyyk.kYk',
  '.k...kYk...k.',
];
const KERNEL = ['.yy.', 'yywy', 'yyyY', '.YY.'];
const POPCORN = ['.ww.w..', 'wwcwww.', 'wcwwoww', 'wwwcww.', '.wowcw.', '..ww...'];
const SHOT = ['y', 'y', 'Y'];
// life icon: a curved banana, outlined in white at load so it pops on dark space
const LIFE = [
  '.......kk',
  '......kbk',
  '.....kyk.',
  '....kyyk.',
  '...kyyyk.',
  '..kyyyYk.',
  '.kyyyyYk.',
  'kyyyyYk..',
  'kyyyYYk..',
  '.kYYYk...',
  '..kkk....',
];
// Bombsusu's bombs: dark ball with a red rim (readable on space) and a fuse; the spark is animated on top
const BOMB = [
  '......by.',
  '.....b...',
  '..rrrrr..',
  '.rxxxxxr.',
  'rxgxxxxxr',
  'rxgxxxxxr',
  'rxxxxxxxr',
  '.rxxxxxr.',
  '..rrrrr..',
];
const SPARK = ['.O.', 'OyO', '.O.'];

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
function pixelate(img, [sx, sy, sw, sh], w, h, { oval = false, step = 34, gain = 1.2 } = {}) {
  const c = mk(w, h);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h);
  const a = d.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4;
    const dx = ((i + 0.5) / w) * 2 - 1, dy = ((j + 0.5) / h) * 2 - 1;
    if (a[k + 3] < 110 || (oval && dx * dx + dy * dy > 1)) { a[k + 3] = 0; continue; }
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
/** Tapered husk leaf from (x0,y0) to its tip (x1,y1), bowing outward. */
function leaf(x, x0, y0, x1, y1, w, col, edge) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  const bow = Math.sign(x1 - x0) * 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const cx = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bow, cy = y0 + (y1 - y0) * t;
    const hw = Math.max(0.5, w * (1 - t) * 0.5);
    x.fillStyle = edge; x.fillRect(Math.round(cx - hw - 1), Math.round(cy), Math.round(hw * 2 + 2), 1);
    x.fillStyle = col; x.fillRect(Math.round(cx - hw), Math.round(cy), Math.max(1, Math.round(hw * 2)), 1);
  }
}
/** Upright corn cob with a face hole. husk = corn suit with green leaves flaring around it; without = bare, half-popped cob. */
function corn(rx, ry, face, husk) {
  const w = rx * 2 + (husk ? 26 : 6), h = ry * 2 + 10;
  const c = mk(w, h);
  const x = c.getContext('2d');
  const mx = w / 2, my = h / 2;
  if (husk) for (const sd of [-1, 1]) leaf(x, mx + sd * 6, my + ry + 2, mx + sd * (rx + 12), my - ry + 6, 12, '#3cb33c', '#1d6b1d');
  const ellipse = (rr, col, oy = 0) => { x.fillStyle = col; for (let j = -ry; j <= ry; j++) { const hw = Math.floor(rr * Math.sqrt(1 - (j / ry) ** 2)); x.fillRect(mx - hw, my + j + oy, hw * 2 + 1, 1); } };
  ellipse(rx + 1, '#3a2a08');
  ellipse(rx, '#d9a400');
  for (let j = -ry + 2; j < ry - 1; j += 3) { // kernel grid
    const hw = rx * Math.sqrt(1 - (j / ry) ** 2) - 2;
    for (let i = -hw + ((j / 3) & 1) * 1.5; i < hw; i += 3) {
      const popped = !husk && ((i * 7 + j * 13) & 7) === 0;
      x.fillStyle = popped ? '#7a5a00' : Math.abs(i) < hw * 0.35 ? '#ffe98a' : '#ffd84a';
      x.fillRect(Math.round(mx + i), my + j, 2, 2);
    }
  }
  x.fillStyle = '#b8860b'; // silk tuft
  for (const dx of [-2, 0, 2]) x.fillRect(mx + dx, my - ry - 4 + Math.abs(dx), 1, 4);
  if (husk) for (const sd of [-1, 1]) leaf(x, mx + sd * 4, my + ry + 3, mx + sd * (rx - 2), my + 2, 10, '#55c455', '#1d6b1d');
  // face hole
  const fw = face.width, fh = face.height;
  x.fillStyle = '#3a2a08';
  for (let j = -fh / 2 - 1; j <= fh / 2 + 1; j++) { const hw = Math.floor((fw / 2 + 1) * Math.sqrt(Math.max(0, 1 - (j / (fh / 2 + 1)) ** 2))); x.fillRect(mx - hw, Math.round(my - 3 + j), hw * 2, 1); }
  x.drawImage(face, Math.round(mx - fw / 2), Math.round(my - 3 - fh / 2));
  return c;
}

/** Copy of a sprite with a 1px colored outline around its opaque pixels (keeps dark sprites readable on space). */
function outlined(img, col) {
  const c = mk(img.width + 2, img.height + 2), x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const sil = mk(img.width, img.height), sx = sil.getContext('2d');
  sx.drawImage(img, 0, 0);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = col;
  sx.fillRect(0, 0, sil.width, sil.height);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(sil, dx, dy);
  x.drawImage(img, 1, 1);
  return c;
}

let S = null;

export default {
  id: 'shmup', no: 24, cmd: '물리쳐라!', hint: '드래그로 피해!', bgm: 'bgm_boss', layer: '2d',
  boss: true, duration: 40, timeout: 'lose', afterglow: 2.8,
  sounds: ['c8_shoot', 'c8_hit', 'c8_boom', 'c8_coin', 'c8_jump', 'peel', 'sparkle', 'pop'],

  async load(A) {
    const [kbs, nana, bombsusu] = await Promise.all([A.img('kbs.png'), A.img('suit_head.png'), A.img('bombsusu.png')]);
    const face = pixelate(kbs, [151, 37, 50, 66], 24, 30, { oval: true });
    const small = pixelate(kbs, [151, 37, 50, 66], 20, 25, { oval: true });
    // the boss's final form: 범수수 in a necklace of lit bombs, pixelated to match the corn boss
    const bomb = outlined(pixelate(bombsusu, [0, 0, bombsusu.width, bombsusu.height], 62, 62, { step: 28, gain: 1.12 }), '#ff5030');
    // after the win: the same face, sooty from his own bombs
    const soot = pixelate(kbs, [151, 37, 50, 66], 36, 46, { oval: true, gain: 1.15 });
    { const x = soot.getContext('2d'); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(25,15,15,0.2)'; x.fillRect(0, 0, 36, 46);
      x.fillStyle = '#1a1414'; for (let i = 0; i < 22; i++) x.fillRect(4 + (i * 17) % 28, 16 + (i * 29) % 26, 2, 1); }
    S = {
      buf: mk(LW, LH), ship: sprite(SHIP), kernel: sprite(KERNEL), popcorn: sprite(POPCORN), shot: sprite(SHOT),
      bombShot: sprite(BOMB), spark: sprite(SPARK), life: outlined(sprite(LIFE), '#ffffff'),
      nana: pixelate(nana, [0, 0, 200, 215], 7, 8, { step: 40, gain: 1.05 }),
      boss: corn(18, 34, face, true), core: corn(16, 31, small, false), bomb, soot,
      stars: Array.from({ length: 70 }, (_, i) => ({ x: (i * 53) % LW, y: (i * 97) % LH, z: 1 + (i % 3) })),
    };
  },

  create(G) {
    const c = G.c2d;
    const b = S.buf.getContext('2d');
    const L = G.level;
    const m = [1, 0.85, 0.72][L - 1]; // attack interval multiplier
    const bs = [1, 1.06, 1.12][L - 1]; // bullet speed multiplier
    const me = { x: 75, y: 170, lives: 3, inv: 0, dead: false, deadT: 0, fireT: 0 };
    const boss = { x: 75, y: -50, hp: HP_MAX, phase: 1, rx: 26, ry: 34, hurt: 0, trans: 0, dead: false };
    const shots = [], bullets = [], segs = [], parts = [];
    const timers = { aim: 2.2, ring: 3.2, dive: 2.0, core: 1.0, bomb: 1.2, lob: 2.0 };
    let drag = null;
    let winT = -1, warnT = 0;
    const st = { me, boss, bullets, segs };

    const angTo = (x, y) => Math.atan2(me.y - y, me.x - x);
    const fire = (x, y, a, v, kind = 'kernel', extra) => {
      if (bullets.length < 140) bullets.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind, r: kind === 'bomb' ? 3.2 : 2, ...extra });
    };
    const fan = (x, y, n, spread, v, kind) => { const a0 = angTo(x, y); for (let i = 0; i < n; i++) fire(x, y, a0 + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0), v, kind); };
    const ring = (x, y, n, v, off = 0, kind) => { for (let i = 0; i < n; i++) fire(x, y, off + (i / n) * Math.PI * 2, v, kind); };
    const boom = (x, y, n = 14, cols = ['#ffd400', '#fff8e0', '#fff'], sp = 70, size = 1) => {
      for (let i = 0; i < n; i++) { const a = G.rand(0, 6.28), v = G.rand(15, sp); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: G.rand(0.3, 0.8), col: G.pick(cols), s: size }); }
    };
    const FIRE = ['#ffffff', '#fff3a0', '#ffd400', '#ff8a00', '#ff5030', '#c02010'];
    const blasts = []; // expanding pixel shock rings

    const damage = (n, x, y) => {
      if (boss.dead || boss.trans > 0) return;
      boss.hp -= n;
      boss.hurt = 0.06;
      if (Math.random() < 0.5) parts.push({ x, y, vx: G.rand(-20, 20), vy: G.rand(-30, 0), t: 0, life: 0.2, col: '#fff', s: 1 });
      if (boss.phase === 1 && boss.hp <= P2_AT) toPhase(2);
      else if (boss.phase === 2 && boss.hp <= P3_AT) toPhase(3);
      else if (boss.hp <= 0) killBoss();
    };
    const clearBullets = () => { for (const q of bullets) boom(q.x, q.y, 2, ['#ffe066']); bullets.length = 0; };
    const toPhase = (n) => {
      boss.phase = n;
      boss.trans = n === 3 ? 1.4 : 1.0;
      clearBullets();
      G.shake(10, 0.4);
      if (n === 2) { // the husk bursts off and kernels pop into popcorn
        G.sfx('peel'); G.sfx('c8_boom', { vol: 0.7 });
        for (let i = 0; i < 5; i++) setTimeout(() => G.sfx('pop', { rate: G.rand(0.9, 1.4) }), i * 90);
        boom(boss.x, boss.y, 30, ['#3cb33c', '#55c455', '#1d6b1d']);
        boom(boss.x, boss.y, 24, ['#fff8e0', '#ffffff', '#ffd84a']);
        boss.rx = 17; boss.ry = 31;
        for (let i = 0; i < 10; i++) segs.push({ a: (i / 10) * Math.PI * 2, hp: 4, state: 'orbit', x: boss.x, y: boss.y, vx: 0, vy: 0 });
      } else { // final form: Bombsusu
        G.sfx('c8_boom'); G.sfx('c8_coin', { vol: 0.6, rate: 0.6 });
        boom(boss.x, boss.y, 40, FIRE, 90);
        blasts.push({ x: boss.x, y: boss.y, t: 0, r: 40 });
        boss.rx = 26; boss.ry = 26;
        warnT = 2.0;
      }
    };
    const killBoss = () => {
      boss.dead = true; boss.hp = 0;
      winT = 0;
      clearBullets();
      for (const s of segs) if (s.state !== 'gone') { boom(s.x, s.y, 8); s.state = 'gone'; }
      G.sfx('c8_boom'); G.shake(16, 0.9);
      G.win();
    };
    const hitMe = () => {
      if (me.inv > 0 || me.dead || G.result) return;
      me.lives--;
      boom(me.x, me.y, 16, ['#ffd400', '#fff', '#ff4040']);
      G.sfx('c8_hit'); G.shake(10, 0.25);
      if (me.lives <= 0) { // the ship blows up
        me.dead = true; me.deadT = 0;
        G.sfx('c8_boom'); G.sfx('c8_boom', { rate: 0.7 });
        G.shake(18, 0.6);
        boom(me.x, me.y, 70, FIRE, 110, 2);
        blasts.push({ x: me.x, y: me.y, t: 0, r: 34 });
        G.lose();
        return;
      }
      me.inv = 1.6;
      clearBullets(); // breathing room
    };

    const toBuf = (p) => ({ x: p.x / P, y: p.y / P });

    return {
      st,
      down(p) { const q = toBuf(p); drag = { ox: me.x - q.x, oy: me.y - q.y }; },
      move(p) {
        if (!drag || !p.down) return;
        const q = toBuf(p);
        me.x = G.clamp(q.x + drag.ox, 7, LW - 7);
        me.y = G.clamp(q.y + drag.oy, 24, LH - 8);
      },
      up() { drag = null; },
      update(dt) {
        const t = G.t;
        // ---- boss motion / attacks
        if (!boss.dead) {
          const entering = t < 2;
          const ty = boss.phase === 1 ? 58 : 60;
          boss.y = entering ? G.lerp(-50, ty, Math.min(1, t / 2) ** 0.5) : G.lerp(boss.y, ty + Math.sin(t * 1.3) * 4, dt * 2);
          boss.x = 75 + Math.sin(t * (0.6 + boss.phase * 0.12)) * (boss.phase === 1 ? 34 : boss.phase === 2 ? 42 : 38);
          if (boss.hurt > 0) boss.hurt -= dt;
          if (boss.trans > 0) boss.trans -= dt;
          else if (!entering && !me.dead && !G.result) {
            for (const k in timers) timers[k] -= dt;
            if (boss.phase === 1) {
              if (timers.aim <= 0) { timers.aim = 1.0 * m; fan(boss.x, boss.y + 10, 3, 0.5, 60 * bs); G.sfx('c8_shoot', { vol: 0.35 }); }
              if (timers.ring <= 0) { timers.ring = 2.6 * m; ring(boss.x, boss.y - 12, 10 + L * 2, 40 * bs, t); }
            } else {
              if (boss.phase === 2) {
                if (timers.core <= 0) { timers.core = 0.95 * m; fan(boss.x, boss.y + 8, 2, 0.25, 70 * bs); G.sfx('c8_shoot', { vol: 0.3 }); }
                if (timers.ring <= 0) { timers.ring = 3.2 * m; ring(boss.x, boss.y - 8, 8 + L, 38 * bs, t); }
              } else {
                // Bombsusu: throws fans of bombs, and lobs a big one that bursts into sparks where you were
                if (timers.bomb <= 0) { timers.bomb = 1.35 * m; fan(boss.x, boss.y + 18, 2 + L, 0.7, 48 * bs, 'bomb'); G.sfx('c8_jump', { vol: 0.35, rate: 0.7 }); }
                if (timers.lob <= 0) {
                  timers.lob = 2.1 * m;
                  const a = angTo(boss.x, boss.y + 18);
                  const d = Math.hypot(me.x - boss.x, me.y - boss.y - 18);
                  fire(boss.x, boss.y + 18, a, Math.max(40, d / 1.1), 'bomb', { lob: Math.min(1.1, d / 40), big: true, r: 4 });
                  G.sfx('c8_jump', { vol: 0.4, rate: 0.5 });
                }
              }
              if (timers.dive <= 0) {
                timers.dive = (boss.phase === 2 ? 2.0 : 2.8) * m;
                const cand = segs.filter((s) => s.state === 'orbit');
                if (cand.length) {
                  const s = G.pick(cand);
                  const a = angTo(s.x, s.y);
                  Object.assign(s, { state: 'dive', vx: Math.cos(a) * 78 * bs, vy: Math.sin(a) * 78 * bs });
                  G.sfx('c8_jump', { vol: 0.3 });
                }
              }
            }
          }
        }
        // popcorn
        for (const s of segs) {
          if (s.state === 'orbit') {
            s.a += dt * 1.3;
            const rr = 30 + Math.sin(t * 2 + s.a) * 3;
            s.x = boss.x + Math.cos(s.a) * rr; s.y = boss.y - 6 + Math.sin(s.a) * rr * 1.3;
          } else if (s.state === 'dive') {
            s.x += s.vx * dt; s.y += s.vy * dt;
            if (s.y > LH + 10 || s.x < -10 || s.x > LW + 10) s.state = 'gone';
          }
        }
        // ---- player
        if (!me.dead) {
          if (me.inv > 0) me.inv -= dt;
          me.fireT -= dt;
          if (me.fireT <= 0 && t > 1.2 && !boss.dead) {
            me.fireT = 0.1;
            shots.push({ x: me.x, y: me.y - 7 });
            if (Math.floor(t * 10) % 3 === 0) G.sfx('c8_shoot', { vol: 0.12, rate: 1.6 });
          }
        } else me.deadT += dt;
        for (const s of shots) {
          s.y -= 250 * dt;
          if (s.y < -5) { s.dead = true; continue; }
          for (const g of segs) {
            if ((g.state === 'orbit' || g.state === 'dive') && Math.abs(g.x - s.x) < 5 && Math.abs(g.y - s.y) < 5) {
              s.dead = true; g.hp--;
              damage(1, s.x, s.y);
              if (g.hp <= 0) { g.state = 'gone'; boom(g.x, g.y, 10, ['#fff8e0', '#e8d49a', '#ffd84a']); G.sfx('pop', { vol: 0.6, rate: 1.3 }); }
              break;
            }
          }
          if (s.dead) continue;
          if (!boss.dead && ((boss.x - s.x) / boss.rx) ** 2 + ((boss.y - s.y) / boss.ry) ** 2 < 1) { s.dead = true; damage(1, s.x, s.y); }
        }
        for (let i = shots.length - 1; i >= 0; i--) if (shots[i].dead) shots.splice(i, 1);
        for (const q of bullets) {
          q.x += q.vx * dt; q.y += q.vy * dt;
          if (q.lob !== undefined) { // lobbed bomb: slows down, blinks, then bursts into a ring of sparks
            q.lob -= dt;
            q.vx *= 1 - dt * 1.2; q.vy *= 1 - dt * 1.2;
            if (q.lob <= 0) {
              q.dead = true;
              boom(q.x, q.y, 14, FIRE, 50);
              blasts.push({ x: q.x, y: q.y, t: 0, r: 10 });
              ring(q.x, q.y, 6 + L, 42 * bs, G.rand(0, 1), 'spark');
              G.sfx('c8_boom', { vol: 0.45, rate: 1.4 });
              continue;
            }
          }
          if (q.x < -8 || q.x > LW + 8 || q.y < -8 || q.y > LH + 8) q.dead = true;
          else if (!me.dead && Math.hypot(q.x - me.x, q.y - (me.y + 1)) < q.r + 1.6) { q.dead = true; hitMe(); }
        }
        for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].dead) bullets.splice(i, 1);
        for (const g of segs) if (g.state === 'dive' && !me.dead && Math.hypot(g.x - me.x, g.y - me.y) < 4.5) { g.state = 'gone'; boom(g.x, g.y, 8); hitMe(); }
        for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5; }
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t > parts[i].life) parts.splice(i, 1);
        for (const k of blasts) k.t += dt;
        for (let i = blasts.length - 1; i >= 0; i--) if (blasts[i].t > 0.5) blasts.splice(i, 1);
        if (warnT > 0) warnT -= dt;
        if (winT >= 0) { // every bomb on the necklace goes off, one after another
          const before = winT;
          winT += dt;
          if (winT < 1.1 && Math.floor(winT * 9) !== Math.floor(before * 9)) {
            const a = Math.floor(winT * 9) * 1.9;
            const bx = boss.x + Math.cos(a) * 24, by = boss.y + Math.sin(a) * 22;
            boom(bx, by, 24, FIRE, 80, 2);
            blasts.push({ x: bx, y: by, t: 0, r: 16 });
            G.sfx('c8_boom', { vol: 0.6, rate: G.rand(0.8, 1.2) });
          }
          if (before < 1.15 && winT >= 1.15) { blasts.push({ x: boss.x, y: boss.y, t: 0, r: 60 }); boom(boss.x, boss.y, 60, FIRE, 120, 2); G.sfx('c8_boom', { rate: 0.6 }); }
          if (winT > 1.3 && Math.random() < 0.3) parts.push({ x: boss.x + G.rand(-14, 14), y: boss.y - 18, vx: G.rand(-4, 4), vy: -G.rand(8, 18), t: 0, life: 1.2, col: G.pick(['#555566', '#777788', '#3a3a44']), s: 2 });
        }

        // ---- draw
        b.fillStyle = '#0b0b2a'; b.fillRect(0, 0, LW, LH);
        for (const s of S.stars) {
          const y = (s.y + t * 12 * s.z) % LH;
          b.fillStyle = s.z === 3 ? '#ffffff' : s.z === 2 ? '#9aa6ff' : '#4a4a8a';
          b.fillRect(s.x, Math.floor(y), 1, s.z === 3 ? 2 : 1);
        }
        // boss (phase 3 flickers between the peeled cob and Bombsusu while transforming)
        if (!boss.dead) {
          let img = boss.phase === 1 ? S.boss : boss.phase === 2 ? S.core : S.bomb;
          if (boss.phase === 3 && boss.trans > 0) img = Math.floor(t * 12) % 2 ? S.core : S.bomb;
          const jx = boss.hurt > 0 ? (Math.random() < 0.5 ? -1 : 1) : 0;
          if (!(boss.phase !== 3 && boss.trans > 0 && Math.floor(t * 20) % 2)) b.drawImage(img, Math.round(boss.x - img.width / 2) + jx, Math.round(boss.y - img.height / 2));
          if (boss.phase === 3) { // the necklace fuses keep sparking
            for (const [fx, fy] of [[-22, -16], [21, -18], [-26, 6], [25, 4], [4, 14]]) {
              if (Math.random() < 0.6) { b.fillStyle = G.pick(['#fff3a0', '#ffd400', '#ff8a00']); b.fillRect(Math.round(boss.x + fx + G.rand(-1, 1)), Math.round(boss.y + fy + G.rand(-1, 1)), 1, 1); }
            }
          }
        } else if (winT < 1.15) {
          b.drawImage(S.bomb, Math.round(boss.x - S.bomb.width / 2 + G.rand(-1, 1)), Math.round(boss.y - S.bomb.height / 2));
        } else { // what's left: a sooty 범수수, blinking
          const k = Math.min(1, (winT - 1.15) / 0.25);
          const y = Math.round(boss.y - 23 + (1 - k) * 6);
          b.drawImage(S.soot, Math.round(boss.x - 18), y);
          if (Math.floor(winT * 3) % 4 === 0) { b.fillStyle = '#2a1a1a'; b.fillRect(Math.round(boss.x - 9), y + 20, 7, 2); b.fillRect(Math.round(boss.x + 2), y + 20, 7, 2); }
        }
        for (const s of segs) if (s.state === 'orbit' || s.state === 'dive') b.drawImage(S.popcorn, Math.round(s.x - 3), Math.round(s.y - 3));
        for (const s of shots) b.drawImage(S.shot, Math.round(s.x), Math.round(s.y));
        for (const q of bullets) {
          if (q.kind === 'bomb') {
            const blink = q.lob !== undefined && q.lob < 0.35 && Math.floor(t * 16) % 2;
            const sc = q.big ? 1.6 : 1.25;
            const w = Math.round(9 * sc);
            b.drawImage(S.bombShot, Math.round(q.x - w / 2), Math.round(q.y - w / 2 - 1), w, w);
            if (blink) { b.fillStyle = '#ff5030'; b.fillRect(Math.round(q.x - 2), Math.round(q.y - 1), 4, 3); }
            b.fillStyle = G.pick(['#fff3a0', '#ffd400', '#ff8a00']); // sparking fuse
            b.fillRect(Math.round(q.x + 2 * sc + G.rand(-1, 1)), Math.round(q.y - 6 * sc + G.rand(-1, 1)), 1, 1);
          } else if (q.kind === 'spark') b.drawImage(S.spark, Math.round(q.x - 1), Math.round(q.y - 1));
          else b.drawImage(S.kernel, Math.round(q.x - 2), Math.round(q.y - 2));
        }
        // ship
        if (!me.dead) {
          if (!(me.inv > 0 && Math.floor(t * 16) % 2)) {
            const sx = Math.round(me.x - 6), sy = Math.round(me.y - 6);
            b.drawImage(S.ship, sx, sy);
            b.drawImage(S.nana, sx + 3, sy + 3);
            b.fillStyle = Math.floor(t * 20) % 2 ? '#ff8a00' : '#ffd400';
            b.fillRect(sx + 5, sy + 12, 3, 2 + Math.floor(t * 20) % 2);
          }
          b.fillStyle = '#fff'; b.fillRect(Math.round(me.x), Math.round(me.y) + 1, 1, 1); // hitbox dot
        } else if (me.deadT < 0.12) { // white flash core of the explosion
          disc(b, me.x, me.y, 6 + me.deadT * 80, '#ffffff');
        } else if (me.deadT < 0.4) {
          disc(b, me.x, me.y, 14 - (me.deadT - 0.12) * 30, G.pick(['#ffd400', '#ff8a00']));
        }
        for (const k of blasts) { // pixel shock ring
          const r = k.r * Math.min(1, k.t / 0.35);
          b.fillStyle = k.t < 0.2 ? '#fff3a0' : '#ff8a00';
          for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; b.fillRect(Math.round(k.x + Math.cos(a) * r), Math.round(k.y + Math.sin(a) * r), 2, 2); }
        }
        for (const p of parts) { b.fillStyle = p.col; b.fillRect(Math.round(p.x), Math.round(p.y), p.s || 1, p.s || 1); }
        // HUD: boss HP bar + big outlined life bananas
        const HY = 21;
        b.fillStyle = '#1a1030'; b.fillRect(18, HY, 126, 7);
        b.fillStyle = '#fff'; b.fillRect(19, HY + 1, 124, 5);
        b.fillStyle = '#3a2a40'; b.fillRect(20, HY + 2, 122, 3);
        b.fillStyle = boss.hp > P2_AT ? '#ffd84a' : boss.hp > P3_AT ? '#f0b030' : '#ff4040';
        b.fillRect(20, HY + 2, Math.round(122 * Math.max(0, boss.hp) / HP_MAX), 3);
        b.fillStyle = '#fff'; b.fillRect(20 + Math.round(122 * P2_AT / HP_MAX), HY + 1, 1, 5); b.fillRect(20 + Math.round(122 * P3_AT / HP_MAX), HY + 1, 1, 5);
        for (let i = 0; i < 3; i++) {
          const lx = 3 + i * 13, ly = LH - 16;
          if (i < me.lives) b.drawImage(S.life, lx, ly);
          else { b.globalAlpha = 0.25; b.drawImage(S.life, lx, ly); b.globalAlpha = 1; }
        }

        c.imageSmoothingEnabled = false;
        c.drawImage(S.buf, 0, 0, G.W, G.H);
        if (!G.result) G.text(String(Math.ceil(G.left)), 586, 140, { size: 34, color: G.left < 10 ? '#ff4040' : '#fff', align: 'right' });
        if (warnT > 0) G.text('WARNING', 300, 420, { size: 76, color: '#ff4040', alpha: Math.floor(warnT * 5) % 2 ? 1 : 0.3 });
      },
      timeout() { clearBullets(); },
    };
  },
};
