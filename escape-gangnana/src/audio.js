// Audio manager: loads assets/audio/manifest.json, plays loops, one-shots and 3D positional sounds.
// Missing files are skipped silently so the game runs before audio exists.
import * as THREE from 'three';

export class Sound {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.buffers = {};
    this.loops = {};
  }

  async load() {
    let manifest = [];
    try {
      manifest = await (await fetch('../shared/assets/audio/manifest.json')).json();
    } catch {
      console.warn('no audio manifest yet');
      return;
    }
    const loader = new THREE.AudioLoader();
    await Promise.all(manifest.map(async (e) => {
      try {
        this.buffers[e.id] = await loader.loadAsync(`../shared/assets/audio/${e.file.split('/').pop()}`);
      } catch (err) {
        console.warn('audio failed', e.id, err);
      }
    }));
  }

  resume() {
    const ctx = this.listener.context;
    if (ctx.state !== 'running') ctx.resume();
  }

  duration(id, fallback = 2.2) {
    return this.buffers[id]?.duration ?? fallback;
  }

  loop(id, volume = 0.5) {
    const buf = this.buffers[id];
    if (!buf || this.loops[id]) return this.loops[id];
    const a = new THREE.Audio(this.listener);
    a.setBuffer(buf).setLoop(true).setVolume(volume).play();
    this.loops[id] = a;
    return a;
  }

  fadeLoop(id, to, seconds = 1) {
    const a = this.loops[id];
    if (!a) return;
    const g = a.gain.gain, ctx = this.listener.context;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(to, ctx.currentTime + seconds);
  }

  play(id, volume = 0.8, rate = 1) {
    const buf = this.buffers[id];
    if (!buf) return null;
    const a = new THREE.Audio(this.listener);
    a.setBuffer(buf).setVolume(volume).setPlaybackRate(rate).play();
    return a;
  }

  /** Positional sound attached to an object (follows it). */
  at(id, object, volume = 1, refDistance = 1.2, rate = 1) {
    return this.atBuffer(this.buffers[id], object, volume, refDistance, rate);
  }

  /** Positional playback of a raw AudioBuffer (e.g. the CM song). */
  atBuffer(buf, object, volume = 1, refDistance = 1.2, rate = 1, { offset, duration, loop } = {}) {
    if (!buf) return null;
    const a = new THREE.PositionalAudio(this.listener);
    a.setBuffer(buf).setRefDistance(refDistance).setRolloffFactor(1.4).setVolume(volume).setPlaybackRate(rate);
    if (offset != null) a.offset = offset;
    if (duration != null) a.duration = duration;
    if (loop) a.setLoop(true);
    object.add(a);
    a.play();
    a.source.onended = () => { object.remove(a); a.disconnect(); };
    return a;
  }

  /** Positional looping sound attached to an object; call .stop() to end it. */
  atLoop(id, object, volume = 1, refDistance = 1.2) {
    return this.atBuffer(this.buffers[id], object, volume, refDistance, 1, { loop: true });
  }

  /** Positional sound at a fixed world point. */
  atPoint(id, point, volume = 1, refDistance = 1.2) {
    const holder = new THREE.Object3D();
    holder.position.copy(point);
    this.listener.parent?.parent?.add(holder); // camera's parent = scene
    const a = this.at(id, holder, volume, refDistance);
    if (!a) holder.removeFromParent();
    else a.source.addEventListener('ended', () => holder.removeFromParent());
    return a;
  }
}
