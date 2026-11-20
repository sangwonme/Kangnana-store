// Scripted horror moments: build-ups, banana rain, the hall TV, window silhouette, finale + jumpscare.
// 강나나 herself only appears in the finale.
import * as THREE from 'three';
import { makeBanana } from './cooking.js';
import { ps1Material } from './ps1.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const KITCHEN_DOORWAY = V(-0.75, 0, -0.25);

/** Wall-mounted CRT in the hall, angled toward the kitchen doorway. Screen = small pixelated canvas. */
class TV {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(2.82, 2.0, 3.4);
    this.group.lookAt(-0.8, 1.6, 0);
    this.group.scale.setScalar(1.35);
    this.pos = this.group.position.clone();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.42), ps1Material({ color: 0x1c1c1e }));
    body.position.z = -0.1;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), ps1Material({ color: 0x333336 }));
    arm.position.z = -0.45;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 96;
    this.canvas.height = 72;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.375), new THREE.MeshBasicMaterial({ map: this.tex }));
    screen.position.z = 0.115;
    this.flash = new THREE.PointLight(0xfff2d0, 0, 6, 1.5);
    this.flash.position.z = 0.4;
    this.glow = new THREE.PointLight(0xffe070, 0, 4, 1.8);
    this.glow.position.z = 0.5;
    this.group.add(body, arm, screen, this.flash, this.glow);
    scene.add(this.group);
    this.mode = 'off';
    this.t = 0;
    this.draw();
  }

  update(dt) {
    if (this.mode === 'stutter' && !this.freeze) { this.drawStutter(); return; }
    if (this.freeze) { this.drawStatic(); return; }
    this.t += dt * (this.mode === 'fast' ? 4 : 1);
    this.draw();
  }

  drawStatic() {
    const x = this.ctx, img = x.createImageData(96, 72);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    this.tex.needsUpdate = true;
  }

  /** Frozen ad frame with a spinning buffering ring and a tearing band. */
  drawStutter() {
    this.mode = 'ad';
    this.draw(); // last frame (time doesn't advance)
    this.mode = 'stutter';
    const x = this.ctx, now = performance.now() / 120;
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.fillRect(0, 0, 96, 72);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + now;
      x.fillStyle = `rgba(255,255,255,${0.2 + (i / 8) * 0.8})`;
      x.fillRect(48 + Math.cos(a) * 12 - 1.5, 36 + Math.sin(a) * 12 - 1.5, 3, 3);
    }
    const band = Math.floor(Math.random() * 60);
    const img = x.getImageData(0, band, 96, 10);
    x.putImageData(img, Math.floor((Math.random() - 0.5) * 20), band);
    this.tex.needsUpdate = true;
  }

  draw() {
    const x = this.ctx, w = 96, h = 72, t = this.t;
    this.glow.intensity = this.mode === 'ad' ? 1.4 : this.mode === 'warp' ? 0.8 : this.mode === 'static' ? 0.6 : 0;
    if (this.mode === 'off' || this.mode === 'dead') {
      x.fillStyle = '#0d0f10';
      x.fillRect(0, 0, w, h);
      if (this.mode === 'dead') {
        x.strokeStyle = '#3a3d40';
        x.beginPath();
        x.moveTo(40, 30); x.lineTo(10, 8); x.moveTo(40, 30); x.lineTo(80, 12); x.moveTo(40, 30); x.lineTo(70, 66);
        x.moveTo(40, 30); x.lineTo(14, 60); x.moveTo(40, 30); x.lineTo(56, 2);
        x.stroke();
      }
    } else if (this.mode === 'static') {
      const img = x.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    } else {
      // banana CM: flashing yellow, a big bouncing banana, Korean jingle text
      const warp = this.mode === 'warp';
      x.fillStyle = Math.floor(t * 4) % 2 ? '#ffd400' : '#ffe760';
      x.fillRect(0, 0, w, h);
      const by = 30 + Math.sin(t * 9) * 5;
      x.save();
      x.translate(48, by);
      x.rotate(Math.sin(t * 4) * 0.3);
      x.fillStyle = '#f5c400';
      x.strokeStyle = '#6a4a10';
      x.lineWidth = 2;
      x.beginPath();
      x.arc(0, -16, 26, 0.35 * Math.PI, 0.65 * Math.PI);
      x.arc(0, -34, 40, 0.62 * Math.PI, 0.38 * Math.PI, true);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = '#000';
      x.fillRect(-3, 10, 2, 2);
      x.fillRect(3, 10, 2, 2);
      x.restore();
      x.fillStyle = '#c0101a';
      x.font = 'bold 13px sans-serif';
      x.textAlign = 'center';
      x.fillText(Math.floor(t * 1.5) % 2 ? '사랑해요' : '강나나♥', 48, 66);
      if (warp) {
        const img = x.getImageData(0, 0, w, h);
        for (let row = 0; row < h; row++) {
          const shift = Math.floor(Math.sin(row * 0.4 + t * 20) * 6 * Math.random());
          img.data.copyWithin(row * w * 4, row * w * 4 + Math.max(0, shift) * 4, (row + 1) * w * 4);
        }
        x.putImageData(img, 0, 0);
        x.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.3})`;
        x.fillRect(0, 0, w, h);
      }
    }
    this.tex.needsUpdate = true;
  }
}

/** Cheap old radio: 8 kHz, narrow band (380–2600 Hz), mid honk, soft clipping, ~5-bit crush, a little noise. */
async function radioize(buf) {
  const sr = 8000;
  const ctx = new OfflineAudioContext(1, Math.ceil(buf.duration * sr), sr);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1400; pk.Q.value = 1.2; pk.gain.value = 7;
  const pre = ctx.createGain(); pre.gain.value = 2.2;
  const sh = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 2.5);
  sh.curve = curve;
  src.connect(hp).connect(pk).connect(lp).connect(pre).connect(sh).connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  const d = out.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.round(d[i] * 20) / 20 * 0.45 + (Math.random() - 0.5) * 0.012;
  return out;
}

/** Cheerful square-wave jingle used until the real CM song is dropped in as assets/audio/banana_cm.mp3. */
async function placeholderJingle() {
  const sr = 22050, notes = [72, 76, 79, 76, 77, 81, 79, 0, 72, 76, 79, 84, 83, 79, 84, 0];
  const step = 0.3, ctx = new OfflineAudioContext(1, Math.ceil(sr * step * notes.length + sr * 0.3), sr);
  notes.forEach((n, i) => {
    if (!n) return;
    for (const [mul, vol, type] of [[1, 0.18, 'square'], [0.5, 0.12, 'triangle']]) {
      const o = ctx.createOscillator(), gn = ctx.createGain(), t0 = i * step;
      o.type = type;
      o.frequency.value = 440 * 2 ** ((n - 69) / 12) * mul;
      gn.gain.setValueAtTime(vol, t0);
      gn.gain.exponentialRampToValueAtTime(0.001, t0 + step * 0.95);
      o.connect(gn).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + step);
    }
  });
  return ctx.startRendering();
}

export class Events {
  constructor(g) {
    this.g = g;
    this.nana = g.gangnana;
    this.nana.root.visible = false;
    g.scene.add(this.nana.root);
    this.ray = new THREE.Raycaster();
    this.costumeReacted = false;
    this.tv = new TV(g.scene);
  }

  show(pos, lookAt, anim = 'idle') {
    const n = this.nana;
    n.root.position.copy(pos);
    n.faceTo(lookAt.clone().setY(0));
    n.unfreeze();
    n.play(anim, { fade: 0 });
    n.root.visible = true;
  }

  hide() { this.nana.root.visible = false; }

  /** Is the object on screen and not blocked by the level? */
  seen(obj, maxDist = 14) {
    const cam = this.g.camera;
    const p = obj.getWorldPosition(new THREE.Vector3()).setY(1.4);
    const dist = p.distanceTo(cam.position);
    if (dist > maxDist) return false;
    const ndc = p.clone().project(cam);
    if (ndc.z > 1 || Math.abs(ndc.x) > 0.75 || Math.abs(ndc.y) > 0.85) return false;
    this.ray.set(cam.position, p.clone().sub(cam.position).normalize());
    this.ray.far = dist - 0.3;
    const block = this.ray.intersectObject(this.g.world.root, true).find((h) =>
      h.object.visible && !(h.object.material?.transparent && (h.object.material.opacity ?? 1) < 0.7));
    return !block;
  }

  async waitSeen(obj, { hold = 1.0, timeout = 30 } = {}) {
    let seenFor = 0, t = 0;
    while (t < timeout && seenFor < hold) {
      await this.g.wait(0.1);
      t += 0.1;
      seenFor = this.seen(obj) ? seenFor + 0.1 : 0;
    }
    return seenFor >= hold;
  }

  async swingDoor(to, seconds = 0.6) {
    const door = this.g.world.door;
    if (!door) return;
    const from = door.rotation.y;
    await this.g.tween(seconds, (k) => { door.rotation.y = THREE.MathUtils.lerp(from, to, THREE.MathUtils.smoothstep(k, 0, 1)); });
  }

  async flickerOut(hideMid = true) {
    const g = this.g;
    for (let i = 0; i < 3; i++) {
      g.power = 0.08;
      if (i === 1 && hideMid) this.hide();
      await g.wait(0.09 + Math.random() * 0.08);
      g.power = 1;
      await g.wait(0.07 + Math.random() * 0.1);
    }
    this.hide();
    g.power = 1;
  }

  // ---------------------------------------------------------------- beats
  // RULE: 강나나 is never shown in person before the finale (only the black window silhouette).

  /** Player took the costume off → the printer complains by itself, lights stutter, breathing right behind you. */
  async costumeReaction() {
    if (this.costumeReacted) return;
    this.costumeReacted = true;
    const g = this.g;
    await g.wait(1.2);
    g.sound.loop('heartbeat_loop', 0);
    g.sound.fadeLoop('heartbeat_loop', 0.5, 1.5);
    await g.cooking.note('왜 바나나탈 멋대로 벗어?');
    g.sound.play('dread_hit', 0.5);
    await this.flickerOut(false);
    g.sound.play('breath_close', 0.8);
    await g.wait(2.5);
    g.sound.fadeLoop('heartbeat_loop', 0, 2);
  }

  /** Bananas pour out of the kitchen ceiling — 20 of them end up on the floor. */
  async bananaRain() {
    const g = this.g, c = g.cooking;
    const free = (x, z) => !g.player.colliders.some((b) => b.min.y < 0.3 && b.max.y > 0.05 &&
      x > b.min.x - 0.12 && x < b.max.x + 0.12 && z > b.min.z - 0.12 && z < b.max.z + 0.12);
    const spots = [];
    while (spots.length < 20) {
      const back = Math.random() < 0.25;
      const x = back ? -0.25 + Math.random() * 0.55 : -1.05 + Math.random() * 0.55;
      const z = back ? -2.6 + Math.random() * 0.5 : -2.55 + Math.random() * 2.0;
      if (free(x, z)) spots.push([x, z]);
    }
    g.power = 0.15;
    await g.wait(0.25);
    g.power = 1;
    g.sound.play('banana_rain', 1);
    this.fallen = [];
    spots.forEach(([x, z], i) => {
      const b = makeBanana(1.1);
      b.position.set(x, 2.55, z);
      const spin = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const rest = Math.random() * Math.PI * 2;
      g.scene.add(b);
      const delay = (i / 20) * 2.4 + Math.random() * 0.4;
      g.wait(delay).then(() => g.tween(0.55, (k) => {
        b.position.y = 2.55 - 2.53 * k * k;          // gravity
        b.rotation.set(spin.x * k, rest + spin.y * k, spin.z * k);
        if (k === 1) b.rotation.set(0, rest, 0);       // settle flat
      }));
      const entry = g.interact.add({
        at: [x, 0.05, z], size: [0.26, 0.14, 0.26], range: 2.2,
        label: () => (c.expected() === 'pick_banana' ? '바나나 줍기' : null),
        use: () => { b.removeFromParent(); g.interact.remove(entry); c.useStation('pick_banana'); },
      });
      this.fallen.push({ b, entry });
    });
    await g.wait(3.6);
  }

  /** The hall TV turns on by itself: the "사랑해요 강나나" CM, radio-quality, twice.
   *  Second time it suddenly fast-forwards, the tape stretches, it gets stuck buffering… and blows up. */
  async tvCM() {
    const g = this.g, s = g.sound, tv = this.tv;
    s.atPoint('tv_on', tv.pos, 1, 3);
    tv.mode = 'static';
    const st = s.at('tv_static', tv.group, 0.6, 2.5);
    await g.wait(1.4);
    st?.stop();
    const buf = await this.cmBuffer();
    const hiss = s.atLoop('tv_static', tv.group, 0.1, 2.5); // radio hiss under the song
    const VOL = 1.1, REF = 3.5;

    // 1st play — plain (but crunchy)
    tv.mode = 'ad';
    s.atBuffer(buf, tv.group, VOL, REF);
    await g.wait(buf.duration + 0.5);

    // 2nd play — goes wrong
    const a = s.atBuffer(buf, tv.group, VOL, REF);
    const tNormal = buf.duration * 0.5;
    await g.wait(tNormal);
    const ctx = s.listener.context, pr = a?.source?.playbackRate;
    // suddenly double speed
    tv.mode = 'fast';
    if (pr) { pr.cancelScheduledValues(ctx.currentTime); pr.setValueAtTime(2.0, ctx.currentTime); }
    await g.wait(2.2);
    // the tape stretches
    tv.mode = 'warp';
    if (pr) { const now = ctx.currentTime; pr.setValueAtTime(2.0, now); pr.linearRampToValueAtTime(0.25, now + 2.6); }
    await g.wait(2.6);
    a?.stop();
    // stuck buffering on a scrap of the song
    let pos = Math.min(buf.duration - 0.6, tNormal + 2.2 * 2.0 + 2.6 * (2.0 + 0.25) / 2);
    tv.mode = 'stutter';
    for (let i = 0; i < 16; i++) {
      const rate = [1, 0.7, 1.3, 0.5][i % 4] * (1 + i * 0.03);
      const seg = s.atBuffer(buf, tv.group, VOL, REF, rate, { offset: Math.max(0, pos + (Math.random() - 0.5) * 0.08), duration: 0.17 });
      await g.wait(0.14 + (i % 3) * 0.05);
      seg?.stop();
      if (i % 4 === 3) { tv.freeze = true; await g.wait(0.18 + i * 0.025); tv.freeze = false; }
      if (i > 10) pos += 0.05;
    }
    hiss?.stop();
    // 펑
    s.atPoint('tv_pop', tv.pos, 1.2, 3.5);
    tv.mode = 'dead';
    tv.flash.intensity = 8;
    g.power = 0.3;
    await g.wait(0.08);
    tv.flash.intensity = 0;
    g.power = 1;
    await g.wait(0.1);
    tv.flash.intensity = 4;
    await g.wait(0.06);
    tv.flash.intensity = 0;
    await g.wait(2.5);
  }

  /** The user's CM song if present (assets/audio/banana_cm.mp3), otherwise a synthesized placeholder jingle. */
  async cmBuffer() {
    const s = this.g.sound;
    if (s.buffers.banana_cm_radio) return s.buffers.banana_cm_radio;
    let src;
    try {
      src = await new THREE.AudioLoader().loadAsync('assets/audio/banana_cm.mp3');
    } catch {
      src = await placeholderJingle();
    }
    s.buffers.banana_cm_radio = await radioize(src);
    return s.buffers.banana_cm_radio;
  }

  update(dt) { this.tv.update(dt); }

  // ---------------------------------------------------------------- build-up beats
  /** A receipt with nothing on it but "^^". */
  async emptyReceipt() {
    const art = [
      '  _',
      "    _ \\'-_,#",
      "   _\\'--','`|",
      '   \\`---`  /',
      "     `----'`",
    ].join('\n');
    await this.g.cooking.note(art, { pre: true });
  }

  /** The door bell rings, the door opens a crack… nobody. Then footsteps cross the hall. */
  async doorAlone() {
    const g = this.g, s = g.sound;
    s.atPoint('door_bell', V(0.35, 2.2, 4.94), 0.9, 2.5);
    s.atPoint('door_open', V(0.03, 1, 5), 0.6, 2);
    await this.swingDoor(-0.35, 0.9);
    await g.wait(1.8);
    await this.swingDoor(0, 0.7);
    s.atPoint('door_close', V(0.03, 1, 5), 0.5, 2);
    await g.wait(1.4);
    const steps = [V(0.1, 0, 4.2), V(0.2, 0, 3.4), V(0.3, 0, 2.6), V(0.45, 0, 1.9), V(0.6, 0, 1.3), V(0.7, 0, 0.9)];
    for (let i = 0; i < steps.length; i++) {
      s.atPoint(`footstep_tile_${1 + (i % 4)}`, steps[i], 0.8, 1.6);
      await g.wait(0.68);
    }
    await g.wait(2.5);
  }

  /** Lights stutter; a banana has been left on the pickup counter, and the printer says it's a gift. */
  async bananaGift() {
    const g = this.g;
    g.power = 0.1;
    await g.wait(0.25);
    if (!this.gift) {
      this.gift = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.022, 6, 10, 2.2), g.world.ps1Material({ color: 0xf5d020 }));
      this.gift.rotation.x = -Math.PI / 2;
      this.gift.position.set(0.2, 1.06, 0.3);
      g.scene.add(this.gift);
    }
    g.power = 1;
    await g.wait(0.6);
    await g.cooking.note('픽업대에 선물 놓고 갔어요 ^^\n먹어요. 너 바나나 좋아하잖아');
  }

  /** The printer answers the name the player wrote. */
  async nameReply() {
    const name = (this.g.nameWritten || '').replace(/\s/g, '');
    if (name === '강나나') await this.g.cooking.note('맞아 나 강나나야.\n내 이름 어떻게 알았어?');
    else await this.g.cooking.note(Array(10).fill('너 아직 내가 누군지 모르나보구나?').join('\n'), { wall: true });
  }

  /** Make 강나나 a pure black shape (for the window silhouette). */
  blacken(on) {
    this.black ??= this.g.world.ps1Material({ color: 0x000000 });
    this.nana.root.traverse((o) => {
      if (!o.isMesh) return;
      if (on) { o.userData.mat ??= o.material; o.material = this.black; } else if (o.userData.mat) o.material = o.userData.mat;
    });
  }

  /** A street light comes on behind the frosted front windows: 강나나's silhouette is standing there. */
  async silhouette() {
    const g = this.g, s = g.sound;
    const glass = new Set();
    g.world.root.traverse((o) => o.isMesh && [o.material].flat().forEach((m) => m.name === 'glass' && glass.add(m)));
    const saved = [...glass].map((m) => ({ m, c: m.color.clone(), o: m.opacity }));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.8), new THREE.MeshBasicMaterial({ color: 0xfff0d0, fog: false }));
    glow.position.set(0.5, 1.4, 7.4);
    glow.rotation.y = Math.PI;
    glow.visible = false;
    g.scene.add(glow);
    for (const { m } of saved) { m.color.set(0xb4ada0); m.opacity = 0.55; }   // frosted glass

    this.show(V(1.7, 0, 5.8), V(-0.7, 0, -1));
    this.blacken(true);
    for (let i = 0; i < 3; i++) { glow.visible = true; await g.wait(0.07); glow.visible = false; await g.wait(0.14); }
    glow.visible = true;
    s.atPoint('glass_bang', V(1.7, 1.4, 5.0), 1.2, 4);   // 쾅쾅 on the glass as it appears
    s.loop('heartbeat_loop', 0);
    s.fadeLoop('heartbeat_loop', 0.5, 2);
    const noticed = await this.waitSeen(this.nana.root, { hold: 1.0, timeout: 45 });
    if (noticed) {
      s.play('dread_hit', 0.7);
      await g.wait(0.6);
      s.atPoint('glass_bang', V(1.7, 1.4, 5.0), 1.3, 4);  // and again once you've seen it
      await g.wait(1.2);
      // it slides along the glass toward the door…
      await this.nana.walk([V(0.6, 0, 5.8)], 0.55);
      await g.wait(1.6);
    }
    for (let i = 0; i < 3; i++) { glow.visible = false; await g.wait(0.1); glow.visible = true; await g.wait(0.08); }
    glow.removeFromParent();
    this.hide();
    this.blacken(false);
    for (const { m, c, o } of saved) { m.color.copy(c); m.opacity = o; }
    s.fadeLoop('heartbeat_loop', 0, 2);
    await g.wait(1.5);
  }

  async finale() {
    const g = this.g;
    g.finale = true;
    this.kneeling = false;
    g.player.canMove = false;
    g.cooking.hint('');
    await g.wait(1.0);
    // blackout; the printer keeps going on its own
    g.sound.play('power_off', 1);
    g.power = 0;
    for (const id of ['amb_fridge_hum', 'amb_fluorescent']) g.sound.fadeLoop(id, 0, 0.8);
    this.hide();
    await g.wait(1.2);
    g.sound.loop('printer_loop', 0);
    g.sound.fadeLoop('printer_loop', 0.55, 1);
    await g.wait(2.5);
    // stutter on: it is standing in the kitchen doorway
    this.show(KITCHEN_DOORWAY, g.player.pos);
    for (let i = 0; i < 3; i++) { g.power = 0.3; await g.wait(0.1); g.power = 0; await g.wait(0.16); }
    g.power = 0.28;
    g.sound.play('dread_hit', 0.9);
    await g.wait(1.7);
    g.power = 0;
    this.hide();
    await g.wait(1.4);
    g.sound.play('breath_close', 1);
    await g.wait(2.4);
    await this.jumpscare();
    g.sound.fadeLoop('printer_loop', 0, 0.3);
    g.shiftMinutes = 26 * 60;
    await g.wait(1.2);
    g.cooking.endShift();
  }

  /** In-your-face 강나나 + photo flash + sting. */
  async jumpscare() {
    const g = this.g, cam = g.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const pos = cam.position.clone().addScaledVector(fwd, 0.55).setY(0);
    pos.y = cam.position.y - 1.62; // face at eye level
    this.show(pos, cam.position.clone().setY(0), this.nana.has('idle_alert') ? 'idle_alert' : 'idle');
    g.power = 1;
    g.sound.play('jumpscare_sting', 1);
    const el = document.getElementById('scare');
    await g.wait(0.12);
    el.hidden = false;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    await g.wait(0.9);
    el.hidden = true;
    this.hide();
    g.fadeTarget = 0;
    g.post.uniforms.fade.value = 0;
    g.sound.play('power_off', 0.4);
  }
}
