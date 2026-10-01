import { Euler, Object3D, Quaternion, Vector3 } from 'three';
import { Locomotion, type LocoConfig } from './Locomotion';
import { Juice } from './Juice';
import { FaceController, type Face } from './Face';
import { Choreo, ACTIONS, ZERO_POSE, petPose, type Pose } from './Choreo';
import { Dangle } from './Dangle';

export interface RigAdapter {
  root: Object3D;     // world position + heading (yaw)
  pivot: Object3D;    // NEW ground-level group between root and the visual rig: lift, squash, grow, roll-over
  body: Object3D;     // torso bone: additive lean, sway, wiggle
  head?: Object3D;    // additive headPitch/headRoll
  legs: Object3D[];   // upper-leg bones, BACK legs LAST
  arms: Object3D[];   // upper-arm bones (empty -> first front leg waves instead)
  extras: Object3D[]; // ear/antenna/tail roots
  height: number;     // creature height in world units
  axes: { pitch: 1 | -1; roll: 1 | -1; limb: 'x' | 'z'; wave: 1 | -1 }; // flip if a motion goes the wrong way
  setGait(amount: number, phase: number): void;  // drives the EXISTING Heroes in-place cycle
  setFace(f: Face): void;
  emote(kind: string): void;                     // 'heart' 'alert' 'question' 'note' 'zzz' 'stars' 'sweat'
  vfx(kind: string, pos: Vector3, scale?: number): void; // 'dust' 'dustRing' 'flash' 'crumbs' 'ring'
  groundHeight(x: number, z: number): number;
}

const ZERO_V = new Vector3(), X = new Vector3(1, 0, 0), Z = new Vector3(0, 0, 1), _q = new Quaternion();
const rot = (o: Object3D, axis: 'x' | 'z', a: number) => { _q.setFromAxisAngle(axis === 'x' ? X : Z, a); o.quaternion.multiply(_q); };

export class CreatureMotion {
  readonly loco: Locomotion; readonly juice: Juice; readonly face = new FaceController(); readonly dangle = new Dangle();
  grabPoint: Vector3 | null = null;
  private choreo: Choreo | null = null; private queue: string[] = [];
  private petT = -1; private heartT = 0; private t = 0;
  private P: Pose = { ...ZERO_POSE };
  private rest = new Map<Object3D, Quaternion>(); private q = new Quaternion(); private e = new Euler();

  constructor(public rig: RigAdapter, cfg: LocoConfig, start: Vector3, heading = 0) {
    this.loco = new Locomotion(cfg); this.loco.pos.copy(start); this.loco.heading = heading;
    this.juice = new Juice(cfg.kind);
    for (const o of [rig.body, rig.head, ...rig.legs, ...rig.arms, ...rig.extras]) if (o) this.rest.set(o, o.quaternion.clone());
  }

  get busy() { return !!this.choreo || this.petT >= 0 || this.dangle.active || this.dangle.airborne; }
  play(...names: string[]) { this.queue.push(...names); if (!this.choreo) this.next(); }
  interrupt(...names: string[]) { this.queue = []; this.choreo = null; this.face.mouthOverride = null; if (names.length) this.play(...names); }
  private next() { const n = this.queue.shift(); this.choreo = n ? new Choreo(ACTIONS[n]) : null; }

  petStart() { this.interrupt(); this.petT = 0; }
  petEnd() { if (this.petT < 0) return; this.petT = -1; this.face.set('neutral'); this.play('petRelease'); }
  pickUp(grab: Vector3) { this.interrupt(); this.dangle.grab(this.loco.pos); this.grabPoint = grab.clone(); this.face.set('scared'); this.rig.emote('sweat'); }
  drop(throwVel: Vector3) { this.grabPoint = null; this.dangle.release(throwVel); this.face.set('surprised'); }

