// Debug menu (F2 or `): jump to any beat of the night, fire single events, speed up time, teleport.
import * as THREE from 'three';
import { BEATS } from './flow.js';
import { PICKUP } from './cooking.js';

export class Debug {
  constructor(g) {
    this.g = g;
    this.open = false;
    const el = document.createElement('div');
    el.id = 'debug';
    el.hidden = true;
    document.body.appendChild(el);
    this.el = el;
    this.render();
    addEventListener('keydown', (e) => {
      if (e.code === 'F2' || e.code === 'Backquote') { e.preventDefault(); this.toggle(); }
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.act(b.dataset.act, b.dataset.arg);
    });
  }

  render() {
    const beats = BEATS.map((b, i) => `<button data-act="beat" data-arg="${i}"><span>${i + 1}</span>${b.label}</button>`).join('');
    const ev = [
      ['empty', '빌드업: 바나나 그림 영수증'], ['door', '빌드업: 문 혼자 열림'], ['gift', '빌드업: 바나나 선물'],
      ['rain', '바나나 비'], ['basket', '바나나 비 + 한바구니 주문'], ['tv', 'TV 씨엠송 → 펑'],
      ['rider', '배달기사 (일반)'], ['rider_x', '배달기사 (바나나헬멧)'],
      ['costume', '바나나탈 쓰기'], ['costume_off', '탈 벗기 → 반응'], ['silhouette', '창밖 실루엣'],
      ['name_ok', '이름 답장 (강나나)'], ['name_ng', '이름 답장 (다른 이름)'], ['name_ask', '이름 입력창'],
      ['love', '강나나사랑해 영수증'], ['finale', '피날레 전체'], ['scare', '갑툭튀만'],
      ['power', '정전 토글'], ['complete', '현재 주문 자동 완성'], ['end', '마감 화면'],
    ].map(([a, l]) => `<button data-act="${a}">${l}</button>`).join('');
    const speeds = [1, 3, 10].map((s) => `<button data-act="speed" data-arg="${s}" class="${this.g.speed === s ? 'on' : ''}">${s}x</button>`).join('');
    const tp = [['kitchen', '주방'], ['printer', '프린터 앞'], ['hall', '홀'], ['door', '정문 앞']]
      .map(([a, l]) => `<button data-act="tp" data-arg="${a}">${l}</button>`).join('');
    this.el.innerHTML = `
      <header><b>DEBUG</b><span>F2로 열고 닫기</span></header>
      <section><h4>흐름 — 여기서부터 시작 (새로고침)</h4><div class="list">${beats}<button data-act="beat" data-arg="free"><span>∅</span>자유 모드 (흐름 없이, 이벤트 테스트용)</button></div></section>
      <section><h4>이벤트 바로 실행</h4><div class="grid">${ev}</div></section>
      <section><h4>속도</h4><div class="row">${speeds}</div></section>
      <section><h4>순간이동</h4><div class="row">${tp}</div></section>
      <footer id="debug-state"></footer>`;
  }

  toggle() {
    this.open = !this.open;
    this.el.hidden = !this.open;
    if (this.open) {
      document.exitPointerLock?.();
      this.state();
    } else if (this.g.started) {
      document.getElementById('view').requestPointerLock?.();
    }
  }

  state() {
    const g = this.g;
    document.getElementById('debug-state').textContent =
      `beat ${g.beat ?? '-'} · ${g.cooking.active ? `주문 #${g.cooking.active.no} step ${g.cooking.active.step}` : '주문 없음'} · speed ${g.speed}x`;
  }

  dummyPack() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.12), new THREE.MeshLambertMaterial({ color: 0xb08a5a }));
    m.position.copy(PICKUP).setY(PICKUP.y + 0.035);
    this.g.scene.add(m);
    return m;
  }

  act(a, arg) {
    const g = this.g, ev = g.events, c = g.cooking;
    if (!g.started && a !== 'beat') { c.toast?.('먼저 출근하기를 눌러주세요'); return; }
    switch (a) {
      case 'beat': location.search = `?skip&beat=${arg}`; return;
      case 'rain': ev.bananaRain(); break;
      case 'basket': ev.bananaRain().then(() => c.order({ menu: 'basket', req: '바나나 한바구니 주세요' })); break;
      case 'tv': ev.tvCM(); break;
      case 'rider': g.delivery.request(this.dummyPack(), false); break;
      case 'rider_x': g.delivery.request(this.dummyPack(), true); break;
      case 'costume': if (!c.costume) c.wearCostume(); break;
      case 'costume_off': ev.costumeReacted = false; if (!c.costume) c.wearCostume(); setTimeout(() => c.takeOffCostume(), 800); break;
      case 'empty': ev.emptyReceipt(); break;
      case 'door': ev.doorAlone(); break;
      case 'gift': ev.bananaGift(); break;
      case 'silhouette': ev.silhouette(); break;
      case 'name_ok': g.nameWritten = '강나나'; ev.nameReply(); break;
      case 'name_ng': g.nameWritten = '동우'; ev.nameReply(); break;
      case 'name_ask': c.order({ menu: 'nachos', req: '(디버그) 이름 적기', extra: ['write_name'] }).then(() => ev.nameReply()); break;
      case 'love': c.note('강나나사랑해'.repeat(100), { wall: true }); break;
      case 'finale': ev.finale(); break;
      case 'scare': ev.jumpscare().then(() => { g.fadeTarget = 1; }); break;
      case 'power': g.power = g.power > 0.5 ? 0 : 1; break;
      case 'complete': c.autoComplete(); break;
      case 'end': c.endShift(); break;
      case 'speed': g.speed = +arg; this.render(); break;
      case 'tp': {
        const spots = { kitchen: [-0.7, -2.45, 0], printer: [-0.62, -0.35, -2.2], hall: [0.5, 2.5, 3.14], door: [0.03, 4.3, 0] };
        const [x, z, yaw] = spots[arg];
        g.player.pos.set(x, 0, z);
        g.player.yaw = yaw;
        g.player.canMove = true;
        break;
      }
    }
    if (this.open) this.toggle(); // close so the effect can be seen
  }
}
