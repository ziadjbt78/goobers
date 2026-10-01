import { Vector3 } from 'three';
import { Spring, clamp } from './util';

export class Dangle {
  active = false; airborne = false;
  pos = new Vector3(); vel = new Vector3();
  pitch = 0; roll = 0; flail = 0;
  private sx = new Spring(0, 2.5, 0.3); private sy = new Spring(0, 2.5, 0.3); private sz = new Spring(0, 2.5, 0.3);
  private tp = new Spring(0, 1.8, 0.2); private tr = new Spring(0, 1.8, 0.2);

  grab(from: Vector3) {
    this.active = true; this.airborne = false; this.pos.copy(from);
    this.sx.snap(from.x); this.sy.snap(from.y); this.sz.snap(from.z);
  }
  release(v: Vector3) { this.active = false; this.airborne = true; this.vel.copy(v).clampLength(0, 9); }

  /** Returns true on the frame it lands. */
  update(dt: number, grab: Vector3 | null, hang: number, heading: number, groundY: (x: number, z: number) => number): boolean {
    if (this.active && grab) {
      const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
      this.pos.set(this.sx.step(grab.x, dt), this.sy.step(grab.y - hang, dt), this.sz.step(grab.z, dt));
      this.vel.set((this.pos.x - px) / dt, (this.pos.y - py) / dt, (this.pos.z - pz) / dt);
      const lz = this.vel.x * Math.sin(heading) + this.vel.z * Math.cos(heading);
      const lx = this.vel.x * Math.cos(heading) - this.vel.z * Math.sin(heading);
      this.pitch = this.tp.step(clamp(lz * 0.12, -0.7, 0.7), dt);
      this.roll = this.tr.step(clamp(-lx * 0.12, -0.7, 0.7), dt);
      this.flail = clamp(0.6 + this.vel.length() * 0.25, 0, 1.6);
      return false;
    }
    if (this.airborne) {
      this.vel.y -= 20 * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.pitch = this.tp.step(0, dt); this.roll = this.tr.step(0, dt); this.flail = 1.2;
      const g = groundY(this.pos.x, this.pos.z);
      if (this.pos.y <= g) { this.pos.y = g; this.airborne = false; return true; }
    }
    return false;
  }
}