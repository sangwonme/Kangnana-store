# 마이크로게임 작성 규칙

게임 하나 = 이 폴더의 파일 하나 (`<file>.js`). 파일 이름은 `index.js`의 `GAMES` 목록과 같아야 한다.
기획(규칙·연출·난이도)은 `../../DESIGN.md` 7장.

```js
export default {
  id: 'catch',            // = 파일 이름
  no: 14,                 // DESIGN.md 번호 (명령어 음성 vo_14.mp3 가 자동 재생됨)
  cmd: '받아라!',
  hint: '드래그 ↔',       // 명령어 아래 작은 조작 힌트. 레벨별로 바꾸려면 (lv) => '...' 함수도 가능
  bgm: 'bgm_island',      // bgm_silly | bgm_kitchen | bgm_island | bgm_chip | bgm_spooky | bgm_boss | bgm_run
  layer: '3d',            // '2d' (WebGL 숨김) | '3d' | 'both' (3D 위에 2D 오버레이)
  boss: false,            // 보스면 true + duration(초, 속도 영향 없음)
  duration: 5,            // 기본 5초. 일반 게임은 core가 speed로 나눔 (최소 2.8초)
  timeout: 'lose',        // 시간 다 됐을 때 결과. 버티기형은 'win'
  sounds: ['pop', 'thud'],// 미리 로드할 효과음 (없어도 재생은 됨, 첫 재생이 늦을 뿐)
  async load(A) { ... },  // 1회만 호출. 모델/이미지 미리 로드
  create(G) {             // 매 판 호출. 아래 핸들러를 가진 객체를 반환
    return { update(dt, t) {}, down(p) {}, move(p) {}, up(p) {}, timeout(result) {}, dispose() {} };
    // timeout(result): 시간 종료 시 호출. 'win'/'lose'를 반환하면 그 결과로 바뀐다 (버저 판정형 게임용)
  },
};
```

## G (게임 컨텍스트)
- 좌표계: **논리 해상도 600×800 (세로 3:4)**. `p = {x, y, id, down}` 도 이 좌표.
- `G.c2d`: 2D 컨텍스트. 매 프레임 core가 지우고 600×800 변환을 걸어 둔 상태로 `update` 호출. 2D 게임은 `update`에서 배경부터 전부 그린다.
- `G.scene`, `G.camera`(PerspectiveCamera fov50, aspect .75), `G.renderer`: 3D는 core가 매 프레임 렌더. 조명·배경은 게임이 넣는다.
- `G.usePS1(h=220)`: PS1 포스트(저해상도+디더). 머티리얼은 `import { toPS1, ps1Material } from '../../../shared/lib/ps1.js'`.
- `G.level` 1~3, `G.speed` 1~1.5+ (움직임 속도에 곱하기), `G.duration`, `G.t`(경과), `G.left`(남은 시간)
- `G.win()`, `G.lose()`: 결과 확정 (한 번만 유효). 확정 후 1.1초 동안 계속 update가 돌므로 **성공/실패 개그 연출은 그 시간에** 보여준다. `G.result` 로 확인.
- `G.sfx(name, {vol, rate, loop})` → 핸들 `{stop(), setRate(), setVol()}`. 루프는 판이 끝나면 core가 자동 정지.
- `G.bubble('누구세요?', x, y, {tail: [tx, ty], size})`: 말풍선은 반드시 이걸로 (상자+꼬리가 한 경로라 이음매가 없다)
- `G.caption('…')`: 플레이 중 안내용. 결과가 정해진 뒤의 자막은 자동으로 안 나온다 (끝난 뒤 하단 서브텍스트 금지).
- `G.caption('※초코입니다')`, `G.shake(px, sec)`, `G.text(str, x, y, {size, color, stroke, align, alpha})`
- `G.animate(root, clips)` → `{play('walk', {loop, timeScale, fade})}` (mixer는 core가 업데이트)
- `G.ray(p)`, `G.groundPoint(p, y)`, `G.toScreen(vec3)`, `G.rand/pick/clamp/lerp`
- 렌더러는 게임끼리 공유한다. clipping/toneMapping/shadowMap은 매 판 시작 때 core가 기본값으로 되돌린다. `A.instance` 복제본의 머티리얼은 판마다 새것이라 마음대로 바꿔도 된다.
- `G.showTimer = false`: 하단 폭탄 퓨즈를 숨김 (보스는 기본 숨김, 보스는 직접 HUD를 그린다)
- `G.pointer`: 현재 포인터 `{x, y, down}` (폴링용)
- 게임 객체에 `afterglow: 2.4` 처럼 쓰면 결과 확정 후 연출 시간을 늘릴 수 있다 (기본 1.1초, 보스 엔딩 개그용)

## A (에셋, load에서 사용)
- `await A.instance('gangnana')` → `{root, clips}` (스킨 모델도 안전하게 복제). 매 판 `create`에서 새로 복제해서 쓰면 된다 (템플릿은 캐시됨).
  - 캐릭터(리깅): gangnana(idle, idle_alert, walk, crawl, crawl_inplace, sit, kneel), gangnana_cute(idle, run, fall, cheer), darknana(idle, hit),
    dongwoo(idle, talk, wave, walk, turn), dongwoo_cute(idle, climb, run, fall, cheer), dongwoo_cozy(idle, walk, cheer, doze, sleep, wave, joy, pick, stroll),
    jiwon/kbs/kkr/rider/rider_banana(idle, look|walk), dongwoo_crowd_0/1(정적)
  - 소품: banana, peel, basket, btree, island, isle, hut, hammock, pond, flowers, lantern, balloon, cloud, chair, sneaker, step, boss, beacon, cctv, fixture / 환경: kitchen
- `fitHeight(root, h)` (`../core/assets.js`): 높이 h로 스케일, 발을 y=0에.
- `await A.img('suit.png')` (assets/img) — suit.png(배경 투명 강나나 전신), suit_head.png, face_close.jpg, shh.jpg, eyes.jpg, blast.jpg, hero.jpg,
  bar.jpg, bar_banana.jpg, eat.jpg, kneel.jpg, bananas_face.jpg, dongwoo.png(투명 배경), darknana.jpg, kbs.png, kkr.jpg, jiwon.jpg
- `await A.texture('suit.png')` → THREE.Texture

## 사운드 (assets/audio)
jg_* 징글은 core 전용. 게임용 효과음: fart_1~5, rumble, sneeze, flush, plunger, angel, splat, pop, pump, deflate, slice, whoosh, boing, bonk,
splash, glug, slurp, peel, squeak, sparkle, motor, sputter, bat, monkey, slip, stomp, jump, thud, sand, blend, torch(루프), burnt, shake, drop,
scare, hadoken, clay, tap, c8_coin, c8_hit, c8_shoot, c8_boom, c8_jump, c8_squish
+ `web/shared/assets/audio/` 의 것은 `shared:` 접두어로 재생 (예: `G.sfx('shared:blender')`, `shared:squeeze`, `shared:fabric_off`, `shared:jumpscare_sting`).

## 원칙
- 조작은 탭/연타/홀드/드래그/스와이프/원 그리기 중 하나. 명령어만 보고 1초 안에 할 일을 알 수 있게.
- 판정은 관대하게, 실패 연출은 성공 연출보다 웃기게.
- `G.level`로 난이도 L1~L3, `G.speed`로 움직임 가속.
- 테스트: `node tools/playtest/page_shot.mjs "made-in-nana/?game=<id>&fast=1" out.png "window.__min.stage.G && window.__min.stage.G.t>1.5" 600 800 0`
