// 20 쳐라! — 옥수수 탈을 쓴 범수수가 던지는 옥수수를 바나나 배트로 타이밍 맞춰 친다.
// 홈런이면 옥수수가 팝콘으로 터져 범수수 머리 위로 쏟아지고, 헛치면 옥수수가 강나나 얼굴에 박힌다. (픽셀)
// Everything is drawn into a 150x200 buffer (1 px = 4 logical px) and blown up without smoothing.
const LW = 150, LH = 200;
const PAL = { y: '#ffd84a', Y: '#d9a400', l: '#3cb33c', L: '#1d6b1d', c: '#5a3410', C: '#8a5a20', w: '#fff8e0', W: '#e8d49a', o: '#f0b030' };
// pitches: 6 px wide sprites, drawn scaled up as they approach the plate
const PITCH = {
  옥수수: ['..yY..', '.yYyY.', '.YyYy.', '.yYyY.', '.YyYy.', '.yYyY.', 'lYyYyl', '.lLLl.'],
  군옥수수: ['..cY..', '.yCyc.', '.cyCy.', '.yCcY.', '.CyYc.', '.ycyC.', 'lCycYl', '.lLLl.'],
  '팝콘 볼': ['.wwW..', 'wwowwW', 'wWwwow', 'owwWww', 'wwWwow', '.Wwwo.'],
};
const KIND = { 옥수수: { travel: 1 }, 군옥수수: { travel: 0.82 }, '팝콘 볼': { travel: 1.15, wobble: true } };

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
/** Downsample part of a photo into a w x h posterized pixel sprite (optionally cut to an oval). */
function pixelate(img, [sx, sy, sw, sh], w, h, { oval = false, step = 34, gain = 1.08 } = {}) {
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
  const bow = Math.sign(x1 - x0) * 3;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const cx = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bow, cy = y0 + (y1 - y0) * t;
    const hw = Math.max(0.5, w * (1 - t) * 0.5);
    x.fillStyle = edge; x.fillRect(Math.round(cx - hw - 1), Math.round(cy), Math.round(hw * 2 + 2), 1);
    x.fillStyle = col; x.fillRect(Math.round(cx - hw), Math.round(cy), Math.max(1, Math.round(hw * 2)), 1);
  }
}

let S = null;

