// 12 [BOSS] 쳐내라! — 주문 폭주. 영수증의 메뉴를 순서대로 버튼으로 낸다. 손님은 전원 강나나(3D·실사·픽셀·다크).
// 마지막 손님 동우 차례가 되면 영업 끝: 픽업대에 강나나가 직접 올라온다. 3번 틀리면 실패. (PS1 주방)
import { toPS1, ps1Material } from '../../../shared/lib/ps1.js';
import { fitHeight } from '../core/assets.js';

let IMG = {}; // suit.png, suit_head.png
const MENU = ['milk', 'taco', 'choco'];
const NAME = { milk: '바나나우유', taco: '타코', choco: '초코바나나' };
const PIX = { k: '#1b1306', y: '#ffd400', Y: '#c9a200', b: '#6b3e14', w: '#f4f4f4', s: '#f1b48a', h: '#2a1a10', e: '#111' };
const PIXNANA = [
  '.....bb.....',
  '....kyyk....',
  '...kyyyyk...',
  '...kyyyyk...',
  '..kyhhhhyk..',
  '..kyssssyk..',
  '..kysesesyk.',
  '..kyssssyk..',
  '..kysskssyk.',
  'wwkyyssyykww',
  'w.kyyyyyyk.w',
  '..kyyyyyyk..',
  '..kyyyyyYk..',
  '..kyyyyyYk..',
  '...kyyyYk...',
  '...kkbbkk...',
  '...ww..ww...',
  '...ww..ww...',
  '..www..www..',
];

async function addKitchen(G) {
  const { THREE } = G;
  const { root } = await G.A.instance('kitchen');
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  root.traverse((o) => {
    if (o.name.startsWith('col_')) { o.visible = false; return; }
    if (o.isMesh) {
      box.setFromObject(o).getSize(size);
      o.material = toPS1(o.material, { affine: Math.max(size.x, size.y, size.z) < 0.9 });
    }
  });
  G.scene.add(root);
  return root;
}

function pixelCanvas(rows, px) {
  const c = document.createElement('canvas');
  c.width = rows[0].length * px; c.height = rows.length * px;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (PIX[ch]) { x.fillStyle = PIX[ch]; x.fillRect(i * px, j * px, px, px); } }));
  return c;
}

