// 강나나 게임 공용 계정 + 기록 (Firebase Auth + Firestore).
//
//  - 가입/로그인: 닉네임 + 비밀번호. Firebase 이메일/비밀번호 인증을 쓰되 닉네임을 이메일 모양으로 바꿔 넣는다
//    (닉네임 중복은 Auth가 막아 준다). 세션은 기기(브라우저 저장소)에 남아 다음부터 자동 로그인.
//  - 기록: leaderboards/{gameId}/players/{uid} = { nick, best, plays, at, micro? }
//    best는 올라갈 때만 바뀐다 (규칙에서도 강제: shared/firebase/firestore.rules).
//
// 사용법 (게임 쪽):
//   import { requireLogin, submitScore } from '../../shared/lib/kangnana.js';
//   const user = await requireLogin();               // 로그인 안 돼 있으면 로그인 창을 띄우고 기다림
//   await submitScore('made-in-nana', 23, { micro }); // 게임 오버 때
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, runTransaction, collection, query, orderBy, limit, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';

// 웹 앱 설정값은 공개돼도 되는 값이다. 보안은 Firestore 규칙과 Auth 설정이 맡는다.
const firebaseConfig = {
  apiKey: 'AIzaSyBUPNzmtdxaIrNHY3vQRCpX6KevE5KkpX0',
  authDomain: 'kangnana-87a7e.firebaseapp.com',
  projectId: 'kangnana-87a7e',
  storageBucket: 'kangnana-87a7e.firebasestorage.app',
  messagingSenderId: '368151975966',
  appId: '1:368151975966:web:304b4f9f2ed8049fbb360f',
  measurementId: 'G-STSYDH79VH',
};

