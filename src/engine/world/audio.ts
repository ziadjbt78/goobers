/**
 * audio.ts: procedural WebAudio. No asset files; every sound is synthesised.
 * Unlocks on the first click/key (browser rule). Shift+M mutes (remembered).
 * Under automation the context never unlocks, so every call is a silent no-op.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private wind: GainNode | null = null;
  private windF: BiquadFilterNode | null = null;
  private last = new Map<string, number>();
  private birdT = 2;
  private cricketT = 1;
  muted = false;

  constructor() {
    if (typeof window === 'undefined') return;
    try { this.muted = localStorage.getItem('goobers.muted') === '1'; } catch { /* private mode */ }
    const unlock = (): void => { const c = this.ensure(); if (c && c.state !== 'running') void c.resume(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key === 'M' || e.key === 'm')) this.setMuted(!this.muted);
      unlock();
    });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try { localStorage.setItem('goobers.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return null;
    try {
      const c = new AC();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      const out = c.createGain(); out.gain.value = this.muted ? 0 : 0.55;
      out.connect(comp); comp.connect(c.destination);
      const n = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = n; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(out); src.start();
      this.ctx = c; this.out = out; this.noiseBuf = n; this.wind = g; this.windF = f;
    } catch { this.ctx = null; }
    return this.ctx;
  }

  private live(): AudioContext | null {
    const c = this.ctx;
    return c && c.state === 'running' && !this.muted ? c : null;
  }

  private gate(key: string, sec: number): boolean {
    const c = this.ctx;
    if (!c) return false;
    const t = c.currentTime;
    if (t - (this.last.get(key) ?? -1e9) < sec) return false;
    this.last.set(key, t);
    return true;
  }

  private att(dist: number): number { return 1 / (1 + Math.max(0, dist) * 0.14); }

  private tone(freq: number, to: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0): void {
    const c = this.live();
    if (!c || !this.out || vol < 0.004) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.03);
  }

  private hiss(dur: number, vol: number, freq: number, q: number, type: BiquadFilterType = 'bandpass', delay = 0): void {
    const c = this.live();
    if (!c || !this.out || !this.noiseBuf || vol < 0.004) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }

  /** soft padded step: bigger creature = lower, heavier thump */
  footstep(power: number, size: number, dist: number): void {
    if (!this.live() || dist > 18 || !this.gate('step', 0.03)) return;
    const a = this.att(dist) * (0.10 + 0.10 * Math.min(1, power));
    const sz = Math.max(0.4, size);
    this.hiss(0.07, a, Math.min(2200, 900 / sz), 1.2);
    this.tone(160 / Math.max(0.5, sz), 55, 0.09, a * 0.8);
  }

  /** a mood chirp: small creature = high voice */
  voice(mood: string, size: number, dist: number, key: number): void {
    if (!this.live() || dist > 22 || !this.gate('v' + key, 0.9)) return;
    const a = this.att(dist) * 0.16;
    const p = (520 / Math.sqrt(Math.max(0.3, size))) * (0.9 + Math.random() * 0.2);
    switch (mood) {
      case 'happy': case 'love':
        this.tone(p, p * 1.5, 0.11, a, 'triangle'); this.tone(p * 1.2, p * 1.9, 0.12, a, 'triangle', 0.12); break;
      case 'surprised': case 'scared':
        this.tone(p * 0.9, p * 2.2, 0.16, a, 'triangle'); break;
      case 'sad':
        this.tone(p * 1.1, p * 0.6, 0.35, a * 0.9); break;
      case 'sleepy':
        this.tone(p * 0.7, p * 0.5, 0.4, a * 0.6); break;
      default:
        this.tone(p, p * 1.15, 0.09, a, 'triangle'); this.tone(p * 1.05, p * 0.9, 0.08, a * 0.8, 'triangle', 0.1);
    }
  }

  /** tool / life events */
  event(kind: string, mood: string, size: number, dist: number, key: number): void {
    if (!this.live()) return;
    const a = this.att(dist);
    if (kind === 'spawn') {
      this.hiss(0.35, 0.10 * a, 3800, 2, 'bandpass');
      for (let i = 0; i < 4; i++) this.tone(900 + i * 260, 1300 + i * 300, 0.1, 0.05 * a, 'sine', 0.55 + i * 0.07);
    } else if (kind.startsWith('call')) {
      if (kind === 'call' && this.gate('call', 0.4)) { this.tone(900, 1450, 0.22, 0.08); this.tone(1450, 1100, 0.18, 0.07, 'sine', 0.22); }
    } else if (kind === 'ball') {
      if (this.gate('ball', 0.2)) this.tone(200, 560, 0.28, 0.12, 'sine');
    } else if (kind === 'pet') {
      this.tone(72, 66, 0.7, 0.05 * a, 'sawtooth'); this.tone(74, 70, 0.6, 0.04 * a, 'sawtooth', 0.7);
    } else if (kind === 'feed' || kind === 'eat' || kind === 'chomp') {
      for (let i = 0; i < 3; i++) this.hiss(0.06, 0.12 * a, 1800, 1.5, 'bandpass', i * 0.22);
    } else if (kind === 'drop' || kind === 'land') {
      this.tone(140 / Math.max(0.5, size), 50, 0.14, 0.14 * a);
    }
    if (kind !== 'ball' && kind !== 'call') this.voice(mood, size, dist, key);
  }

  /** wind always, birds by day, crickets at night. day: 0 midnight .. 0.5 noon */
  ambient(dt: number, day: number): void {
    const c = this.live();
    if (!c || !this.wind || !this.windF) return;
    const t = c.currentTime;
    const night = Math.max(0, -Math.sin((day - 0.25) * Math.PI * 2));
    this.wind.gain.setTargetAtTime(0.035 + 0.02 * Math.sin(t * 0.13) + 0.012 * Math.sin(t * 0.71), t, 0.5);
    this.windF.frequency.setTargetAtTime(320 + 140 * Math.sin(t * 0.21), t, 0.5);
    this.birdT -= dt; this.cricketT -= dt;
    if (night < 0.3 && this.birdT <= 0) {
      this.birdT = 2.5 + Math.random() * 5;
      const f = 2400 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.tone(f * (1 + 0.1 * i), f * (1.25 + 0.1 * i), 0.07, 0.025, 'sine', i * 0.11);
    }
    if (night > 0.4 && this.cricketT <= 0) {
      this.cricketT = 0.6 + Math.random() * 0.8;
      for (let i = 0; i < 3; i++) this.tone(4300, 4150, 0.03, 0.012 * night, 'sine', i * 0.06);
    }
  }
}
