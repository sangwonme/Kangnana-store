// 29 웃어라! — 시무룩한 실사 강나나의 입꼬리(L2+ 눈꺼풀도)를 손가락으로 끌어올려 웃게 만든다.
// 표정 사진 5장(실제 사진 한 장을 LivePortrait 얼굴 키포인트 리타게팅으로 표정만 바꿈: 시무룩/살짝/활짝/섬뜩/오열,
// tools/made-in-nana/smile_lp.py)을 진행도에 따라 섞고,
// 손가락이 닿은 곳 주변을 고무처럼 늘리는 메쉬 워프를 얹는다. 성공하면 과하게 섬뜩한 미소, 실패하면 오열하며 녹아내린다.
// L1 입꼬리 2개 · L2 입꼬리+눈꺼풀 4개 · L3 4개 + 손을 떼면 다시 처짐.

const IMG_W = 600, IMG_H = 804, IMG_Y = -2;        // photos are 600x804; drawn full width
const HANDLES = {                                   // landmark positions in canvas space
  mouthL: { x: 255, y: 570, pair: 'mouthR', label: '입꼬리' },
  mouthR: { x: 365, y: 570, pair: 'mouthL', label: '입꼬리' },
  eyeL: { x: 207, y: 352, pair: 'eyeR', label: '눈꺼풀' },
  eyeR: { x: 395, y: 352, pair: 'eyeL', label: '눈꺼풀' },
};
// warp grid over the face only (everything else is drawn untouched)
const GX0 = 130, GX1 = 480, GY0 = 230, GY1 = 700, NX = 10, NY = 14;
let IMGS = null;

