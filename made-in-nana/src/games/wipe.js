// 04 닦아라! — 탈 속 얼굴에 달라붙은 세균(지원 얼굴)들을 수건으로 문질러 전부 닦아낸다. 성공하면 행복한 강나나 사진. (실사)
// Background = face_close.jpg crop (precomputed in load). Germs = assets/img/germ_0..11.png. Face hole ellipse in logical coords below.

const SRC = { x: 130, y: 170, w: 640, h: 853 };
const FACE = { x: 307, y: 429, rx: 131, ry: 161 };
const HAPPY = { x: 97, y: 0, w: 768, h: 1024, face: { x: 286, y: 482, rx: 110, ry: 125 } }; // nanahappy.jpg cover crop + face hole
let BG = null;
let P = null; // towel (+ soaked copy), happy photo, germ sprites

export default {
  id: 'wipe', no: 4, cmd: '닦아라!', hint: '문질러!', bgm: 'bgm_silly', layer: '2d',
  duration: 5, timeout: 'lose', sounds: ['squeak', 'sparkle', 'pop'],

  async load(A) {
    const [img, towel, happy, ...germs] = await Promise.all([A.img('face_close.jpg'), A.img('assets/photo/wipe_towel.png'),
      A.img('nanahappy.jpg'), ...Array.from({ length: 12 }, (_, i) => A.img(`germ_${i}.png`))]);
    // banana-sweat soaked copy of the towel (blended in as it soaks)
    const soaked = document.createElement('canvas');
    soaked.width = towel.width; soaked.height = towel.height;
    const sx = soaked.getContext('2d');
    sx.drawImage(towel, 0, 0);
    sx.globalCompositeOperation = 'source-atop';
    sx.fillStyle = 'rgba(255,205,0,0.55)';
    sx.fillRect(0, 0, towel.width, towel.height);
    P = { towel, soaked, happy, germs };
    BG = document.createElement('canvas');
    BG.width = 600; BG.height = 800;
    const x = BG.getContext('2d');
    x.drawImage(img, SRC.x, SRC.y, SRC.w, SRC.h, 0, 0, 600, 800);
    // flushed, hot face
    const g = x.createRadialGradient(FACE.x, FACE.y + 30, 20, FACE.x, FACE.y, FACE.ry);
    g.addColorStop(0, 'rgba(255,60,40,0.22)');
    g.addColorStop(1, 'rgba(255,60,40,0)');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(FACE.x, FACE.y, FACE.rx, FACE.ry, 0, 0, Math.PI * 2); x.fill();
  },

  create(G) {
    const c = G.c2d;
    const count = [6, 9, 8][G.level - 1];
    const drops = []; // germs stuck on the face
    const bag = [...Array(12).keys()].sort(() => Math.random() - 0.5);
    const spawn = (grow) => {
      const a = G.rand(0, Math.PI * 2);
      const r = Math.sqrt(G.rand(0.05, 1)) * 0.78;
      drops.push({ x: FACE.x + Math.cos(a) * FACE.rx * r, y: FACE.y + Math.sin(a) * FACE.ry * r, s: G.rand(84, 108), wet: 1,
        img: P.germs[bag[drops.length % 12]], ph: G.rand(0, 6.28), rot: G.rand(-0.6, 0.6), grow: grow ? 0 : 1, jig: 0 });
    };
    for (let i = 0; i < count; i++) spawn(false);
    let regrow = 1.0;
    let towel = null; // {x, y, rot}
    let last = null;
    let sparkles = [];
    let flyoff = []; // germs knocked off the face
    let resultT = 0;
    let rubSnd = 0;

    const drawGerm = (d, x, y, k, rot, alpha = 1) => {
      const w = d.s * k;
      const h = w * d.img.height / d.img.width;
      c.save();
      c.globalAlpha = alpha;
      c.translate(x, y);
      c.rotate(rot);
      c.drawImage(d.img, -w / 2, -h / 2, w, h);
      c.restore();
    };
    const drawDrop = (d) => {
      const breathe = 1 + Math.sin(G.t * 4 + d.ph) * 0.05;
      const k = Math.min(1, d.grow) * (0.55 + 0.45 * d.wet) * breathe;
      const j = d.jig > 0 ? d.jig * 6 : 0;
      drawGerm(d, d.x + G.rand(-j, j), d.y + G.rand(-j, j), k, d.rot + Math.sin(G.t * 3 + d.ph) * 0.12, Math.min(1, 0.35 + d.wet));
    };

    const drawTowel = (t) => {
      const w = 190;
      const h = w * P.towel.height / P.towel.width;
      c.save();
      c.translate(t.x, t.y);
      c.rotate(t.rot + Math.sin(G.t * 20) * 0.03);
      c.shadowColor = 'rgba(0,0,0,0.35)';
      c.shadowBlur = 12;
      c.shadowOffsetY = 6;
      c.drawImage(P.towel, -w / 2, -h / 2, w, h);
      c.shadowColor = 'transparent';
      c.globalAlpha = Math.min(1, t.soak || 0);
      c.drawImage(P.soaked, -w / 2, -h / 2, w, h);
      c.restore();
    };

    const star = (x, y, r, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      c.beginPath();
      for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.3 : r; const a = i * Math.PI / 4; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffd400'; c.stroke();
      c.restore();
    };

    // fail: the germs multiply and spread over his whole face and costume
    let swarm = [];
    let swarmT = 0;
    const multiply = (dt) => {
      swarmT -= dt;
      while (swarmT <= 0 && swarm.length < 90) {
        swarmT += 0.014;
        const nearFace = Math.random() < 0.45;
        const a = G.rand(0, Math.PI * 2);
        const r = Math.sqrt(Math.random());
        swarm.push({ x: nearFace ? FACE.x + Math.cos(a) * FACE.rx * r : G.rand(30, 570), y: nearFace ? FACE.y + Math.sin(a) * FACE.ry * r : G.rand(40, 790),
          s: G.rand(70, 135), img: G.pick(P.germs), ph: G.rand(0, 6.28), rot: G.rand(-0.8, 0.8), t: 0 });
        if (swarm.length % 6 === 0) G.sfx('pop', { vol: 0.3, rate: G.rand(0.7, 1.6) });
      }
    };

    const zoomed = (img, sx, sy, sw, sh, cx, cy, z) => {
      c.save();
      c.translate(cx, cy);
      c.scale(z, z);
      c.translate(-cx, -cy);
      c.drawImage(img, sx, sy, sw, sh, 0, 0, 600, 800);
      c.restore();
    };

    const draw = () => {
      if (G.result === 'win') {
        // punchy cut: snap-zoom into the clean face + white flash, then the happy photo pops in and bounces into place
        if (resultT < 0.16) {
          const k = resultT / 0.16;
          zoomed(BG, 0, 0, 600, 800, FACE.x, FACE.y, 1 + k * k * 0.9);
          c.fillStyle = `rgba(255,255,255,${k})`;
          c.fillRect(0, 0, 600, 800);
        } else {
          const u = resultT - 0.16;
          const F = HAPPY.face;
          zoomed(P.happy, HAPPY.x, HAPPY.y, HAPPY.w, HAPPY.h, F.x, F.y, 1.1 + 0.4 * Math.exp(-u * 8) * Math.cos(u * 20));
          if (u < 0.2) { c.fillStyle = `rgba(255,255,255,${1 - u / 0.2})`; c.fillRect(0, 0, 600, 800); }
          // shine sweep across the happy face + sparkles
          c.save();
          c.beginPath(); c.ellipse(F.x, F.y, F.rx, F.ry, 0, 0, Math.PI * 2); c.clip();
          const sx = -200 + u * 1000;
          const g = c.createLinearGradient(sx - 80, 0, sx + 80, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g;
          c.save(); c.translate(sx, F.y); c.rotate(0.4); c.fillRect(-80, -400, 160, 800); c.restore();
          c.restore();
          for (let i = 0; i < 6; i++) star(F.x + Math.cos(i * 1.1 + u * 2) * 170, F.y + Math.sin(i * 1.7 + u) * 190, 18 + 8 * Math.sin(u * 12 + i), u * 3 + i);
        }
        return;
      }
      c.drawImage(BG, 0, 0);
      for (const d of drops) if (d.wet > 0) drawDrop(d);
      for (const f of flyoff) drawGerm(f.d, f.x, f.y, 0.6, f.rot, Math.max(0, 1 - f.t));
      for (const s of sparkles) star(s.x, s.y, 22 * (1 - s.t), s.t * 4);
      if (G.result === 'lose') {
        for (const g of swarm) {
          const k = g.t < 0.15 ? (g.t / 0.15) * 1.2 : 1 + 0.2 * Math.exp(-(g.t - 0.15) * 10);
          drawGerm(g, g.x + Math.sin(G.t * 9 + g.ph) * 4, g.y + Math.cos(G.t * 7 + g.ph) * 4, k * (1 + Math.sin(G.t * 6 + g.ph) * 0.06), g.rot + Math.sin(G.t * 5 + g.ph) * 0.25);
        }
      }
      if (towel && !G.result) drawTowel(towel);
    };

    const check = () => {
      if (!G.result && drops.every((d) => d.wet <= 0)) {
        G.win();
        G.sfx('squeak', { rate: 1.6 });
        G.sfx('sparkle');
      }
    };

    return {
      down(p) { towel = { x: p.x, y: p.y, rot: 0, soak: towel?.soak || 0 }; last = { x: p.x, y: p.y }; },
      move(p) {
        if (!p.down || !towel) return;
        const d = Math.min(90, Math.hypot(p.x - last.x, p.y - last.y));
        towel.rot = G.clamp((p.x - last.x) * 0.02, -0.5, 0.5);
        towel.x = p.x; towel.y = p.y;
        last = { x: p.x, y: p.y };
        let rubbed = false;
        for (const dr of drops) {
          if (dr.wet <= 0 || Math.hypot(dr.x - p.x, dr.y - p.y) > 90) continue;
          dr.wet -= d / 150;
          dr.jig = 0.15;
          rubbed = true;
          if (dr.wet <= 0) {
            towel.soak += 0.12;
            sparkles.push({ x: dr.x, y: dr.y, t: 0 });
            const a = Math.atan2(dr.y - FACE.y, dr.x - FACE.x);
            flyoff.push({ d: dr, x: dr.x, y: dr.y, vx: Math.cos(a) * 500, vy: Math.sin(a) * 300 - 300, rot: dr.rot, vr: G.rand(-12, 12), t: 0 });
            G.sfx('pop', { vol: 0.4, rate: G.rand(1.2, 1.6) });
          }
        }
        if (rubbed && (rubSnd -= d) < 0) { rubSnd = 140; G.sfx('squeak', { vol: 0.35, rate: G.rand(0.9, 1.4) }); }
        check();
      },
      up() { towel = null; },
      update(dt) {
        for (const d of drops) {
          if (d.wet <= 0) continue;
          d.grow = Math.min(1, d.grow + dt * 3);
          d.jig = Math.max(0, d.jig - dt);
        }
        flyoff = flyoff.filter((f) => { f.t += dt * 1.6; f.vy += 1400 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; return f.t < 1; });
        if (G.level === 3 && !G.result && G.left > 1.0) {
          regrow -= dt * G.speed;
          if (regrow <= 0) { regrow = 1.0; spawn(true); G.sfx('pop', { vol: 0.3, rate: 0.7 }); }
        }
        sparkles = sparkles.filter((s) => (s.t += dt * 2.5) < 1);
        if (G.result) resultT += dt;
        if (G.result === 'lose') {
          multiply(dt);
          for (const g of swarm) g.t += dt;
          for (const d of drops) d.jig = 0.3; // the old ones jitter with excitement
        }
        draw();
      },
      timeout(r) {
        if (r !== 'lose') return;
        G.sfx('squeak', { rate: 0.7 });
        G.sfx('pop', { rate: 0.6 });
      },
    };
  },
};
