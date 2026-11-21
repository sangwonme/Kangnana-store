// The night's fixed event flow. Each beat waits `gap` seconds, then runs. `clock` = minutes after 22:00 (used when jumping).
// Escalation: normal → small wrongness (^^ receipt, door opens by itself) → banana rain + 20-banana basket
// → banana-helmet rider → costume → banana gift → name → TV CM explodes → silhouette → 강나나사랑해 → finale.
// RULE: 강나나 herself only appears in the finale.
export const BEATS = [
  { label: '튜토리얼 1 · 타코', clock: 0, gap: 4,
    run: (g) => g.cooking.order({ menu: 'taco', req: '고수는 빼주세요', tutorial: true, tutorialStep: 0 }) },
  { label: '튜토리얼 2 · 나초', clock: 14, gap: 6,
    run: (g) => g.cooking.order({ menu: 'nachos', req: '살사 많이 주세요~', tutorial: true, tutorialStep: 1 }) },
  { label: '주문 · 부리또 (맵게)', clock: 30, gap: 8,
    run: (g) => g.cooking.order({ menu: 'burrito', req: '맵게 해주세요' }) },
  { label: '주문 · 타코 (포크)', clock: 46, gap: 8,
    run: (g) => g.cooking.order({ menu: 'taco', req: '포크 두 개 넣어주세요' }) },
  { label: '빌드업 · 바나나 그림만 있는 영수증', clock: 58, gap: 6,
    run: (g) => g.events.emptyReceipt() },
  { label: '★ 요청 · 바나나우유 서비스', clock: 64, gap: 6,
    run: (g) => g.cooking.order({ menu: 'nachos', req: '바나나우유 서비스 부탁해요 ^^', extra: ['banana', 'blender'] }) },
  { label: '빌드업 · 문이 혼자 열리고 발소리', clock: 82, gap: 6,
    run: (g) => g.events.doorAlone() },
  { label: '주문 · 부리또 (소스 따로)', clock: 88, gap: 6,
    run: (g) => g.cooking.order({ menu: 'burrito', req: '소스는 따로 담아주세요' }) },
  { label: '이벤트 · 천장에서 바나나 우수수', clock: 102, gap: 6,
    run: (g) => g.events.bananaRain() },
  { label: '주문 · 바나나 한바구니 (줍기 ×20)', clock: 104, gap: 2.5,
    run: (g) => g.cooking.order({ menu: 'basket', req: '바나나 한바구니 주세요' }) },
  { label: '주문 + 바나나헬멧 배달기사', clock: 118, gap: 6,
    run: (g) => g.cooking.order({ menu: 'taco', req: '알바생분 오늘 혼자세요?', anomalyRider: true }) },
  { label: '★ 요청 · 바나나탈 쓰고 서빙', clock: 132, gap: 14,
    run: (g) => g.cooking.order({ menu: 'nachos', req: '바나나탈 쓰고 서빙해주세요', extra: ['costume_on'] }) },
  { label: '빌드업 · 픽업대에 놓인 바나나', clock: 148, gap: 8,
    run: (g) => g.events.bananaGift() },
  { label: '★ 요청 · 영수증에 이름 (직접 입력)', clock: 154, gap: 8,
    run: async (g) => {
      await g.cooking.order({ menu: 'burrito', req: '영수증에 이름 적어주세요. 제 이름 아시죠?', extra: ['write_name'] });
      await g.wait(5);
      await g.events.nameReply();
    } },
  { label: '주문 · 나초 (치즈 많이)', clock: 168, gap: 6,
    run: (g) => g.cooking.order({ menu: 'nachos', req: '치즈 많이 올려주세요' }) },
  { label: '이벤트 · 홀 TV 씨엠송 → 펑', clock: 182, gap: 6,
    run: (g) => g.events.tvCM() },
  { label: '이벤트 · 창밖 실루엣', clock: 192, gap: 6,
    run: (g) => g.events.silhouette() },
  { label: '주문 · 뒷모습 보고 있었어요', clock: 200, gap: 4,
    run: (g) => g.cooking.order({ menu: 'taco', req: '아까 조리대 앞에 서 있던 뒷모습, 계속 보고 있었어요' }) },
  { label: '이벤트 · 강나나사랑해 영수증', clock: 214, gap: 8,
    run: (g) => g.cooking.note('강나나사랑해'.repeat(100), { wall: true }) },
  { label: '피날레 · 정전 → 갑툭튀 → 마감', clock: 230, gap: 1.5,
    run: (g) => g.events.finale() },
];

export async function runFlow(g, from = 0) {
  if (from > 0) g.shiftMinutes = 22 * 60 + BEATS[from].clock;
  // jumping straight to the basket order: the bananas must already be on the floor
  if (BEATS[from]?.label.includes('한바구니')) await g.events.bananaRain();
  for (let i = from; i < BEATS.length; i++) {
    g.beat = i;
    await g.wait(BEATS[i].gap);
    await BEATS[i].run(g);
  }
}
