// SABLE YARD — procedural sound. Every effect is synthesized with WebAudio:
// no audio files, no network. The context starts on the first user gesture.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // A short burst of filtered noise. `freq` is the lowpass corner, `dur` seconds.
  burst(freq, dur, vol, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // A pure tone with a pitch slide, for beeps and stings.
  tone(freq0, freq1, dur, vol, type = 'sine', when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // distance in metres scales the shot down and dulls it.
  shot(weaponId, distance = 0) {
    if (!this.ctx) return;
    const att = Math.max(0.12, 1 - distance / 55);
    const dull = Math.max(500, 3200 - distance * 60);
    if (weaponId === 'sniper') {
      this.burst(2400, 0.28, 0.5 * att);
      this.tone(140, 55, 0.22, 0.35 * att, 'sawtooth');
    } else if (weaponId === 'smg') {
      this.burst(dull, 0.09, 0.3 * att);
      this.tone(220, 90, 0.07, 0.2 * att, 'square');
    } else if (weaponId === 'pistol') {
      this.burst(dull, 0.12, 0.34 * att);
      this.tone(190, 80, 0.09, 0.22 * att, 'square');
    } else {
      this.burst(dull, 0.13, 0.38 * att);
      this.tone(170, 70, 0.1, 0.26 * att, 'sawtooth');
    }
  }

  dryClick() { this.tone(1400, 900, 0.04, 0.12, 'square'); }
  hit(head = false) {
    this.tone(head ? 2400 : 1700, head ? 1800 : 1300, 0.06, 0.22, 'sine');
  }
  reload() {
    this.tone(900, 700, 0.05, 0.14, 'square');
    this.tone(1200, 1000, 0.05, 0.14, 'square', 0.22);
  }
  plantTick() { this.tone(1100, 1100, 0.07, 0.16, 'square'); }
  explosion() {
    this.burst(500, 0.9, 0.9);
    this.tone(90, 28, 0.7, 0.6, 'sine');
    this.burst(1800, 0.25, 0.4);
  }
  roundWin() {
    this.tone(523, 523, 0.12, 0.2); this.tone(659, 659, 0.12, 0.2, 'sine', 0.12);
    this.tone(784, 784, 0.22, 0.22, 'sine', 0.24);
  }
  roundLose() {
    this.tone(392, 392, 0.14, 0.2); this.tone(330, 330, 0.14, 0.2, 'sine', 0.14);
    this.tone(262, 220, 0.3, 0.22, 'sine', 0.28);
  }
  buy() { this.tone(880, 1320, 0.09, 0.18, 'sine'); }
  denied() { this.tone(220, 160, 0.12, 0.18, 'square'); }
  hurt() { this.burst(700, 0.12, 0.25); this.tone(120, 70, 0.12, 0.2, 'sawtooth'); }
  grenadePin() { this.tone(1500, 1100, 0.05, 0.14, 'square'); }
}