// ---- 2D menu icons: real photo cutouts (assets/photo/rush_*.png), drawn fallback if missing ----
function icon(c, kind, x, y, s) {
  const im = IMG[kind];
  if (!im) { iconDrawn(c, kind, x, y, s); return; }
  const k = (s * 1.05) / Math.max(im.naturalWidth, im.naturalHeight);
  const w = im.naturalWidth * k, h = im.naturalHeight * k;
  c.save();
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
  c.translate(x, y);
  if (w < h * 0.5) c.rotate(0.55); // skinny choco-banana stick: tilt it so it reads at icon size
  c.drawImage(im, -w / 2, -h / 2, w, h);
  c.restore();
}
function iconDrawn(c, kind, x, y, s) {
  c.save();
  c.translate(x, y);
  c.scale(s / 100, s / 100);
  c.lineWidth = 6; c.strokeStyle = '#1b1306'; c.lineJoin = 'round';
  if (kind === 'milk') { // the round banana-milk jar
    c.fillStyle = '#ffe14a';
    c.beginPath(); c.ellipse(0, 12, 34, 36, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#ffe14a'; c.fillRect(-14, -36, 28, 20); c.strokeRect(-14, -36, 28, 20);
    c.fillStyle = '#3aa05a'; c.fillRect(-17, -46, 34, 12); c.strokeRect(-17, -46, 34, 12);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(-14, 4, 7, 14, -0.3, 0, 7); c.fill();
  } else if (kind === 'taco') {
    c.fillStyle = '#7ac94a';
    c.beginPath(); c.arc(0, 16, 40, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    c.fillStyle = '#e04a3a';
    for (const dx of [-18, 0, 18]) { c.beginPath(); c.arc(dx, -6, 8, 0, 7); c.fill(); }
    c.fillStyle = '#f0c060';
    c.beginPath(); c.arc(0, 16, 44, Math.PI, 0); c.lineTo(38, 16); c.arc(0, 16, 30, 0, Math.PI, true); c.closePath(); c.fill(); c.stroke();
  } else if (kind === 'choco') {
    c.fillStyle = '#d8b080'; c.fillRect(-4, 18, 8, 34); c.strokeRect(-4, 18, 8, 34);
    c.fillStyle = '#ffe14a';
    c.beginPath(); c.ellipse(0, -6, 16, 32, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#5a2c12';
    c.beginPath(); c.ellipse(0, -16, 16, 22, 0, Math.PI, 0); c.lineTo(16, 0); c.quadraticCurveTo(8, 8, 0, 0); c.quadraticCurveTo(-8, 8, -16, 0); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ff7ab0';
    for (const [dx, dy] of [[-6, -22], [5, -12], [-2, -30], [7, -26]]) c.fillRect(dx, dy, 4, 4);
  }
  c.restore();
}

export default {
  id: 'rush', no: 12, cmd: '쳐내라!', hint: '영수증 순서대로 탭!', bgm: 'bgm_boss', layer: 'both',
  boss: true, duration: 32, timeout: 'lose',
  sounds: ['tap', 'pop', 'sparkle', 'bonk', 'whoosh', 'shared:printer_receipt', 'shared:service_bell', 'shared:wrong_buzz'],

  async load(A) {
    await Promise.all(['kitchen', 'gangnana', 'gangnana_cute', 'darknana', 'dongwoo'].map((n) => A.glb(n)));
    IMG.suit = await A.img('suit.png').catch(() => null);
    IMG.head = await A.img('suit_head.png').catch(() => null);
    await Promise.all(MENU.map(async (k) => { IMG[k] = await A.img(`assets/photo/rush_${k}.png`).catch(() => null); }));
  },

  create(G) {
    const { THREE, scene, camera, A } = G;
    G.usePS1(240);
    G.showTimer = false;
    scene.background = new THREE.Color('#1a1614');
    scene.add(new THREE.HemisphereLight('#fff4e0', '#3a2a20', 1.8));
    const key = new THREE.DirectionalLight('#fff0d8', 1.2);
    key.position.set(-1, 3, -2);
    scene.add(key);
    const fill = new THREE.PointLight('#ffd8a0', 3, 5, 1.4);
    fill.position.set(0, 2.2, 1.2);
    scene.add(fill);
    addKitchen(G);

    // looking out from the kitchen over the pickup counter into the hall
    camera.position.set(0, 1.95, -0.8);
    camera.lookAt(0, 1.0, 1.4);
    camera.updateMatrixWorld();
    const COUNTER_Y = 1.03;

    // ---- customers ----
    const L = G.level;
    const sizes = [[1, 1, 2, 2, 3], [1, 2, 2, 3, 3, 3], [2, 2, 3, 3, 3, 3]][L - 1];
    const styles = ['gangnana', 'suit', 'gangnana_cute', 'pixel', 'darknana', 'suit_big'];
    const customers = sizes.map((n, i) => ({
      style: styles[i % styles.length],
      order: Array.from({ length: n }, () => G.pick(MENU)),
      holder: new THREE.Group(), anim: null, slot: i, leaving: false,
    }));
    customers.push({ style: 'dongwoo', order: ['nana'], holder: new THREE.Group(), anim: null, slot: customers.length });
    const SLOT = [[0, 1.25], [-0.55, 1.95], [0.55, 2.6], [0, 3.3]];
    const slotPos = (s) => (s < SLOT.length ? new THREE.Vector3(SLOT[s][0], 0, SLOT[s][1]) : new THREE.Vector3(0, 0, 4.5));
    const billboard = (canvasOrImg, w, h) => {
      const t = canvasOrImg instanceof HTMLCanvasElement ? new THREE.CanvasTexture(canvasOrImg) : new THREE.Texture(canvasOrImg);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ps1Material({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
      m.position.y = h / 2;
      return m;
    };
    for (const cu of customers) {
      cu.holder.position.copy(slotPos(cu.slot));
      cu.holder.rotation.y = Math.PI; // face the kitchen
      scene.add(cu.holder);
      const st = cu.style;
      if (st === 'suit' || st === 'suit_big') {
        if (IMG.suit) cu.holder.add(billboard(IMG.suit, st === 'suit_big' ? 2.0 : 1.55, st === 'suit_big' ? 2.25 : 1.75));
      } else if (st === 'pixel') {
        cu.holder.add(billboard(pixelCanvas(PIXNANA, 8), 1.1, 1.75));
      } else {
        const h = { gangnana: 1.72, gangnana_cute: 1.3, darknana: 1.75, dongwoo: 1.72 }[st];
        A.instance(st).then(({ root, clips }) => {
          fitHeight(root, h);
          root.traverse((o) => { if (o.isMesh) o.material = toPS1(o.material); });
          cu.holder.add(root);
          cu.mats = [];
          root.traverse((o) => o.isMesh && cu.mats.push(o.material));
          cu.anim = G.animate(root, clips);
          cu.anim.play(st === 'dongwoo' ? 'walk' : 'idle');
          cu.walking = st === 'dongwoo';
        });
      }
    }

    // ---- the Gangnana for sale + pickup spot (final order) ----
    const nana = new THREE.Group();
    nana.position.set(-0.3, COUNTER_Y, 0.46);
    nana.rotation.y = Math.PI - 0.3;
    nana.visible = false;
    scene.add(nana);
    let nanaAnim = null;
    A.instance('gangnana_cute').then(({ root, clips }) => {
      fitHeight(root, 0.36);
      root.traverse((o) => { if (o.isMesh) o.material = toPS1(o.material); });
      nana.add(root);
      nanaAnim = G.animate(root, clips);
      nanaAnim.play('idle');
    });
    // ending: after the last order, Dongwoo (last in line) steps up and the Gangnana herself pops onto the pickup tray
    const PICK = new THREE.Vector3(0.08, COUNTER_Y, 0.46);
    const pickPad = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 16), ps1Material({ color: '#ffd400', emissive: '#553f00' }));
    pickPad.position.copy(PICK);
    pickPad.visible = false;
    scene.add(pickPad);
    nana.position.copy(PICK);

    // ---- state ----
    let cur = 0, step = 0, mistakes = 0, served = 0;
    let phase = 'enter', phT = 0, state = 'play', stT = 0;
    let printT = 0, wrongFlash = 0, popT = 0;
    let lastTap = null;
    // button layout (L3 shuffles after every order)
    let btnOrder = [...MENU];
    const BTN = (i) => ({ x: 20 + i * 192, y: 640, w: 180, h: 130 });
    G.dbg = { cur, step, phase, order: null, btn: btnOrder, mistakes };

    const customer = () => customers[cur];
    const startOrder = () => {
      phase = 'order'; phT = 0; step = 0; printT = 0;
      G.sfx('shared:printer_receipt', { vol: 0.8 });
    };
    const advance = () => {
      const c = customer();
      c.leaving = true;
      c.anim?.play(c.style === 'gangnana_cute' ? 'cheer' : 'idle');
      cur++;
      for (const o of customers) if (!o.leaving) o.slot = Math.max(0, o.slot - 1);
      phase = 'enter'; phT = 0;
      if (customers[cur]?.style === 'dongwoo') { customers[cur].anim?.play('walk'); customers[cur].walking = true; win(); return; }
      if (L >= 3) btnOrder = [...MENU].sort(() => Math.random() - 0.5);
    };
    const fail = (why) => {
      state = 'fail'; stT = 0;
      G.sfx('shared:wrong_buzz');
      G.sfx('bonk', { rate: 0.7 });
      G.shake(18, 0.5);
      for (const o of customers) if (!o.leaving) { o.anim?.play(o.style === 'darknana' ? 'hit' : o.style === 'gangnana' ? 'idle_alert' : 'idle'); }
      G.lose();
    };
    const win = () => {
      state = 'win'; stT = 0; printT = 0; step = 0;
      G.sfx('shared:printer_receipt', { vol: 0.8 });
      setTimeout(() => { G.sfx('shared:service_bell'); G.sfx('sparkle'); }, 350);
      nana.visible = true;
      pickPad.visible = true;
      nanaAnim?.play('cheer');
      G.win();
    };

    const tapMenu = (kind) => {
      const c = customer();
      lastTap = { kind, t: 0 };
      if (kind === c.order[step]) {
        step++;
        G.sfx('pop', { rate: 0.9 + step * 0.15 });
        if (step >= c.order.length) {
          served++;
          G.sfx('shared:service_bell', { vol: 0.8 });
          phase = 'served'; phT = 0;
        }
      } else {
        mistakes++;
        wrongFlash = 1;
        G.sfx('shared:wrong_buzz', { vol: 0.7 });
        G.shake(10, 0.2);
        if (mistakes >= 3) fail('miss');
      }
      G.dbg.mistakes = mistakes;
    };

    return {
      down(p) {
        if (state !== 'play') return;
        if (phase !== 'order' || printT < 0.25) return;
        for (let i = 0; i < 3; i++) {
          const b = BTN(i);
          if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) { b.kind = btnOrder[i]; tapMenu(btnOrder[i]); return; }
        }
      },
      timeout() { if (state === 'play') fail('time'); },
      update(dt) {
        stT += dt; phT += dt; printT += dt;
        wrongFlash = Math.max(0, wrongFlash - dt * 3);
        if (lastTap) lastTap.t += dt;

        // flow
        if (state === 'play') {
          if (phase === 'enter' && phT > 0.55) startOrder();
          if (phase === 'served' && phT > 0.45) advance();
        }
        // customers glide to their slots; served ones walk off to the side
        for (const o of customers) {
          const tgt = o.leaving ? new THREE.Vector3(o.holder.position.x > -0.1 ? 2.6 : -2.6, 0, 1.2) : slotPos(o.slot);
          o.holder.position.lerp(tgt, Math.min(1, dt * (o.leaving ? 4 : 5)));
          const moving = o.holder.position.distanceTo(tgt) > 0.05;
          const bob = moving || (state === 'fail' && !o.leaving) ? Math.abs(Math.sin(G.t * 14 + o.slot)) * 0.06 : 0;
          o.holder.position.y = bob;
          if (o.style === 'dongwoo' && !moving && o.anim && o.walking) { o.walking = false; o.anim.play('idle'); }
          if (state === 'fail' && !o.leaving) o.holder.rotation.z = Math.sin(G.t * 20 + o.slot) * 0.06;
        }
        if (state === 'win') {
          popT += dt;
          const k = Math.min(1, popT / 0.25);
          nana.scale.setScalar(Math.max(0.01, k * (1 + Math.sin(popT * 14) * 0.05)));
          nana.position.y = COUNTER_Y + Math.abs(Math.sin(popT * 9)) * 0.05;
          const dw = customers[cur];
          if (dw?.anim && popT > 0.5 && !dw.waved) { dw.waved = true; dw.walking = false; dw.anim.play('wave'); }
        }

        const c = G.c2d;
        const cu = customer();
        G.dbg.cur = cur; G.dbg.step = step; G.dbg.phase = phase; G.dbg.order = cu?.order; G.dbg.btn = btnOrder;

        // ---- HUD ----
        c.save();
        c.fillStyle = 'rgba(20,14,6,.7)';
        c.fillRect(0, 0, 600, 64);
        const tf = G.left / G.duration;
        c.fillStyle = '#333'; c.fillRect(150, 22, 250, 20);
        c.fillStyle = tf < 0.25 ? '#ff4a3a' : '#ffd400'; c.fillRect(150, 22, 250 * tf, 20);
        c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(150, 22, 250, 20);
        c.restore();
        G.text(`${served}/${customers.length - 1}`, 70, 33, { size: 30, color: '#fff' });
        for (let i = 0; i < 3; i++) G.text(i < mistakes ? '✕' : '○', 428 + i * 34, 33, { size: 32, color: i < mistakes ? '#ff4a3a' : '#777' });

        // ---- receipt ----
        if (cu && (phase === 'order' || phase === 'served' || state === 'win') && state !== 'fail') {
          const k = Math.min(1, printT / 0.35);
          const items = cu.style === 'dongwoo' ? ['nana'] : cu.order;
          const ph = 120 + items.length * 92;
          const shown = ph * k;
          c.save();
          c.beginPath(); c.rect(20, 76, 230, shown); c.clip();
          c.translate(0, shown - ph);
          c.fillStyle = '#fbf8ee';
          c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 10;
          c.fillRect(30, 76, 210, ph);
          c.shadowBlur = 0;
          c.fillStyle = '#555'; c.font = "22px 'ONE Mobile POP'"; c.textAlign = 'center';
          c.fillText(`#${cur + 1}`, 135, 106);
          c.fillRect(44, 118, 182, 2);
          // icons only (no item names), so nothing can overflow the paper
          items.forEach((it, i) => {
            const y = 175 + i * 92;
            c.globalAlpha = i < step ? 0.35 : 1;
            if (it === 'nana') { if (IMG.head) c.drawImage(IMG.head, 95, y - 42, 84, 84); } else icon(c, it, 140, y, 80);
            c.fillStyle = '#1b1306';
            c.beginPath(); c.arc(62, y, 15, 0, 7); c.fill();
            c.fillStyle = '#fff'; c.font = "20px 'ONE Mobile POP'"; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(String(i + 1), 62, y + 1);
            c.textBaseline = 'alphabetic';
            c.globalAlpha = 1;
            if (i < step) { c.strokeStyle = '#2a9a4a'; c.lineWidth = 7; c.beginPath(); c.moveTo(110, y); c.lineTo(132, y + 22); c.lineTo(176, y - 26); c.stroke(); }
            if (i === step && phase === 'order' && state === 'play') { c.strokeStyle = '#ff4a3a'; c.lineWidth = 4; c.strokeRect(40, y - 44, 190, 88); }
          });
          c.restore();
        }
        // ---- buttons ----
        if (state === 'play' && cu?.style !== 'dongwoo') {
          for (let i = 0; i < 3; i++) {
            const b = BTN(i);
            const kind = btnOrder[i];
            const pressed = lastTap && lastTap.kind === kind && lastTap.t < 0.12;
            c.save();
            c.fillStyle = '#1b1306';
            c.beginPath(); c.roundRect(b.x, b.y + 8, b.w, b.h, 22); c.fill();
            c.fillStyle = phase === 'order' ? '#ffd400' : '#b8a040';
            c.beginPath(); c.roundRect(b.x, b.y + (pressed ? 8 : 0), b.w, b.h, 22); c.fill();
            c.strokeStyle = '#1b1306'; c.lineWidth = 5; c.stroke();
            c.restore();
            icon(c, kind, b.x + b.w / 2, b.y + 52 + (pressed ? 8 : 0), 80);
            G.text(NAME[kind], b.x + b.w / 2, b.y + 108 + (pressed ? 8 : 0), { size: 22, color: '#1b1306', stroke: null });
          }
        }
        if (wrongFlash > 0) {
          c.save(); c.fillStyle = `rgba(255,0,0,${wrongFlash * 0.25})`; c.fillRect(0, 0, 600, 800); c.restore();
          G.text('✕', 300, 400, { size: 200, color: '#ff4a3a', alpha: wrongFlash });
        }

      },
    };
  },
};
