// Runs one microgame inside the 3:4 box: owns the WebGL + 2D canvases, input, timer fuse and command card.
// Game contract: see src/games/README.md.
import * as THREE from 'three';
import { PS1Post } from '../../../shared/lib/ps1.js';
import { A } from './assets.js';

export const W = 600;
export const H = 800;

export class Stage {
  constructor(box, sound) {
    this.box = box;
    this.sound = sound;
    this.cv = box.querySelector('#c2d');
    this.c = this.cv.getContext('2d');
    this.renderer = new THREE.WebGLRenderer({ canvas: box.querySelector('#gl'), antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.ps1 = new PS1Post(this.renderer, { height: 220 });
    this.ps1.uniforms.fade.value = 1;
    this.hud = box.querySelector('#hud');
    this.fuse = box.querySelector('#fuse-bar');
    this.bomb = box.querySelector('#fuse-bomb');
    this.count = box.querySelector('#count');
    this.cmd = box.querySelector('#cmd');
    this.captionEl = box.querySelector('#caption');
    this.inst = null;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(box);
    this.bindInput();
  }

  resize() {
    const r = this.box.getBoundingClientRect();
    this.rect = r;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(r.width * this.dpr);
    this.cv.height = Math.round(r.height * this.dpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(r.width, r.height, false);
    this.ps1.setSize(r.width, r.height);
    document.documentElement.style.setProperty('--u', `${r.width / 100}px`); // also used by buttons outside the box
  }

  toLogical(e) {
    const r = this.box.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, id: e.pointerId };
  }

  bindInput() {
    const down = new Set();
    this.pointer = { x: W / 2, y: H / 2, down: false };
    const send = (type, e) => {
      const p = this.toLogical(e);
      p.down = down.size > 0;
      Object.assign(this.pointer, { x: p.x, y: p.y, down: p.down });
      const g = this.inst;
      if (g && !this.G.result && this.G.t >= 0) g[type]?.(p);
    };
    this.box.addEventListener('pointerdown', (e) => {
      if (!this.inst) return;
      if (this._trap && this.G && !this.G.result) { this._trap(); return; }
      this.box.setPointerCapture?.(e.pointerId);
      down.add(e.pointerId);
      send('down', e);
    });
    this.box.addEventListener('pointermove', (e) => send('move', e));
    const up = (e) => { if (!down.delete(e.pointerId)) return; send('up', e); };
    this.box.addEventListener('pointerup', up);
    this.box.addEventListener('pointercancel', up);
    this.box.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  caption(text, dur = 1.4) {
    // no subtitles once a round is decided (games often call caption() and win()/lose() in the same tick, so check a tick later);
    // and none while the command card is still up — those wait until it has gone
    const G = this.G;
    const wait = G ? Math.max(0, (this.textFrom || 0) - G.t) : 0;
    setTimeout(() => { if (this.G === G && G && !G.result) this._showCaption(text, dur); }, wait * 1000);
  }

  _showCaption(text, dur) {
    this.captionEl.textContent = text;
    this.captionEl.classList.add('on');
    clearTimeout(this._capT);
    this._capT = setTimeout(() => this.captionEl.classList.remove('on'), dur * 1000);
  }

  shake(px = 10, dur = 0.3) { this._shake = { px, until: performance.now() + dur * 1000 }; }

  showCommand(game, dur, level = 1) {
    const t = this.cmd.querySelector('.cmd-text');
    t.textContent = game.cmd;
    t.style.fontSize = `calc(var(--u) * ${Math.min(19, 92 / ([...game.cmd].length * 0.98)).toFixed(2)})`;
    this.cmd.querySelector('.cmd-hint').textContent = (typeof game.hint === 'function' ? game.hint(level) : game.hint) || '';
    this.cmd.style.setProperty('--cmd-dur', `${dur}s`);
    this.cmd.classList.remove('on');
    void this.cmd.offsetWidth;
    this.cmd.classList.add('on');
  }

  /** Run one game to completion. Resolves to 'win' | 'lose'. */
  /** dontTouch: the "아무것도 하지마!" trap round — the game plays, but any touch loses and waiting it out wins. */
  run(game, { level = 1, speed = 1, dontTouch = false } = {}) {
    // never let two games tick at once: a stale loop from a previous run is cancelled
    this._runId = (this._runId || 0) + 1;
    const runId = this._runId;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 500);
    camera.position.set(0, 1.5, 6);
    const duration = game.boss ? (game.duration ?? 30) : Math.max(2.8, (game.duration ?? 5) / speed);
    const afterglow = game.afterglow ?? 1.1;
    const mixers = [];
    const sound = this.sound;
    let endAt = Infinity;
    let usePS1 = false;
    let lastTick = 99;
    let lastSfxAt = -1e9; // for the silent-fail safety net below
    this.ps1.height = 220;
    this.ps1.setSize(this.rect.width, this.rect.height);
    // the renderer is shared: undo whatever the previous game changed
    const rd = this.renderer;
    rd.setClearColor(0x000000, 1);
    rd.localClippingEnabled = false;
    rd.clippingPlanes = [];
    rd.toneMapping = THREE.NoToneMapping;
    rd.toneMappingExposure = 1;
    rd.shadowMap.enabled = false;

    const G = this.G = {
      W, H, THREE, A, level, speed, duration, t: 0, left: duration, result: null,
      scene, camera, renderer: this.renderer, c2d: this.c, pointer: this.pointer,
      showTimer: !game.boss,
      win: () => decide('win'),
      lose: () => decide('lose'),
      sfx: (name, o) => { lastSfxAt = performance.now(); return sound.play(name, o); },
      caption: (t, d) => this.caption(t, d),
      shake: (px, d) => this.shake(px, d),
      usePS1: (h) => { usePS1 = true; if (h) { this.ps1.height = h; this.ps1.setSize(this.rect.width, this.rect.height); } },
      /** Register an AnimationMixer that the stage updates every frame. Returns {mixer, play(name, {loop, fade, timeScale, clamp})}. */
      animate(root, clips) {
        const mixer = new THREE.AnimationMixer(root);
        mixers.push(mixer);
        let cur = null;
        const byName = Array.isArray(clips) ? Object.fromEntries(clips.map((c) => [c.name, c])) : clips;
        return {
          mixer,
          play(name, { loop = true, fade = 0.15, timeScale = 1, clamp = true } = {}) {
            const clip = byName[name];
            if (!clip) return null;
            const a = mixer.clipAction(clip);
            a.reset();
            a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
            a.clampWhenFinished = clamp;
            a.timeScale = timeScale;
            a.play();
            if (cur && cur !== a) cur.crossFadeTo(a, fade, false);
            cur = a;
            return a;
          },
        };
      },
      /** Pointer (logical px) -> THREE.Raycaster from the game camera. */
      ray(p) {
        const r = new THREE.Raycaster();
        r.setFromCamera(new THREE.Vector2((p.x / W) * 2 - 1, -(p.y / H) * 2 + 1), camera);
        return r;
      },
      /** Pointer -> point on the plane y = h (or any THREE.Plane). */
      groundPoint(p, h = 0) {
        const plane = h instanceof THREE.Plane ? h : new THREE.Plane(new THREE.Vector3(0, 1, 0), -h);
        return G.ray(p).ray.intersectPlane(plane, new THREE.Vector3());
      },
      /** World position -> logical 2D px (for drawing 2D overlays on 3D things). */
      toScreen(v) {
        const q = v.clone().project(camera);
        return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H };
      },
      text(str, x, y, { size = 48, color = '#fff', stroke = '#1b1306', lw, align = 'center', font = 'ONE Mobile POP', baseline = 'middle', alpha = 1 } = {}) {
        const c = this.c2d;
        c.save();
        c.globalAlpha = alpha;
        c.font = `${size}px ${font.includes(',') ? font : `'${font}'`}`;
        c.textAlign = align;
        c.textBaseline = baseline;
        c.lineJoin = 'round';
        if (stroke) { c.lineWidth = lw ?? size * 0.16; c.strokeStyle = stroke; c.strokeText(str, x, y); }
        c.fillStyle = color;
        c.fillText(str, x, y);
        c.restore();
      },
      /**
       * Speech bubble drawn as ONE path (rounded box + tail), so there is no seam where the tail meets the box.
       * (x, y) = box center. tail = [tx, ty] tip point (optional). Text may contain '\n'.
       */
      bubble(text, x, y, { size = 30, tail = null, fill = '#fff', stroke = '#1b1306', lw = 4, color = '#1b1306', pad = 14,
        r = 16, font = "'ONE Mobile POP'", alpha = 1, rot = 0 } = {}) {
        const c = this.c2d;
        const lines = String(text).split(/\r?\n/);
        c.save();
        c.globalAlpha = alpha;
        c.font = `${size}px ${font}`;
        const w = Math.max(...lines.map((l) => c.measureText(l).width)) + pad * 2;
        const h = lines.length * size * 1.15 + pad * 1.4;
        c.translate(x, y);
        c.rotate(rot);
        const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
        r = Math.min(r, w / 2, h / 2);
        // tail: base on the edge facing the tip, as two points along that edge
        let tp = null;
        if (tail) {
          const tx = tail[0] - x, ty = tail[1] - y;
          const cs = Math.cos(-rot), sn = Math.sin(-rot);
          tp = [tx * cs - ty * sn, tx * sn + ty * cs];
        }
        const bw = Math.min(22, w / 4);
        const side = !tp ? null : Math.abs(tp[1]) / h > Math.abs(tp[0]) / w ? (tp[1] > 0 ? 'b' : 't') : (tp[0] > 0 ? 'r' : 'l');
        const clampX = (v) => Math.max(x0 + r + bw, Math.min(x1 - r - bw, v));
        const clampY = (v) => Math.max(y0 + r + bw, Math.min(y1 - r - bw, v));
        c.beginPath();
        c.moveTo(x0 + r, y0);
        if (side === 't') { const bx = clampX(tp[0] * 0.5); c.lineTo(bx - bw, y0); c.lineTo(tp[0], tp[1]); c.lineTo(bx + bw, y0); }
        c.lineTo(x1 - r, y0);
        c.arcTo(x1, y0, x1, y0 + r, r);
        if (side === 'r') { const by = clampY(tp[1] * 0.5); c.lineTo(x1, by - bw); c.lineTo(tp[0], tp[1]); c.lineTo(x1, by + bw); }
        c.lineTo(x1, y1 - r);
        c.arcTo(x1, y1, x1 - r, y1, r);
        if (side === 'b') { const bx = clampX(tp[0] * 0.5); c.lineTo(bx + bw, y1); c.lineTo(tp[0], tp[1]); c.lineTo(bx - bw, y1); }
        c.lineTo(x0 + r, y1);
        c.arcTo(x0, y1, x0, y1 - r, r);
        if (side === 'l') { const by = clampY(tp[1] * 0.5); c.lineTo(x0, by + bw); c.lineTo(tp[0], tp[1]); c.lineTo(x0, by - bw); }
        c.lineTo(x0, y0 + r);
        c.arcTo(x0, y0, x0 + r, y0, r);
        c.closePath();
        c.lineJoin = 'round';
        c.fillStyle = fill;
        c.fill();
        if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
        c.fillStyle = color;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        lines.forEach((l, i) => c.fillText(l, 0, (i - (lines.length - 1) / 2) * size * 1.15 + size * 0.04));
        c.restore();
      },
      rand: (a = 0, b = 1) => a + Math.random() * (b - a),
      pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      lerp: (a, b, t) => a + (b - a) * t,
    };

    // trap round: the game's own verdicts are ignored; only a touch (lose) or the buzzer (win) decides
    if (dontTouch) { G.win = () => {}; G.lose = () => {}; }
    const decide = (r) => {
      if (G.result) return;
      G.result = r;
      this.captionEl.classList.remove('on');
      if (r === 'lose') {
        // some games fail silently: if nothing was heard around the moment of failure, add a comic fail sound
        const at = performance.now();
        setTimeout(() => { if (lastSfxAt < at - 350 && runId === this._runId) { sound.play('bonk', { vol: 0.9 }); sound.play('deflate', { vol: 0.5, rate: 1.4 }); } }, 160);
      }
      endAt = G.t + afterglow;
    };

    this.box.classList.toggle('no3d', game.layer === '2d');
    this.count.style.opacity = 0;
    const cmdDur = game.boss ? 1.4 : Math.max(0.7, 1.0 / Math.sqrt(speed));
    this.showCommand(dontTouch ? { cmd: '아무것도 하지마!', hint: '' } : game, cmdDur, level);
    if (dontTouch) sound.play('vo_dont', { vol: 1 });
    else if (game.no) sound.play(`vo_${String(game.no).padStart(2, '0')}`, { vol: 0.9 });
    const scareEl = this.box.querySelector('#scare');
    this._trap = dontTouch ? () => {
      lastSfxAt = performance.now();
      decide('lose');
      endAt = G.t + 1.7; // let the scare land
      scareEl.classList.remove('on'); void scareEl.offsetWidth; scareEl.classList.add('on');
      sound.stopMusic(0.05);
      sound.play('scare', { vol: 1 });
      sound.play('shared:jumpscare_sting', { vol: 1 });
      setTimeout(() => sound.play('evil_laugh', { vol: 0.8, rate: 0.85 }), 380);
      this.shake(26, 0.6);
    } : null;
    if (game.bgm) sound.music(game.bgm, game.boss ? 1 : Math.min(1.7, speed), game.bgmVol ?? 0.45);
    else sound.stopMusic();

    // in-game text waits until the command card has gone, so the two never overlap
    // (the card fades during its last ~25%; text may appear from then on)
    const textFrom = cmdDur * 0.78;
    this.textFrom = textFrom;
    for (const k of ['text', 'bubble']) {
      const raw = G[k];
      G[k] = function (...a) { if (G.t < textFrom && !G.result) return; return raw.apply(G, a); };
    }
    const inst = this.inst = game.create(G) || {};
    this.hud.classList.toggle('on', G.showTimer); // after create() so a game can turn the fuse off

    return new Promise((resolve) => {
      let last = performance.now();
      const frame = (now) => {
        if (runId !== this._runId) return; // superseded by a newer run
        const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // rAF time can be slightly before `last` on frame 1
        last = now;
        G.t += dt;
        G.left = Math.max(0, duration - G.t);
        if (!G.result && G.t >= duration && dontTouch) {
          decide('win'); // kept their hands off — survived
        } else if (!G.result && G.t >= duration) {
          decide(game.timeout || 'lose');
          const r = inst.timeout?.(G.result); // a game may judge at the buzzer by returning 'win' | 'lose'
          if (r === 'win' || r === 'lose') G.result = r;
        }

        const c = this.c;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.cv.width, this.cv.height);
        c.setTransform(this.cv.width / W, 0, 0, this.cv.height / H, 0, 0);
        try { inst.update?.(dt, G.t); } catch (e) { console.error(game.id, e); decide('win'); }
        for (const m of mixers) m.update(dt);
        if (game.layer !== '2d') {
          if (usePS1) this.ps1.render(scene, camera, G.t);
          else { this.renderer.setRenderTarget(null); this.renderer.render(scene, camera); }
        }

        // fuse + 3-2-1
        if (G.showTimer) {
          const f = G.left / duration;
          this.fuse.style.width = `${f * 100}%`; // the rope burns down toward the bomb
          const n = Math.ceil(G.left);
          if (!G.result && n <= 3 && n >= 1 && n < lastTick) {
            lastTick = n;
            this.count.textContent = n;
            this.count.style.opacity = 1;
            this.count.classList.remove('tick'); void this.count.offsetWidth; this.count.classList.add('tick');
            sound.play('tick', { vol: 0.5 });
          }
          if (G.result) this.count.style.opacity = 0;
        }
        const sh = this._shake;
        this.box.style.transform = sh && now < sh.until
          ? `translate(${(Math.random() - 0.5) * sh.px}px, ${(Math.random() - 0.5) * sh.px}px)` : '';

        if (G.t >= endAt) {
          this.finish(inst, scene);
          resolve(G.result);
          return;
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  finish(inst, scene) {
    this._trap = null;
    this.box.querySelector('#scare')?.classList.remove('on');
    try { inst.dispose?.(); } catch (e) { console.error(e); }
    this.inst = null;
    this.sound.stopLoops();
    this.hud.classList.remove('on');
    this.cmd.classList.remove('on');
    this.captionEl.classList.remove('on');
    this.box.style.transform = '';
    scene.traverse((o) => {
      if (!o.geometry?.userData?.keep) o.geometry?.dispose?.();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) m.dispose();
    });
    this.renderer.renderLists.dispose();
    this.c.setTransform(1, 0, 0, 1, 0, 0);
    this.c.clearRect(0, 0, this.cv.width, this.cv.height);
  }
}