export default {
  id: 'smile', no: 29, cmd: '웃어라!', hint: (lv) => (lv >= 2 ? '입꼬리·눈꺼풀을 위로 쭉' : '입꼬리를 위로 쭉'),
  bgm: 'bgm_spooky', layer: '2d', duration: 5, timeout: 'lose', afterglow: 1.6,
  sounds: ['clay', 'squeak', 'splat', 'scare', 'sneeze'],

  async load(A) {
    IMGS = await Promise.all([0, 1, 2, 3, 4].map((i) => A.img(`smile_${i}.jpg`)));
  },

  create(G) {
    const c = G.c2d;
    const L = G.level;
    const ids = L >= 2 ? ['mouthL', 'mouthR', 'eyeL', 'eyeR'] : ['mouthL', 'mouthR'];
    const need = L >= 2 ? 55 : 70;                     // px of upward drag for a full lift
    const H = Object.fromEntries(ids.map((id) => [id, { ...HANDLES[id], id, p: 0, drag: null, idle: 9, done: false }]));
    const pointers = new Map();                        // pointerId -> {h, sx, sy, p0, x, y}
    let state = 'play';                                // play | win | melt
    let endT = 0;

    // offscreen: the blended expression frame we warp from
    const frame = document.createElement('canvas');
    frame.width = IMG_W; frame.height = IMG_H;
    const fx = frame.getContext('2d');
    let lastKey = '';
    const compose = (a, b, t) => {
      const key = `${a}|${b}|${t.toFixed(2)}`;
      if (key === lastKey) return;
      lastKey = key;
      fx.globalAlpha = 1;
      fx.drawImage(IMGS[a], 0, 0, IMG_W, IMG_H);
      if (t > 0.01) { fx.globalAlpha = t; fx.drawImage(IMGS[b], 0, 0, IMG_W, IMG_H); }
      fx.globalAlpha = 1;
    };

    const progress = () => ids.reduce((s, id) => s + H[id].p, 0) / ids.length;

    // displacement of a source point: rubber pull toward active fingers + melt drip
    const disp = (x, y) => {
      let dx = 0, dy = 0;
      for (const h of Object.values(H)) {
        if (!h.drag) continue;
        const g = Math.exp(-((x - h.x) ** 2 + (y - h.y) ** 2) / (2 * 48 * 48));
        dx += h.drag.dx * g;
        dy += h.drag.dy * g;
      }
      if (state === 'melt') {
        const k = Math.min(1, endT / 1.2);
        const below = Math.max(0, Math.min(1, (y - 380) / 300));
        dy += k * k * 150 * below * below + Math.sin(x * 0.05 + endT * 3) * 10 * k * below;
        dx += (x - 310) * 0.18 * k * below;
      }
      return [dx, dy];
    };

    // draw `src` through the warped grid (affine per triangle, clipped)
    const tri = (img, s0, s1, s2, d0, d1, d2) => {
      const [x0, y0] = s0, [x1, y1] = s1, [x2, y2] = s2;
      const [u0, v0] = d0, [u1, v1] = d1, [u2, v2] = d2;
      const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
      if (!den) return;
      const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den;
      const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den;
      const cc = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den;
      const d = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den;
      const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den;
      const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den;
      // grow the clip triangle a hair to hide seams
      const mx = (u0 + u1 + u2) / 3, my = (v0 + v1 + v2) / 3;
      const grow = (u, v) => [u + Math.sign(u - mx) * 0.6, v + Math.sign(v - my) * 0.6];
      c.save();
      c.beginPath();
      c.moveTo(...grow(u0, v0)); c.lineTo(...grow(u1, v1)); c.lineTo(...grow(u2, v2));
      c.closePath();
      c.clip();
      c.transform(a, b, cc, d, e, f);
      c.drawImage(img, 0, 0);
      c.restore();
    };

    const drawFace = (zoom = 1) => {
      c.save();
      if (zoom !== 1) { c.translate(310, 470); c.scale(zoom, zoom); c.translate(-310, -470); }
      c.drawImage(frame, 0, IMG_Y);
      const warping = state === 'melt' || Object.values(H).some((h) => h.drag);
      if (warping) {
        const gw = (GX1 - GX0) / NX, gh = (GY1 - GY0) / NY;
        const pts = [];
        for (let j = 0; j <= NY; j++) {
          for (let i = 0; i <= NX; i++) {
            const x = GX0 + i * gw, y = GY0 + j * gh;
            const edge = i === 0 || j === 0 || i === NX || (j === NY && state !== 'melt'); // pin the border
            const [dx, dy] = edge ? [0, 0] : disp(x, y);
            pts.push({ s: [x, y - IMG_Y], d: [x + dx, y + dy] });
          }
        }
        // repaint the grid area from the frame with displacement (background first so pulled-away gaps aren't empty)
        for (let j = 0; j < NY; j++) {
          for (let i = 0; i < NX; i++) {
            const p00 = pts[j * (NX + 1) + i], p10 = pts[j * (NX + 1) + i + 1];
            const p01 = pts[(j + 1) * (NX + 1) + i], p11 = pts[(j + 1) * (NX + 1) + i + 1];
            tri(frame, p00.s, p10.s, p11.s, p00.d, p10.d, p11.d);
            tri(frame, p00.s, p11.s, p01.s, p00.d, p11.d, p01.d);
          }
        }
      }
      c.restore();
    };

    const grab = (p) => {
      if (state !== 'play') return;
      let best = null, bd = 80;
      for (const h of Object.values(H)) {
        if (!ids.includes(h.id) || h.done) continue;
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (d < bd) { bd = d; best = h; }
      }
      if (!best) return;
      best.drag = { dx: 0, dy: 0 };
      pointers.set(p.id, { h: best, sx: p.x, sy: p.y, p0: best.p });
      G.sfx('clay', { vol: 0.6, rate: G.rand(0.9, 1.2) });
    };

    const win = () => {
      state = 'win';
      endT = 0;
      for (const h of Object.values(H)) h.drag = null;
      pointers.clear();
      G.sfx('scare', { vol: 0.5 });
      G.caption('…좋아.', 1.6);
      G.win();
    };

    const melt = () => {
      if (state === 'melt') return;
      state = 'melt';
      endT = 0;
      for (const h of Object.values(H)) h.drag = null;
      pointers.clear();
      G.sfx('splat');
      setTimeout(() => G.sfx('sneeze', { vol: 0.5, rate: 0.7 }), 300);
      G.caption('…녹는다');
    };

    return {
      down: grab,
      move(p) {
        const ptr = pointers.get(p.id);
        if (!ptr || state !== 'play') return;
        const h = ptr.h;
        const up = ptr.sy - p.y;
        // rubber: the face follows the finger, but only so far
        h.drag.dx = G.clamp((p.x - ptr.sx) * 0.5, -40, 40);
        h.drag.dy = G.clamp(-up * 0.6, -55, 30);
        const np = G.clamp(ptr.p0 + up / need, 0, 1);
        if (np > h.p) {
          const gain = np - h.p;
          h.p = np;
          const mate = H[h.pair];
          if (mate && ids.includes(mate.id)) mate.p = Math.min(1, mate.p + gain * 0.35); // smiling one side tugs the other
        }
        h.idle = 0;
        if (h.p >= 1 && !h.done) { h.done = true; G.sfx('squeak', { vol: 0.6 }); }
        for (const id of ids) if (H[id].p >= 1) H[id].done = true;
        if (ids.every((id) => H[id].done)) win();
      },
      up(p) {
        const ptr = pointers.get(p.id);
        if (!ptr) return;
        ptr.h.drag = null;
        pointers.delete(p.id);
      },
      timeout(r) { if (r === 'lose') melt(); },
      update(dt) {
        endT += dt;
        // L3: the face sags back when you let go
        if (state === 'play' && L >= 3) {
          for (const id of ids) {
            const h = H[id];
            if (h.drag) continue;
            h.idle += dt;
            if (h.idle > 0.6 && !h.done) h.p = Math.max(0, h.p - dt * 0.35 * G.speed);
          }
        }

        // expression frame: sad -> mid -> big while playing; creepy on win; melt on fail
        const P = progress();
        if (state === 'win') compose(2, 3, Math.min(1, endT * 4));
        else if (state === 'melt') compose(0, 4, Math.min(1, endT * 3));
        else if (P < 0.5) compose(0, 1, P / 0.5);
        else compose(1, 2, (P - 0.5) / 0.5);

        c.fillStyle = '#7d7d7d';
        c.fillRect(0, 0, G.W, G.H);
        const zoom = state === 'win' ? 1 + Math.min(1, endT / 1.4) * 0.16 : 1;
        drawFace(zoom);

        if (state === 'play') {
          // handle markers + bouncing arrows on the ones still to lift
          for (const id of ids) {
            const h = H[id];
            if (h.done) continue;
            const bob = Math.sin(G.t * 9) * 5;
            c.save();
            c.lineWidth = 4;
            c.setLineDash([7, 6]);
            c.strokeStyle = 'rgba(255,212,0,.95)';
            c.beginPath(); c.arc(h.x, h.y, 22, 0, Math.PI * 2); c.stroke();
            c.setLineDash([]);
            // progress arc
            c.strokeStyle = '#ff3b30';
            c.lineWidth = 6;
            c.beginPath(); c.arc(h.x, h.y, 22, -Math.PI / 2, -Math.PI / 2 + h.p * Math.PI * 2); c.stroke();
            c.restore();
            G.text('↑', h.x + (h.x < 300 ? -34 : 34), h.y - 34 + bob, { size: 40, color: '#ffd400' });
          }
        } else if (state === 'win') {
          const k = Math.min(1, endT / 1.2);
          const g = c.createRadialGradient(300, 470, 140, 300, 470, 520);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, `rgba(0,0,0,${0.85 * k})`);
          c.fillStyle = g;
          c.fillRect(0, 0, G.W, G.H);
        } else {
          c.fillStyle = `rgba(40,80,160,${Math.min(0.25, endT * 0.3)})`;
          c.fillRect(0, 0, G.W, G.H);
        }
      },
    };
  },
};