export const GAMES = {
  'made-in-nana': { title: '만져라! 메이드인 강나나', unit: '', path: 'made-in-nana/' },
  'banana-power': { title: '무한의 나나', unit: '계단', path: 'banana-power/' },
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics는 있으면 좋고 없어도 그만 (광고 차단기 등에서 실패해도 게임은 돈다)
import('https://www.gstatic.com/firebasejs/13.4.0/firebase-analytics.js')
  .then(async (m) => { if (await m.isSupported()) m.getAnalytics(app); })
  .catch(() => {});

// ---------------------------------------------------------------- nickname <-> email
const NICK_RE = /^[0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ_.\-]{2,10}$/u;
function nickToEmail(nick) {
  const hex = [...new TextEncoder().encode(nick.normalize('NFC'))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `u${hex}@players.kangnana.game`;
}

const authReady = new Promise((res) => { const off = onAuthStateChanged(auth, (u) => { off(); res(u); }); });
export const currentUser = () => auth.currentUser;
export const nickOf = (u = auth.currentUser) => u?.displayName || '';
export const onUser = (fn) => onAuthStateChanged(auth, fn);

const ERR = {
  'auth/email-already-in-use': '이미 있는 닉네임이에요. 로그인하거나 다른 닉네임을 쓰세요.',
  'auth/invalid-credential': '닉네임 또는 비밀번호가 틀렸어요.',
  'auth/wrong-password': '닉네임 또는 비밀번호가 틀렸어요.',
  'auth/user-not-found': '없는 닉네임이에요. 회원가입부터 해 주세요.',
  'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 후 다시 해 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  'auth/configuration-not-found': '서버 설정이 아직 안 됐어요 (Firebase 콘솔에서 Authentication 시작 + 이메일/비밀번호 켜기).',
  'auth/operation-not-allowed': '서버 설정이 아직 안 됐어요 (Firebase에서 이메일/비밀번호 로그인을 켜야 해요).',
};
const errMsg = (e) => ERR[e?.code] || `문제가 생겼어요 (${e?.code || e?.message || e})`;

export async function signUp(nick, pw) {
  nick = nick.trim();
  if (!NICK_RE.test(nick)) throw new Error('닉네임은 2~10자 (한글/영문/숫자/_ . -)');
  if (pw.length < 6) throw Object.assign(new Error(), { code: 'auth/weak-password' });
  const cred = await createUserWithEmailAndPassword(auth, nickToEmail(nick), pw);
  await updateProfile(cred.user, { displayName: nick });
  await setDoc(doc(db, 'users', cred.user.uid), { nick, createdAt: serverTimestamp() });
  return cred.user;
}

export async function logIn(nick, pw) {
  const cred = await signInWithEmailAndPassword(auth, nickToEmail(nick.trim()), pw);
  if (!cred.user.displayName) await updateProfile(cred.user, { displayName: nick.trim() });
  return cred.user;
}

export const logOut = () => signOut(auth);

// ---------------------------------------------------------------- login gate UI
const CSS = `
@font-face { font-family: 'ONE Mobile POP'; src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/ONE-Mobile-POP.woff') format('woff'); font-display: swap; }
.kn-gate{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(20,14,4,.72);font-family:'Pretendard Variable',Pretendard,'Nanum Gothic',sans-serif;padding:16px}
.kn-card{width:min(360px,100%);background:#fff8dc;border:4px solid #1b1306;border-radius:18px;box-shadow:0 8px 0 #1b1306;padding:22px 20px;color:#1b1306}
.kn-card h2{margin:0 0 4px;font-size:26px;text-align:center;font-family:'ONE Mobile POP'}
.kn-card p.sub{margin:0 0 14px;text-align:center;font-size:14px;opacity:.7}
.kn-tabs{display:flex;gap:6px;margin-bottom:14px}
.kn-tabs button{flex:1;font:inherit;font-family:'ONE Mobile POP';font-size:17px;padding:8px;border:3px solid #1b1306;border-radius:10px;background:#fff;cursor:pointer}
.kn-tabs button.on{background:#ffd400}
.kn-card label{display:block;font-size:14px;margin:8px 0 4px}
.kn-card input{width:100%;box-sizing:border-box;font:inherit;font-size:18px;padding:10px 12px;border:3px solid #1b1306;border-radius:10px;background:#fff}
.kn-go{width:100%;margin-top:16px;font:inherit;font-family:'ONE Mobile POP';font-size:21px;padding:12px;border:3px solid #1b1306;border-radius:12px;background:#ffd400;box-shadow:0 4px 0 #1b1306;cursor:pointer}
.kn-go:disabled{opacity:.6}
.kn-err{min-height:20px;margin-top:10px;color:#c0271d;font-size:14px;text-align:center}
.kn-hint{font-size:12px;opacity:.6;margin-top:4px}
.kn-chip{position:fixed;left:10px;bottom:10px;z-index:50;font:700 14px 'Pretendard Variable',Pretendard,'Nanum Gothic',sans-serif;background:#fff;border:3px solid #1b1306;border-radius:99px;padding:5px 10px;color:#1b1306;display:flex;gap:8px;align-items:center}
.kn-chip[hidden]{display:none}
.kn-chip a,.kn-chip button{font:inherit;color:#1b1306;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline}
`;
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

function gateUI(title) {
  style();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'kn-gate';
    el.innerHTML = `<form class="kn-card" autocomplete="on">
      <h2>🍌 강나나 계정</h2><p class="sub">${title ? `${title} — ` : ''}로그인해야 플레이할 수 있어요</p>
      <div class="kn-tabs"><button type="button" data-m="login" class="on">로그인</button><button type="button" data-m="signup">회원가입</button></div>
      <label>닉네임</label><input name="nick" autocomplete="username" maxlength="10" required>
      <div class="kn-hint">2~10자. 랭킹에 이 이름이 보여요</div>
      <label>비밀번호</label><input name="pw" type="password" autocomplete="current-password" minlength="6" required>
      <div class="kn-hint">6자 이상. 한 번 로그인하면 이 기기에선 자동으로 로그인돼요</div>
      <button class="kn-go" type="submit">로그인</button>
      <div class="kn-err"></div></form>`;
    document.body.appendChild(el);
    const form = el.querySelector('form');
    const go = el.querySelector('.kn-go');
    const err = el.querySelector('.kn-err');
    let mode = 'login';
    el.querySelectorAll('.kn-tabs button').forEach((b) => {
      b.onclick = () => {
        mode = b.dataset.m;
        el.querySelectorAll('.kn-tabs button').forEach((x) => x.classList.toggle('on', x === b));
        go.textContent = mode === 'login' ? '로그인' : '가입하고 시작';
        form.pw.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
        err.textContent = '';
      };
    });
    // stop game input handlers from seeing these taps
    for (const t of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart']) el.addEventListener(t, (e) => e.stopPropagation());
    form.onsubmit = async (e) => {
      e.preventDefault();
      go.disabled = true;
      err.textContent = '';
      try {
        const u = mode === 'login' ? await logIn(form.nick.value, form.pw.value) : await signUp(form.nick.value, form.pw.value);
        el.remove();
        resolve(u);
      } catch (ex) {
        err.textContent = ex.code ? errMsg(ex) : ex.message;
        go.disabled = false;
      }
    };
    setTimeout(() => form.nick.focus(), 50);
  });
}

/** Resolve with the signed-in user, showing the login/sign-up dialog first if needed. */
export async function requireLogin(title) {
  const u = await authReady;
  if (auth.currentUser || u) return auth.currentUser || u;
  return gateUI(title);
}

/** Small "닉네임 · 랭킹 · 로그아웃" chip in a corner. */
export function accountChip({ rankingHref = '../ranking/', corner = 'left-bottom' } = {}) {
  style();
  const el = document.createElement('div');
  el.className = 'kn-chip';
  if (corner.startsWith('right')) { el.style.left = 'auto'; el.style.right = '10px'; }
  if (corner.endsWith('top')) { el.style.bottom = 'auto'; el.style.top = '10px'; }
  document.body.appendChild(el);
  for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart']) el.addEventListener(t, (e) => e.stopPropagation());
  onUser((u) => {
    el.hidden = !u;
    if (!u) return;
    el.innerHTML = `🍌 <b></b> · <a href="${rankingHref}">랭킹</a> · <button type="button">로그아웃</button>`;
    el.querySelector('b').textContent = nickOf(u);
    el.querySelector('button').onclick = async () => { await logOut(); location.reload(); };
  });
  return el;
}

// ---------------------------------------------------------------- scores
/** Firestore keeps retrying when the database is missing/offline; give up with a readable error instead. */
export function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('시간 초과: Firestore 데이터베이스가 없거나 인터넷이 끊겼어요'), { code: 'timeout' })), ms))]);
}
/**
 * Record one finished run. best only goes up; plays always counts.
 * micro (optional): { <microgameId>: { w: wins, p: plays } } added to the totals.
 * Returns { best, isBest } (best = the stored personal best after this run). Never throws (offline → null).
 */
