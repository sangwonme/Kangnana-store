// 만져라! 메이드인 강나나 — title, the endless microgame run, intermissions, game over, practice list.
// Every module that changes often is loaded with the page's ?v= version (bumped on each deploy by
// tools/made-in-nana/bump_version.py), so a new deploy never runs against stale cached files.
// assets.js / ps1.js stay unversioned: they're shared by many modules and must stay a single instance.
const V = new URL(import.meta.url).search;
const [{ Sound }, { Stage, A }, { Scheduler, BOSS_EVERY }, { GAMES }, { BananaWorld }] = await Promise.all(
  ['./core/audio.js', './core/stage.js', './core/schedule.js', './games/index.js', './core/idle.js'].map((m) => import(m + V)));

let best = 0;
try { best = +localStorage.getItem('min-best') || 0; } catch {}

// accounts + records (Firebase). If the SDK can't load (offline), the game still runs, just without recording.
const K = await import(`../../shared/lib/kangnana.js${V}`).catch((e) => { console.warn('firebase unavailable', e); return null; });
const chip = K?.accountChip({ rankingHref: '../ranking/?game=made-in-nana', corner: 'left-top' });
const showChip = (on) => { if (chip) chip.style.display = on ? '' : 'none'; };
async function login() {
  if (!K) return null;
  showChip(false);
  const u = await K.requireLogin('만져라! 메이드인 강나나');
  const b = await K.myBest('made-in-nana');
  if (b != null) best = Math.max(best, b);
  return u;
}

const box = document.getElementById('box');
const screen = document.getElementById('screen');
const sound = new Sound();
const stage = new Stage(box, sound);
const world = new BananaWorld(stage.renderer); // 3D banana island behind the intermission overlay
const params = new URLSearchParams(location.search);
const LIVES = 4;
const START_SPEED = 1.15 ** 2; // = the old tempo of game 20 (1.3225x)
const BG = ['#ff5a5f', '#3ec1d3', '#7bd389', '#b388ff', '#ff9f1c', '#2ec4b6', '#f15bb5', '#00bbf9'];

const mods = (await Promise.all(GAMES.map((f) => import(`./games/${f}.js${V}`)
  .then((m) => ({ ...m.default, file: f }))
  .catch((e) => { console.warn('skip game', f, e.message); return null; }))))
  .filter(Boolean).sort((a, b) => a.no - b.no);
const byId = Object.fromEntries(mods.map((g) => [g.id, g]));
window.__min = { stage, sound, mods, world, state: 'boot' };

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
// canvas text can't swap fonts later, so make sure the display font is in before any game draws (give up after 3s)
await Promise.race([Promise.all([document.fonts.load("40px 'ONE Mobile POP'", '만져라!'), document.fonts.load("700 16px 'Pretendard Variable'", '기록')]), wait(3)]).catch(() => {});

function ensureLoaded(g) {
  g._loaded ??= Promise.resolve()
    .then(() => g.load?.(A))
    .then(() => sound.preload(g.sounds || []))
    .catch((e) => console.error('load', g.id, e));
  return g._loaded;
}

function show(html, cls) {
  screen.innerHTML = `<div class="scr ${cls}">${html}</div>`;
  screen.classList.add('on');
  return screen.firstElementChild;
}
const hide = () => { screen.classList.remove('on'); screen.innerHTML = ''; };

const muteBtn = document.getElementById('mute');
const syncMute = () => { muteBtn.textContent = sound.muted ? '🔇' : '🔊'; };
muteBtn.onclick = (e) => { e.stopPropagation(); sound.unlock(); sound.setMuted(!sound.muted); syncMute(); };
syncMute();

// ---------------------------------------------------------------- title
let introDone = false; // the logo + voice intro plays once per visit

