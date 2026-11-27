// "🏠 게임 목록" button back to the hub, shown only while one of the game's menu screens is visible.
// Usage (in a game's index.html):
//   <script type="module" src="../shared/lib/home.js" data-show="#title, #over"></script>
// data-show = CSS selectors of the menu screens (title, game over, …); the button hides during play.
const me = document.currentScript || document.querySelector('script[src*="shared/lib/home.js"]');
const selectors = me?.dataset.show || '#title';
const pos = me?.dataset.pos || 'bottom-left'; // or 'top-left' / 'top-right' (under a mute button)

const css = document.createElement('style');
css.textContent = `
.kn-home { position: fixed; left: max(10px, env(safe-area-inset-left)); bottom: max(10px, env(safe-area-inset-bottom)); z-index: 60;
  display: none; align-items: center; gap: 6px; padding: 7px 12px 7px 10px; border-radius: 99px;
  font: 700 14px 'Pretendard Variable', Pretendard, 'Nanum Gothic', sans-serif; color: #1b1306; text-decoration: none;
  background: #ffd400; border: 3px solid #1b1306; box-shadow: 0 3px 0 #1b1306; }
.kn-home:active { transform: translateY(2px); box-shadow: 0 1px 0 #1b1306; }
.kn-home.on { display: inline-flex; }
.kn-home.top-right { left: auto; bottom: auto; right: max(10px, env(safe-area-inset-right)); top: 62px; }
.kn-home.top-left { bottom: auto; top: max(10px, env(safe-area-inset-top)); }`;
document.head.appendChild(css);

const a = document.createElement('a');
a.className = `kn-home ${pos}`;
a.href = new URL('../../', import.meta.url).href; // web/ root = the game hub
a.innerHTML = '<span aria-hidden="true">🏠</span>게임 목록';
for (const t of ['pointerdown', 'touchstart']) a.addEventListener(t, (e) => e.stopPropagation());
document.body.appendChild(a);

const visible = (el) => {
  if (!el || el.hidden) return false;
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
const tick = () => {
  const show = [...document.querySelectorAll(selectors)].some(visible);
  a.classList.toggle('on', show);
};
setInterval(tick, 300);
tick();
