import { Vector3 } from 'three';
import { clamp, smooth, wrapAngle } from './util';

export type LocoKind = 'biped' | 'quadruped' | 'hopper' | 'hexapod';
export interface LocoConfig {
  kind: LocoKind;
  walkSpeed: number;  // world units / s
  runSpeed: number;
  stride: number;     // distance per full gait cycle at walk (CALIBRATE, see integration step 4)
  turnRate: number;   // rad/s max
  accel: number;      // units/s^2
  decel: number;
}

function crossed(a: number, b: number, m: number) {
  if (b >= a) return a < m && b >= m;
  return a < m || b >= m || m === 0; // wrapped past 1 -> 0
}

export class Locomotion {
  pos = new Vector3(); heading = 0; speed = 0; accelLong = 0; turnVel = 0; phase = 0; footfall = false;
  constructor(public cfg: LocoConfig) {}

  update(dt: number, desired: Vector3, groundY: (x: number, z: number) => number) {
    const c = this.cfg;
    const want = Math.hypot(desired.x, desired.z);
    let align = 1;
    if (want > 0.05) {
      const err = wrapAngle(Math.atan2(desired.x, desired.z) - this.heading);
      const step = clamp(err * 6, -c.turnRate, c.turnRate) * dt;
      this.turnVel = step / dt;
      this.heading = wrapAngle(this.heading + step);
      align = Math.max(0, Math.cos(err)); // turn first, never walk sideways
    } else this.turnVel = 0;

    const target = Math.min(want, c.runSpeed) * align;
    const rate = target > this.speed ? c.accel : c.decel;
    const prev = this.speed;
    this.speed += clamp(target - this.speed, -rate * dt, rate * dt);
    this.accelLong = (this.speed - prev) / Math.max(dt, 1e-4);

    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.pos.y = groundY(this.pos.x, this.pos.z);

    // Phase from DISTANCE, never time -> no moonwalking. Running lengthens the stride by 40%.
    const stride = c.stride * (1 + 0.4 * smooth(c.walkSpeed, c.runSpeed, this.speed));
    const p0 = this.phase;
    this.phase = (this.phase + (this.speed * dt) / stride) % 1;
    this.footfall = this.speed > 0.05 &&
      (crossed(p0, this.phase, 0) || (c.kind !== 'hopper' && crossed(p0, this.phase, 0.5)));
  }

  /** Same convention as the Heroes gait slider: 0 = stand, 0.6 = walk, 1 = trot. */
  gaitAmount() {
    const c = this.cfg;
    if (this.speed < 0.02) return 0;
    return clamp(this.speed / c.walkSpeed, 0, 1) * 0.6 + 0.4 * smooth(c.walkSpeed, c.runSpeed, this.speed);
  }
  runT() { return smooth(this.cfg.walkSpeed, this.cfg.runSpeed, this.speed); }
}

export function arrive(from: Vector3, to: Vector3, maxSpeed: number, slowRadius = 1.5, out = new Vector3()) {
  out.subVectors(to, from); out.y = 0;
  const d = out.length();
  if (d < 0.05) return out.set(0, 0, 0);
  return out.multiplyScalar((maxSpeed * Math.min(1, d / slowRadius)) / d);
}