export default {
  id: 'bat', no: 20, cmd: '쳐라!', hint: '타이밍 맞춰 탭', bgm: 'bgm_chip', layer: '2d',
  duration: 5, timeout: 'lose', sounds: ['bat', 'whoosh', 'splat', 'pop', 'c8_coin', 'c8_hit', 'boing'],

  async load(A) {
    const [kbs, nana] = await Promise.all([A.img('kbs.png'), A.img('suit_head.png')]);
    S = {
      kbs: pixelate(kbs, [151, 37, 50, 66], 18, 22, { oval: true, gain: 1.25 }),
      nana: pixelate(nana, [0, 0, 200, 215], 24, 26, { step: 12, gain: 1 }),
      pitch: Object.fromEntries(Object.entries(PITCH).map(([k, v]) => [k, sprite(v)])),
      buf: mk(LW, LH),
    };
    { // costume yellow of the pixel head's bottom row, so the drawn body matches it exactly
      const d = S.nana.getContext('2d').getImageData(0, 25, 24, 1).data;
      let r = 0, g = 0, bl = 0, n = 0;
      for (let i = 0; i < 24; i++) if (d[i * 4 + 3] && d[i * 4] > 180 && d[i * 4 + 1] > 150) { r += d[i * 4]; g += d[i * 4 + 1]; bl += d[i * 4 + 2]; n++; }
      const c = n ? [r / n, g / n, bl / n] : [250, 214, 4];
      S.nanaYellow = [`rgb(${c.map(Math.round)})`, `rgb(${c.map((v) => Math.round(v * 0.82))})`];
    }
    // static field, drawn once
    const f = S.field = mk(LW, LH);
    const x = f.getContext('2d');
    x.fillStyle = '#5c94fc'; x.fillRect(0, 0, LW, 40);
    x.fillStyle = '#fff';
    for (const [cx, cy] of [[20, 10], [110, 16], [70, 6]]) { x.fillRect(cx, cy, 14, 3); x.fillRect(cx + 3, cy - 2, 7, 2); }
    x.fillStyle = '#0a4a14'; x.fillRect(0, 30, LW, 20);
    x.fillStyle = '#00a800'; x.fillRect(0, 50, LW, LH - 50);
    x.fillStyle = '#20bc20';
    for (let y = 54; y < LH; y += 12) x.fillRect(0, y, LW, 5);
    x.fillStyle = '#fff';
    for (let i = 0; i <= 100; i++) { x.fillRect(75 - i * 0.78, 168 - i * 0.72, 1, 1); x.fillRect(75 + i * 0.78, 168 - i * 0.72, 1, 1); }
    disc(x, 75, 82, 1, '#000');
    x.fillStyle = '#c87830';
    for (let j = -7; j <= 7; j++) { const w = Math.round(26 * Math.sqrt(1 - (j / 7.5) ** 2)); x.fillRect(75 - w, 82 + j, 2 * w, 1); }
    for (let j = -16; j <= 16; j++) { const w = Math.round(44 * Math.sqrt(1 - (j / 16.5) ** 2)); x.fillRect(75 - w, 170 + j, 2 * w, 1); }
    x.fillStyle = '#e0a060'; x.fillRect(66, 80, 18, 2);
    x.fillStyle = '#fff'; x.fillRect(73, 164, 10, 3); x.fillRect(75, 167, 6, 1); x.fillRect(77, 168, 2, 1);
    x.fillRect(58, 156, 12, 1); x.fillRect(58, 176, 12, 1); x.fillRect(58, 156, 1, 20); x.fillRect(86, 156, 12, 1); x.fillRect(86, 176, 12, 1); x.fillRect(97, 156, 1, 20);
    S.crowd = Array.from({ length: 70 }, (_, i) => ({ x: (i * 37) % 148 + 1, y: 33 + (i % 4) * 4, c: ['#ffd400', '#ff5a5f', '#f4f4f4', '#3ec1d3', '#ff9f1c'][i % 5], ph: i * 1.7 }));
  },

  create(G) {
    const c = G.c2d;
    const b = S.buf.getContext('2d');
    const sp = G.speed;
    const L = G.level;
    // pitch schedule (seconds, already divided by speed)
    const kind = L === 1 ? '옥수수' : G.pick(['옥수수', '군옥수수', '팝콘 볼']);
    const travel = (KIND[kind].travel * [1, 0.9, 0.82][L - 1]) / sp;
    const curve = L === 1 ? 0 : G.pick([-1, 1]) * G.rand(12, 22);
    const fakes = L === 3 ? G.pick([1, 2, 2]) : 0;
    const steps = [{ s: 'idle', d: 0.45 / sp }];
    for (let i = 0; i < fakes; i++) steps.push({ s: 'windup', d: 0.5 / sp, fake: true }, { s: 'fake', d: 0.4 / sp }, { s: 'idle', d: 0.22 / sp });
    steps.push({ s: 'windup', d: 0.55 / sp }, { s: 'throw', d: 99 });
    let stepI = 0, stepT = 0;

    const PLATE = { x: 80, y: 158 };
    const FACE = { x: 40, y: 130 };
    const ball = { state: 'wait', tt: 0, x: 80, y: 55, r: 1.5, bt: 0, x0: 0, y0: 0 };
    const bat = { a: -1.35, swingT: -1, whiff: false, spinT: -1 };
    let kbsPop = 0, nanaSplat = 0, kindPopT = -1;
    const parts = [];
    const st = { ball, bat, travel, get step() { return steps[stepI].s; } };

    const KERNELS = ['#ffd84a', '#f0b030', '#ffe98a'];
    const POPCORN = ['#fff8e0', '#ffffff', '#f2e2b0'];
    const burst = (x, y, n, cols = KERNELS, pop = false) => {
      for (let i = 0; i < n; i++) parts.push({ x, y, vx: G.rand(-60, 60), vy: G.rand(-70, 20), t: 0, col: G.pick(cols), pop, life: 0.9 });
    };

    const swing = () => {
      if (bat.swingT >= 0 || bat.whiff || ball.state === 'hit' || ball.state === 'face') return;
      bat.swingT = 0;
      const window = ball.state === 'fly' && ball.tt > travel * 0.78 && ball.tt < travel * 1.14;
      if (window) {
        ball.state = 'hit'; ball.bt = 0; ball.x0 = ball.x; ball.y0 = ball.y;
        G.sfx('bat'); G.sfx('c8_coin', { vol: 0.6 });
        if (kind === '팝콘 볼') { burst(ball.x, ball.y, 14, POPCORN, true); G.sfx('pop'); }
        G.shake(10, 0.2);
        G.win();
      } else {
        bat.whiff = true;
        bat.spinT = 0;
        G.sfx('whoosh');
        G.caption(ball.state === 'fly' ? '너무 빨라!' : '…아직 안 던졌는데?', 1);
      }
    };

    const drawPitcher = () => {
      const s = steps[stepI].s;
      const k = Math.min(1, stepT / steps[stepI].d);
      // arm angle: idle down, windup goes back/up, throw snaps forward
      let arm = 0.6, leg = 0, lean = 0;
      if (s === 'windup') { arm = 0.6 - k * 3.4; leg = k * 6; lean = -k; }
      else if (s === 'fake') { arm = -2.8; leg = 6; lean = -1; }
      else if (s === 'throw') { const q = Math.min(1, stepT * sp / 0.15); arm = -2.8 + q * 4.2; leg = 6 * (1 - q); lean = q * 2 - 1; }
      const ox = 75 + Math.round(lean);
      // corn suit: kernel-grid cob body, husk leaves flaring up around the face hole, green tights
      b.fillStyle = '#2f8f2f'; b.fillRect(ox - 7, 71, 4, 9); b.fillRect(ox + 3, 71 - leg, 4, 9);
      b.fillStyle = '#111'; b.fillRect(ox - 8, 80, 6, 2); b.fillRect(ox + 2, 80 - leg, 6, 2);
      for (const sd of [-1, 1]) leaf(b, ox + sd * 6, 74, ox + sd * 19, 30, 7, '#3cb33c', '#1d6b1d'); // outer husk, behind the cob
      disc(b, ox, 31, 11, '#7a5a00');
      b.fillStyle = '#7a5a00'; b.fillRect(ox - 11, 31, 22, 38);
      disc(b, ox, 68, 11, '#7a5a00');
      disc(b, ox, 31, 10, '#d9a400');
      b.fillStyle = '#d9a400'; b.fillRect(ox - 10, 31, 20, 37);
      disc(b, ox, 68, 10, '#d9a400');
      b.fillStyle = '#ffd84a';
      for (let y = 22; y < 77; y += 3) for (let x = ox - 10 + ((y / 3) % 2); x < ox + 10; x += 3) {
        const dy = y < 31 ? 31 - y : y > 67 ? y - 67 : 0;
        if (Math.abs(x + 1 - ox) <= Math.sqrt(Math.max(0, 100 - dy * dy)) - 1) b.fillRect(x, y, 2, 2);
      }
      b.fillStyle = '#b8860b'; b.fillRect(ox, 17, 1, 4); b.fillRect(ox - 2, 18, 1, 3); b.fillRect(ox + 2, 18, 1, 3); // silk tuft
      for (const sd of [-1, 1]) leaf(b, ox + sd * 4, 78, ox + sd * 13, 50, 6, '#55c455', '#1d6b1d'); // inner husk, in front
      b.fillStyle = '#e6b88a'; // left arm hangs, right arm throws
      b.fillRect(ox - 15, 52, 3, 12);
      for (let i = 0; i < 13; i++) b.fillRect(Math.round(ox + 11 + Math.sin(arm) * i), Math.round(52 + Math.cos(arm) * i), 3, 3);
      const hx = ox + 11 + Math.sin(arm) * 13, hy = 52 + Math.cos(arm) * 13;
      if (s === 'windup' || s === 'fake') b.drawImage(S.pitch[kind], Math.round(hx - 3), Math.round(hy - 4));
      // face in the face hole
      const shake = kbsPop > 0 ? Math.round(Math.sin(G.t * 60) * 1.5) : 0;
      disc(b, ox + shake, 41, 10.5, '#5a3a10');
      b.drawImage(S.kbs, ox - 9 + shake, 30);
      if (kbsPop > 0) { // buried in popcorn
        const n = Math.min(30, Math.floor(kbsPop * 40));
        for (let i = 0; i < n; i++) {
          const px = ox - 12 + ((i * 7) % 25), py = 24 - ((i * 3) % 6) + (i > 18 ? 6 : 0);
          b.fillStyle = i % 3 ? '#fff8e0' : '#f2e2b0'; b.fillRect(px + shake, py, 3, 2);
          b.fillStyle = '#f0b030'; b.fillRect(px + 1 + shake, py + 1, 1, 1);
        }
      }
      return { hx, hy };
    };

    const drawBatter = () => {
      let flip = false;
      if (bat.spinT >= 0 && bat.spinT < 0.6) flip = Math.floor(bat.spinT / 0.09) % 2 === 1;
      b.save();
      if (flip) { b.translate(84, 0); b.scale(-1, 1); }
      // body: costume, white tights, sneakers
      // the costume body continues the pixel head: same yellow (sampled from it) and the same 24px width at the seam
      const [Y1, Y2] = S.nanaYellow;
      b.fillStyle = Y1; b.fillRect(29, 141, 24, 27); b.fillRect(31, 168, 20, 4); b.fillRect(35, 172, 12, 3);
      b.fillStyle = Y2; b.fillRect(29, 164, 2, 4); b.fillRect(51, 164, 2, 4); b.fillRect(31, 171, 20, 1); b.fillRect(35, 174, 12, 1);
      b.fillStyle = '#6b3e14'; b.fillRect(40, 175, 3, 2);
      b.fillStyle = '#f4f4f4'; b.fillRect(33, 172, 4, 12); b.fillRect(45, 172, 4, 12); b.fillRect(31, 184, 7, 3); b.fillRect(44, 184, 7, 3);
      b.fillRect(50, 146, 6, 4); // arm to the hands
      b.drawImage(S.nana, 29, 116);
      if (nanaSplat > 0) {
        // a corn cob stamped across the face, kernels everywhere
        b.fillStyle = '#7a5a00'; b.fillRect(FACE.x - 9, FACE.y - 2, 19, 8);
        b.fillStyle = '#d9a400'; b.fillRect(FACE.x - 8, FACE.y - 1, 17, 6);
        b.fillStyle = '#ffd84a';
        for (let i = 0; i < 6; i++) { b.fillRect(FACE.x - 7 + i * 3, FACE.y - 1, 2, 2); b.fillRect(FACE.x - 6 + i * 3, FACE.y + 2, 2, 2); }
        b.fillStyle = '#3cb33c'; b.fillRect(FACE.x + 9, FACE.y - 3, 4, 3); b.fillRect(FACE.x + 9, FACE.y + 4, 4, 3);
        b.fillStyle = '#ffd84a';
        for (let i = 0; i < 5; i++) b.fillRect(FACE.x - 5 + i * 2.5, FACE.y + 7 + ((i * 3 + Math.floor(nanaSplat * 10)) % 5), 1, 1);
        b.fillStyle = '#1b1306'; // x eyes peek out
        b.fillRect(FACE.x - 6, FACE.y - 4, 1, 1); b.fillRect(FACE.x - 4, FACE.y - 4, 1, 1); b.fillRect(FACE.x - 5, FACE.y - 3, 1, 1);
        b.fillRect(FACE.x + 5, FACE.y - 4, 1, 1); b.fillRect(FACE.x + 7, FACE.y - 4, 1, 1); b.fillRect(FACE.x + 6, FACE.y - 3, 1, 1);
      }
      // banana bat
      const px = 54, py = 150, len = 30;
      const ca = Math.cos(bat.a), sa = Math.sin(bat.a);
      for (let i = 0; i <= len; i++) {
        const bend = Math.sin((i / len) * Math.PI) * 3;
        const x = px + ca * i - sa * bend, y = py + sa * i + ca * bend;
        const th = i < 4 ? 1 : i > len - 3 ? 2 : 3;
        b.fillStyle = i > len - 3 || i < 3 ? '#6b3e14' : i % 5 === 0 ? '#c9a200' : '#ffd400';
        b.fillRect(Math.round(x - th / 2), Math.round(y - th / 2), th, th);
      }
      b.fillStyle = '#f4f4f4'; b.fillRect(px - 2, py - 2, 4, 4);
      b.restore();
    };

    return {
      st,
      down() { if (G.t > 0.3) swing(); },
      update(dt) {
        // pitch sequencing
        stepT += dt;
        const step = steps[stepI];
        if (stepT >= step.d && stepI < steps.length - 1) {
          stepT = 0; stepI++;
          if (steps[stepI].s === 'fake') { G.sfx('boing', { vol: 0.5 }); }
          if (steps[stepI].s === 'throw') {
            ball.state = 'fly'; ball.tt = 0;
            G.sfx('whoosh', { vol: 0.5, rate: 1.3 });
            if (L > 1) kindPopT = 0;
          }
        }
        // ball
        if (ball.state === 'fly') {
          ball.tt += dt;
          const p = ball.tt / travel;
          const e = Math.pow(Math.min(p, 1.3), 1.7);
          const wob = KIND[kind].wobble ? Math.sin(ball.tt * 22) * 3 : 0;
          ball.x = G.lerp(80, PLATE.x, e) + curve * Math.sin(Math.PI * Math.min(p, 1)) + wob;
          ball.y = G.lerp(55, PLATE.y, e) + wob * 0.5;
          ball.r = G.lerp(1.2, 5.5, Math.min(1, e));
          if (p > 1.14) { // missed: straight into the face
            ball.state = 'face'; ball.bt = 0; ball.x0 = ball.x; ball.y0 = ball.y;
          }
        } else if (ball.state === 'face') {
          ball.bt += dt;
          const q = Math.min(1, ball.bt / 0.1);
          ball.x = G.lerp(ball.x0, FACE.x, q); ball.y = G.lerp(ball.y0, FACE.y, q);
          if (q >= 1 && !nanaSplat) {
            nanaSplat = 0.001; ball.state = 'gone';
            burst(FACE.x, FACE.y, 18);
            G.sfx('splat'); G.sfx('c8_hit', { vol: 0.5 });
            G.shake(16, 0.3);
            G.lose();
          }
        } else if (ball.state === 'hit') {
          ball.bt += dt;
          const q = Math.min(1, ball.bt / 0.32);
          ball.x = G.lerp(ball.x0, 75, q); ball.y = G.lerp(ball.y0, 40, q) - Math.sin(q * Math.PI) * 30;
          ball.r = G.lerp(5, 2.5, q);
          if (q >= 1) {
            ball.state = 'gone'; kbsPop = 0.001;
            burst(75, 40, 30, POPCORN, true);
            G.sfx('pop'); G.sfx('pop', { rate: 1.3, vol: 0.7 });
          }
        }
        if (bat.swingT >= 0) {
          bat.swingT += dt;
          const q = Math.min(1, bat.swingT / 0.14);
          bat.a = G.lerp(-1.35, 1.0, 1 - (1 - q) ** 2);
        }
        if (bat.spinT >= 0) bat.spinT += dt;
        if (kbsPop) { // popcorn keeps raining on 범수수
          kbsPop += dt;
          if (Math.random() < 0.7) parts.push({ x: 75 + G.rand(-30, 30), y: -2, vx: G.rand(-8, 8), vy: G.rand(10, 40), t: 0, col: G.pick(POPCORN), pop: true, life: 1.4 });
          if (Math.random() < dt * 8) G.sfx('pop', { vol: 0.35, rate: G.rand(0.9, 1.5) });
        }
        if (nanaSplat) nanaSplat += dt;
        if (kindPopT >= 0) kindPopT += dt;
        for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; }

        // ---- draw
        b.drawImage(S.field, 0, 0);
        const cheer = G.result === 'win';
        for (const m of S.crowd) {
          b.fillStyle = m.c;
          b.fillRect(m.x, m.y - (cheer && Math.sin(G.t * 20 + m.ph) > 0 ? 2 : 0), 2, 2);
        }
        drawPitcher();
        if (ball.state === 'fly' || ball.state === 'face' || ball.state === 'hit') {
          // shadow + corn
          b.fillStyle = 'rgba(0,0,0,.35)';
          if (ball.state === 'fly') b.fillRect(Math.round(ball.x - ball.r), Math.round(G.lerp(82, 172, Math.min(1, ball.tt / travel))), Math.round(ball.r * 2), 1);
          const img = S.pitch[kind];
          const s = Math.max(1, ball.r / 3);
          b.save();
          b.translate(Math.round(ball.x), Math.round(ball.y));
          if (kind !== '팝콘 볼') b.rotate(ball.state === 'hit' ? ball.bt * 30 : 0.5); // the cob tumbles once hit
          b.drawImage(img, Math.round(-3 * s), Math.round((-img.height / 2) * s), Math.round(6 * s), Math.round(img.height * s));
          b.restore();
        }
        drawBatter();
        for (const p of parts) if (p.t < p.life) {
          b.fillStyle = p.col; b.fillRect(Math.round(p.x), Math.round(p.y), p.pop ? 3 : 2, 2);
          if (p.pop) { b.fillStyle = '#f0b030'; b.fillRect(Math.round(p.x) + 1, Math.round(p.y) + 1, 1, 1); }
        }

        c.imageSmoothingEnabled = false;
        c.drawImage(S.buf, 0, 0, G.W, G.H);
        if (kindPopT >= 0 && kindPopT < 0.7) G.text(`${kind}!`, 440, 230, { size: 50, color: kind === '군옥수수' ? '#c07020' : '#ffd84a', alpha: 1 - kindPopT / 0.7 });
      },
    };
  },
};