function title({ intro = false } = {}) {
  world.stop();
  window.__min.state = 'title';
  if (!introDone) {
    // browsers keep audio locked until the first touch, so the very first screen is just "tap"
    showChip(false);
    sound.stopMusic();
    const tap = show(`<div class="tap-start otext">터치해서 시작</div>`, 'title tap');
    tap.onclick = () => {
      introDone = true;
      sound.unlock();
      title({ intro: true });
      const el = screen.firstElementChild;
      el.classList.add('intro');
      sound.play('vo_title');
      setTimeout(() => {
        el.classList.add('reveal');
        showChip(true);
        sound.music('bgm_title', 1, 0.4);
      }, 1900);
    };
    return;
  }
  if (!intro) { showChip(true); sound.music('bgm_title', 1, 0.4, { keep: true }); }
  const el = show(`
    <img class="logo-img" src="assets/img/logo.png" alt="만져라! 메이드인 강나나">
    <img class="hero" src="assets/img/suit.png" alt="">
    <button class="ibtn start" data-a="start"><img src="assets/img/btn_start_big.png" alt="당장 시작!"></button>
    <div class="row2">
      <button class="ibtn" data-a="list" style="width:43%"><img src="assets/img/btn_list.png" alt="미니게임 목록"></button>
      <button class="ibtn" data-a="rank" style="width:31%"><img src="assets/img/btn_ranking.png" alt="랭킹"></button>
      <button class="ibtn" data-a="options" style="width:22%"><img src="assets/img/btn_options.png" alt="옵션"></button>
    </div>`, 'title');
  const on = (a, fn) => { el.querySelector(`[data-a=${a}]`).onclick = (e) => { e.preventDefault(); sound.unlock(); fn(); }; };
  on('start', async () => { await login(); run(); });
  on('list', async () => { await login(); sound.play('tap'); list(); });
  on('rank', () => { sound.play('tap'); leaderboard(el); });
  on('options', () => {
    sound.play('tap');
    const nick = (K?.nickOf?.() || '').replace(/[<>&"]/g, '');
    modal(el, `<h3>⚙️ 옵션</h3>
      <button class="btn small" data-m="sound">${sound.muted ? '🔇 소리 켜기' : '🔊 소리 끄기'}</button>
      <button class="btn small" data-m="credits">📷 사진 출처</button>
      ${nick ? `<p>🍌 ${nick} 님으로 로그인됨</p><button class="btn small" data-m="logout">로그아웃</button>` : ''}
      <button class="btn small" data-m="close">닫기</button>`,
    { sound: () => { sound.setMuted(!sound.muted); syncMute(); return 'close'; },
      credits: () => { credits(); return 'close'; },
      logout: async () => { await K?.logOut(); location.reload(); } });
  });
  // returning players: pick up the stored best once auth has restored the session
  K?.myBest('made-in-nana').then((b) => { if (b != null && b > best) best = b; });
}

/** Small popup over a screen. actions: {name: fn} for [data-m=name] buttons; a fn returning 'close' (or a 'close' button) closes it. */
function modal(parent, html, actions = {}) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="card">${html}</div>`;
  parent.appendChild(m);
  const close = () => m.remove();
  m.onclick = (e) => { if (e.target === m) close(); };
  m.querySelectorAll('[data-m]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      sound.play('tap');
      const fn = actions[btn.dataset.m];
      if (!fn || (await fn()) === 'close') close();
    };
  });
  return m;
}

// Ranking popup built from the user's leaderboard art: podium for 1-3, rows for 4-10, and a highlighted row for me.
async function leaderboard(parent) {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const m = document.createElement('div');
  m.className = 'lb';
  m.innerHTML = `<div class="lb-wrap">
    <div class="lb-ribbon"><img src="assets/img/lb_ribbon.png" alt=""><span class="otext">랭킹</span></div>
    <div class="lb-panel"><div class="lb-inner"><div class="lb-msg">불러오는 중…</div></div></div>
    <button class="lb-x" aria-label="닫기">✕</button>
    <a class="lb-more" href="../ranking/?game=made-in-nana">전체 랭킹 보기 →</a></div>`;
  parent.appendChild(m);
  const close = () => { sound.play('tap'); m.remove(); };
  m.querySelector('.lb-x').onclick = close;
  m.onclick = (e) => { if (e.target === m) close(); };
  const inner = m.querySelector('.lb-inner');
  if (!K) { inner.innerHTML = '<div class="lb-msg">오프라인이라 랭킹을 볼 수 없어요</div>'; return; }
  let rows;
  try { rows = await K.topScores('made-in-nana', 50); } catch (e) {
    inner.innerHTML = `<div class="lb-msg">랭킹을 불러오지 못했어요<br><small>${esc(e.message || e.code)}</small></div>`;
    return;
  }
  const me = K.currentUser();
  const myIdx = me ? rows.findIndex((r) => r.uid === me.uid) : -1;
  // long names get a smaller font so the whole name always fits (podium slot ≈ 7 chars, row ≈ 13 chars at full size)
  const fit = (text, full, room) => `font-size:calc(var(--u) * ${Math.min(full, (full * room) / Math.max(1, [...text].length)).toFixed(2)})`;
  // podium slots (% of lb_podium.png): [x0, x1, nameY0, nameY1, scoreY0, scoreY1]
  const SLOT = [[34.5, 65.5, 51.1, 76.9, 80.3, 92.1], [2.9, 29.9, 56.5, 76.7, 79.4, 90.2], [70.1, 97.0, 56.8, 76.7, 79.4, 90.2]];
  const pod = SLOT.map(([x0, x1, a0, a1, b0, b1], i) => {
    const r = rows[i];
    const cls = r && myIdx === i ? 'mine' : '';
    const box = (y0, y1, html, c) => `<div class="slot ${c} ${cls}" style="left:${x0}%;width:${x1 - x0}%;top:${y0}%;height:${y1 - y0}%">${html}</div>`;
    return box(a0, a1, `<span class="nm" style="${r ? fit(r.nick, 3, 6.5) : ''}">${r ? esc(r.nick) : '-'}</span>`, '') + box(b0, b1, `<span class="sc">${r ? r.best : ''}</span>`, '');
  }).join('');
  const row = (r, i, extra = '') => `<div class="lb-row ${extra}"><b class="rk">${i + 1}</b><span class="nm" style="${fit(r.nick, 3.3, 13)}">${esc(r.nick)}</span>
    <span class="sc">${r.best}</span></div>`;
  let list = rows.slice(3, 10).map((r, k) => row(r, k + 3, myIdx === k + 3 ? 'me mine' : '')).join('');
  if (rows.length <= 3) list += '<div class="lb-msg" style="padding:4% 0">4위부터는 아직 비어 있어요</div>';
  if (me && (myIdx < 0 || myIdx >= 10)) {
    const mine = myIdx >= 0 ? rows[myIdx] : { nick: K.nickOf(me), best: best };
    list += `<div class="lb-row me mine"><b class="rk">${myIdx >= 0 ? myIdx + 1 : '-'}</b><span class="nm" style="${fit(`나 · ${mine.nick}`, 3.3, 12)}">나 · ${esc(mine.nick)}</span>
      <span class="sc">${mine.best}</span></div>`;
  }
  inner.innerHTML = `<div class="lb-podium"><img src="assets/img/lb_podium.png" alt="">${pod}</div>${list}`;
}

// Photos come from Wikimedia Commons under free licenses; this screen is the required attribution.
async function credits() {
  window.__min.state = 'credits';
  let rows = {};
  try { rows = await (await fetch('assets/photo/credits.json')).json(); } catch {}
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = show(`<h2>사진 출처</h2>
    <div class="credits">${Object.values(rows).map((r) => `<div><b>${esc(r.title.replace(/^File:/, ''))}</b>
      ${esc(r.artist)} · <a href="${esc(r.license_url)}" target="_blank" rel="noopener">${esc(r.license)}</a> ·
      <a href="${esc(r.source)}" target="_blank" rel="noopener">원본</a> <small>(${esc(r.modified)})</small></div>`).join('') || '<div>없음</div>'}</div>
    <p class="credits-note">위키미디어 커먼즈의 자유 라이선스 사진을 잘라 쓰거나 배경을 지워 사용했습니다. CC BY-SA 사진을 고친 이미지는 같은 라이선스를 따릅니다.
    강나나 세계관 인물 사진은 본인들의 것입니다.</p>
    <button class="btn small" data-a="back">뒤로</button>`, 'list credits-scr');
  el.querySelector('[data-a=back]').onclick = () => { sound.play('tap'); title(); };
}

function list() {
  world.stop();
  window.__min.state = 'list';
  showChip(true);
  const el = show(`<div class="list-head"><button class="btn small back" data-a="back">뒤로</button><h2 class="otext">미니게임 갤러리</h2></div>
    <div class="list-body">${[['미니게임', mods.filter((g) => !g.boss)], ['보스', mods.filter((g) => g.boss)]].map(([label, group]) => `
      <h3 class="list-sec otext">${label}</h3>
      <div class="grid">${group.map((g, i) => `<button class="g ${g.boss ? 'boss' : ''}" data-id="${g.id}">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <span class="otext ${[...g.cmd].length > 6 ? 'xlong' : [...g.cmd].length > 5 ? 'long' : ''}">${g.cmd}</span></button>`).join('')}</div>`).join('')}</div>`, 'list');
  el.querySelectorAll('.g').forEach((d) => { d.onclick = () => { sound.play('tap'); run({ only: d.dataset.id }); }; });
  el.querySelector('[data-a=back]').onclick = () => { sound.play('tap'); title(); };
}

// ---------------------------------------------------------------- intermission
// Like the series: a host groove keeps playing between games (tempo follows the game speed), the win/lose phrase and the
// fuse count-in land on top of it, and the next game's own track cuts in when it starts. Timing is in beats of the groove.
const INTER_BPM = 130;

async function intermission({ n, lives, prev, banner, speed, prevSpeed = speed, lostIndex }) {
  window.__min.state = 'inter';
  const rateFor = (sp) => Math.min(1.6, sp);
  let rate = rateFor(prevSpeed);
  const beats = (k) => wait((k * 60) / (INTER_BPM * rate));
  if (prev === 'lose') {
    // the groove droops like a sad tape, then recovers
    sound.music('bgm_inter', rate * 0.78, 0.5, { keep: true });
    setTimeout(() => sound.musicRate(rate, 0.25), 450);
  } else {
    sound.music('bgm_inter', rate, 0.5, { keep: true });
  }
  const bg = BG[n % BG.length];
  const lifeImgs = Array.from({ length: LIVES }, (_, i) => {
    const cls = i >= lives ? (i === lostIndex ? 'dying' : 'dead') : '';
    return `<img class="${cls}" src="assets/img/suit_head.png" alt="">`;
  }).join('');
  const el = show('', 'inter');
  void lifeImgs;
  world.setLives(lives, lostIndex);
  void bg;
  // banana world: HAPPY after a win, SAD after a loss, then IDLE while the next game is announced
  box.classList.remove('no3d');
  world.start(prev === 'win' ? 'happy' : prev === 'lose' || lives <= 0 ? 'sad' : 'idle', rate);
  if (prev) {
    sound.play(prev === 'win' ? 'jg_win' : 'jg_lose');
    await beats(prev === 'lose' ? 3 : 2);
  }
  if (lives > 0) world.setMood('idle');
  if (lives <= 0) {
    // record-stop: the groove winds down to nothing
    sound.musicRate(0.3, 0.35);
    await wait(0.9);
    sound.stopMusic(0.2);
    return;
  }
  if (banner) {
    el.querySelector('.msg')?.remove();
    el.insertAdjacentHTML('beforeend', `<img class="banner" src="assets/img/banner_${banner.img}.png" alt="${banner.text}">`);
    if (banner.boss) sound.stopMusic(0.15); // silence + timpani: the boss gets its own entrance
    else if (speed !== prevSpeed) { rate = rateFor(speed); sound.musicRate(rate, 0.3); }
    sound.play(banner.jingle);
    if (banner.voice) setTimeout(() => sound.play(banner.voice), 250);
    await wait(1.7);
    el.querySelector('.banner').remove();
  }
  el.querySelector('.msg')?.remove();
  el.insertAdjacentHTML('beforeend', `<div class="big">${n}</div>`);
  sound.play('jg_ready', { rate: Math.min(1.4, rate) });
  await beats(3);
}

// ---------------------------------------------------------------- run
let stopFlag = false;

let running = false; // only ONE run loop at a time — a double tap on 시작/다시 used to start two interleaved runs

async function run(opts = {}) {
  if (running) return;
  running = true;
  try { await runLoop(opts); } finally { running = false; }
}

async function runLoop({ only = null } = {}) {
  const practice = !!only;
  const sched = new Scheduler(mods.filter((g) => !g.boss).map((g) => g.id), mods.filter((g) => g.boss).map((g) => g.id));
  let lives = LIVES;
  let cleared = 0;
  let prev = null;
  let lostIndex = -1;
  let prevSpeed = 1;
  const micro = {}; // per-microgame wins/plays for this run (sent to the ranking)
  stopFlag = false;
  showChip(false);
  const exit = practice ? addExit() : null;

  for (let n = 1; lives > 0 && !stopFlag; n++) {
    const id = only || sched.next(n);
    const g = byId[id];
    const cycle = Math.floor((n - 1) / BOSS_EVERY);
    const pos = ((n - 1) % BOSS_EVERY) + 1;
    const level = practice ? +(params.get('lv') || Math.min(3, 1 + Math.floor((n - 1) / 3))) : Math.min(3, 1 + cycle);
    // starts at the old game-20 tempo (~1.32x); +10% at games 4 and 7 of every 10, and +6% per cycle (never drops back)
    const speed = practice ? +(params.get('speed') || START_SPEED)
      : START_SPEED * (1 + 0.06 * cycle) * 1.1 ** Math.min(2, Math.floor((pos - 1) / 3));
    const loading = ensureLoaded(g);
    let banner = null;
    if (!practice) {
      if (g.boss) banner = { text: '보스 등장!', img: 'boss', jingle: 'jg_boss', voice: 'vo_boss', boss: true };
      else if (pos === 4 || pos === 7) banner = { text: '스피드 업!', img: 'speedup', jingle: 'jg_speed', voice: 'vo_speed' };
      else if (pos === 1 && n > 1) banner = { text: '레벨 업!', img: 'levelup', jingle: 'jg_clear', voice: null };
    }
    if (params.get('fast') !== '1') await intermission({ n, lives, prev, banner, speed, prevSpeed, lostIndex });
    lostIndex = -1;
    prevSpeed = speed;
    await loading;
    hide();
    world.stop();
    window.__min.state = 'game';
    window.__min.game = g.id;
    // rare trap round (1/50 of normal games, never the very first game): "아무것도 하지마!" — any touch loses
    const dontTouch = !practice && !g.boss && n > 1 && Math.random() < 1 / 50;
    const r = await stage.run(g, { level, speed, dontTouch });
    window.__min.state = 'after';
    prev = r;
    const m = (micro[g.id] ??= { w: 0, p: 0 });
    m.p++;
    if (r === 'win') { cleared++; m.w++; }
    else if (!practice) { lives--; lostIndex = lives; }
  }
  exit?.remove();
  if (practice) { sound.stopMusic(); list(); return; }
  await intermission({ n: 0, lives, prev, banner: null, speed: 1, lostIndex });
  gameOver(cleared, micro);
}

function addExit() {
  const b = document.createElement('button');
  b.className = 'btn small';
  b.textContent = '연습 끝내기';
  b.style.cssText = 'position:fixed;left:8px;top:8px;z-index:5;font-size:13px;padding:5px 10px;border-width:2px;box-shadow:none;opacity:.75';
  b.onclick = (e) => { e.stopPropagation(); stopFlag = true; b.textContent = '이번 판까지…'; };
  document.body.appendChild(b);
  return b;
}

function gameOver(score, micro) {
  world.stop();
  window.__min.state = 'over';
  showChip(true);
  const isBest = score > best;
  if (isBest) { best = score; try { localStorage.setItem('min-best', String(best)); } catch {} }
  const saved = K?.submitScore('made-in-nana', score, { micro });
  sound.stopMusic();
  sound.play('jg_gameover');
  setTimeout(() => sound.play('vo_gameover'), 1200);
  const el = show(`<h1>게임 오버</h1>
    <img src="assets/img/suit.png" alt="">
    <div class="score">${score}</div>
    <div class="sub">${isBest ? '최고 기록 갱신! 강나나가 감동했다' : `최고 기록 ${best}`}</div>
    <div class="sub" id="saved">${K ? '기록 저장 중…' : '오프라인: 기록이 저장되지 않았어요'}</div>
    <div class="row" style="display:flex;gap:12px"><button class="btn" data-a="again">다시</button><button class="btn small" data-a="title">타이틀</button><button class="btn small" data-a="rank">랭킹</button></div>`, 'over');
  saved?.then((r) => { const s = el.querySelector('#saved'); if (s) s.textContent = r ? '랭킹에 기록 저장됨 🍌' : K?.currentUser() ? '기록 저장 실패 (인터넷 확인)' : '로그인하지 않아 기록은 저장되지 않았어요'; });
  el.querySelector('[data-a=rank]').onclick = () => { sound.play('tap'); leaderboard(el); };
  el.querySelector('[data-a=again]').onclick = () => { sound.play('tap'); run(); };
  el.querySelector('[data-a=title]').onclick = () => { sound.play('tap'); title(); };
}

// ---------------------------------------------------------------- boot
// ?game=<id>[&lv=1..3][&speed=1.3]  practice one game on a loop (auto-starts; good for testing)
// ?fast=1  skip intermissions
if (params.get('game') && byId[params.get('game')]) run({ only: params.get('game') });
else if (params.get('list') === '1') list(); // dev: open the minigame list directly
else if (params.get('run') === '1') run(); // dev: full run without the login screen
else title();
