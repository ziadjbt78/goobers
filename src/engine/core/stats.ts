/**
 * Frame-time budget tracker + on-screen overlay (backtick toggles).
 *
 * Time is measured with performance.now() deltas between real frames and
 * smoothed over the last 30 — never from a simulation clock. A counter fed by
 * a stopped clock is what produced "0 fps / Infinity ms" on the frozen
 * verification page, and that is a lie the overlay must never tell.
 */
const WINDOW = 30;

export class Stats {
  fps = 0;
  ms = 0;
  cpuMs = 0;
  drawCalls = 0;
  triangles = 0;
  programs = 0;
  creatures = 0;
  /** wall-clock seconds since the page started, for the sim log */
  elapsed = 0;
  visible = false;

  private last = 0;
  private deltas: number[] = [];
  private el: HTMLDivElement | null = null;

  constructor() {
    this.last = performance.now();
    document.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.code === 'Backquote') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    if (this.visible && !this.el) {
      const d = document.createElement('div');
      d.style.cssText = [
        'position:fixed', 'left:12px', 'bottom:12px', 'z-index:9999',
        'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
        'color:#c9f7ff', 'background:rgba(8,10,20,.82)', 'border:1px solid rgba(120,220,255,.25)',
        'border-radius:10px', 'padding:8px 11px', 'pointer-events:none', 'white-space:pre',
        'text-shadow:0 1px 2px #000', 'backdrop-filter:blur(6px)',
      ].join(';');
      document.body.appendChild(d);
      this.el = d;
    }
    if (this.el) this.el.style.display = this.visible ? 'block' : 'none';
  }

  beginFrame(): void {
    const now = performance.now();
    const d = now - this.last;
    this.last = now;
    this.elapsed += d / 1000;
    // Only a genuinely stalled clock is rejected (paused tab, breakpoint, a
    // multi-second build stall). A slow software rasterizer can legitimately
    // take 1-3 s per frame, and an honest overlay must report that instead of
    // filtering every real frame away and then claiming 0 fps / 0.00 ms.
    if (d > 0 && d < 4000) {
      this.deltas.push(d);
      if (this.deltas.length > WINDOW) this.deltas.shift();
    }
    if (this.deltas.length >= 1) {
      let sum = 0;
      for (const v of this.deltas) sum += v;
      const avg = sum / this.deltas.length;
      this.ms = +avg.toFixed(2);
      this.fps = avg > 0 ? Math.round(1000 / avg) : 0;
    }
  }

  endFrame(dtMs: number, renderInfo: { calls: number; triangles: number; programs: number }): void {
    this.cpuMs = +dtMs.toFixed(2);
    this.drawCalls = renderInfo.calls;
    this.triangles = renderInfo.triangles;
    this.programs = renderInfo.programs;
    if (this.el && this.visible) this.paint();
  }

  /** Called on a timer so the overlay updates even when nothing is rendering. */
  paint(): void {
    if (!this.el) return;
    const spark = '▁▂▃▄▅▆▇█';
    const hist = this.deltas.length ? this.deltas : [16.6];
    const mx = Math.max(...hist, 16.6);
    const line = hist.map((v) => spark[Math.min(7, Math.floor((v / mx) * 7.999))]).join('');
    const peak = Math.max(...hist).toFixed(1);
    this.el.textContent =
      `FPS   ${String(Math.max(0, this.fps)).padStart(3)}   (${this.ms.toFixed(2)} ms avg, ${peak} ms peak)\n` +
      `draws ${this.drawCalls}  tris ${(this.triangles / 1000).toFixed(1)}k  progs ${this.programs}` +
      (this.creatures ? `  creatures ${this.creatures}` : '') + '\n' +
      line;
  }
}

export const stats = new Stats();
setInterval(() => stats.paint(), 250);
