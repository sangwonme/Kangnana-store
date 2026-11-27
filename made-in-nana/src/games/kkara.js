// 01 까라! — 바나나 탈 껍질을 갈래별로 아래로 끌어내려 벗긴다. 다 벗기면 흰 쫄쫄이 강나나. (실사)
// suit.png (799x900) is drawn in image coords; peel strips are vertical bands that follow the costume's silhouette.
// The yellow outer layer is drawn clipped to "band below its peel line", over a recolored inner layer.

const S = 0.75; // image -> logical scale (799 px wide -> 600)
const OX = 0;
const OY = 62;
const CX = 391; // costume centre line (image x)
const TOP = 24; // just under the stem
const BOT = 676; // costume bottom tip
// half width of the costume per image y (+ margin), so every yellow pixel sits inside some band
const PROFILE = [[0, 18], [30, 26], [60, 42], [100, 62], [150, 88], [200, 114], [235, 124], [480, 124], [520, 114], [560, 94],
  [600, 72], [640, 48], [680, 26], [700, 10]];
const halfW = (y) => {
  for (let i = 1; i < PROFILE.length; i++) {
    const [y1, w1] = PROFILE[i];
    if (y <= y1) { const [y0, w0] = PROFILE[i - 1]; return w0 + (w1 - w0) * (y - y0) / (y1 - y0); }
  }
  return 10;
};
let IMG = null; // { suit, white, green }

/** Recolor the yellow costume pixels. mode 'white' = tights, 'green' = unripe inner suit. */
function recolor(img, mode, plain = false) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  const w = c.width;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 8) continue;
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const yellow = r > 120 && g > 95 && b < g * 0.72 && r - b > 60;
    const py = (i / 4 / w) | 0;
    const px = (i / 4) % w;
    const tip = !plain && py > 600 && px > 340 && px < 445 && r < 170 && r > b + 15; // brown bottom tip
    if (!plain && mode === 'white' && !yellow && !tip && Math.abs(px - 391) < 95 && py > 515 + 85 * (1 - ((px - 391) / 95) ** 2) + 2) {
      // dark seam/shadow pixels of the suit's lower tip (not yellow enough to be recolored): drop them too, keep the tights
      const tights = r > 150 && g > 150 && b > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 45;
      if (!tights) { p[i + 3] = 0; continue; }
    }
    if (!yellow && !tip) continue;
    if (!plain && ((px - 391) / 47) ** 2 + ((py - 146) / 58) ** 2 < 1 && !(b < g * 0.42 && g > 150)) continue; // keep the face (skin is yellow-ish too)
    if (!plain && mode === 'white') {
      // no dangling lobe between the legs: the white bodysuit ends in a smooth leotard curve (feathered edge).
      // Only suit pixels are affected, so the tights stay whole.
      const dx = (px - 391) / 95;
      const crotchY = Math.abs(dx) < 1 ? 515 + 85 * (1 - dx * dx) : 515;
      const over = py - crotchY;
      if (over > 2) { p[i + 3] = 0; continue; }
      if (over > -2) p[i + 3] = p[i + 3] * (2 - over) / 4;
    }
    const lum = tip ? 150 + (r + g) * 0.2 : (r + g) * 0.5;
    if (mode === 'white') {
      const v = Math.min(255, lum * 0.98 + 14);
      p[i] = v; p[i + 1] = v; p[i + 2] = Math.min(255, v + 6);
    } else {
      p[i] = lum * 0.55; p[i + 1] = Math.min(255, lum * 0.92); p[i + 2] = lum * 0.25;
    }
  }
  x.putImageData(d, 0, 0);
  return c;
}

function bandPath(c, k, n, y0, y1) {
  const pts = [];
  const xAt = (j, y) => CX + halfW(y) * (2 * j / n - 1) + (j === 0 ? -24 : j === n ? 24 : 0);
  for (let y = y0; y <= y1; y += 12) pts.push([xAt(k, y), y]);
  pts.push([xAt(k, y1), y1]);
  for (let y = y1; y >= y0; y -= 12) pts.push([xAt(k + 1, y), y]);
  pts.push([xAt(k + 1, y0), y0]);
  c.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts) c.lineTo(q[0], q[1]);
  c.closePath();
  return pts;
}

