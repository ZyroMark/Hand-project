/* Tiny WebAudio synth. Every sound is generated, so the project ships with
   no audio files and nothing to download at runtime.
   Browsers block audio until the user interacts, so init() is called from the
   first click or keypress. */

class Synth {
  constructor() {
    this.ctx    = null;
    this.master = null;
    this.muted  = false;
    this.ready  = false;
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.25;
    return this.muted;
  }

  /** One shaped oscillator note. */
  tone(freq, dur, type, gain, slideTo) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain === undefined ? 0.4 : gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Filtered white noise, for slices and explosions. */
  noise(dur, gain, freq, q) {
    if (!this.ready || this.muted) return;
    const t  = this.ctx.currentTime;
    const n  = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(freq || 1800, t);
    filt.Q.value = q || 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain === undefined ? 0.35 : gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
  }

  /* named sounds used across the modes */

  bounce(speed) {
    const s = Math.min(1, speed / 1400);
    this.tone(160 + s * 420, 0.09 + s * 0.05, 'sine', 0.15 + s * 0.3);
  }

  grab()   { this.tone(520, 0.06, 'triangle', 0.2); }
  release(){ this.tone(300, 0.08, 'triangle', 0.18, 520); }

  slice(combo) {
    this.noise(0.13, 0.3, 2400 + Math.min(combo, 8) * 260, 1.6);
    this.tone(620 + Math.min(combo, 8) * 90, 0.1, 'triangle', 0.16, 1100);
  }

  gold() {
    this.tone(880, 0.09, 'square', 0.16);
    setTimeout(() => this.tone(1320, 0.13, 'square', 0.14), 70);
  }

  bomb() {
    this.noise(0.5, 0.5, 220, 0.7);
    this.tone(150, 0.45, 'sawtooth', 0.3, 40);
  }

  correct() {
    this.tone(660, 0.09, 'sine', 0.22);
    setTimeout(() => this.tone(990, 0.16, 'sine', 0.2), 80);
  }

  wrong()  { this.tone(220, 0.2, 'sawtooth', 0.18, 120); }
  blip()   { this.tone(760, 0.05, 'square', 0.1); }
  gameOver() {
    const notes = [520, 420, 330, 220];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.28, 'triangle', 0.22), i * 150));
  }
  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'square', 0.16), i * 110));
  }
}

export const Sound = new Synth();
