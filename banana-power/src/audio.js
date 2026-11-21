// Tiny WebAudio manager: preloaded one-shots with pitch/volume, a looping BGM whose rate can be pushed.
const BASE = 'assets/audio/';

export class Sound {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);
    this.buffers = {};
    this.bgm = null;
    let muted = false;
    try { muted = localStorage.getItem('bp-muted') === '1'; } catch {}
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
    if (!b) return 0;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
    return b.duration / rate;
  }

  music(name) {
    if (this.bgm || !this.buffers[name]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.bgm = src;
  }

  musicRate(r) { this.bgm?.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.15); }
  musicVolume(v) { this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

  setMuted(m) {
    this.muted = m;
    this.master.gain.value = m ? 0 : 1;
    try { localStorage.setItem('bp-muted', m ? '1' : '0'); } catch {}
  }
}
