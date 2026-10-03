/** Engine rumble (procedural noise), UI beeps and mission-control voice callouts. */
export class AudioSystem {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.lastSpoken = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    this.src = ctx.createBufferSource(); this.src.buffer = buf; this.src.loop = true;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 120;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.src.connect(this.filter).connect(this.gain).connect(ctx.destination);
    this.src.start();
  }

  /** level 0..1 engine power, atmo 0..1 how much air there is to carry sound */
  setEngine(level, atmo) {
    if (!this.ctx || !this.settings.sound) { if (this.gain) this.gain.gain.value = 0; return; }
    const g = Math.min(1, level) * (0.15 + 0.85 * atmo) * 0.7;
    this.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.1);
    this.filter.frequency.setTargetAtTime(80 + 220 * level, this.ctx.currentTime, 0.1);
  }

  beep(freq = 880, dur = 0.08, vol = 0.12) {
    if (!this.ctx || !this.settings.sound) return;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.frequency.value = freq; o.type = 'square';
    g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + dur);
  }

  say(text, priority = false) {
    if (!this.settings.voice || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (!priority && speechSynthesis.pending && now - this.lastSpoken < 1500) return;
    if (priority) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[—×·]/g, ',').replace(/°/g, ' degrees'));
    u.rate = 1.05; u.pitch = 0.95; u.volume = 0.9;
    speechSynthesis.speak(u);
    this.lastSpoken = now;
  }

  stopVoice() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
}
