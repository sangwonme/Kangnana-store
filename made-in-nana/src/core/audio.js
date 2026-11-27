// WebAudio: lazily-loaded one-shots + one looping music track whose rate follows game speed.
const BASE = 'assets/audio/';

export class Sound {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.buffers = new Map(); // name -> Promise<AudioBuffer|null>
    this.loops = new Set();
    this.bgm = null;
    let muted = false;
    try { muted = localStorage.getItem('min-muted') === '1'; } catch {}
    this.setMuted(muted);
  }

  load(name) {
    if (!this.buffers.has(name)) {
      const url = name.startsWith('shared:') ? `../shared/assets/audio/${name.slice(7)}.mp3` : `${BASE}${name}.mp3`;
      this.buffers.set(name, fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((a) => this.ctx.decodeAudioData(a))
        .catch(() => { console.warn('audio missing', name); return null; }));
    }
    return this.buffers.get(name);
  }

  preload(names) { return Promise.all(names.map((n) => this.load(n))); }

  unlock() { if (this.ctx.state !== 'running') this.ctx.resume(); }

  /** Play a one-shot. Returns a handle {stop(), setRate(r)}; safe to call before the buffer is loaded (it just starts late). */
  play(name, { vol = 1, rate = 1, loop = false } = {}) {
    const h = { src: null, gain: null, stopped: false,
      stop: (fade = 0.05) => {
        h.stopped = true;
        if (!h.src) return;
        const t = this.ctx.currentTime;
        h.gain.gain.setTargetAtTime(0, t, fade / 3);
        try { h.src.stop(t + fade); } catch {}
        this.loops.delete(h);
      },
      setRate: (r) => h.src?.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.05),
      setVol: (v) => h.gain?.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05) };
    this.load(name).then((b) => {
      if (!b || h.stopped) return;
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.loop = loop;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.master);
      src.start();
      h.src = src; h.gain = g;
    });
    if (loop) this.loops.add(h);
    return h;
  }

  /** Stop every looping one-shot (called between games so a forgotten loop never leaks). */
  stopLoops() { for (const h of [...this.loops]) h.stop(); }

  /** Start a looping track. With keep=true and the same track already playing, it just carries on (new rate/volume). */
  async music(name, rate = 1, vol = 0.5, { keep = false } = {}) {
    if (keep && this.bgm && this.bgmName === name) { this.musicRate(rate); this.musicVolume(vol); return; }
    this.stopMusic();
    this.bgmName = name;
    const token = (this._tok = {});
    const b = await this.load(name);
    if (!b || this._tok !== token) return;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.playbackRate.value = rate;
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.value = vol;
    src.connect(this.musicGain);
    src.start();
    this.bgm = src;
  }

  stopMusic(fade = 0.08) {
    this._tok = null;
    this.bgmName = null;
    if (!this.bgm) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(0, t, fade / 3);
    try { this.bgm.stop(t + fade); } catch {}
    this.bgm = null;
  }

  /** Glide the music's playback rate (tc = time constant in seconds). */
  musicRate(r, tc = 0.05) { this.bgm?.playbackRate.setTargetAtTime(r, this.ctx.currentTime, tc); }

  musicVolume(v) { this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

  setMuted(m) {
    this.muted = m;
    this.master.gain.value = m ? 0 : 1;
    try { localStorage.setItem('min-muted', m ? '1' : '0'); } catch {}
  }
}