  /** 1) BEFORE HeroAnimator.update */
  preAnimate(dt: number, desiredVel: Vector3) {
    this.t += dt;
    for (const [o, q] of this.rest) o.quaternion.copy(q);   // clear last frame's additive layer
    this.loco.update(dt, this.busy ? ZERO_V : desiredVel, this.rig.groundHeight);
    this.juice.update(dt, this.loco);
    this.rig.setGait(this.busy ? 0 : this.loco.gaitAmount(), this.loco.phase);
  }

  /** 2) AFTER HeroAnimator.update */
  postAnimate(dt: number) {
    const r = this.rig, j = this.juice.out, P = this.P, t = this.t;
    Object.assign(P, ZERO_POSE);
    if (this.choreo) { Object.assign(P, this.choreo.update(dt, r, this.face)); if (this.choreo.done) this.next(); }
    if (this.petT >= 0) {
      this.petT += dt; Object.assign(P, petPose(this.petT, t));
      this.face.set(this.petT > 2 ? 'love' : 'joyful');
      if ((this.heartT -= dt) <= 0) { this.heartT = 0.35; r.emote('heart'); }
    }

    const landed = this.dangle.update(dt, this.grabPoint, r.height * 0.9, this.loco.heading, r.groundHeight);
    if (landed) { this.loco.pos.copy(this.dangle.pos); this.loco.speed = 0; this.play('landDizzy'); }
    if (this.dangle.active || this.dangle.airborne) {
      r.root.position.copy(this.dangle.pos);
      P.pitch += this.dangle.pitch; P.roll += this.dangle.roll; P.limbFlail = this.dangle.flail;
      if (this.dangle.active) P.squash = 1.15;   // stretched while held
    } else r.root.position.copy(this.loco.pos);
    r.root.rotation.set(0, this.loco.heading, 0);

    if (this.loco.footfall && this.loco.speed > this.loco.cfg.walkSpeed * 0.8)
      r.vfx('dust', this.loco.pos, 0.6 + this.loco.runT());

    // pivot: lift + volume-preserving squash + grow + roll-over
    const s = j.squash * P.squash, g = P.grow, side = 1 / Math.sqrt(s);
    r.pivot.position.set(0, (j.lift + P.lift + P.rollOver * 0.85) * r.height, 0);
    r.pivot.scale.set(g * side, g * s, g * side);
    r.pivot.rotation.set(0, 0, P.rollOver * Math.PI * 0.9 * r.axes.roll);

    // body: lean, sway, wiggle
    this.e.set(r.axes.pitch * (j.pitch + P.pitch), j.yawSway + P.yaw + Math.sin(t * 14) * 0.14 * P.wiggle, r.axes.roll * (j.roll + P.roll), 'YXZ');
    r.body.quaternion.multiply(this.q.setFromEuler(this.e));
    if (r.head) { this.e.set(r.axes.pitch * P.headPitch, 0, P.headRoll, 'YXZ'); r.head.quaternion.multiply(this.q.setFromEuler(this.e)); }

    // limbs: flail, kick, wave
    const ax = r.axes.limb, ax2 = ax === 'x' ? 'z' : 'x';
    r.legs.forEach((b, i) => {
      let a = Math.sin(t * 18 + i * 1.7) * 0.6 * P.limbFlail;
      if (P.legKick && i === r.legs.length - 1) a += Math.sin(t * 22) * 0.9 * P.legKick;
      if (a) rot(b, ax, a);
    });
    const wavers = r.arms.length ? r.arms : r.legs.slice(0, 1);
    wavers.forEach((b, i) => {
      let a = Math.sin(t * 18 + i * 2.3 + 1) * 0.7 * P.limbFlail;
      if (P.armWave && i === 0) a += r.axes.wave * (-1.2 + Math.sin(t * 2 * Math.PI * 3) * 0.45) * P.armWave;
      if (a) rot(b, r.arms.length ? ax2 : ax, a);
    });
    r.extras.forEach((b, i) => {
      const a = Math.sin(t * 16 + i) * 0.5 * P.limbFlail + Math.sin(t * 12 + i) * 0.25 * P.wiggle;
      if (a) rot(b, 'z', a);
    });

    this.face.update(dt);
    r.setFace(this.face.cur);
  }
}