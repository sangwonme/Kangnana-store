// 19 모두 잡아라! — 바나나 주변 초파리를 탭해서 잡는다. 마지막 한 마리는 날개 달린 미니 강나나. (픽셀)
// Pixel art is defined as string rows; one char = one palette color, '.' = transparent.
const PAL = { k: '#1b1306', y: '#ffd400', Y: '#c9a200', b: '#6b3e14', w: '#f4f4f4', r: '#ff5a5f', s: '#f1b48a', g: '#7a8c99', G: '#2d3a45', e: '#ff2d2d' };
const BANANA = [
  '..........bb....',
  '.........kbbk...',
  '........kyyk....',
  '.......kyyyk....',
  '......kyyyYk....',
  '.....kyyyyYk....',
  '...kkyyyyyYk....',
  '.kkyyyyyyYk.....',
  'kyyyyyyyYYk.....',
  'kYyyyyyYYk......',
  '.kYYYYYYk.......',
  '..kkkkkk........',
];
const FLY = [['.ww.ww.', '.wwkww.', '..GGG..', '.GeGeG.', '..GGG..', '...G...'],
  ['.......', 'wwwkwww', '..GGG..', '.GeGeG.', '..GGG..', '...G...']];
const NANA = [['ww...ww', 'www.www', '..kbk..', '.kyyyk.', '.ksksk.', '.kyyyk.', '..kyk..', '..k.k..'],
  ['.......', 'wwwbwww', '.wkyk w', '.kyyyk.', '.ksksk.', '.kyyyk.', '..kyk..', '..k.k..']];
const SPLAT = ['y.y..y', '.yyyy.', 'yyyyyy', '.yyyy.', 'y..y.y'];

function sprite(rows, px) {
  const c = document.createElement('canvas');
  c.width = rows[0].length * px;
  c.height = rows.length * px;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i * px, j * px, px, px); } }));
  return c;
}
let S = null;

export default {
  id: 'swat', no: 19, cmd: '모두 잡아라!', hint: '탭 · 한 마리도 남김없이', bgm: 'bgm_chip', layer: '2d',
  duration: 5, timeout: 'lose', sounds: ['c8_squish', 'c8_hit', 'c8_coin'],

  load() {
    S = { banana: sprite(BANANA, 22), fly: FLY.map((f) => sprite(f, 9)), nana: NANA.map((f) => sprite(f, 10)), splat: sprite(SPLAT, 10) };
  },

  create(G) {
    const c = G.c2d;
    const n = [3, 4, 5][G.level - 1];
    const flies = [];
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      flies.push({ x: G.rand(80, 520), y: G.rand(160, 560), a: G.rand(0, 6.28), sp: G.rand(120, 190) * (0.8 + 0.2 * G.level),
        turn: G.rand(-3, 3), alive: true, nana: last, splatT: 0 });
    }
    let misses = [];

    const draw = () => {
      // green-ish handheld screen
      c.fillStyle = '#c5d86d';
      c.fillRect(0, 0, G.W, G.H);
      c.fillStyle = '#b3c95a';
      for (let y = 0; y < G.H; y += 8) c.fillRect(0, y, G.W, 2);
      c.imageSmoothingEnabled = false;
      c.drawImage(S.banana, G.W / 2 - S.banana.width / 2, 500);
      for (const m of misses) G.text('헛손질', m.x, m.y - m.t * 40, { size: 30, color: '#fff', alpha: 1 - m.t });
      const frame = Math.floor(G.t * 16) % 2;
      for (const f of flies) {
        if (f.alive) {
          const img = f.nana ? S.nana[frame] : S.fly[frame];
          c.drawImage(img, f.x - img.width / 2, f.y - img.height / 2);
        } else {
          c.drawImage(S.splat, f.x - 30, f.y - 25);
          if (f.nana) G.text('찍!', f.x, f.y - 60 - f.splatT * 30, { size: 44, color: '#ffd400' });
        }
      }
      if (G.result === 'win') G.text('박멸!', 300, 200, { size: 90, color: '#ffd400' });
      if (G.result === 'lose') G.text('바나나 점령당함', 300, 200, { size: 54, color: '#ff5a5f' });
    };

    return {
      down(p) {
        let hit = null;
        for (const f of flies) if (f.alive && Math.hypot(f.x - p.x, f.y - p.y) < (f.nana ? 60 : 55)) { hit = f; break; }
        if (!hit) { misses.push({ x: p.x, y: p.y, t: 0 }); G.sfx('c8_hit', { vol: 0.4 }); return; }
        hit.alive = false;
        G.sfx(hit.nana ? 'c8_squish' : 'c8_coin');
        if (hit.nana) G.caption('…미안 강나나');
        if (flies.every((f) => !f.alive)) G.win();
      },
      update(dt) {
        for (const f of flies) {
          if (!f.alive) { f.splatT += dt; continue; }
          if (G.result === 'lose') { // they swarm the banana
            f.x += (300 + Math.cos(G.t * 9 + f.a) * 60 - f.x) * dt * 4;
            f.y += (560 + Math.sin(G.t * 9 + f.a) * 40 - f.y) * dt * 4;
            continue;
          }
          f.turn += G.rand(-8, 8) * dt;
          f.turn = G.clamp(f.turn, -4, 4);
          f.a += f.turn * dt;
          const sp = f.sp * G.speed * (G.level === 3 ? 1 + 0.5 * Math.sin(G.t * 7 + f.a) : 1);
          f.x += Math.cos(f.a) * sp * dt;
          f.y += Math.sin(f.a) * sp * dt;
          if (f.x < 40 || f.x > 560) { f.a = Math.PI - f.a; f.x = G.clamp(f.x, 40, 560); }
          if (f.y < 120 || f.y > 640) { f.a = -f.a; f.y = G.clamp(f.y, 120, 640); }
        }
        misses = misses.filter((m) => (m.t += dt * 2) < 1);
        draw();
      },
    };
  },
};
