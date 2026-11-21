// Readable notes/signs + the reader overlay (screen goes dark, text shown crisp in HTML instead of the PS1 texture).

const checklist = ['오픈 전 냉장고 온도 확인', '식자재 유통기한 확인', '조리도구 세척 확인', '주방/홀 바닥 청소',
  '냉장고 조명 끄기', '테이블링 기계 충전', '가스 밸브 잠금 확인', '조명 OFF, 비품 정리'];
const recipeSheet = `<h2>주문 확인 · 조리 순서</h2>
  <table class="recipes">
    <tr><td>타코</td><td>또띠아 → 토치 → 고기 → 살사 → 픽업대</td></tr>
    <tr><td>나초</td><td>나초칩 → 치즈 → 살사 → 픽업대</td></tr>
    <tr><td>부리또</td><td>또띠아 → 고기 → 치즈 → 토치 → 픽업대</td></tr>
  </table>
  <p class="warn">※ 요청사항 꼭 확인</p>`;
const sets = [['A 세트', '타코 2 + 나초 + 음료', '15,900'], ['B 세트', '부리또 + 나초 + 음료', '16,500'],
  ['C 세트', '타코 3종 + 과카몰리', '22,000'], ['패밀리', '타코 6 + 나초 L + 음료 2', '42,000']];
const menu = [['소고기 타코', '6,900'], ['돼지고기 타코', '6,500'], ['새우 타코', '7,500'], ['부리또', '9,800'],
  ['퀘사디아', '8,900'], ['나초 & 살사', '5,500'], ['과카몰리', '4,500'], ['음료', '2,500']];

// world-space (glTF) centers from tools/env/build_kitchen.py; axis = which way the sheet faces
export const READABLES = [
  {
    at: [-1.24, 1.55, -1.75], size: [0.46, 0.64], axis: 'x', theme: 'board',
    html: `<h2>CHECK LIST ※</h2><ul class="check">${checklist.map((t) => `<li>${t}</li>`).join('')}</ul><p class="foot">KITCHEN</p>`,
  },
  { at: [-0.22, 1.25, -1.16], size: [0.22, 0.3], axis: 'x', theme: 'sheet green', html: recipeSheet },
  { at: [-0.22, 1.28, -0.7], size: [0.22, 0.3], axis: 'x', theme: 'sheet green', html: recipeSheet },
  ...[[-0.78, 1.17], [-0.47, 1.18]].map(([x, y]) => ({
    at: [x, y, -3.598], size: [0.27, 0.2], axis: 'z', theme: 'sheet',
    html: `<h2>배달 &amp; 포장 · 세트 메뉴 구성표</h2><table>${sets.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>
      <p class="warn">※ 요청사항 꼭 확인</p>`,
  })),
  {
    at: [0.33, 1.25, -3.598], size: [0.16, 0.09], axis: 'z', theme: 'sign',
    html: `<h2>필히 확인!</h2><p class="warn big">요청 사항 확인하기</p><p class="fresh big">싱싱한 고수 사용하기</p>`,
  },
  {
    at: [1.8, 1.85, 0.077], size: [1.56, 0.76], axis: 'z', theme: 'chalk', range: 3.2,
    html: `<h2>MENU</h2><table class="menu">${menu.map(([n, p]) => `<tr><td>${n}</td><td>${p}</td></tr>`).join('')}</table>`,
  },
  {
    at: [-2.995, 1.6, 2.6], size: [0.5, 0.75], axis: 'x', theme: 'poster', range: 2.6,
    html: `<h2>TACO</h2><p class="big">오늘도 맛있게!</p>`,
  },
];

export class Reader {
  constructor(player) {
    this.player = player;
    this.open = false;
    this.overlay = document.getElementById('reader');
    this.card = document.getElementById('reader-card');
    this.overlay.addEventListener('click', () => this.close());
  }

  show(theme, html, onClose) {
    if (this.open) this.close();
    this.open = true;
    this.onClose = onClose;
    this.player.locks.add('reader');
    this.card.className = `card ${theme}`;
    this.card.innerHTML = html;
    this.card.scrollTop = 0;
    this.overlay.hidden = false;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.overlay.hidden = true;
    this.player.locks.delete('reader');
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}

export function addReadables(interact, reader, sound) {
  for (const r of READABLES) {
    const [w, h] = r.size;
    interact.add({
      at: r.at,
      size: r.axis === 'x' ? [0.08, h, w] : [w, h, 0.08],
      range: r.range ?? 1.9,
      label: () => '읽기',
      use: () => { sound.play('paper_rustle', 0.6); reader.show(r.theme, r.html); },
    });
  }
}
