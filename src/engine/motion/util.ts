// Implicit damped spring (unconditionally stable). damping < 1 overshoots = cartoon follow-through.
export class Spring {
  x: number; v = 0;
  constructor(x = 0, public freq = 4, public damping = 0.5) { this.x = x; }
  step(target: number, dt: number): number {
    const w = 2 * Math.PI * this.freq;
    const f = 1 + 2 * dt * this.damping * w;
    const ww = w * w, hww = dt * ww, hhww = dt * hww;
    const inv = 1 / (f + hhww);
    const x = (f * this.x + dt * this.v + hhww * target) * inv;
    const v = (this.v + hww * (target - this.x)) * inv;
    this.x = x; this.v = v;
    return x;
  }
  kick(impulse: number) { this.v += impulse; }
  snap(x: number) { this.x = x; this.v = 0; }
}
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const pulse = (k: number) => Math.sin(clamp(k, 0, 1) * Math.PI);
export const osc = (t: number, hz: number) => Math.sin(t * hz * 2 * Math.PI);
export const easeOutBack = (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };