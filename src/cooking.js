// Cooking + orders. The night's event flow (flow.js) calls order()/note(); requests are mandatory extra steps (★).
import * as THREE from 'three';
import { ps1Material } from './ps1.js';

export const STEP = {
  tortilla: { label: '또띠아 꺼내기', sfx: 'food_plop' },
  torch: { label: '토치로 굽기', sfx: 'torch_ignite', hold: 1.4 },
  meat: { label: '고기 올리기', sfx: 'food_plop' },
  cheese: { label: '치즈 올리기', sfx: 'food_plop' },
  salsa: { label: '살사 뿌리기', sfx: 'squeeze' },
  chips: { label: '나초칩 담기', sfx: 'food_plop' },
  banana: { label: '바나나 꺼내기', sfx: 'food_plop', req: true },
  blender: { label: '믹서에 갈기', sfx: 'blender', hold: 1.6, req: true },
  costume_on: { label: '바나나탈 쓰기', sfx: 'fabric_on', req: true },
  write_name: { label: '영수증에 이름 적기', sfx: 'pen_write', req: true }, // opens a text box
  pick_banana: { label: '바나나 줍기', sfx: 'banana_pick' }, // done on the fallen bananas (events.js)
  serve: { label: '픽업대에 내기', sfx: 'service_bell' },
};

export const RECIPES = {
  taco: { name: '타코', steps: ['tortilla', 'torch', 'meat', 'salsa'] },
  nachos: { name: '나초', steps: ['chips', 'cheese', 'salsa'] },
  burrito: { name: '부리또', steps: ['tortilla', 'meat', 'cheese', 'torch'] },
  basket: { name: '바나나 한바구니', steps: Array(20).fill('pick_banana'), pack: 'basket' },
};

// world positions (glTF, meters) — prep table / sink unit tops are at y≈0.85
const BOARD = new THREE.Vector3(-0.98, 0.865, -3.0);
export const PICKUP = new THREE.Vector3(0, 1.03, 0.28);
export const PRINTER = new THREE.Vector3(0, 1.1, -0.16);
const HOOK = new THREE.Vector3(-1.19, 1.45, -1.05); // banana hood hanging on the left wall
const STATIONS = {
  tortilla: { at: [-1.06, 0.9, -3.32], size: [0.24, 0.12, 0.24] },
  torch: { at: [-0.42, 0.97, -3.27], size: [0.14, 0.26, 0.14] },
  meat: { at: [-0.13, 0.9, -3.12], size: [0.18, 0.12, 0.16] },
  cheese: { at: [0.07, 0.9, -3.12], size: [0.18, 0.12, 0.16] },
  salsa: { at: [-0.55, 0.94, -3.08], size: [0.1, 0.2, 0.1] },
  chips: { at: [0.33, 1.55, -3.33], size: [0.4, 0.22, 0.32], range: 2.0 },
  banana: { at: [0.19, 0.92, -2.98], size: [0.22, 0.16, 0.2] },
  blender: { at: [0.32, 0.98, -3.12], size: [0.14, 0.3, 0.14] },
  costume_on: { at: HOOK.toArray(), size: [0.12, 0.5, 0.3] },
  serve: { at: [0, 1.08, 0.2], size: [0.9, 0.2, 0.4], range: 2.0 },
};

