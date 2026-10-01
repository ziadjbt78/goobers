import { Spring, clamp } from './util';
import type { Locomotion, LocoKind } from './Locomotion';

export interface JuiceOut { lift: number; squash: number; pitch: number; roll: number; yawSway: number; }

export function hopCurve(t: number) {
  if (t < 0.18) return { lift: 0, squash: -0.28 * Math.sin((t / 0.18) * Math.PI * 0.5) };   // anticipation squash
  if (t < 0.78) { const k = (t - 0.18) / 0.6; return { lift: 4 * k * (1 - k), squash: 0.25 * (1 - Math.sin(k * Math.PI)) }; } // stretch, round at apex
  const k = (t - 0.78) / 0.22; return { lift: 0, squash: -0.3 * Math.sin(k * Math.PI) * (1 - 0.5 * k) };                     // landing squash
}

export class Juice {
  private squash = new Spring(1, 5, 0.35);
  private pitch = new Spring(0, 3, 0.45);   // underdamped -> recoil + wobble on stop
  private roll = new Spring(0, 3, 0.5);
  out: JuiceOut = { lift: 0, squash: 1, pitch: 0, roll: 0, yawSway: 0 };
  constructor(public kind: LocoKind) {}

  update(dt: number, loco: Locomotion) {
    const c = loco.cfg, s = loco.speed, runT = loco.runT();
    const move = clamp(s / c.walkSpeed, 0, 1);
    const p = loco.phase * Math.PI * 2;
    const low = this.kind === 'hexapod';      // ZIK stays low and scuttly
    let lift = 0, sway = 0, sqT = 1;

    if (this.kind === 'hopper') {
      const h = hopCurve(loco.phase);
      lift = h.lift * (0.35 + 0.25 * runT) * move;
      sqT = 1 + h.squash * move;
    } else {
      lift = Math.abs(Math.sin(p)) * (low ? 0.03 : 0.08 + 0.04 * runT) * move;   // fraction of height
      sway = Math.sin(p) * (this.kind === 'biped' ? 0.12 : 0.04) * move;
      if (loco.footfall) this.squash.kick(-(low ? 0.6 : 1.6 + 1.6 * runT));
    }
    const sq = this.squash.step(sqT, dt);
    const pitch = this.pitch.step(clamp(loco.accelLong / c.accel, -1, 1) * 0.22 + runT * 0.1, dt);
    const roll = this.roll.step(clamp((-loco.turnVel * s) / c.runSpeed * 0.35, -0.26, 0.26), dt);
    this.out = { lift, squash: sq, pitch, roll, yawSway: sway * 0.5 };
  }
}