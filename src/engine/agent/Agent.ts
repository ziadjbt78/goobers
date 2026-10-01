/**
 * Agent — the per-creature driver. v8.
 *
 * The Agent decides ONE thing per frame: the DESIRED velocity that would take
 * the creature to its brain's goal. It never writes a position, never writes a
 * heading, never writes a bone. Everything visible comes from the motion layer:
 *
 *   brain -> desired velocity -> motion.preAnimate -> HeroAnimator.update
 *                             -> motion.postAnimate  -> rig
 *
 * Position, heading, speed, the gait cycle, the juice, the face, the
 * choreography and the dangling pick-up all live in CreatureMotion.
 */
import * as THREE from 'three';
import { HeroAnimator, type Mood, type ActionId as AnimAction } from '../anim/HeroAnimator';
import type { HeroHandle } from '../render/hero/HeroRenderer';
import type { HeroTemplate } from '../hero/types';
import { mulberry32, type HeroDNA } from '../hero/dna';
import { heightAt, isDry, WALK_R } from '../world/terrain';
import type { HashEntry, World } from '../world/World';
import type { Glyph } from '../render/hero/emotes';
import { CreatureMotion } from '../motion/CreatureMotion';
import { arrive } from '../motion/Locomotion';
import { createRig, locoConfigFor } from '../motion/Rig';

export interface Foot {
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  swing: number;
  swinging: boolean;
  phase: number;
  step: number;
  lift: number;
  wasUp: boolean;
}

/** Absolute turn-rate ceiling, rad/s. Locomotion enforces its own per-species cap. */
export const TURN_RATE = 2.6;
const ARRIVE = 0.30;
const SLOW_RADIUS = 0.85;

/** animator action -> the Choreo action the motion layer plays for it. */
const ACTION_PLAY: Record<AnimAction, string | null> = {
  none: null, eat: 'feedEat', chomp: 'feedEat', sniff: 'feedEat',
  play: 'celebrate', greet: 'callArrive', startle: 'callNotice',
  wave: 'inspectWave', dig: 'yuck', pet: 'petRelease',
  sleep: null, carry: null, splash: null, swim: null, fly: null,
  perch: null, petRoll: null,
};

export class Agent implements HashEntry {
  readonly id: number;
  readonly dna: HeroDNA;
  readonly template: HeroTemplate;
  readonly handle: HeroHandle;
  readonly hero: HeroAnimator;
  readonly rig: ReturnType<typeof createRig>;
  readonly motion: CreatureMotion;
  readonly world: World;
  alive = true;
  name: string;
  mood: Mood = 'neutral';
  goal: THREE.Vector3 | null = null;
  /** turn to face a point WITHOUT walking — Locomotion's heading spring turns it */
  faceTarget: { x: number; z: number } | null = null;
  throttle = 0;
  carried = false;
  bulk: number;

  emoteGlyph: Glyph | null = null;
  emoteT = 0;
  emoteMax = 1.8;
  emotePunch = 1;
  wiggle = 0;

  action: AnimAction = 'none';
  actionAge = 0;

  /** the Sim resolves motion-layer effects through here */
  onFootfall: ((x: number, y: number, z: number, power: number) => void) | null = null;
  onVfx: ((kind: string, x: number, y: number, z: number, scale: number) => void) | null = null;

  readonly feet: Foot[] = [];
  private desired = new THREE.Vector3();
  private prevSwing: boolean[] = [];
  private rng: () => number;
  private _hip = new THREE.Vector3();
  private static NEXT_ID = 1;

  constructor(world: World, template: HeroTemplate, dna: HeroDNA, handle: HeroHandle, seed: number) {
    this.id = Agent.NEXT_ID++;
    this.world = world;
    this.dna = dna;
    this.template = template;
    this.handle = handle;
    this.rng = mulberry32(seed);
    this.name = `${template.name} ${String(this.id).padStart(2, '0')}`;
    this.bulk = template.height * dna.scale;

    // The animator runs in EXTERNAL-phase mode: the motion layer supplies the
    // gait cycle every frame, so there is exactly one clock.
    this.hero = new HeroAnimator(template, handle);
    const height = template.height * dna.scale;
    const rig = createRig(template, handle, this.hero, {
      emote: (g, life, punch) => this.say(g, life, punch),
      vfx: (kind, x, y, z, scale) => this.onVfx?.(kind, x, y, z, scale),
      ground: (x, z) => heightAt(x, z),
    });
    this.rig = rig;
    this.restBodyY = rig.body.position.y;
    // reach from the LIVE rig, not the template offsets
    const f0 = template.feet[0];
    const liveReach = f0
      ? handle.bones[f0.chain[1]].position.length() + handle.bones[f0.chain[2]].position.length()
      : 0;
    this.motion = new CreatureMotion(rig, locoConfigFor(template, height, liveReach), new THREE.Vector3(), 0);

    for (let i = 0; i < template.feet.length; i++) {
      const f = template.feet[i];
      this.feet.push({
        pos: f.plant.clone(), from: f.plant.clone(), to: f.plant.clone(),
        swing: 0, swinging: false, phase: f.phase, step: f.step, lift: f.lift, wasUp: false,
      });
      this.prevSwing.push(false);
    }
  }

