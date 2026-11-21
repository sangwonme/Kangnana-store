// WebAudio: preloaded one-shots, looping beds with live volume, music.
const BASE = 'assets/audio/';

export class Sound {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.buffers = {};
    this.loops = {};
    let muted = false;
    try { muted = localStorage.getItem('da-muted') === '1'; } catch {}
    this.setMuted(muted);
  }

  async load(names) {
    await Promise.all(names.map(async (n) => {
      try {
        const r = await fetch(`${BASE}${n}.mp3`);
        if (!r.ok) throw new Error(r.status);
        this.buffers[n] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) { console.warn('audio missing', n, e); }
    }));
  }

  unlock() { if (this.ctx.state !== 'running') this.ctx.resume(); }

  play(name, { vol = 1, rate = 1 } = {}) {
    const b = this.buffers[name];
    if (!b) return;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
  }

  /** Start (once) a looping bed; returns nothing, control with loopVolume. */
  loop(name, vol = 0) {
    if (this.loops[name] || !this.buffers[name]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
    this.loops[name] = { src, g };
  }

  loopVolume(name, v, tc = 0.1) {
    const l = this.loops[name];
    if (l) l.g.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  setMuted(m) {
    this.muted = m;
    this.master.gain.value = m ? 0 : 1;
    try { localStorage.setItem('da-muted', m ? '1' : '0'); } catch {}
  }
}