const mat = (color, extra) => ps1Material({ color, ...extra });
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const fmtTime = (min) => {
  const m = Math.floor(min) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export class Cooking {
  constructor(game, { scene, interact, reader }) {
    this.g = game;
    this.scene = scene;
    this.reader = reader;
    this.waiting = null;   // printed receipt (order or note) not yet torn off
    this.queue = [];       // receipts waiting for the printer
    this.active = null;    // current order ticket
    this.held = false;     // finished + packed, ready to serve
    this.action = null;    // timed action (torch / blender / pen)
    this.costume = false;
    this.stats = { served: 0, tips: 0, mistakes: 0 };
    this.receiptNo = 47;
    this.ended = false;
    this.onServed = null;     // (ticket, packMesh) → delivery
    this.onCostumeOff = null; // flow reacts

    this.dish = new THREE.Group();
    this.dish.position.copy(BOARD);
    scene.add(this.dish);
    this.paper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.12), mat(0xf4f4f0));
    this.paper.visible = false;
    scene.add(this.paper);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4),
      mat(0xffd23a, { emissive: 0xffc400, emissiveIntensity: 1.2 }));
    this.arrow.rotation.x = Math.PI;
    this.arrow.visible = false;
    scene.add(this.arrow);

    this.buildProps();
    for (const [key, s] of Object.entries(STATIONS)) {
      interact.add({ at: s.at, size: s.size, range: s.range ?? 1.6, label: () => this.labelFor(key), use: () => this.useStation(key) });
    }
    interact.add({ at: PRINTER.toArray(), size: [0.3, 0.25, 0.3], range: 1.8, label: () => this.printerLabel(), use: () => this.usePrinter() });

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyQ' && this.costume && !this.reader.open && !this.ended) this.takeOffCostume();
    });
  }

  // ---------------------------------------------------------------- props
  buildProps() {
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); this.scene.add(mesh); return mesh; };
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.045, 12), mat(0xe9d9a6)), -1.06, 0.875, -3.32);
    for (const [x, c] of [[-0.13, 0x5a3020], [0.07, 0xf2c84b]]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.14), mat(0xb8bcc0)), x, 0.885, -3.12);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.12), mat(c)), x, 0.918, -3.12);
    }
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8), mat(0xc0281e)), -0.55, 0.925, -3.08);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 6), mat(0xe8e8e8)), -0.55, 1.025, -3.08);
    // banana bunch on the sink-unit front
    const bunch = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 6, 10, 2.0), mat(0xf5d020));
      b.rotation.set(-Math.PI / 2 + 0.35, 0, -0.4 + i * 0.4);
      b.position.set(0, 0.02 + i * 0.012, 0);
      bunch.add(b);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.04, 5), mat(0x4a3a1a));
    stem.position.set(0.06, 0.03, 0);
    bunch.add(stem);
    add(bunch, 0.19, 0.86, -2.98);
    // blender
    add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.13), mat(0x2a2a2c)), 0.32, 0.89, -3.12);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.17, 8), mat(0xcfe3ee, { transparent: true, opacity: 0.55 })), 0.32, 1.015, -3.12);
    // banana hood hanging on a hook (left wall)
    this.hood = makeHood();
    this.hood.rotation.z = -0.15;
    add(this.hood, HOOK.x + 0.06, HOOK.y - 0.2, HOOK.z);
  }

  // ---------------------------------------------------------------- receipts
  /** Print an order; resolves when it has been served. */
  order(spec) {
    return new Promise((resolve) => {
      const recipe = RECIPES[spec.menu];
      const steps = [...recipe.steps, ...(spec.extra || []), 'serve'];
      this.print({ kind: 'order', ...spec, recipe, steps, step: 0, resolve });
    });
  }

  /** Print a non-order receipt (a message); resolves when it has been read and closed. */
  note(text, opts = {}) {
    return new Promise((resolve) => this.print({ kind: 'note', req: text, ...opts, resolve }));
  }

  print(r) {
    r.no = this.receiptNo++;
    r.time = this.g.shiftMinutes;
    this.queue.push(r);
  }

  printNext() {
    const r = this.queue.shift();
    this.waiting = r;
    this.paper.visible = true;
    this.paperT = 0;
    const times = r.wall ? 3 : 1;
    for (let i = 0; i < times; i++) setTimeout(() => this.g.sound.atPoint('printer_receipt', PRINTER, 0.9, 1.5), i * 2600);
    this.toast(r.kind === 'order' ? `주문 #${String(r.no).padStart(3, '0')} 들어옴` : '…프린터가 혼자 움직인다');
    if (r.tutorial && r.tutorialStep === 0) this.hint('주문이 들어왔다. 카운터 쪽 프린터에서 주문서를 뜯자');
  }

  receiptHTML(r) {
    const head = `<div class="rc-head">TACO${r.kind === 'order' ? ' · 주문서' : ''}</div>
      <div class="rc-meta">#${String(r.no).padStart(3, '0')} · ${fmtTime(r.time)}${r.kind === 'order' ? ' · 포장' : ''}</div>
      <div class="rc-line"></div>`;
    const body = r.kind === 'order'
      ? `<div class="rc-item"><span>${r.recipe.name}</span><span>x1</span></div><div class="rc-line"></div>
         <div class="rc-req-label">요청사항</div>`
      : '';
    const text = r.pre ? `<div class="rc-art-wrap"><pre class="rc-art">${esc(r.req)}</pre></div>`
      : `<div class="rc-req ${r.wall ? 'wall' : ''}">${esc(r.req).replace(/\n/g, '<br>')}</div>`;
    return `${head}${body}${text}
      <div class="rc-line"></div><div class="rc-foot">${r.kind === 'order' ? '감사합니다' : '　'}</div>`;
  }

  printerLabel() {
    if (this.waiting) return this.waiting.kind === 'order' ? '주문서 뜯기' : '영수증 뜯기';
    if (this.expected() === 'write_name') return `★ ${STEP.write_name.label}`;
    return null;
  }

  usePrinter() {
    if (this.waiting) return this.takeReceipt();
    if (this.expected() === 'write_name') this.useStation('write_name');
  }

  takeReceipt() {
    const r = this.waiting;
    this.waiting = null;
    this.paper.visible = false;
    this.g.sound.play('paper_tear', 0.7);
    if (r.kind === 'order') this.active = r;
    this.reader.show(`receipt${r.wall ? ' wall' : ''}`, this.receiptHTML(r), () => {
      this.renderTicket();
      if (r.kind === 'note') r.resolve();
      else if (r.tutorial) this.hint(r.tutorialStep === 0
        ? '왼쪽 위 주문서 순서대로 만들자. 노란 화살표를 따라가'
        : '이번엔 나초. 순서는 왼쪽 위에 있어');
      else if (r.extra?.length) this.hint('★ 요청사항도 순서에 들어 있다');
    });
  }

  // ---------------------------------------------------------------- stations
  expected() { return this.active ? this.active.steps[this.active.step] : null; }

  labelFor(key) {
    if (this.action || this.ended) return null;
    const exp = this.expected();
    if (key === 'serve') return this.held ? STEP.serve.label : null;
    if (STEP[key].req) return exp === key ? `★ ${STEP[key].label}` : null; // request props only when needed
    return STEP[key].label;
  }

  useStation(key) {
    const t = this.active;
    if (!t) { this.toast('주문서가 없다. 프린터를 확인하자'); return; }
    if (key === 'serve') { this.serve(); return; }
    const exp = this.expected();
    if (key !== exp) {
      this.g.sound.play('wrong_buzz', 0.7);
      if (t.tutorial) { this.toast(`지금은 "${STEP[exp].label}" 차례야`); return; }
      this.stats.mistakes++;
      this.toast('순서가 틀렸다! 처음부터 다시');
      t.step = 0;
      this.dish.clear();
      this.renderTicket();
      return;
    }
    if (key === 'write_name') { this.askName(t); return; }
    if (STATIONS[key]) this.g.sound.atPoint(STEP[key].sfx, new THREE.Vector3(...STATIONS[key].at), 0.9, 1.2);
    else this.g.sound.play(STEP[key].sfx, 0.8);
    if (STEP[key].hold) {
      this.action = { t: 0, dur: STEP[key].hold, done: () => this.advance(t, key) };
      this.g.player.locks.add('action');
      $('progress').hidden = false;
    } else {
      this.advance(t, key);
    }
  }

  /** Write a name on the back of the receipt — typed by the player. */
  askName(t) {
    this.naming = true;
    const box = $('namebox'), input = $('name-input');
    box.hidden = false;
    input.value = '';
    this.g.player.locks.add('name');
    setTimeout(() => input.focus(), 30);
    const done = (e) => {
      if (e.key !== 'Enter' || e.isComposing || !input.value.trim()) return;
      input.removeEventListener('keydown', done);
      input.blur();
      box.hidden = true;
      this.naming = false;
      this.g.player.locks.delete('name');
      this.g.nameWritten = input.value.trim();
      this.g.sound.atPoint('pen_write', PRINTER, 0.9, 1.2);
      this.toast(`영수증 뒷면에 "${this.g.nameWritten}" 라고 적었다`);
      this.advance(t, 'write_name');
    };
    input.addEventListener('keydown', done);
  }

  advance(t, key) {
    this.addVisual(t, key);
    if (key === 'costume_on') this.wearCostume();
    t.step++;
    if (t.steps[t.step] === 'serve' && !this.held) {
      this.held = true;
      this.dish.clear();
      this.g.sound.play('box_close', 0.7);
      this.toast(`${t.recipe.name} 완성! 포장했다`);
      if (t.tutorial) this.hint('포장 완료. 카운터 픽업대에 내자');
    }
    // remaining request steps after packing (e.g. costume) don't unpack anything
    if (t.steps[t.step] !== 'serve' && this.held) this.held = false;
    this.renderTicket();
  }

  serve() {
    const t = this.active;
    this.g.sound.atPoint('service_bell', PICKUP, 0.8, 2);
    const pack = new THREE.Group();
    if (t.recipe.pack === 'basket') {
      this.g.sound.atPoint('basket_place', PICKUP, 0.9, 1.5);
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.14, 10, 1, true), mat(0x9a6a34, { side: THREE.DoubleSide }));
      basket.position.y = 0.07;
      pack.add(basket);
      for (let i = 0; i < 20; i++) {
        const b = makeBanana(0.8);
        const a = (i / 20) * Math.PI * 2 * 3, r = 0.04 + (i % 7) * 0.018;
        b.position.set(Math.cos(a) * r, 0.1 + Math.floor(i / 7) * 0.03, Math.sin(a) * r);
        b.rotation.y = a;
        pack.add(b);
      }
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.12), mat(0xb08a5a));
      box.position.y = 0.035;
      pack.add(box);
    }
    if (t.extra?.includes('blender')) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.12, 8), mat(0xf6e7a0));
      cup.position.set(0.13, 0.06, 0);
      pack.add(cup);
    }
    pack.position.copy(PICKUP).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0));
    this.scene.add(pack);
    this.active = null;
    this.held = false;
    this.stats.served++;
    this.stats.tips += 1000 + (t.extra?.length ? 3000 : 0);
    this.renderTicket();
    if (t.tutorial) {
      if (t.tutorialStep === 0) this.hint('잘했어. 배달기사님이 가져갈 거야');
      else { this.hint(''); this.toast('튜토리얼 끝. 이제부터는 혼자다'); }
    } else this.hint('');
    this.onServed?.(t, pack);
    t.resolve(t);
  }

  /** Debug: finish the current order instantly. */
  autoComplete() {
    if (this.waiting) { this.takeReceipt(); this.reader.close(); }
    const t = this.active;
    if (!t) return;
    while (t.steps[t.step] !== 'serve') this.advance(t, t.steps[t.step]);
    this.serve();
  }

  // ---------------------------------------------------------------- visuals
  addVisual(t, key) {
    const d = this.dish;
    const scatter = (n, geo, color, y) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo, mat(color));
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.06;
        m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        m.rotation.y = Math.random() * 3;
        d.add(m);
      }
    };
    switch (key) {
      case 'tortilla': {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.008, 12), mat(0xe9d9a6));
        m.name = 'base';
        m.position.y = 0.004;
        d.add(m);
        break;
      }
      case 'torch':
        if (t.recipe === RECIPES.burrito) {
          d.clear();
          const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.19, 8), mat(0xc99a52));
          wrap.rotation.z = Math.PI / 2;
          wrap.position.y = 0.04;
          d.add(wrap);
        } else d.getObjectByName('base')?.material.color.set(0xc99a52);
        break;
      case 'meat': scatter(7, new THREE.BoxGeometry(0.03, 0.02, 0.025), 0x5a3020, 0.016); break;
      case 'cheese': scatter(9, new THREE.BoxGeometry(0.02, 0.008, 0.012), 0xf2c84b, 0.03); break;
      case 'salsa': scatter(6, new THREE.SphereGeometry(0.012, 5, 4), 0xc0281e, 0.035); break;
      case 'chips': scatter(10, new THREE.ConeGeometry(0.03, 0.006, 3), 0xe8b84a, 0.012); break;
      case 'banana': {
        const b = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 10, 2.2), mat(0xf2d33a));
        b.rotation.x = -Math.PI / 2;
        b.position.set(0.16, 0.02, 0);
        b.name = 'banana';
        d.add(b);
        break;
      }
      case 'blender': {
        d.getObjectByName('banana')?.removeFromParent();
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.12, 8), mat(0xf6e7a0));
        cup.position.set(0.16, 0.06, 0);
        d.add(cup);
        break;
      }
    }
  }

  wearCostume() {
    this.costume = true;
    this.hood.visible = false;
    $('costume').hidden = false;
    $('costume-hint').hidden = false;
    this.g.sound.loop('costume_breath_loop', 0.35);
    this.g.sound.fadeLoop('costume_breath_loop', 0.35, 0.5);
    this.toast('바나나탈을 썼다… 앞이 잘 안 보인다 (Q: 벗기)');
  }

  takeOffCostume() {
    this.costume = false;
    $('costume').hidden = true;
    $('costume-hint').hidden = true;
    this.g.sound.play('fabric_off', 0.8);
    this.g.sound.fadeLoop('costume_breath_loop', 0, 0.4);
    this.onCostumeOff?.();
  }

  // ---------------------------------------------------------------- HUD
  renderTicket() {
    const t = this.active;
    const el = $('ticket');
    el.hidden = !t;
    $('held').hidden = !this.held;
    if (!t) return;
    const req = t.req.length > 26 ? `${t.req.slice(0, 26)}…` : t.req;
    el.innerHTML = `<div class="tk-title">#${String(t.no).padStart(3, '0')} · ${t.recipe.name}</div>
      <ol>${t.steps.map((s, i) => `<li class="${i < t.step ? 'done' : i === t.step ? 'now' : ''} ${STEP[s].req ? 'req' : ''}">${STEP[s].req ? '★ ' : ''}${STEP[s].label}</li>`).join('')}</ol>
      <div class="tk-req">요청: ${esc(req).replace(/\n/g, ' ')}</div>`;
    $('held').textContent = `들고 있음: ${t.recipe.name} (포장)`;
  }

  toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  hint(text) { $('hint').textContent = text; }

  arrowTarget() {
    if (this.waiting?.tutorial) return PRINTER.clone().setY(1.3);
    const t = this.active;
    if (!t) return null;
    const key = this.expected();
    // tutorial: every step; later: only for request steps (props that are used once)
    if (!t.tutorial && !STEP[key].req) return null;
    if (key === 'write_name') return PRINTER.clone().setY(1.3);
    const s = STATIONS[key];
    const at = new THREE.Vector3(...s.at);
    at.y += s.size[1] / 2 + 0.12;
    return at;
  }

  // ---------------------------------------------------------------- tick
  update(dt) {
    if (this.ended || this.g.shiftMinutes === null) return;
    if (!this.waiting && this.queue.length) this.printNext();
    if (this.paper.visible) {
      this.paperT = Math.min(1, this.paperT + dt / 2.5);
      this.paper.position.copy(PRINTER).add(new THREE.Vector3(0, -0.02, -0.06 - this.paperT * 0.08));
    }
    if (this.action) {
      this.action.t += dt;
      $('progress-bar').style.width = `${Math.min(100, (this.action.t / this.action.dur) * 100)}%`;
      if (this.action.t >= this.action.dur) {
        const done = this.action.done;
        this.action = null;
        this.g.player.locks.delete('action');
        $('progress').hidden = true;
        done();
      }
    }
    const target = this.arrowTarget();
    this.arrow.visible = !!target;
    if (target) this.arrow.position.copy(target).setY(target.y + Math.sin(performance.now() / 250) * 0.025);
  }

  endShift() {
    this.ended = true;
    this.g.clockStopped = true;
    const s = this.stats;
    $('end-stats').innerHTML = `
      <li><span>처리한 주문</span><b>${s.served}</b></li>
      <li><span>받은 팁</span><b>${s.tips.toLocaleString()}원</b></li>
      <li><span>실수</span><b>${s.mistakes}</b></li>`;
    $('end-mood').textContent = '프린터는 아직도 출력 중이다…';
    $('endcard').hidden = false;
    document.exitPointerLock?.();
  }
}

/** One banana (curved, yellow, brown stem) — used for the bunch, the gift, the banana rain and the basket. */
export function makeBanana(scale = 1) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 6, 10, 2.0), mat(0xf5d020));
  b.rotation.x = -Math.PI / 2;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.035, 5), mat(0x4a3a1a));
  stem.position.set(0.075, 0, -0.012);
  stem.rotation.z = Math.PI / 2;
  g.add(b, stem);
  g.scale.setScalar(scale);
  return g;
}

/** Banana hood: tall yellow cone with brown tip + dark oval opening. */
export function makeHood(scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.13, 0.5, 8), mat(0xf2cf22));
  body.position.y = 0.25;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.06, 6), mat(0x4a3018));
  tip.position.y = 0.52;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), mat(0x1a1408));
  hole.scale.set(1, 1.3, 1);
  hole.position.set(0, 0.12, 0.118);
  hole.rotation.x = -0.25;
  g.add(body, tip, hole);
  g.scale.setScalar(scale);
  return g;
}
