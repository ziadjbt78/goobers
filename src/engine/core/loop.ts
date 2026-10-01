/**
 * Fixed-timestep simulation loop with interpolated rendering.
 *
 * The simulation runs at a hard 1/60 s with at most 4 substeps per frame, and
 * the real frame delta is clamped to 0.1 s. A slow or backgrounded tab
 * therefore degrades into slow motion instead of teleporting every creature
 * forward — the single biggest source of "the World moves wrong".
 */
export type SimFn = (dt: number, tick: number) => void;
export type RenderFn = (alpha: number, dt: number) => void;

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 4;
const MAX_FRAME_DT = 0.1;

export class Loop {
  readonly simDt: number;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private tick = 0;
  private running = false;

  constructor(
    private onSim: SimFn,
    private onRender: RenderFn,
    _hz = 60,
  ) {
    this.simDt = FIXED_DT;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(frame);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
        this.onSim(FIXED_DT, this.tick++);
        this.acc -= FIXED_DT;
        steps++;
      }
      // never let the accumulator run away: drop the remainder rather than
      // paying it back as a burst of steps on the next frame
      if (steps === MAX_SUBSTEPS) this.acc = 0;
      this.onRender(this.acc / FIXED_DT, dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (cur: number, target: number, lambda: number, dt: number): number =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt));
