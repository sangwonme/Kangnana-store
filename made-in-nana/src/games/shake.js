// 16 털어라! — 크레인 갈고리에 거꾸로 매단 강나나를 좌우로 흔들어 탈 속 물건을 목표 개수만큼 털어낸다. 마지막엔 동우가 떨어진다. (실사 콜라주)
// suit.png hangs upside down by the ankles from a crane hook (photo) that follows the pointer's x; it swings as a pendulum.
// Each left-right reversal = one shake. Items are photo cutouts (assets/photo/shake_*.png, duck.png).

const INK = '#1b1306';
const FLOOR = 700;
const AY = 96; // anchor (hook) height
const SS = 0.44; // suit.png scale (medium, hangs high so the floor pile stays visible)
const ANK = { x: 388, y: 820 }; // ankles in suit.png = pivot
const HOLE = { y: (ANK.y - 150) * SS }; // where things fall out (the face hole), pivot-local, body hangs along +y
let DW = null;
let IMG = null;

const ITEMS = {
  coin: { w: 58, big: false, name: '동전', file: 'shake_coin' },
  sock: { w: 120, big: false, name: '양말 한 짝', file: 'shake_sock' },
  remote: { w: 118, big: true, name: '리모컨', file: 'shake_remote' },
  tangerine: { w: 74, big: true, name: '귤', file: 'shake_tangerine' },
  duck: { w: 84, big: false, name: '고무오리', file: 'duck' },
};

export default {
  id: 'shake', no: 16, cmd: '털어라!', hint: '좌우로 마구 ↔', bgm: 'bgm_island', layer: '2d',
  duration: 5, timeout: 'lose', sounds: ['shake', 'drop', 'thud', 'c8_coin', 'boing', 'whoosh', 'pop', 'squeak'],

  async load(A) {
    const names = Object.keys(ITEMS);
    const imgs = await Promise.all([A.img('suit.png'), A.img('assets/photo/shake_hook.png'), ...names.map((k) => A.img(`assets/photo/${ITEMS[k].file}.png`))]);
    IMG = { suit: imgs[0], hook: imgs[1] };
    names.forEach((k, i) => { const im = imgs[i + 2]; ITEMS[k].img = im; ITEMS[k].h = ITEMS[k].w * im.height / im.width; ITEMS[k].r = ITEMS[k].h / 2; });
    // dongwoo.png ships with an opaque white background: flood-fill it away from the borders (keeps the white shoes)
    const img = await A.img('dongwoo.png');
    DW = document.createElement('canvas');
    const W = (DW.width = img.width);
    const H = (DW.height = img.height);
    const x = DW.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, W, H);
    const p = d.data;
    const seen = new Uint8Array(W * H);
    const st = [];
    for (let i = 0; i < W; i++) st.push(i, (H - 1) * W + i);
    for (let j = 0; j < H; j++) st.push(j * W, j * W + W - 1);
    while (st.length) {
      const i = st.pop();
      if (seen[i]) continue;
      seen[i] = 1;
      const o = i * 4;
      if (Math.min(p[o], p[o + 1], p[o + 2]) < 240) continue;
      p[o + 3] = 0;
      const cx = i % W;
      if (cx > 0) st.push(i - 1);
      if (cx < W - 1) st.push(i + 1);
      if (i >= W) st.push(i - W);
      if (i < W * (H - 1)) st.push(i + W);
    }
    x.putImageData(d, 0, 0);
  },

  create(G) {
    const c = G.c2d;
    const order = G.level === 1 ? ['coin', 'sock', 'tangerine'] : G.level === 2 ? ['coin', 'remote', 'sock', 'tangerine']
      : ['coin', 'remote', 'sock', 'tangerine', 'duck'];
    const target = order.length;
    let next = 0; // next item index inside the costume
    let energy = 0;
    const per = (k) => (G.level === 3 && ITEMS[k].big ? 4 : 3);
    let ax = 300;
    let tx = 300;
    let vax = 0;
    let th = 0;
    let om = 0;
    let lastX = null;
    let ext = null; // last extreme x
    let dir = 0;
    let shakes = 0;
    let shakeSnd = 0;
    const floor = []; // {k, x, y, vx, vy, rot, vr, rest}
    let resultT = 0;
    let dong = null;
    let squash = 0;

    const holeWorld = () => {
      const s = Math.sin(th), co = Math.cos(th);
      return { x: ax - s * HOLE.y, y: AY + co * HOLE.y };
    };

    const outline = (w = 8) => { c.lineWidth = w; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); };
    const drawItem = (k, x, y, rot, s = 1) => {
      const it = ITEMS[k];
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.scale(s, s);
      c.drawImage(it.img, -it.w / 2, -it.h / 2, it.w, it.h);
      c.restore();
    };

    const drawSuit = () => {
      c.save();
      c.translate(ax, AY);
      c.rotate(th);
      const sq = 1 + squash * 0.06;
      c.scale(1 / sq, sq);
      // stuck item poking out of the face hole (L3 big things), behind the body
      const k = order[next];
      if (k && ITEMS[k].big && G.level === 3 && energy > 0 && !G.result) {
        drawItem(k, Math.sin(G.t * 40) * 4, HOLE.y + 40 + energy * 8, 0.4 + Math.sin(G.t * 30) * 0.1, 0.9);
      }
      c.save();
      c.rotate(Math.PI);
      const im = IMG.suit;
      c.drawImage(im, -ANK.x * SS, -ANK.y * SS, im.width * SS, im.height * SS);
      c.restore();
      if (G.result === 'lose' && resultT > 0.4) {
        // dizzy swirl over the (upside-down) face
        c.save();
        c.translate(0, HOLE.y);
        c.rotate(resultT * 9);
        c.strokeStyle = 'rgba(255,255,255,0.9)';
        c.lineWidth = 5;
        c.beginPath();
        for (let a = 0; a < 12; a += 0.3) c.lineTo(Math.cos(a) * a * 2.6, Math.sin(a) * a * 2.6);
        c.stroke();
        c.restore();
      }
      c.restore();
      // crane hook holding the ankles (not rotated with the body, just swings a little)
      const hk = IMG.hook;
      const hw = 118;
      const hh = hw * hk.height / hk.width;
      c.save();
      c.translate(ax, AY + 18);
      c.rotate(th * 0.3);
      c.drawImage(hk, -hw / 2, -hh, hw, hh);
      c.restore();
    };

    const draw = () => {
      // background: rays + floor
      c.fillStyle = '#4fd0e8';
      c.fillRect(0, 0, 600, 800);
      c.save();
      c.translate(300, 420);
      c.rotate(G.t * 0.3);
      c.fillStyle = '#7fe0f0';
      for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); c.beginPath(); c.moveTo(0, 0); c.lineTo(800, -110); c.lineTo(800, 110); c.closePath(); c.fill(); }
      c.restore();
      c.fillStyle = '#ff8a3d';
      c.fillRect(0, FLOOR, 600, 100);
      c.beginPath(); c.moveTo(0, FLOOR); c.lineTo(600, FLOOR); outline(8);
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.beginPath(); c.ellipse(ax - Math.sin(th) * 200, FLOOR + 14, 110, 12, 0, 0, Math.PI * 2); c.fill();

      for (const f of floor) drawItem(f.k, f.x, f.y, f.rot);
      drawSuit();
      if (dong && dong.delay <= 0) {
        c.save();
        c.translate(dong.x, dong.y);
        c.rotate(dong.rot);
        c.drawImage(DW, -75, -82, 150, 164);
        c.restore();
      }

    };

    const dropItem = () => {
      const k = order[next++];
      const h = holeWorld();
      floor.push({ k, x: h.x, y: h.y, vx: -om * 300 + G.rand(-60, 60), vy: 100, rot: 0, vr: G.rand(-8, 8), rest: false });
      energy = 0;
      G.sfx(k === 'coin' ? 'c8_coin' : ITEMS[k].big ? 'pop' : 'drop', { rate: G.rand(0.9, 1.1) });
      if (ITEMS[k].big) G.caption(`${ITEMS[k].name}이 빠졌다!`, 0.8);
      if (next >= target && !G.result) {
        G.win();
        dong = { x: h.x, y: h.y, vy: 0, rot: Math.PI, landed: false, delay: 0.25 };
      }
    };

    const onShake = () => {
      shakes++;
      energy++;
      squash = 1;
      if ((shakeSnd -= 1) <= 0) { shakeSnd = 2; G.sfx('shake', { vol: 0.6, rate: G.rand(0.9, 1.2) }); }
      const k = order[next];
      if (k && energy >= per(k)) dropItem();
    };

    return {
      down(p) { tx = p.x; lastX = p.x; ext = p.x; dir = 0; },
      move(p) {
        if (!p.down) return;
        tx = p.x;
        if (lastX == null) { lastX = p.x; ext = p.x; }
        const d = Math.sign(p.x - lastX);
        if (d !== 0) {
          if (dir !== 0 && d !== dir) {
            if (Math.abs(lastX - ext) >= 45) onShake();
            ext = lastX;
          }
          if (dir === 0) ext = lastX;
          dir = d;
        }
        lastX = p.x;
      },
      up() { lastX = null; },
      update(dt) {
        // pendulum driven by the hands
        const prev = ax;
        const target2 = G.clamp(tx, 170, 430);
        ax += (target2 - ax) * Math.min(1, dt * 22);
        const v = (ax - prev) / Math.max(dt, 1e-3);
        const acc = (v - vax) / Math.max(dt, 1e-3);
        vax = v;
        om += (-28 * Math.sin(th) - 3.2 * om - acc * 0.0022) * dt;
        th = G.clamp(th + om * dt, -1.1, 1.1);
        squash = Math.max(0, squash - dt * 6);
        // falling items
        for (const f of floor) {
          if (f.rest) continue;
          f.vy += 1800 * dt;
          f.x = G.clamp(f.x + f.vx * dt, 40, 560);
          f.y += f.vy * dt;
          f.rot += f.vr * dt;
          const r = ITEMS[f.k].r;
          if (f.y > FLOOR - r * 0.7) {
            f.y = FLOOR - r * 0.7;
            if (f.vy > 300) { f.vy *= -0.35; f.vx *= 0.6; f.vr *= 0.5; } else { f.rest = true; f.rot = f.k === 'coin' ? 0 : f.rot % (Math.PI * 2); }
          }
        }
        if (G.result) resultT += dt;
        if (dong) {
          if (dong.delay > 0) {
            dong.delay -= dt;
            const h = holeWorld();
            dong.x = h.x; dong.y = h.y - 60;
          } else if (!dong.landed) {
            dong.vy += 2000 * dt;
            dong.y += dong.vy * dt;
            if (dong.y > FLOOR - 78) {
              dong.y = FLOOR - 78;
              dong.landed = true;
              G.sfx('thud');
              G.sfx('boing', { vol: 0.5 });
              G.shake(10, 0.25);
            }
          } else dong.rot = Math.PI + Math.sin(resultT * 30) * 0.05; // legs wiggle
        }
        if (G.result === 'lose') {
          // everything gets slurped back in
          const h = holeWorld();
          for (const f of floor) {
            f.rest = true;
            f.x += (h.x - f.x) * Math.min(1, dt * 7);
            f.y += (h.y - f.y) * Math.min(1, dt * 7);
            f.rot += dt * 12;
          }
          th = Math.sin(resultT * 8) * 0.1 * Math.max(0, 1 - resultT);
        }
        for (let i = floor.length - 1; i >= 0; i--) {
          const f = floor[i];
          if (G.result === 'lose' && Math.hypot(f.x - holeWorld().x, f.y - holeWorld().y) < 20) floor.splice(i, 1);
        }
        draw();
      },
      timeout(r) {
        if (r !== 'lose') return;
        G.sfx('whoosh', { rate: 0.7 });
        setTimeout(() => G.sfx('squeak', { rate: 0.8 }), 450);
      },
    };
  },
};
