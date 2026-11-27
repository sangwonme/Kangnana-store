// 03 파라! — 화면을 꽉 채운 콧구멍에 손가락을 넣고 휘저어 코딱지(바나나)를 잡아 끌어낸다. 성공하면 줌아웃되며 콧구멍에서 바나나가 쏟아진다. (실사 콜라주)
// Background = face_close.jpg zoomed 5x around the nose (precomputed in load). Finger and bananas are photo cutouts
// (assets/photo/nose_finger.png, nose_banana.png).

const SRC = { x: 386, y: 588, w: 120, h: 160 }; // face_close.jpg crop (3:4) -> 600x800, nostrils at ~(420,672) & (472,672)
const HOLES = [{ x: 172, y: 418 }, { x: 428, y: 418 }];
const HRX = 70;
const HRY = 40;
let BG = null;

let P = null; // photo props
const FINGER = { tip: { x: 64, y: 12 }, wrist: { x: 530, y: 312 }, scale: 0.8 }; // nose_finger.png landmarks

function banana(c, x, y, s, rot) {
  const im = P.banana;
  const w = 56 * s;
  const h = w * im.height / im.width;
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.drawImage(im, -w / 2, -h / 2, w, h);
  c.restore();
}

export default {
  id: 'nose', no: 3, cmd: '파라!', hint: '드래그 · 휘휘', bgm: 'bgm_silly', layer: '2d',
  duration: 5, timeout: 'lose', sounds: ['sneeze', 'squeak', 'pop', 'slurp', 'sparkle', 'splat', 'shared:squeeze'],

  async load(A) {
    const [img, finger, ban] = await Promise.all([A.img('face_close.jpg'), A.img('assets/photo/nose_finger.png'), A.img('assets/photo/nose_banana.png')]);
    // dark copy of the finger for the part that is inside the nostril
    const dark = document.createElement('canvas');
    dark.width = finger.width; dark.height = finger.height;
    const dx = dark.getContext('2d');
    dx.drawImage(finger, 0, 0);
    dx.globalCompositeOperation = 'source-atop';
    dx.fillStyle = 'rgba(40,10,8,0.85)';
    dx.fillRect(0, 0, dark.width, dark.height);
    P = { finger, dark, banana: ban, face: img };
    BG = document.createElement('canvas');
    BG.width = 600; BG.height = 800;
    const x = BG.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.filter = 'saturate(1.15) contrast(1.05)';
    x.drawImage(img, SRC.x, SRC.y, SRC.w, SRC.h, 0, 0, 600, 800);
    x.filter = 'none';
    // paint deep nostrils over the real (small, blurry) ones so they read as holes
    for (const h of HOLES) {
      const g = x.createRadialGradient(h.x, h.y + 6, 4, h.x, h.y, HRX * 1.25);
      g.addColorStop(0, 'rgba(20,4,4,1)');
      g.addColorStop(0.55, 'rgba(45,10,8,0.97)');
      g.addColorStop(0.8, 'rgba(120,50,40,0.6)');
      g.addColorStop(1, 'rgba(160,80,70,0)');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(h.x, h.y, HRX * 1.25, HRY * 1.3, 0, 0, Math.PI * 2); x.fill();
    }
  },

  create(G) {
    const c = G.c2d;
    const target = G.rand() < 0.5 ? 0 : 1;
    const need = [650, 1050, 900][G.level - 1];
    const PULL = 250;
    let state = 'out'; // out | in | grab
    let dig = 0;
    let tip = { x: 300, y: 900 };
    let last = null;
    let pulled = 0;
    let fallers = []; // success: bananas pouring out of the nostril
    let pourT = 0;
    const pile = new Array(16).fill(0);
    let resultT = 0;
    let twitch = { x: 0, y: 0, vx: 0, next: 0.6 };
    let splats = [];
    let flying = [];

    const off = () => (G.level === 3 ? { x: Math.sin(G.t * 2.3) * 22 + twitch.x, y: Math.sin(G.t * 3.1) * 12 + twitch.y } : { x: 0, y: 0 });
    const hole = () => { const o = off(); const h = HOLES[target]; return { x: h.x + o.x, y: h.y + o.y }; };
    const inHole = (p, k = 1) => { const h = hole(); return ((p.x - h.x) / (HRX * k)) ** 2 + ((p.y - h.y) / (HRY * k)) ** 2 <= 1; };
    const clampHole = (p) => {
      const h = hole();
      const dx = (p.x - h.x) / (HRX * 0.75);
      const dy = (p.y - h.y) / (HRY * 0.75);
      const d = Math.hypot(dx, dy);
      return d <= 1 ? { x: p.x, y: p.y } : { x: h.x + dx / d * HRX * 0.75, y: h.y + dy / d * HRY * 0.75 };
    };

    // ---- photo finger: rotated so the wrist points to a base below the screen and the fingertip sits on (tx, ty)
    const IMG_ANG = Math.atan2(FINGER.tip.y - FINGER.wrist.y, FINGER.tip.x - FINGER.wrist.x);
    const drawFinger = (tx, ty, dark) => {
      const bx = tx * 0.55 + 300 * 0.45 + 70;
      const ang = Math.atan2(ty - 900, tx - bx);
      const im = dark ? P.dark : P.finger;
      c.save();
      c.translate(tx, ty);
      c.rotate(ang - IMG_ANG);
      c.scale(FINGER.scale, FINGER.scale);
      c.drawImage(im, -FINGER.tip.x, -FINGER.tip.y);
      c.restore();
    };

    // success zoom: crop rect of face_close.jpg goes from the nose close-up to the whole photo (cover 3:4)
    const FULL = { x: 90, y: 0, w: 768, h: 1024 };
    const NOSTRIL = { x: SRC.x + HOLES[target].x / 600 * SRC.w, y: SRC.y + HOLES[target].y / 800 * SRC.h }; // in the photo
    const zoomRect = (z) => ({ x: G.lerp(SRC.x, FULL.x, z), y: G.lerp(SRC.y, FULL.y, z), w: G.lerp(SRC.w, FULL.w, z), h: G.lerp(SRC.h, FULL.h, z) });
    const zoomK = () => { const z = Math.min(1, resultT / 0.4); return 1 - (1 - z) ** 3; };
    const nostrilOnScreen = () => { const r = zoomRect(zoomK()); return { x: (NOSTRIL.x - r.x) / r.w * 600, y: (NOSTRIL.y - r.y) / r.h * 800 }; };

    const draw = () => {
      const o = off();
      const flare = state === 'in' ? 1 + Math.min(0.12, dig / need * 0.12) + Math.sin(G.t * 30) * 0.01 : 1;
      const sneezing = G.result === 'lose';
      const preSneeze = !G.result && state !== 'grab' && G.left < 1.4;
      const sq = sneezing ? Math.max(0, 1 - resultT * 3) * 0.1 : preSneeze ? (1.4 - G.left) * 0.08 : 0;
      c.save();
      c.translate(300 + o.x, 420 + o.y);
      c.scale(flare + sq, flare + sq * 0.6);
      c.translate(-300, -420);
      if (G.result === 'win') {
        const z = zoomK();
        const r = zoomRect(z);
        c.drawImage(P.face, r.x, r.y, r.w, r.h, 0, 0, 600, 800);
        if (z < 0.3) { c.globalAlpha = 1 - z / 0.3; c.drawImage(BG, 0, 0); }
      } else c.drawImage(BG, -20, -20, 640, 840);
      c.restore();
      const h = hole();
      // target hint
      if (state === 'out' && !G.result) {
        // a banana tip pokes out of the target nostril (only the part below the rim shows)
        c.save();
        c.beginPath(); c.rect(0, h.y - 4, 600, 400); c.clip();
        banana(c, h.x + Math.sin(G.t * 7) * 6, h.y + 14 + Math.sin(G.t * 11) * 5, 1.5, Math.PI / 2 + 0.35 + Math.sin(G.t * 5) * 0.15);
        c.restore();
        G.text('여기!', h.x, h.y - 80 + Math.sin(G.t * 9) * 5, { size: 32, color: '#ffd400' });
      }
      // finger
      if (state === 'in') {
        // part of the finger outside the hole drawn normally, the part inside as a dark silhouette
        c.save();
        c.beginPath();
        c.rect(0, 0, 600, 800);
        c.ellipse(h.x, h.y, HRX * 0.98, HRY * 1.05, 0, 0, Math.PI * 2);
        c.clip('evenodd');
        drawFinger(tip.x, tip.y, false);
        c.restore();
        c.save();
        c.beginPath(); c.ellipse(h.x, h.y, HRX * 0.98, HRY * 1.05, 0, 0, Math.PI * 2); c.clip();
        c.globalAlpha = 0.75;
        drawFinger(tip.x, tip.y, true);
        c.restore();
        const prog = Math.min(1, dig / need);
        c.save();
        c.lineWidth = 12;
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.beginPath(); c.arc(h.x, h.y - 130, 30, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = '#ffd400';
        c.beginPath(); c.arc(h.x, h.y - 130, 30, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); c.stroke();
        c.restore();
      } else if (G.result === 'win') {
        for (const f of fallers) banana(c, f.x, f.y, 1.25, f.r);
      } else if (state === 'grab') {
        // the caught banana dangles from the fingertip
        banana(c, tip.x - 6, tip.y + 4, 1.4, 0.4 + Math.sin(G.t * 9) * 0.2);
        drawFinger(tip.x, tip.y, false);
        if (!G.result) G.text('↓ 당겨!', 300, 250 + Math.sin(G.t * 12) * 8, { size: 64, color: '#ffd400' });
      } else if (G.pointer.down && !G.result) {
        drawFinger(tip.x, tip.y, false);
      } else if (!G.result) {
        drawFinger(300 + Math.sin(G.t * 3) * 20, 700, false);
      }

      if (sneezing) {
        if (resultT < 0.12) { c.fillStyle = '#fff'; c.fillRect(0, 0, 600, 800); }
        for (const f of flying) banana(c, f.x, f.y, f.s, f.r);
        for (const s of splats) {
          // banana stuck on the lens + a juice smear
          const g = c.createRadialGradient(s.x, s.y, 4, s.x, s.y, s.r * 1.3);
          g.addColorStop(0, 'rgba(255,236,140,0.9)');
          g.addColorStop(1, 'rgba(255,236,140,0)');
          c.fillStyle = g;
          c.beginPath(); c.arc(s.x, s.y, s.r * 1.3, 0, Math.PI * 2); c.fill();
          banana(c, s.x, s.y, s.r / 26, s.seed);
        }
      }
    };

    const sneeze = () => {
      G.sfx('sneeze');
      G.sfx('splat', { vol: 0.7 });
      G.shake(22, 0.5);
      for (const hh of HOLES) {
        for (let i = 0; i < 16; i++) {
          const a = G.rand(0, Math.PI * 2);
          flying.push({ x: hh.x, y: hh.y, vx: Math.cos(a) * G.rand(200, 600), vy: Math.sin(a) * G.rand(200, 600) - 100, s: 0.6, r: a, vr: G.rand(-8, 8), life: G.rand(0.15, 0.5) });
        }
      }
    };

    return {
      down(p) {
        last = { x: p.x, y: p.y };
        if (state === 'out') {
          tip = { x: p.x, y: p.y };
          if (inHole(p, 1.5)) { state = 'in'; tip = clampHole(p); G.sfx('shared:squeeze', { vol: 0.6 }); }
        } else if (state === 'grab') {
          tip = { x: p.x, y: p.y };
        }
      },
      move(p) {
        if (!p.down) return;
        const d = last ? Math.min(80, Math.hypot(p.x - last.x, p.y - last.y)) : 0;
        last = { x: p.x, y: p.y };
        if (state === 'out') {
          tip = { x: p.x, y: p.y };
          if (inHole(p, 1.5)) { state = 'in'; tip = clampHole(p); G.sfx('shared:squeeze', { vol: 0.6 }); }
        } else if (state === 'in') {
          tip = clampHole(p);
          dig += d;
          if (Math.random() < d / 120) {
            if (Math.random() < 0.3) G.sfx('squeak', { vol: 0.3, rate: G.rand(0.8, 1.5) });
          }
          if (dig >= need) {
            state = 'grab';
            G.sfx('pop');
          }
        } else if (state === 'grab') {
          tip = { x: p.x, y: p.y };
          const h = hole();
          pulled = Math.max(pulled, tip.y - h.y - 30); // pull downward, out of the nose
          if (pulled >= PULL) {
            G.win();
            G.sfx('slurp');
            G.sfx('sparkle', { vol: 0.6 });
          }
        }
      },
      up() {
        if (state === 'in') state = 'out';
      },
      update(dt) {
        if (G.level === 3) {
          twitch.next -= dt * G.speed;
          if (twitch.next <= 0) { twitch.next = G.rand(0.5, 1.0); twitch.vx = G.rand(-1, 1) * 70; G.sfx('squeak', { vol: 0.2, rate: 0.6 }); }
          twitch.x += (twitch.vx - twitch.x) * Math.min(1, dt * 18);
          twitch.vx *= Math.pow(0.02, dt);
          twitch.y = Math.abs(twitch.x) * -0.2;
          if (state === 'in') tip = clampHole(tip);
        }
        if (G.result) resultT += dt;
        if (G.result === 'win') {
          // zoom out to the whole face; bananas keep pouring out of the nostril and pile up at the bottom
          pourT -= dt;
          if (pourT <= 0 && resultT > 0.15) {
            pourT = 0.03;
            const n = nostrilOnScreen();
            fallers.push({ x: n.x, y: n.y, vx: G.rand(-160, 160), vy: G.rand(-60, 120), r: G.rand(0, 6.28), vr: G.rand(-10, 10), rest: false });
            if (fallers.length % 4 === 0) G.sfx('pop', { vol: 0.25, rate: G.rand(0.9, 1.5) });
          }
          for (const f of fallers) {
            if (f.rest) continue;
            f.vy += 1700 * dt;
            f.x = G.clamp(f.x + f.vx * dt, 20, 580);
            f.y += f.vy * dt;
            f.r += f.vr * dt;
            const b = G.clamp(Math.floor(f.x / 40), 0, 15);
            const floor = 790 - pile[b];
            if (f.y >= floor) {
              f.y = floor;
              if (f.vy > 500) { f.vy *= -0.3; f.vx *= 0.5; } else { f.rest = true; f.vr = 0; pile[b] += 18; }
            }
          }
        }
        if (G.result === 'lose') {
          for (const f of flying) {
            if (f.life > 0) {
              f.x += f.vx * dt; f.y += f.vy * dt; f.s += dt * 6; f.r += f.vr * dt; f.life -= dt;
              if (f.life <= 0) splats.push({ x: f.x, y: f.y, r: 30 + f.s * 14, seed: f.r });
            }
          }
          flying = flying.filter((f) => f.life > 0);
        }
        draw();
      },
      timeout(r) { if (r === 'lose') sneeze(); },
    };
  },
};