export default {
  id: 'kkara', no: 1, cmd: '까라!', hint: '드래그 ↓', bgm: 'bgm_silly', layer: '2d',
  duration: 5, timeout: 'lose', sounds: ['peel', 'squeak', 'sparkle', 'whoosh', 'jump', 'shared:fabric_off'],

  async load(A) {
    const [suit, peel, shy] = await Promise.all([A.img('suit.png'), A.img('assets/photo/kkara_peel.png'), A.img('shy_nana.png')]);
    const green = recolor(suit, 'green');
    // flap textures: the costume with the face hole painted over, so a folded-down strip never shows a mirrored face
    const noFace = (img, col) => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const x = cv.getContext('2d');
      x.drawImage(img, 0, 0);
      x.fillStyle = col;
      x.beginPath(); x.ellipse(391, 146, 56, 68, 0, 0, Math.PI * 2); x.fill();
      return cv;
    };
    IMG = { suit, shy, white: recolor(suit, 'white'), green, peel, peelGreen: recolor(peel, 'green', true) };
    IMG.flap = new Map([[suit, noFace(suit, '#f4d70f')], [green, noFace(green, '#86c41c')]]);
  },

  create(G) {
    const c = G.c2d;
    // L1: 3 strips. L2: 4. L3: 2 strips, then a green (unripe) suit inside, 2 more strips.
    const layers = G.level === 3 ? [{ img: IMG.suit, n: 2 }, { img: IMG.green, n: 2 }] : [{ img: IMG.suit, n: G.level === 1 ? 3 : 4 }];
    let li = 0;
    let bands = [];
    const setup = () => { bands = Array.from({ length: layers[li].n }, () => ({ p: 0, done: false, auto: false })); };
    setup();
    const REQ = 230; // logical px of drag for a full strip
    let grab = null;
    const fallen = [];
    let resultT = 0;
    let revealT = 0;
    const snow = Array.from({ length: 40 }, () => ({ x: G.rand(0, 600), y: G.rand(-800, 0), v: G.rand(80, 160), s: G.rand(3, 7) }));

    const ix = (x) => (x - OX) / S;
    const iy = (y) => (y - OY) / S;
    const bandCenter = (k, n, y) => CX + halfW(y) * ((2 * k + 1) / n - 1);
    const peelY = (b) => TOP + (BOT - TOP) * Math.min(1, b.p);

    const complete = (k) => {
      const b = bands[k];
      if (b.done) return;
      b.done = true;
      b.auto = true;
      G.sfx('peel', { rate: G.rand(0.9, 1.2) });
      G.sfx('shared:fabric_off', { vol: 0.5 });
    };

    const finishLayer = () => {
      if (li < layers.length - 1) {
        li++;
        setup();
        revealT = 1;
        G.caption('…안에 덜 익은 게 한 겹 더?!', 1.2);
        G.sfx('squeak');
        G.shake(6, 0.2);
      } else {
        G.win();
        G.sfx('sparkle');
        G.sfx('squeak', { rate: 1.3 });
        G.sfx('jump', { vol: 0.5 });
      }
    };

    const drawBg = () => {
      const g = c.createRadialGradient(300, 330, 40, 300, 330, 600);
      g.addColorStop(0, '#ffe3f0');
      g.addColorStop(1, '#ff8fb8');
      c.fillStyle = g;
      c.fillRect(0, 0, 600, 800);
      c.save();
      c.translate(300, 330);
      c.rotate(G.t * 0.15);
      c.fillStyle = 'rgba(255,255,255,0.28)';
      for (let i = 0; i < 16; i++) {
        c.rotate(Math.PI / 8);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(900, -90); c.lineTo(900, 90); c.closePath(); c.fill();
      }
      c.restore();
      // floor
      c.fillStyle = '#d9668f';
      c.fillRect(0, 700, 600, 100);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.beginPath(); c.ellipse(300, 712, 170, 18, 0, 0, Math.PI * 2); c.fill();
    };

    // the peeled strip folds down: the costume photo of that strip, mirrored below the peel line, with a pale lining wash
    const drawFlap = (k, n, b, img) => {
      const py = peelY(b);
      const len = py - TOP;
      if (len < 2) return;
      const f = Math.min(1, 210 / len);
      c.save();
      const cx = bandCenter(k, n, py);
      c.translate(cx, py);
      c.rotate(Math.sin(G.t * 7 + k * 1.7) * 0.07 + (k - (n - 1) / 2) * 0.12);
      c.translate(-cx, -py);
      c.beginPath();
      const pts = [];
      for (let y = TOP; y <= py; y += 12) pts.push(y);
      pts.push(py);
      const xAt = (j, y) => CX + halfW(y) * (2 * j / n - 1);
      const ry = (y) => py + (py - y) * f;
      c.moveTo(xAt(k, py), py);
      for (const y of pts.slice().reverse()) c.lineTo(xAt(k, y), ry(y));
      for (const y of pts) c.lineTo(xAt(k + 1, y), ry(y));
      c.closePath();
      c.save();
      c.clip();
      c.translate(0, py);
      c.scale(1, -f);
      c.translate(0, -py);
      c.drawImage(img, 0, 0);
      c.restore();
      c.fillStyle = 'rgba(255,246,205,0.5)';
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(120,90,0,0.8)';
      c.stroke();
      c.restore();
    };

    const drawPeelPiece = (x, y, rot, green) => {
      const im = green ? IMG.peelGreen : IMG.peel;
      const w = 130;
      const h = w * im.height / im.width;
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.drawImage(im, -w / 2, -h * 0.8, w, h);
      c.restore();
    };

    // fully peeled: the white-tights Gangnana crouches shyly (photo), with a little hop and a blush
    const SHY = { s: 0.485, // face 132px in shy_nana.png vs 86px*0.75 in the T-pose -> same on-screen head
       cheeks: [[302, 246], [372, 246]] };
    const drawShy = () => {
      const im = IMG.shy;
      const w = im.width * SHY.s;
      const h = im.height * SHY.s;
      const hop = resultT < 0.32 ? Math.sin(resultT / 0.32 * Math.PI) * 70 : 0;
      const k = Math.sin(resultT * 22) * 0.025 * Math.max(0, 1 - resultT * 0.7);
      c.save();
      c.translate(300, 736 - hop);
      c.scale(1 - k, 1 + k);
      c.translate(-w / 2, -h);
      c.drawImage(im, 0, 0, w, h);
      c.scale(SHY.s, SHY.s);
      c.fillStyle = `rgba(255,70,110,${Math.min(0.5, resultT * 2)})`;
      for (const [bx, by] of SHY.cheeks) { c.beginPath(); c.ellipse(bx, by, 20, 11, 0, 0, Math.PI * 2); c.fill(); }
      c.restore();
    };

    const draw = () => {
      drawBg();
      const L = layers[li];
      const n = L.n;
      const base = li < layers.length - 1 ? layers[li + 1].img : IMG.white;
      const won = G.result === 'win';
      const lost = G.result === 'lose';
      if (won) drawShy();
      c.save();
      if (won) c.globalAlpha = 0; // the T-pose is replaced by the crouching shy photo
      if (lost) c.translate(Math.sin(resultT * 90) * 4, 0);
      c.translate(OX, OY);
      c.scale(S, S);
      c.drawImage(base, 0, 0);
      // outer layer, only where not yet peeled
      c.save();
      c.beginPath();
      bands.forEach((b, k) => { if (!b.done || b.p < 1) bandPath(c, k, n, peelY(b), 760); });
      c.clip();
      c.drawImage(L.img, 0, 0);
      c.restore();
      // flaps hanging from each peel line
      bands.forEach((b, k) => { if (b.p > 0 && b.p < 1) drawFlap(k, n, b, IMG.flap.get(L.img)); });
      if (lost) {
        // icicle under the nose
        const h = Math.min(1, resultT * 2) * 46;
        c.fillStyle = '#bfefff';
        c.strokeStyle = '#3a7ea8';
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(384, 168); c.lineTo(398, 168); c.lineTo(392, 168 + h); c.closePath(); c.fill(); c.stroke();
      }
      c.restore();

      for (const f of fallen) drawPeelPiece(f.x, f.y, f.rot, f.green);

      if (revealT > 0) G.text('한 겹 더?!', 300, 420, { size: 70, color: '#9be15d', alpha: Math.min(1, revealT * 2) });
      if (won) {
        for (let j = 0; j < 5; j++) {
          const a = resultT * 1.5 + j;
          G.text('♥', 300 + Math.sin(a * 2 + j * 2) * 160, 330 - ((resultT * 160 + j * 70) % 300), { size: 40, color: '#ff4f8b', stroke: '#fff' });
        }
      }
      if (lost) {
        c.fillStyle = 'rgba(120,190,255,0.28)';
        c.fillRect(0, 0, 600, 800);
        c.fillStyle = '#fff';
        for (const s of snow) { c.beginPath(); c.arc(s.x, s.y, s.s, 0, Math.PI * 2); c.fill(); }
      }
    };

    return {
      down(p) {
        // nearest unpeeled band by x at the pointer's height (generous: anywhere on screen)
        const n = layers[li].n;
        const y = G.clamp(iy(p.y), TOP + 40, BOT - 40);
        let best = null;
        let bd = Infinity;
        bands.forEach((b, k) => {
          if (b.done) return;
          const d = Math.abs(bandCenter(k, n, y) - ix(p.x));
          if (d < bd) { bd = d; best = k; }
        });
        if (best == null) return;
        grab = { k: best, y0: p.y, p0: bands[best].p };
        G.sfx('squeak', { vol: 0.35, rate: 1.4 });
      },
      move(p) {
        if (!grab || !p.down) return;
        const b = bands[grab.k];
        if (b.done) return;
        b.p = Math.max(b.p, grab.p0 + (p.y - grab.y0) / REQ);
        if (b.p >= 0.75) complete(grab.k);
      },
      up() {
        if (grab && bands[grab.k].p >= 0.6) complete(grab.k);
        grab = null;
      },
      update(dt) {
        if (revealT > 0) revealT = Math.max(0, revealT - dt);
        let allDone = true;
        bands.forEach((b, k) => {
          if (b.auto && b.p < 1) {
            b.p = Math.min(1, b.p + dt * 4);
            if (b.p >= 1) {
              const n = layers[li].n;
              fallen.push({ x: OX + bandCenter(k, n, BOT - 40) * S, y: OY + (BOT - 40) * S, vy: -120, vx: G.rand(-1, 1) * 260, rot: G.rand(-0.6, 0.6),
                vr: G.rand(-6, 6), green: layers[li].img === IMG.green });
            }
          }
          if (!(b.done && b.p >= 1)) allDone = false;
        });
        if (allDone && !G.result) finishLayer();
        for (const f of fallen) {
          if (f.y < 735) { f.vy += 1600 * dt; f.y = Math.min(735, f.y + f.vy * dt); f.x = G.clamp(f.x + f.vx * dt, 60, 540); f.rot += f.vr * dt; } else f.rot *= 0.85;
        }
        if (G.result) {
          resultT += dt;
          for (const s of snow) { s.y += s.v * dt; s.x += Math.sin(G.t * 3 + s.v) * 30 * dt; if (s.y > 800) s.y -= 820; }
        }
        draw();
      },
      timeout(r) {
        if (r !== 'lose') return;
        G.sfx('whoosh', { rate: 0.6 });
      },
    };
  },
};