  /** Personality trait, 0..1. Defensive so a DNA without the field still runs. */
  trait(k: 'bold' | 'curious' | 'sociable' | 'playful' | 'lazy'): number {
    const p = (this.dna as unknown as { personality?: Record<string, number> }).personality;
    return p && typeof p[k] === 'number' ? p[k] : 0.5;
  }

  /** live views — the motion layer owns both vectors */
  get pos(): THREE.Vector3 { return this.motion.loco.pos; }
  get heading(): number { return this.motion.loco.heading; }
  set heading(v: number) { this.motion.loco.heading = v; }
  get speed(): number { return this.motion.loco.speed; }
  get moving(): boolean { return this.motion.loco.speed > 0.06; }
  get topSpeed(): number { return this.motion.loco.cfg.runSpeed * (0.78 + this.dna.speed * 0.34); }

  /** Drop the creature at a world point. */
  place(x: number, z: number, heading = this.rng() * Math.PI * 2): void {
    let px = x;
    let pz = z;
    if (!isDry(px, pz)) {
      const s = this.world.randomSpot(this.rng);
      px = s.x;
      pz = s.z;
    }
    const rr = Math.hypot(px, pz);
    if (rr > WALK_R) { px *= WALK_R / rr; pz *= WALK_R / rr; }
    const loco = this.motion.loco;
    loco.pos.set(px, heightAt(px, pz), pz);
    loco.heading = heading;
    loco.speed = 0;
    loco.phase = this.rng();
    this.motion.grabPoint = null;
    this.rig.root.position.copy(loco.pos);
    this.rig.root.rotation.set(0, heading, 0);
  }

  goTo(p: THREE.Vector3 | { x: number; y: number; z: number } | null, throttle = 1): void {
    this.goal = p ? new THREE.Vector3(p.x, p.y, p.z) : null;
    this.throttle = p ? throttle : 0;
  }

  stop(): void { this.goal = null; this.throttle = 0; this.faceTarget = null; }

  say(g: Glyph, life = 1.6, punch = 1): void {
    this.emoteGlyph = g;
    this.emoteT = life;
    this.emoteMax = life;
    this.emotePunch = punch;
  }

  /** Begin a choreographed action. Restarting the same action is a no-op. */
  begin(id: AnimAction): void {
    if (this.action === id) return;
    this.action = id;
    this.actionAge = 0;
    const act = ACTION_PLAY[id];
    if (act) this.motion.play(act);
    else this.motion.interrupt();
  }

  /** A happy hop — one celebrate cycle, restarted so three in a row read as three. */
  cheer(): void { this.motion.interrupt('celebrate'); }

  /** v9 `G` key: 0 none, 1 pitch+, 2 roll+, 3 left limb forward, 4 wave+. */
  debugPose = 0;