export async function submitScore(gameId, score, { micro } = {}) {
  await authReady;
  const u = auth.currentUser;
  if (!u) return null;
  const ref = doc(db, 'leaderboards', gameId, 'players', u.uid);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const old = snap.exists() ? snap.data() : null;
      const prevBest = old?.best ?? -1;
      const isBest = score > prevBest;
      const data = { nick: nickOf(u), plays: increment(1), lastScore: score, lastAt: serverTimestamp() };
      if (isBest) Object.assign(data, { best: score, at: serverTimestamp() });
      else if (!old) Object.assign(data, { best: score, at: serverTimestamp() });
      if (micro) {
        const m = {};
        for (const [id, v] of Object.entries(micro)) m[id] = { w: increment(v.w || 0), p: increment(v.p || 0) };
        data.micro = m;
      }
      tx.set(ref, data, { merge: true });
      return { best: Math.max(prevBest, score), isBest };
    });
  } catch (e) {
    console.warn('submitScore failed', e);
    return null;
  }
}

/** My stored best for a game (null if none / offline). */
export async function myBest(gameId) {
  await authReady;
  const u = auth.currentUser;
  if (!u) return null;
  try {
    const s = await getDoc(doc(db, 'leaderboards', gameId, 'players', u.uid));
    return s.exists() ? s.data().best ?? null : null;
  } catch { return null; }
}

// records left behind by automated tests (their accounts are gone, so the rules won't let anyone delete them)
export const HIDDEN_UIDS = new Set(['hhaF8FOrL2VENgiPGIc5ExX7hkt2']);

/** Top players of a game, best first. */
export async function topScores(gameId, n = 50) {
  const q = query(collection(db, 'leaderboards', gameId, 'players'), orderBy('best', 'desc'), limit(n));
  const s = await withTimeout(getDocs(q), 12000);
  return s.docs.filter((d) => !HIDDEN_UIDS.has(d.id)).map((d) => ({ uid: d.id, ...d.data() }));
}
