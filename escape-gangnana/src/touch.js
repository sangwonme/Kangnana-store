// Mobile controls: floating joystick on the left, drag-to-look on the right, a context action button (= E),
// tappable costume button. Only activated on touch devices.
export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export function setupTouch(game, { action, actionLabel }) {
  const layer = document.getElementById('touch');
  const stick = document.getElementById('stick');
  const knob = document.getElementById('stick-knob');
  const btn = document.getElementById('btn-act');
  layer.hidden = false;
  document.body.classList.add('touch');

  const R = 50; // joystick radius in px
  let stickId = null, lookId = null, origin = null, last = null;

  layer.addEventListener('pointerdown', (e) => {
    if (e.target === btn) return;
    if (e.clientX < innerWidth * 0.42 && stickId === null) {
      stickId = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
      stick.style.left = `${origin.x}px`;
      stick.style.top = `${origin.y}px`;
      stick.hidden = false;
      knob.style.transform = 'translate(-50%, -50%)';
    } else if (lookId === null) {
      lookId = e.pointerId;
      last = { x: e.clientX, y: e.clientY };
    }
    try { layer.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });

  layer.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      game.player.joy.set(dx / R, dy / R);
    } else if (e.pointerId === lookId) {
      game.player.lookBy((e.clientX - last.x) * 2.2, (e.clientY - last.y) * 2.2);
      last = { x: e.clientX, y: e.clientY };
    }
  });

  const end = (e) => {
    if (e.pointerId === stickId) {
      stickId = null;
      stick.hidden = true;
      game.player.joy.set(0, 0);
    }
    if (e.pointerId === lookId) lookId = null;
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);

  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); action(); });

  // costume button is tappable on mobile
  document.getElementById('costume-hint').addEventListener('pointerdown', () => {
    if (game.cooking.costume) game.cooking.takeOffCostume();
  });

  // keep the action button label in sync with what you're looking at
  return () => {
    const label = actionLabel();
    btn.textContent = label || '·';
    btn.classList.toggle('ready', !!label);
  };
}

/** Fullscreen (+ landscape lock where the browser allows it). Must be called from a user gesture. */
export function goFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement) return;
  Promise.resolve(req.call(el, { navigationUI: 'hide' }))
    .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
    .catch(() => {});
}