  /**
   * The G-key sign check. Each pose drives ONE channel through the adapter's
   * `axes` signs, so the rendered frame says whether that sign moves the way
   * its name claims. Applied on top of the real motion layer, after
   * postAnimate, so nothing else is disturbed.
   */
  private applyDebugPose(): void {
    const p = this.debugPose;
    if (!p) return;
    const ax = this.rig.axes;
    const q = new THREE.Quaternion();
    const AMP = 0.5;
    if (p === 1) {
      // rotation about the BODY bone's own pivot: the head swings relative to
      // that pivot, which is what the probe measures in the body's frame
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), ax.pitch * AMP);
      this.rig.body.quaternion.multiply(q);
    } else if (p === 2) {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ax.roll * AMP);
      this.rig.body.quaternion.multiply(q);
    } else if (p === 3) {
      const leg = this.rig.legs[0];
      if (leg) leg.quaternion.multiply(this.axisIn(leg, ax.limb === 'x' ? 1 : 0, ax.limb === 'z' ? 1 : 0, AMP));
    } else if (p === 4) {
      const w = this.rig.arms[0] ?? this.rig.legs[0];
      if (w) w.quaternion.multiply(this.axisIn(w, 1, 0, ax.wave * -AMP));
    }
  }

  /** v9 diagnostic: strip the pivot's juice so the slip it causes can be
   *  separated from slip caused by a wrong stride. */
  noPivotJuice = false;
  /** frames (per probe) where a PLANTED foot was past 95% of leg reach */
  overstretchFrames = 0;
  private restBodyY = 0;

  /**
   * Build a rotation about a WORLD axis, expressed in `bone`'s parent space, so
   * a test pose swings the limb the same way no matter how that bone's rest
   * frame happens to be oriented.
   */
  private axisIn(bone: THREE.Object3D, x: number, z: number, ang: number): THREE.Quaternion {
    const axisWorld = new THREE.Vector3(x, 0, z);
    if (axisWorld.lengthSq() < 1e-9) axisWorld.set(1, 0, 0);
    axisWorld.normalize();
    const pw = (bone.parent ?? bone).getWorldQuaternion(new THREE.Quaternion());
    const axisLocal = axisWorld.applyQuaternion(pw.clone().invert()).normalize();
    return new THREE.Quaternion().setFromAxisAngle(axisLocal, ang);
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.actionAge += dt;

    // ---- the ONE thing this class decides: desired velocity ---------------
    this.desired.set(0, 0, 0);
    if (!this.carried) {
      if (this.goal) {
        const d = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
        if (d < ARRIVE) this.goal = null;
        else arrive(this.pos, this.goal, this.topSpeed * Math.max(0, this.throttle), SLOW_RADIUS, this.desired);
      }
      if (this.faceTarget) {
        const dx = this.faceTarget.x - this.pos.x;
        const dz = this.faceTarget.z - this.pos.z;
        if (Math.hypot(dx, dz) < 0.04) this.faceTarget = null;
        else {
          // turn in place: aim a slow creep at the target, and let the
          // heading spring in Locomotion do the turning
          const a = Math.atan2(dx, dz);
          this.desired.set(Math.sin(a) * 0.30, 0, Math.cos(a) * 0.30);
        }
      }
    }

    // ---- the 3-step pipeline ---------------------------------------------
    // the world-foot-planting solver needs the live gait numbers
    const loco = this.motion.loco;
    this.hero.drive.stride = loco.cfg.stride * (1 + 0.4 * loco.runT());
    this.hero.drive.speed = loco.speed;
    this.hero.drive.heading = loco.heading;
    this.hero.drive.groundY = heightAt;

    this.motion.preAnimate(dt, this.desired);
    this.hero.update(dt, null);
    this.motion.postAnimate(dt);
    this.applyDebugPose();

    // ---- v10: MOVE THE JUICE OFF THE PIVOT AND ONTO THE BODY --------------
    // The pivot sits BELOW the leg roots, so squashing it scaled the IK targets
    // with the body and the solver had to re-solve every frame — that was the
    // knee pop. The body bone sits ABOVE the leg roots, exactly like the
    // pedestal, so the juice no longer touches a planted foot.
    const pivot = this.rig.pivot;
    const body = this.rig.body;
    if (this.noPivotJuice) {
      pivot.position.set(0, 0, 0); pivot.scale.set(1, 1, 1); pivot.rotation.set(0, 0, 0);
    } else {
      body.position.set(body.position.x, this.restBodyY + pivot.position.y, body.position.z);
      body.scale.multiply(pivot.scale);
      // the WHOLE juice rotation moves to the body, not just the roll-over:
      // reading only rotation.z silently discarded every pitch the motion
      // layer applied, which is why the G-key pitch probe read 0.0000 m.
      if (pivot.quaternion.x || pivot.quaternion.y || pivot.quaternion.z) {
        body.quaternion.multiply(pivot.quaternion);
      }
      pivot.position.set(0, 0, 0); pivot.scale.set(1, 1, 1); pivot.rotation.set(0, 0, 0);
    }

    this.readFeet();
    this.tickEmote(dt);
  }

  private tickEmote(dt: number): void {
    if (this.emoteT > 0) {
      this.emoteT -= dt;
      if (this.emoteT <= 0) { this.emoteGlyph = null; this.emoteT = 0; }
    }
    this.wiggle = Math.max(0, this.wiggle - dt * 1.6);
  }

  /**
   * Read the REAL ankle bones back after the animator has solved them, so the
   * motion metrics measure the rendered rig and not a re-derivation of it.
   */
  private readFeet(): void {
    const t = this.template;
    const g = this.handle.group;
    g.updateMatrixWorld(true);
    const loco = this.motion.loco;
    for (let i = 0; i < this.feet.length; i++) {
      const f = this.feet[i];
      const bone = this.handle.bones[t.feet[i].chain[2]];
      const hipBone = this.handle.bones[t.feet[i].chain[0]];
      const kneeBone = this.handle.bones[t.feet[i].chain[1]];
      if (bone) bone.getWorldPosition(f.pos);
      // the stance/swing flag now comes from the real world-planting solver
      const legs = (this.hero as unknown as { legs: { index: number; mode: string }[] }).legs;
      const leg = legs?.find((l) => l.index === i);
      const swinging = leg ? leg.mode === 'swing' : false;
      f.swinging = swinging;
      f.swing = 0;
      if (!swinging && hipBone && kneeBone && bone) {
        const reach = (kneeBone.position.length() + bone.position.length()) * 0.95;
        const hw = hipBone.getWorldPosition(this._hip);
        if (hw.distanceTo(f.pos) > reach) this.overstretchFrames++;
      }
      // one dust puff per footfall, fired on the swing -> stance edge
      if (this.prevSwing[i] && !swinging && loco.speed > 0.1) {
        this.onFootfall?.(f.pos.x, f.pos.y, f.pos.z, 0.25 + loco.runT());
      }
      this.prevSwing[i] = swinging;
    }
  }

  emoteAnchor(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.pos).setY(this.pos.y + this.template.height * this.dna.scale * 0.98);
  }
}
