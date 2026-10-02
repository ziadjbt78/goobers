/**
 * HeroAnimator — THE one animation pipeline, and the place all the cartoon
 * juice lives. Every view (Heroes, Zoo, Studio, World) drives this same class.
 *
 * Layers, all additive and all eased — never switched hard:
 *   1. base        idle breath, ambient idle behaviour, blinks, micro-turn
 *   2. locomotion  gait driven by ACTUAL ground speed, eased in over 0.25s
 *   3. action      eat / sniff / play / pet / sleep / greet / carry / startle
 *   4. look        gaze, deliberate eye lead, saccades
 *   5. secondary   damped springs on ears, tails, antennae
 *
 * Exaggeration is the point. Body bob is 8-12% of creature height, every
 * footfall squashes the body, turning rolls it 12 degrees, acceleration pitches
 * it and stopping recoils it. Subtle is a bug.
 *
 * The idle path reproduces the locked baseline: locomotionW 0 and actionW 0
 * with the ambient idle timer parked gives the approved pedestal pose.
 */
import * as THREE from 'three';
import type { HeroTemplate } from '../hero/types';
import type { HeroHandle } from '../render/hero/HeroRenderer';
import { solveLeg, Wobble } from './pose';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
/** Radians per second a limb bone may turn while its foot is airborne. */
const LEG_RATE = 18;
/** v12: fraction of the gait cycle a World foot spends planted. */
const DUTY = 0.6;
/** v13: last-resort cap on a PLANTED leg, so a straight-leg branch flip can never pop. */
const PLANT_RATE = 40;
function crossedPhase(a: number, b: number, m: number): boolean {
  if (b >= a) return a < m && b >= m;
  return a < m || b >= m;
}
const _lim = new THREE.Quaternion();

export type Mood = 'neutral' | 'happy' | 'surprised' | 'sleepy' | 'scared' | 'dizzy' | 'love' | 'sad';

/** Additive action poses. All are blended, never cut. */
export type ActionId =
  | 'none' | 'eat' | 'sniff' | 'play' | 'pet' | 'sleep' | 'greet'
  | 'carry' | 'startle' | 'dig' | 'splash' | 'swim' | 'fly' | 'perch'
  | 'petRoll' | 'chomp' | 'wave';

/** How long each action is held before the brain may pick another. */
export const ACTION_MIN: Record<ActionId, number> = {
  none: 0, eat: 3.0, sniff: 2.2, play: 3.0, pet: 2.0, sleep: 4.0, greet: 2.4,
  carry: 1.0, startle: 1.2, dig: 2.6, splash: 2.4, swim: 3.0, fly: 3.0, perch: 3.0,
  petRoll: 3.0, chomp: 2.6, wave: 2.0,
};

export interface Drive {
  /** v10 world-path gait bookkeeping, written by the Agent every frame */
  stride: number;
  heading: number;
  groundY: ((x: number, z: number) => number) | null;
  /** metres per second the body is ACTUALLY travelling */
  speed: number;
  /** local body bob, metres. Never the terrain height — the group carries that. */
  lift: number;
  squash: number;
  /** extra local yaw on the body, radians */
  yaw: number;
  /** roll into the turn, radians */
  lean: number;
  /** pitch from acceleration / recoil, radians */
  pitch: number;
  /** terrain slope under the feet, radians */
  slopePitch: number;
  slopeRoll: number;
  /** how far the head has turned ahead of the body, radians */
  headLead: number;
  /** how far the EYES have turned ahead of the head — always further, sooner */
  eyeLead: number;
  /** where each foot should go, world space, one per template foot */
  footTargets: THREE.Vector3[];
  /** true while a foot is airborne — airborne legs may be rate limited */
  footSwing: boolean[];
}

interface LegRig {
  hip: THREE.Bone;
  knee: THREE.Bone;
  ankle: THREE.Bone;
  plant: THREE.Vector3;
  step: number;
  lift: number;
  phase: number;
  index: number;
  prev: THREE.Quaternion[];
  kneeLocal: THREE.Vector3;
  /** v9: the pole direction in CREATURE space, one per leg, so the two-bone
   *  solve can never pick the mirrored branch. */
  poleLocal: THREE.Vector3;
  /** smoothed world-space pole actually handed to the solver */
  poleSm: THREE.Vector3;
  /** true while this foot was airborne last frame (the pop-prone transition) */
  wasSwing: boolean;
  // ---- v10 world planting -------------------------------------------------
  /** world point the foot is pinned to while planted */
  lock: THREE.Vector3;
  swingFrom: THREE.Vector3;
  swingTo: THREE.Vector3;
  /** 0..1 through the current swing */
  swingT: number;
  /** 'plant' pins the foot in the world, 'swing' arcs it to the next plant */
  mode: 'plant' | 'swing';
  /** swing length in seconds for the current step */
  swingDur: number;
  init: boolean;
  /** body world position when this foot last planted, for the idle-drift guard */
  bodyAtPlant: THREE.Vector3;
  /** bone segment lengths, read off the rest offsets */
  L1: number;
  L2: number;
  /** rest direction of the foot in creature space, for the turn guard */
  restAngle: number;
  /** true when the last lift was forced early (reach / turn / drift guard) */
  forced: boolean;
  /** v12: landed this frame; lock to where the ankle REALLY is after the solve */
  landPending: boolean;
  /** v12: seconds since this foot last landed */
  landT: number;
  /** v12: last frame's cycle position, for edge-triggered lifts */
  prevU: number;
  /** v13: ankle miss after the closed-loop solve, world units */
  err: number;
  /** v13: live world leg length (hip->knee + knee->ankle) */
  reachW: number;
  /** v14: ankle miss AFTER the rate limiter (limiter lag shows up here) */
  postErr: number;
  /** v15: legs were hanging free; next planted frame swings in from the real ankle */
  relaunch: boolean;
  /** v15: rest rotation of the hip's parent relative to the creature, for a body-space pole */
  parRel: THREE.Quaternion | null;
  /** v16: planted foot raised straight up because the body lifted past its reach */
  lifted: boolean;
}

interface ArmRig { upper: THREE.Bone; lower: THREE.Bone; side: number }

interface Wiggle { bone: THREE.Bone; w: Wobble; axis: 'x' | 'y'; gain: number }

/** Ambient idle behaviours — the creature is never a statue. */
type IdleAct = 'none' | 'sniff' | 'scratch' | 'sit' | 'yawn';

export class HeroAnimator {
  readonly template: HeroTemplate;
  readonly handle: HeroHandle;

  gait = 0.5;
  /**
   * v8 external-phase mode. The motion layer (CreatureMotion) owns the clock,
   * every body-attitude channel (lift / squash / lean / pitch / yaw) and the
   * whole face; the animator writes ONLY the in-place gait cycle, the spine,
   * the arms and the secondary wobble. Entered by `setGait(amount, phase)`.
   */
  external = false;
  private externalPhase = 0;
  excited = 0;
  mood: Mood = 'neutral';
  driven = false;
  action: ActionId = 'none';
  actionW = 0;
  actionT = 0;
  locomotionW = 0;
  /** verification switch: kills every random source so two runs match exactly */
  deterministic = false;
  /** true while the player is holding this creature: petting or carrying */
  petted = false;
  held = false;

  drive: Drive = {
    speed: 0, lift: 0, squash: 1, yaw: 0, lean: 0, pitch: 0,
    stride: 0.3, heading: 0, groundY: null,
    slopePitch: 0, slopeRoll: 0, headLead: 0, eyeLead: 0, footTargets: [], footSwing: [],
  };

  /** Face parameters, all 0..1 unless noted. Written by the action layer. */
  face = { lid: 0, mouthOpen: 0, mouthWide: 1, blush: 0.35, pupil: 1, gazeSpin: 0 };

  private legs: LegRig[] = [];
  private arms: ArmRig[] = [];
  private wiggles: Wiggle[] = [];
  private spine: THREE.Bone[] = [];
  private phase = 0;
  private t = Math.random() * 40;
  private blinkTimer = 1.6 + Math.random() * 2;
  private blinkT = 0;
  private blinkSide = 0;
  private doubleBlink = 0;
  private lookX = 0;
  private lookY = 0;
  private nextLook = 1;
  private gazeYaw = 0;
  private gazePitch = 0;
  private headPitch = 0;
  private headYawIdle = 0;
  private bodyYawTarget = 0;
  private bodyYaw = 0;
  private nextTurn = 2;
  private pupil = 1;
  private squash = 1;
  private squashV = 0;
  private hopY = 0;
  private hopV = 0;
  private lidClose = 0;
  private actionBlend = 0;
  private idleAct: IdleAct = 'none';
  private idleActT = 0;
  private idleActW = 0;
  private idleTimer = 3 + Math.random() * 4;
  /** a back leg kicks out while the creature is being petted */
  private kickT = 0;

  private _v = new THREE.Vector3();
  private _pole = new THREE.Vector3();
  private _q = new THREE.Quaternion();

  constructor(template: HeroTemplate, handle: HeroHandle) {
    this.template = template;
    this.handle = handle;

    for (let i = 0; i < template.feet.length; i++) {
      const f = template.feet[i];
      const [hi, ki, ai] = f.chain;
      const hip = handle.bones[hi];
      const knee = handle.bones[ki];
      const ankle = handle.bones[ai];
      if (!hip || !knee || !ankle) continue;
      // ---- v9 pole, per leg, in creature space ---------------------------
      // A quadruped's REAR knees bend backward and its FRONT knees forward; a
      // hexapod's legs all bow OUTWARD; a biped keeps the pedestal's forward
      // pole. Locking this per leg is what stops the mirrored-branch flip.
      let poleLocal: THREE.Vector3;
      if (template.locomotion === 'skitter') {
        poleLocal = new THREE.Vector3(f.side >= 0 ? 1 : -1, 0, 0);
      } else if (template.feet.length === 4) {
        poleLocal = new THREE.Vector3(0, 0, f.plant.z < 0 ? -1 : 1);
      } else {
        poleLocal = new THREE.Vector3(0, 0, 1);
      }
      this.legs.push({
        hip, knee, ankle,
        plant: f.plant.clone(), step: f.step, lift: f.lift, phase: f.phase, index: i,
        prev: [hip.quaternion.clone(), knee.quaternion.clone(), ankle.quaternion.clone()],
        // rest knee in the HIP-PARENT's space — the space solveIK2 works in
        kneeLocal: hip.position.clone().add(knee.position),
        poleLocal, poleSm: new THREE.Vector3(), wasSwing: false,
        lock: f.plant.clone(), swingFrom: f.plant.clone(), swingTo: f.plant.clone(),
        swingT: 0, mode: 'plant', swingDur: 0.2, init: false,
        bodyAtPlant: new THREE.Vector3(),
        L1: knee.position.length(), L2: ankle.position.length(),
        restAngle: Math.atan2(f.plant.x, f.plant.z), forced: false,
        landPending: false, landT: 1, prevU: 0, err: 0, reachW: 0, postErr: 0, relaunch: false, parRel: null, lifted: false,
      });
      this.drive.footTargets.push(f.plant.clone());
      this.drive.footSwing.push(false);
    }

    for (const b of handle.bones) {
      if (b.name.startsWith('arm') && b.name.includes('upper')) {
        const lower = handle.bones.find((o) => o.name === b.name.replace('upper', 'lower'));
        if (lower) this.arms.push({ upper: b, lower, side: b.position.x < 0 ? -1 : 1 });
      }
    }
    for (const b of handle.bones) if (b.name.startsWith('spine')) this.spine.push(b);

    for (const b of handle.bones) {
      const n = b.name;
      if (n.startsWith('ear') || n.startsWith('tail') || n.startsWith('ant') || n.startsWith('sprout_leaf') || n.startsWith('antenna')) {
        this.wiggles.push({
          bone: b, w: new Wobble(),
          axis: n.startsWith('ant') || n.startsWith('antenna') ? 'y' : 'x',
          gain: n.startsWith('tail') ? 1.4 : 1.0,
        });
      }
    }
  }

  /** v11: per-leg planting state, for the joint-rate frame-type report. */
  legState(): { index: number; mode: string; forced: boolean }[] {
    return this.legs.map((l) => ({ index: l.index, mode: l.mode, forced: l.forced }));
  }

  hop(power = 3.4): void {
    this.hopV = power;
    this.squashV = -2.6;
    this.excited = 1.4;
  }

  /**
   * One-argument form = the locked Heroes pedestal baseline (time-driven cycle).
   * Two-argument form switches to external phase: the caller supplies the cycle
   * position every frame, so a World creature's legs and the pedestal
   * creature's legs march through exactly the same poses at gait 0.6.
   */
  setGait(v: number, phase?: number): void {
    this.gait = Math.max(0, Math.min(1, v));
    if (phase !== undefined) { this.external = true; this.externalPhase = phase; }
  }
  setMood(m: Mood): void { this.mood = m; }
  /** Pin the shared clock, so two animators can be compared frame for frame. */
  setClock(v: number): void { this.t = v; this.phase = 0; }

  /** Begin an additive action. Restarting the same action is a no-op. */
  play(id: ActionId): void {
    if (this.action === id) return;
    this.action = id;
    this.actionT = 0;
  }

  /** Cancel any ambient idle behaviour — an action is about to play. */
  interruptIdle(): void {
    this.idleAct = 'none';
    this.idleActT = 0;
    this.idleTimer = 4 + Math.random() * 6;
  }

  beginDrive(): void { this.driven = true; }

  focusPoint(out: THREE.Vector3): THREE.Vector3 {
    const e = this.handle.eyes[0];
    if (!e) return out.copy(this.handle.group.position);
    return out.setFromMatrixPosition(e.root.matrixWorld);
  }

  update(dt: number, lookAt: THREE.Vector3 | null): void {
    const h = this.handle;
    const t = this.template;
    this.t += dt;
    this.excited = Math.max(0, this.excited - dt);
    this.actionT += dt;

    // ---- layer weights -----------------------------------------------------
    const jumpy = t.locomotion === 'hop';
    const moving = this.driven && !this.external ? (this.drive.speed > 0.05 ? 1 : 0) : (this.gait > 0.02 ? 1 : 0);
    const locoTarget = this.driven || this.external ? moving : 0;
    this.locomotionW += (locoTarget - this.locomotionW) * Math.min(1, dt / 0.25);
    const loco = this.driven || this.external ? this.locomotionW : 0;
    const actTarget = this.action === 'none' ? 0 : 1;
    this.actionBlend += (actTarget - this.actionBlend) * Math.min(1, dt / 0.25);
    const act = this.actionBlend;

    // ---- ambient idle behaviour: the creature is never frozen --------------
    // in external mode the motion layer plays ambient behaviour through Choreo
    const standingStill = !this.external && loco < 0.15 && act < 0.2;
    if (standingStill && this.idleAct === 'none') {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) {
        const pool: IdleAct[] = ['sniff', 'scratch', 'sit', 'yawn', 'sniff'];
        const pick = this.deterministic ? 'sniff' : pool[Math.floor(Math.random() * pool.length)];
        this.idleAct = pick;
        this.idleActT = pick === 'sit' ? 2.4 : 1.3;
        this.idleTimer = 4 + Math.random() * 6;
      }
    }
    if (this.idleAct !== 'none') {
      this.idleActT -= dt;
      if (this.idleActT <= 0) { this.idleAct = 'none'; this.idleActW = 0; }
    }
    const idleTarget = this.idleAct !== 'none' && standingStill ? 1 : 0;
    this.idleActW += (idleTarget - this.idleActW) * Math.min(1, dt / 0.25);
    const ia = this.idleActW;

    // ---- the shared clock --------------------------------------------------
    const speed01 = this.driven && !this.external ? Math.min(1, this.drive.speed / 1.4) : this.gait;
    if (this.external) {
      this.phase = this.externalPhase;
    } else if (this.driven) {
      if (jumpy) this.phase += dt * (1.2 + speed01 * 2.6);
      else {
        const stride = Math.max(0.16, this.legs.length ? this.legs[0].step * 2.1 * Math.max(1, this.bulkScale * 0.5) : 0.4);
        this.phase = (this.phase + (this.drive.speed * dt) / stride) % 1;
      }
    } else {
      this.phase += dt * (jumpy ? 1.3 + this.gait * 2.2 : 1.1 + this.gait * 2.4);
    }

    // ---- body ---------------------------------------------------------------
    let bodyLift = 0;
    let bodyPitch = 0;
    let bodyRoll = 0;

    const beatLegs = this.template.feet.length > 4 ? 3 : 2;
    const beat = Math.abs(Math.sin(this.phase * Math.PI * 2 * beatLegs));

    if (this.external) {
      // The motion layer writes lift / squash / pitch / roll / yaw on the pivot
      // and body bones. The animator adds NOTHING here, so no channel is
      // applied twice.
      bodyLift = 0;
      bodyPitch = 0;
      bodyRoll = 0;
      this.squash = 1;
      this.bodyYaw = 0;
      this.headPitch = 0;
    } else if (this.driven) {
      bodyLift = this.drive.lift;
      bodyPitch = this.drive.pitch + this.drive.slopePitch;
      bodyRoll = -this.drive.lean + this.drive.slopeRoll;
      this.squash = this.drive.squash;
      this.bodyYaw = this.drive.yaw;
      this.headPitch = 0;
    } else if (jumpy) {
      this.hopV -= 22 * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY < 0) {
        this.hopY = 0;
        if (this.hopV < -0.6) this.squashV += -this.hopV * 1.6;
        this.hopV = 0;
      }
      if (this.hopY === 0 && moving > 0) {
        const push = Math.max(0, Math.sin(this.phase * Math.PI * 2 * 0.5 + 0.4));
        if (push > 0.97) this.hopV = 2.6 + this.gait * 2.4;
      }
      bodyLift = this.hopY;
      const airborne = this.hopY > 0.001 ? 1 : 0;
      this.squashV += (-(this.squash - 1) * 120 - this.squashV * 14) * dt;
      this.squash += this.squashV * dt;
      this.squash = Math.max(0.72, Math.min(1.22, this.squash));
      bodyPitch = airborne * -0.06;
    } else {
      const bob = (beat - 0.5) * 0.028 * this.gait;
      const idle = Math.sin(this.t * 1.6) * 0.006 * (1 - moving);
      bodyLift = bob + idle + this.excited * Math.abs(Math.sin(this.t * 11)) * 0.05;
      this.squash += (1 - this.squash) * Math.min(1, dt * 9);
      bodyLift += -this.squashV * 0.004;
      this.squashV *= Math.max(0, 1 - dt * 8);
    }

    if (this.driven && !this.external) bodyLift += Math.sin(this.t * 1.6) * 0.006;
    bodyLift -= loco * 0.012;
    if (this.external) {
      bodyLift = 0; bodyPitch = 0; bodyRoll = 0;
      this.squash = 1; this.bodyYaw = 0; this.headPitch = 0;
    }

    // ---- ambient idle poses, layered on the base ---------------------------
    if (ia > 0.001) {
      const u = this.idleAct === 'none' ? 0 : Math.min(1, this.idleActT > 0.001 ? 1 - this.idleActT / 1.3 : 1);
      const ease = Math.sin(Math.min(1, u) * Math.PI);
      switch (this.idleAct) {
        case 'sniff':
          bodyPitch += ease * 0.42 * ia;                       // head down to the ground
          bodyLift -= ease * 0.05 * ia;
          break;
        case 'scratch':
          bodyRoll += Math.sin(this.idleActT * 26) * 0.20 * ia;
          bodyPitch += ease * 0.10 * ia;
          break;
        case 'sit':
          bodyPitch -= ease * 0.34 * ia;                       // rock back on the haunches
          bodyLift -= ease * 0.10 * ia;
          this.squash *= 1 - ease * 0.14 * ia;
          break;
        case 'yawn':
          bodyPitch -= ease * 0.22 * ia;                       // big stretch up
          bodyLift += ease * 0.06 * ia;
          this.squash *= 1 + ease * 0.10 * ia;
          break;
        default: break;
      }
    }

    // ---- attention: gaze, blink --------------------------------------------
    this.nextLook -= dt;
    if (this.nextLook <= 0) {
      this.nextLook = 0.5 + Math.random() * 1.5;
      this.lookX = this.deterministic ? 0 : (Math.random() - 0.5) * 0.9;
      this.lookY = this.deterministic ? 0 : (Math.random() - 0.5) * 0.5;
    }
    if (lookAt) {
      const eye = this._v.setFromMatrixPosition(h.eyes[0]?.root.matrixWorld ?? h.group.matrixWorld);
      const local = eye.clone().sub(h.group.getWorldPosition(new THREE.Vector3()));
      const yaw = Math.atan2(local.x, local.z);
      const dist = Math.max(0.3, local.length());
      const pitch = Math.atan2(lookAt.y - eye.y, dist);
      this.lookX = THREE.MathUtils.clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -0.9, 0.9);
      this.lookY = THREE.MathUtils.clamp(pitch, -0.5, 0.5);
    }
    // The eyes lead: they snap onto the target FIRST, the head arrives 0.15 s
    // later (drive.headLead is already delayed by the Agent), the body last.
    if (this.driven && Math.abs(this.drive.eyeLead) > 0.01) {
      this.lookX = THREE.MathUtils.clamp(this.lookX + this.drive.eyeLead, -1.1, 1.1);
    }
    this.gazeYaw += (this.lookX - this.gazeYaw) * Math.min(1, dt * 12);
    this.gazePitch += (this.lookY - this.gazePitch) * Math.min(1, dt * 12);

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      const sleepy = this.mood === 'sleepy';
      this.blinkT = 1;
      this.blinkTimer = (sleepy ? 1.4 : 2.0 + Math.random() * 4);
      if (this.doubleBlink > 0) { this.doubleBlink = 0; this.blinkTimer = 0.16; }
      else if (!this.deterministic && Math.random() < 0.16) this.doubleBlink = 1;
      this.blinkSide = !this.deterministic && Math.random() < 0.08 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    }
    if (this.blinkT > 0) this.blinkT = Math.max(0, this.blinkT - dt * 7);

    if (!this.driven) {
      this.nextTurn -= dt;
      if (this.nextTurn <= 0) {
        this.nextTurn = 1.6 + Math.random() * 3;
        this.bodyYawTarget = this.deterministic ? 0 : (Math.random() - 0.5) * 0.55;
      }
      this.headYawIdle = THREE.MathUtils.clamp(this.bodyYawTarget - this.bodyYaw, -0.55, 0.55) * 0.9;
      this.bodyYaw += (this.bodyYawTarget - this.bodyYaw) * Math.min(1, dt * 1.5);
      this.headPitch = 0;
    }
    const headLead = this.driven ? this.drive.headLead : this.headYawIdle;

    // ---- action layer -------------------------------------------------------
    let actionPitch = 0;
    let actionLift = 0;
    let actionSquash = 1;
    let actionRoll = 0;
    if (act > 0.001) {
      const a = this._actionPose(this.action, this.actionT);
      actionPitch = a.pitch; actionLift = a.lift; actionSquash = a.squash; actionRoll = a.roll;
    }

    // the Face map owns every face mesh in external mode (RigAdapter.setFace)
    if (!this.external) this._updateFace(dt, act);

    // ---- write the body ----------------------------------------------------
    const root = h.bones[0];
    const body = h.bones[t.bodyBone];
    const head = h.bones[t.headBone];
    const breathe = 1 + Math.sin(this.t * 2.4) * 0.02;
    const idle = Math.sin(this.t * 1.6) * 0.006;
    if (this.external) root.position.set(0, 0, 0);
    else if (!this.driven) root.position.set(0, bodyLift - idle * 0.5, 0);
    else root.position.set(0, bodyLift - idle * 0.5 + actionLift * act, 0);

    const style = this._gaitFlavour(loco, speed01);
    const roll = bodyRoll + style.roll + actionRoll * act;
    this._q.setFromEuler(new THREE.Euler(
      bodyPitch + actionPitch * act,
      this.bodyYaw + (this.driven ? headLead * 0.25 : 0),
      roll,
    ));
    body.quaternion.copy(this._q);

    const sq = this.squash * (1 + (actionSquash - 1) * act);
    body.scale.set(1 / Math.sqrt(Math.max(0.2, sq)), sq * breathe, 1 / Math.sqrt(Math.max(0.2, sq)));

    for (let i = 0; i < this.spine.length; i++) {
      const b = this.spine[i];
      const lag = i * 0.16;
      const w = Math.sin((this.phase - lag) * Math.PI * 2) * style.spine * (1 - i * 0.25);
      b.rotateX(w);
    }

    head.quaternion.setFromEuler(new THREE.Euler(
      this.headPitch - bodyPitch * 0.5 + style.headPitch - actionPitch * act * 0.6,
      headLead,
      0,
    ));

    // ---- feet --------------------------------------------------------------
    // v12: the World path solves its legs LAST (Agent -> solveWorldLegs), after
    // root, heading and body juice are final. Solving here, before those moved,
    // is what dragged planted feet and popped knees.
    if (!this.external) this._solveLegsPedestal(dt, moving);

    // ---- a petted creature kicks a back leg ---------------------------------
    if (this.legs.length > 0) {
      this.kickT = this.petted ? this.kickT + dt : 0;
      if (this.petted) {
        const back = this.legs[this.legs.length - 1];
        const kick = Math.max(0, Math.sin(this.kickT * 9)) * 0.85;
        if (kick > 0.02) back.hip.rotateX(-kick);
      }
    }

    // ---- arms swing opposite the legs, and wave when greeting --------------
    for (const a of this.arms) {
      let sw = 0;
      if (loco > 0.01) sw = Math.sin(this.phase * Math.PI * 2 + (a.side > 0 ? Math.PI : 0)) * 0.52 * loco;
      if (this.action === 'wave' || this.action === 'greet') {
        sw += act * (a.side > 0 ? Math.sin(this.t * 13) * 0.9 + 0.7 : 0.1);
      }
      if (this.held) sw += Math.sin(this.t * 15 + a.side) * 0.55;
      a.upper.rotateX(sw);
      a.lower.rotateX(Math.max(0, -sw) * 0.5);
    }

    // ---- wobble springs on ears, tails, antennae ---------------------------
    const accel = this.driven ? this.drive.speed * 0.9 : this.gait * 0.6;
    const driveW = -this.bodyYaw * 0.6 + bodyPitch * 2.4 + (accel * 0.10 * Math.sin(this.phase * Math.PI * 4));
    for (const w of this.wiggles) {
      const extra = this.template.locomotion === 'skitter' ? Math.sin(this.t * 17 + w.gain) * 0.04 * loco : 0;
      const kick = this.mood === 'happy' ? Math.sin(this.t * 9) * 0.12 : 0;
      const x = w.w.step((driveW + kick) * w.gain, Math.min(dt, 1 / 60));
      w.bone.quaternion.setFromAxisAngle(w.axis === 'y' ? Y : X, x * 0.9 + extra);
    }
  }


  /**
   * v10 — world-space foot planting for the World path.
   *
   * The pedestal cycle moves a body-space target, which is why a planted foot
   * used to travel with the body (25 cm of slide). Here the foot is instead
   * pinned to a WORLD point for its whole stance, and the swing is a
   * predicted-arc step to the next plant. Guards force an early lift before
   * anything can overstretch or slide: leg reach, rest-offset error, turn
   * error, and idle body drift.
   */
  /** Pedestal / driven leg solve, moved here VERBATIM from update(). */
  private _solveLegsPedestal(dt: number, moving: number): void {
    const h = this.handle;
    // ---- feet --------------------------------------------------------------
    if (this.legs.length > 0) {
      h.group.updateMatrixWorld(true);
      const world = new THREE.Matrix4().copy(h.group.matrixWorld);
      // The IK pole must live in the CREATURE's frame, not the world's: a knee
      // that always bends toward world +Z folds backwards the moment the
      // creature faces any other way. On a pedestal the creature never turns,
      // so the pole stays exactly the old world +Z and the baseline holds.
      const drivenRig = this.driven || this.external;
      const groupWorldQuat = drivenRig ? h.group.getWorldQuaternion(this._q) : null;
      for (let i = 0; i < this.legs.length; i++) {
        const L = this.legs[i];
        if (drivenRig && groupWorldQuat) {
          // per-leg pole in creature space, rotated into the world, then eased.
          // An unsmoothed pole that grazes the limb axis is exactly what makes a
          // two-bone solve flip; the ease removes that.
          this._pole.copy(L.poleLocal).applyQuaternion(groupWorldQuat);
          if (L.poleSm.lengthSq() < 1e-6) L.poleSm.copy(this._pole);
          else L.poleSm.lerp(this._pole, 1 - Math.exp(-dt / 0.08)).normalize();
          this._pole.copy(L.poleSm);
        } else {
          this._pole.set(0, 0, 1);
        }
        const target = new THREE.Vector3();
        if (this.external) {
          // v10 WORLD PLANTING: the foot is pinned to a world point for the
          // whole stance, so it cannot slide. See _worldFootTarget.
          this._worldFootTarget(L, target, dt);
        } else if (this.driven && this.drive.footTargets[L.index]) {
          target.copy(this.drive.footTargets[L.index]);
        } else {
          const u = (this.phase + L.phase) % 1;
          let zOff = 0;
          let yOff = 0;
          if (moving > 0) {
            if (u < 0.5) zOff = (0.5 - u * 2) * L.step;
            else {
              const s = (u - 0.5) * 2;
              zOff = (s * 2 - 1) * L.step * 0.5;
              yOff = Math.sin(s * Math.PI) * L.lift;
            }
          }
          target.set(L.plant.x, L.plant.y + yOff * moving, L.plant.z + zOff * moving);
          target.applyMatrix4(world);
        }
        solveLeg({
          hip: L.hip, knee: L.knee, ankle: L.ankle,
          targetWorld: target,
          poleWorld: this._pole,
          prevKnee: L.kneeLocal,
        });
        // A two-bone solve flips branch when the pole crosses the limb axis, and
        // a splayed insect leg does that constantly. An airborne leg is capped
        // at 12 rad/s so a flip reads as a fast move, never a pop. Planted legs
        // are exempt, so foot slip stays exactly zero.
        //
        // v9: EXTERNAL mode derives the swing from the external cycle itself,
        // and the plant-transition frame counts as airborne (that is the frame
        // the solve is most prone to snap on).
        const airborne = this.external ? L.mode === 'swing' : false;
        const swingNow = this.external
          ? (airborne || L.wasSwing)
          : !!(this.driven && this.drive.footSwing[L.index]);
        if (this.external) L.wasSwing = airborne;
        if ((this.driven || this.external) && swingNow) {
          const maxD = LEG_RATE * dt;
          for (let k = 0; k < 3; k++) {
            const bone = k === 0 ? L.hip : k === 1 ? L.knee : L.ankle;
            const q = L.prev[k];
            const ang = 2 * Math.acos(Math.min(1, Math.abs(bone.quaternion.dot(q))));
            if (ang > maxD && ang > 1e-6) {
              _lim.copy(bone.quaternion);
              bone.quaternion.copy(q).slerp(_lim, maxD / ang);
            }
          }
        }
        L.prev[0].copy(L.hip.quaternion);
        L.prev[1].copy(L.knee.quaternion);
        L.prev[2].copy(L.ankle.quaternion);
      }
      void world;
    }

  }

  private _hips: Set<THREE.Object3D> | null = null;
  /** v12: the hip bones the leg IK owns, so the Agent can preserve additive limb poses. */
  /** v16: true while a planted foot is raised off its lock (body out of reach). */
  legLifted(index: number): boolean {
    const L = this.legs.find((l) => l.index === index);
    return !!L && L.lifted;
  }

  /** v15: template foot index of the leg whose hip is `b`, or -1. */
  legIndexOfHip(b: THREE.Object3D): number {
    const L = this.legs.find((l) => l.hip === b);
    return L ? L.index : -1;
  }

  private _restQ: THREE.Quaternion[][] | null = null;
  private _pq = new THREE.Quaternion();
  private _iq = new THREE.Quaternion();

  /** v15: rate-limit all three bones of a leg against last frame, then remember them. */
  private _limitLeg(L: LegRig, maxD: number): void {
    for (let k = 0; k < 3; k++) {
      const bone = k === 0 ? L.hip : k === 1 ? L.knee : L.ankle;
      const q = L.prev[k];
      const ang = 2 * Math.acos(Math.min(1, Math.abs(bone.quaternion.dot(q))));
      if (ang > maxD && ang > 1e-6) { _lim.copy(bone.quaternion); bone.quaternion.copy(q).slerp(_lim, maxD / ang); }
      q.copy(bone.quaternion);
    }
  }

  legHips(): Set<THREE.Object3D> {
    if (!this._hips) this._hips = new Set(this.legs.map((l) => l.hip));
    return this._hips;
  }

  /**
   * v12 World leg solve. Called by the Agent AFTER the motion layer has written
   * the final root position, heading and body juice for this frame, so a planted
   * foot is solved against the body it is actually attached to.
   * `free` = held / airborne: nothing plants, locks re-seed on landing.
   */
  /** v13: world-units drop of the skeleton root that keeps every hip inside its leg */
  crouch = 0;
  /** v14: legs hang free this frame (held, rolled, mid-jump) */
  legsFree = false;
  liftStats = { beat: 0, hard: 0, strain: 0, soft: 0, maxErr: 0 };
  resetLiftStats(): void { this.liftStats = { beat: 0, hard: 0, strain: 0, soft: 0, maxErr: 0 }; }

  solveWorldLegs(dt: number, free: boolean): void {
    if (!this.external || this.legs.length === 0) return;
    void this._wrapPi;
    const restQ = this._restQ ?? (this._restQ = this.legs.map((L) => [L.knee.quaternion.clone(), L.ankle.quaternion.clone()]));
    this.legsFree = free;
    if (free) {
      // v15: hanging legs EASE, never snap. Hips keep the motion layer's pose
      // (dangle flail), knees/ankles relax toward rest at the swing rate, and the
      // crouch stays applied (decaying) so the body cannot pop up.
      const hf = this.handle;
      this.crouch *= Math.exp(-dt / 0.2);
      if (this.crouch > 1e-5) {
        const root = hf.bones[0];
        const ps = root.parent ? root.parent.getWorldScale(this._sc).y : 1;
        root.position.y -= this.crouch / Math.max(1e-4, ps);
      }
      const maxF = LEG_RATE * dt;
      for (let li = 0; li < this.legs.length; li++) {
        const L = this.legs[li];
        L.relaunch = true; L.mode = 'plant'; L.err = 0; L.postErr = 0;
        L.knee.quaternion.copy(restQ[li][0]);
        L.ankle.quaternion.copy(restQ[li][1]);
        this._limitLeg(L, maxF);
      }
      return;
    }
    const h = this.handle;
    h.group.updateMatrixWorld(true);

    // v13 CROUCH: stubby legs plus the cartoon bob put the hips higher than the
    // legs can reach, so a planted foot had zero horizontal room and HAD to slide.
    // Drop the skeleton root just enough that every hip sits inside its leg.
    const ground = this.drive.groundY;
    const kH = 0.92 - 0.12 * Math.min(1, Math.max(0, this.locomotionW));
    let need = 0;
    for (const L of this.legs) {
      const hip = L.hip.getWorldPosition(this._vw);
      const knee = L.knee.getWorldPosition(this._kw);
      const ank = L.ankle.getWorldPosition(this._aw);
      L.reachW = hip.distanceTo(knee) + knee.distanceTo(ank);
      this._rw.set(L.plant.x, 0, L.plant.z).applyMatrix4(h.group.matrixWorld);
      const gy = (ground ? ground(this._rw.x, this._rw.z) : h.group.position.y) + L.plant.y;
      need = Math.max(need, Math.min(0.5 * L.reachW, hip.y - gy - kH * L.reachW));
    }
    this.crouch = need > this.crouch ? need : this.crouch + (need - this.crouch) * Math.min(1, dt / 0.25);
    if (this.crouch > 1e-5) {
      const root = h.bones[0];
      const ps = root.parent ? root.parent.getWorldScale(this._sc).y : 1;
      root.position.y -= this.crouch / Math.max(1e-4, ps);
      h.group.updateMatrixWorld(true);
    }

    const gq = h.group.getWorldQuaternion(this._q);
    for (const L of this.legs) {
      // v15: the pole rides the hip's PARENT (the body), so an action that pitches
      // or rolls the body carries the knee direction with it instead of flipping it
      const par = L.hip.parent;
      if (par) {
        par.getWorldQuaternion(this._pq);
        if (!L.parRel) L.parRel = gq.clone().invert().multiply(this._pq);
        this._pq.multiply(this._iq.copy(L.parRel).invert());
        this._pole.copy(L.poleLocal).applyQuaternion(this._pq);
      } else {
        this._pole.copy(L.poleLocal).applyQuaternion(gq);
      }
      if (L.poleSm.lengthSq() < 1e-6) L.poleSm.copy(this._pole);
      else L.poleSm.lerp(this._pole, 1 - Math.exp(-dt / 0.08)).normalize();
      this._pole.copy(L.poleSm);
      if (L.relaunch) {
        // v15: back from hanging: swing in from where the ankle REALLY is
        L.relaunch = false;
        if (L.init) {
          L.ankle.getWorldPosition(this._aw);
          L.mode = 'swing'; L.swingT = 0; L.swingDur = 0.18; L.forced = true;
          L.swingFrom.copy(this._aw); L.swingTo.copy(this._aw);
        }
      }
      this._worldFootTarget(L, this._ft, dt);
      const hip = L.hip.getWorldPosition(this._hw2);
      const rMax = 0.985 * L.reachW;
      // v16: a planted foot the body has risen away from lifts STRAIGHT UP on its
      // lock (keeps x/z) instead of being dragged sideways toward the hip
      L.lifted = false;
      this._lk.copy(this._ft);
      if (L.mode === 'plant' && !L.landPending) {
        const dxz = Math.hypot(this._ft.x - hip.x, this._ft.z - hip.z);
        if (dxz < rMax) {
          const minY = hip.y - Math.sqrt(rMax * rMax - dxz * dxz);
          if (this._ft.y < minY) { L.lifted = minY - this._ft.y > 0.01; this._ft.y = minY; }
        }
      }
      this._clampReach(this._ft, hip, rMax);
      // v17: clamped along hip->lock = raised off the ground, not sliding on it
      if (L.mode === 'plant' && !L.landPending && this._ft.distanceTo(this._lk) > 0.01) L.lifted = true;
      this._goal.copy(this._ft);
      // v13 CLOSED-LOOP IK: squash shears the leg's parent space, so the aim
      // misses. Measure where the ankle REALLY went and re-aim, up to 3 times.
      let err = 0;
      for (let it = 0; it < 3; it++) {
        solveLeg({ hip: L.hip, knee: L.knee, ankle: L.ankle, targetWorld: this._ft, poleWorld: this._pole, prevKnee: L.kneeLocal });
        L.ankle.updateWorldMatrix(true, false);
        L.ankle.getWorldPosition(this._aw);
        const ex = this._goal.x - this._aw.x, ey = this._goal.y - this._aw.y, ez = this._goal.z - this._aw.z;
        err = Math.hypot(ex, ey, ez);
        if (err < 0.0015) break;
        this._ft.x += ex; this._ft.y += ey; this._ft.z += ez;
        this._clampReach(this._ft, hip, rMax);
      }
      L.err = err;
      if (L.mode === 'plant' && !L.landPending && err > this.liftStats.maxErr) this.liftStats.maxErr = err;
      const maxD = (L.mode === 'swing' || L.landPending ? LEG_RATE : PLANT_RATE) * dt;
      for (let k = 0; k < 3; k++) {
        const bone = k === 0 ? L.hip : k === 1 ? L.knee : L.ankle;
        const q = L.prev[k];
        const ang = 2 * Math.acos(Math.min(1, Math.abs(bone.quaternion.dot(q))));
        if (ang > maxD && ang > 1e-6) { _lim.copy(bone.quaternion); bone.quaternion.copy(q).slerp(_lim, maxD / ang); }
      }
      L.ankle.updateWorldMatrix(true, false);
      L.postErr = L.ankle.getWorldPosition(this._aw).distanceTo(this._goal);
      L.prev[0].copy(L.hip.quaternion);
      L.prev[1].copy(L.knee.quaternion);
      L.prev[2].copy(L.ankle.quaternion);
      if (L.landPending) { L.ankle.updateWorldMatrix(true, false); L.ankle.getWorldPosition(L.lock); L.landPending = false; }
    }
    if (this.petted) {
      const back = this.legs[this.legs.length - 1];
      const kick = Math.max(0, Math.sin(this.kickT * 9)) * 0.85;
      if (kick > 0.02) back.hip.rotateX(-kick);
    }
  }

  private _clampReach(v: THREE.Vector3, hip: THREE.Vector3, r: number): void {
    if (r <= 1e-4) return;
    const d = v.distanceTo(hip);
    if (d > r) v.sub(hip).multiplyScalar(r / d).add(hip);
  }

  private _hw2 = new THREE.Vector3();
  private _goal = new THREE.Vector3();
  private _lk = new THREE.Vector3();
  private _sc = new THREE.Vector3();

  /**
   * v12 world stepper. Leg geometry is measured LIVE in world space (creature
   * scale and squash included). Lifts are edge-triggered on the gait beat; a
   * swing re-aims every frame at where the foot must land so the coming stance
   * is centred under the hip; guards lift early only when the leg truly runs
   * out of reach, with an airborne-count limit so a creature never lifts every
   * foot at once.
   */
  private _worldFootTarget(L: LegRig, out: THREE.Vector3, dt: number): void {
    const g = this.handle.group;
    const gp = g.position;
    const hd = this.drive.heading;
    const fx = Math.sin(hd), fz = Math.cos(hd);
    const speed = this.drive.speed;
    const moving = speed > 0.05;
    const stride = Math.max(0.05, this.drive.stride);
    const ground = this.drive.groundY;
    const gy = (x: number, z: number): number => (ground ? ground(x, z) : gp.y) + L.plant.y;

    const hip = L.hip.getWorldPosition(this._vw);
    const knee = L.knee.getWorldPosition(this._kw);
    const ank = L.ankle.getWorldPosition(this._aw);
    const reach = Math.max(1e-3, hip.distanceTo(knee) + knee.distanceTo(ank));
    const rest = this._rw.set(L.plant.x, 0, L.plant.z).applyMatrix4(g.matrixWorld);
    rest.y = gy(rest.x, rest.z);

    if (!L.init) {
      L.lock.copy(rest); L.mode = 'plant'; L.landT = 1;
      L.prevU = (this.externalPhase + L.phase) % 1;
      L.init = true;
    }

    const dyHip = Math.max(0, hip.y - rest.y);
    const r92 = 0.92 * reach;
    const restFlat = Math.hypot(rest.x - hip.x, rest.z - hip.z);
    const flat = Math.max(0.25 * reach, 1.3 * restFlat, Math.sqrt(Math.max(0, r92 * r92 - dyHip * dyHip)));
    const hardR = Math.max(0.97 * reach, 1.08 * hip.distanceTo(rest));
    const cycle = moving ? stride / speed : 1.2;
    const half = Math.min(0.5 * DUTY * stride, 0.6 * flat);

    const u = (this.externalPhase + L.phase) % 1;
    const onBeat = moving && crossedPhase(L.prevU, u, DUTY);
    L.prevU = u;
    L.landT += dt;

    // landing point: half a stance AHEAD of where the body will be at touchdown,
    // clamped inside the leg's reach from where the hip will be
    const plan = (remaining: number, o: THREE.Vector3): THREE.Vector3 => {
      const travel = moving ? speed * remaining : 0;
      const ahead = moving ? travel + half : 0;
      o.set(rest.x + fx * ahead, 0, rest.z + fz * ahead);
      const hx = hip.x + fx * travel, hz = hip.z + fz * travel;
      const vx = o.x - hx, vz = o.z - hz;
      const vd = Math.hypot(vx, vz), lim = 0.85 * flat;
      if (vd > lim) { o.x = hx + (vx / vd) * lim; o.z = hz + (vz / vd) * lim; }
      o.y = gy(o.x, o.z);
      return o;
    };

    if (L.mode === 'plant') {
      // v13: a planted foot the solver cannot hold steps instead of sliding
      const strained = L.err > 0.01 && L.landT > 0.05;
      const hard = strained || Math.hypot(L.lock.x - hip.x, L.lock.z - hip.z) > flat || hip.distanceTo(L.lock) > hardR;
      const rx = L.lock.x - rest.x, rz = L.lock.z - rest.z;
      const along = rx * fx + rz * fz;
      const lagging = moving && along < -1.35 * half;
      const drifted = !moving && Math.hypot(rx, rz) > Math.max(0.3 * flat, 0.05 * reach);
      let air = 0;
      for (const o of this.legs) if (o !== L && o.mode === 'swing') air++;
      const maxAir = this.legs.length >= 6 ? 3 : this.legs.length >= 4 ? 2 : 1;
      const beat = onBeat && L.landT > 0.2 * cycle;
      const soft = (lagging || drifted) && air < maxAir && L.landT > 0.08;
      if (hard || beat || soft) {
        const ls = this.liftStats;
        if (strained) ls.strain++; else if (hard) ls.hard++; else if (beat) ls.beat++; else ls.soft++;
        L.mode = 'swing';
        L.forced = !beat;
        L.swingT = 0;
        L.swingFrom.copy(L.lock);
        if (beat && !hard) {
          L.swingDur = THREE.MathUtils.clamp((1 - DUTY) * cycle, 0.12, 0.40);
        } else {
          plan(0.2, L.swingTo);
          const dd = Math.hypot(L.swingTo.x - L.lock.x, L.swingTo.z - L.lock.z);
          L.swingDur = THREE.MathUtils.clamp(0.14 + 0.35 * dd / reach, 0.14, 0.30);
        }
        plan(L.swingDur, L.swingTo);
      }
    }

    if (L.mode === 'swing') {
      L.swingT = Math.min(1, L.swingT + dt / Math.max(0.05, L.swingDur));
      plan((1 - L.swingT) * L.swingDur, this._tw);
      L.swingTo.lerp(this._tw, 1 - Math.exp(-dt / 0.05));
      const sT = L.swingT;
      const e = sT * sT * (3 - 2 * sT);
      out.lerpVectors(L.swingFrom, L.swingTo, e);
      const dd = Math.hypot(L.swingTo.x - L.swingFrom.x, L.swingTo.z - L.swingFrom.z);
      const k = reach / Math.max(1e-3, L.L1 + L.L2);
      const liftH = L.lift * k * Math.min(1, 0.35 + dd / stride);
      out.y = Math.max(out.y, gy(out.x, out.z)) + Math.sin(sT * Math.PI) * liftH;
      if (sT >= 1) { L.mode = 'plant'; L.landPending = true; L.landT = 0; L.lock.copy(out); }
      return;
    }
    L.lock.y += (gy(L.lock.x, L.lock.z) - L.lock.y) * Math.min(1, dt * 20);
    out.copy(L.lock);
  }

  private _kw = new THREE.Vector3();
  private _aw = new THREE.Vector3();
  private _rw = new THREE.Vector3();
  private _tw = new THREE.Vector3();
  private _ft = new THREE.Vector3();

  private _wrapPi(a: number): number {
    let d = a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  private _vw = new THREE.Vector3();

  /** Height proxy used for the stride, set by the Agent; 1 for pedestal views. */
  bulkScale = 1;

  /**
   * The face. One place writes eyes, lids, brows, mouth and blush, so an
   * expression can never half-apply.
   */
  private _updateFace(dt: number, act: number): void {
    const h = this.handle;
    const closed = this.blinkT > 0 ? Math.sin(Math.PI * (1 - this.blinkT)) : 0;
    const f = this.face;

    const happy = this.mood === 'happy' ? 1 : 0;
    const love = this.mood === 'love' ? 1 : 0;
    const sad = this.mood === 'sad' ? 1 : 0;
    const surprised = this.mood === 'surprised' || this.mood === 'scared' ? 1 : 0;
    const sleepy = this.mood === 'sleepy' ? 1 : 0;
    const dizzy = this.mood === 'dizzy' ? 1 : 0;

    // target face values, then blend — never a hard set
    let lidT = f.lid;
    let openT = f.mouthOpen;
    let wideT = f.mouthWide;
    let blushT = f.blush;
    let pupT = 1;
    let spinT = 0;

    if (this.petted) { lidT = 0.72; blushT = 1; pupT = 1.06; wideT = 1.15; openT = Math.max(openT, 0.25); }
    if (this.held) { lidT = 0; blushT = 0.2; pupT = 1.35; openT = Math.max(openT, 0.75); wideT = 0.8; }
    if (dizzy) { pupT = 0.7; spinT = 1; }
    if (sleepy) { lidT = Math.max(lidT, 0.62); }
    if (happy || love) { lidT = Math.max(lidT, 0.55); blushT = Math.max(blushT, 0.8); pupT = 1.08; openT = Math.max(openT, 0.35); }
    if (surprised) { lidT = 0; pupT = 1.3; openT = Math.max(openT, 0.85); wideT = 0.85; }
    if (sad) { lidT = Math.max(lidT, 0.28); pupT = 1.12; wideT = 0.85; }
    if (this.action === 'chomp' || this.action === 'eat') {
      const chew = 0.5 + 0.5 * Math.sin(this.actionT * 22);
      openT = Math.max(openT, chew * 0.95);
      wideT = 1.1;
      blushT = Math.max(blushT, 0.55);
    }
    if (this.action === 'wave') { lidT = Math.max(lidT, 0.5); openT = Math.max(openT, 0.7); wideT = 1.2; }
    if (this.idleAct === 'yawn' && this.idleActW > 0.2) { openT = Math.max(openT, 0.95 * this.idleActW); wideT = 0.9; lidT = Math.max(lidT, 0.75 * this.idleActW); }
    if (this.idleAct === 'sniff' && this.idleActW > 0.2) { wideT = 0.8; }

    const k = Math.min(1, dt / 0.22);
    f.lid += (lidT - f.lid) * k;
    f.mouthOpen += (openT - f.mouthOpen) * k;
    f.mouthWide += (wideT - f.mouthWide) * k;
    f.blush += (blushT - f.blush) * k;
    f.pupil += (pupT - f.pupil) * Math.min(1, dt * 6);
    f.gazeSpin += (spinT - f.gazeSpin) * Math.min(1, dt * 4);

    this.pupil += ((1 + surprised * 0.10 - happy * 0.05 + (sleepy + dizzy) * -0.08) - this.pupil) * Math.min(1, dt * 5);
    this.lidClose += (f.lid - this.lidClose) * Math.min(1, dt * 6);

    const dizzySpin = f.gazeSpin * this.t * 5.5;
    for (const e of h.eyes) {
      // a one-eyed wink, when the blink roll said so
      const lid = this.blinkSide > 0 ? (e.side > 0 ? closed : 0)
        : this.blinkSide < 0 ? (e.side < 0 ? closed : 0)
          : closed;
      e.lidPivot.rotation.x = -Math.PI * 0.5 + Math.max(0, Math.min(0.985, lid + this.lidClose)) * Math.PI * 0.98;
      // eyes lead the head: the socket carries the gaze, the head carries the pose
      const spinY = f.gazeSpin > 0.05 ? Math.cos(dizzySpin) * 0.45 * f.gazeSpin : 0;
      const spinP = f.gazeSpin > 0.05 ? Math.sin(dizzySpin) * 0.35 * f.gazeSpin : 0;
      e.socket.rotation.set(this.gazePitch + spinP, this.gazeYaw + spinY, f.gazeSpin * Math.sin(dizzySpin * 0.7) * 0.4);
      const pup = this.pupil * f.pupil * (1 + surprised * 0.05);
      e.pupil.scale.set(pup, pup * (1 - sad * 0.12), 1);
      const browUp = surprised * 1.0 + sad * 0.45;
      e.brow.visible = browUp > 0.08;
      if (e.brow.visible) {
        e.brow.position.y = e.radius * (0.92 + browUp * 0.20);
        // angry/sad tilt: inner end up for sad, down for angry
        e.brow.rotation.z = (sad * -0.30 + (this.mood === 'scared' ? 0.25 : 0)) * (e.side >= 0 ? 1 : -1);
      }
    }

    const open = f.mouthOpen;
    h.mouthOpen.visible = open > 0.06;
    h.mouth.visible = open <= 0.06;
    if (h.mouthOpen.visible) {
      const w = f.mouthWide;
      // cheeks puff 20% on a chomp: the open mouth and the blush both swell
      h.mouthOpen.scale.set(w * (1 + open * 0.15), (0.6 + open * 0.75) * (1 + open * 0.12), 1 * (1 + open * 0.2));
    }
    if (h.mouth.visible) {
      h.mouth.scale.set(f.mouthWide, 1 - (1 - f.mouthWide) * 0.5 + (sad ? -0.25 : 0), 1);
      h.mouth.rotation.z = -Math.PI * 0.5 - 1.55 * 0.5 + (sad ? 0.5 : 0);
    }
    for (const b of h.blush) b.scale.setScalar(0.85 + f.blush * 0.55 + open * 0.08);
    void act;
  }

  /** Per-species locomotion flavour, keyed off the template NAME: PIP and
   *  MOCHI share the `walk` tag but must move completely differently. */
  private _gaitFlavour(loco: number, speed01: number): { roll: number; spine: number; headPitch: number } {
    const t = this.template;
    if (loco <= 0.001) return { roll: 0, spine: 0, headPitch: 0 };
    const s = Math.sin(this.phase * Math.PI * 2);
    const key = (t.name || '').toUpperCase();
    if (key.startsWith('PIP') || t.locomotion === 'walk') {
      // PIP waddle: hard side-to-side sway, shoulders roll, head counter-sways
      return { roll: s * 0.24 * loco * (0.45 + speed01 * 0.55), spine: 0.11 * loco, headPitch: 0 };
    }
    if (key.startsWith('MOCHI')) {
      return { roll: Math.sin(this.phase * Math.PI * 4) * 0.05 * loco, spine: 0.19 * loco, headPitch: -0.05 * speed01 };
    }
    if (t.locomotion === 'skitter') {
      // ZIK alternating-tripod: low body, quick shimmy, head holds still
      return { roll: s * 0.07 * loco, spine: -0.05 * loco, headPitch: -0.06 * loco };
    }
    if (t.locomotion === 'hop') return { roll: 0, spine: 0, headPitch: 0 };
    return { roll: s * 0.08 * loco, spine: 0.09 * loco, headPitch: 0 };
  }

  /** Additive action poses, all in body-local radians / metres. */
  private _actionPose(id: ActionId, time: number): { pitch: number; lift: number; squash: number; roll: number } {
    const e = Math.min(1, time / 0.22);
    const osc = Math.sin(time * 9);
    const R = { pitch: 0, lift: 0, squash: 1, roll: 0 };
    switch (id) {
      // eat: dip the head, then chomp — the mouth itself is driven by _updateFace
      case 'eat': return { ...R, pitch: e * 0.40 + osc * 0.07, lift: -e * 0.03, squash: 1 + osc * 0.05 };
      case 'chomp': return { ...R, pitch: e * 0.44 + Math.sin(time * 22) * 0.05, lift: -e * 0.03, squash: 1 + Math.sin(time * 22) * 0.055 };
      case 'sniff': return { ...R, pitch: e * 0.46 + Math.sin(time * 7) * 0.07, lift: -e * 0.03, squash: 1 };
      case 'play': return { ...R, pitch: -e * 0.12, lift: Math.abs(Math.sin(time * 5)) * e * 0.10, squash: 1 + Math.sin(time * 5) * 0.10, roll: Math.sin(time * 4) * 0.10 * e };
      case 'pet': return { ...R, pitch: e * 0.14, lift: -e * 0.02, squash: 1 + Math.sin(time * 8) * 0.05 };
      // roll onto the back: a big roll plus a drop, held for the stroke
      case 'petRoll': {
        const u = Math.min(1, time / 0.35);
        return { pitch: -u * 0.55, lift: -u * 0.06, squash: 1 + Math.sin(time * 6) * 0.06, roll: u * 2.3 };
      }
      case 'sleep': return { ...R, pitch: e * 0.34, lift: -e * 0.07, squash: 1 - e * 0.08 };
      case 'greet': return { ...R, pitch: -e * 0.10, lift: Math.abs(Math.sin(time * 7)) * e * 0.09, squash: 1 + Math.sin(time * 7) * 0.05 };
      case 'wave': return { ...R, pitch: -e * 0.06, lift: Math.abs(Math.sin(time * 8)) * e * 0.05, squash: 1 };
      case 'startle': return { ...R, pitch: -e * 0.22, lift: e * 0.07, squash: 1 - e * 0.08 };
      case 'dig': return { ...R, pitch: e * 0.46 + Math.sin(time * 12) * 0.10, lift: -e * 0.04, squash: 1 };
      case 'splash': return { ...R, pitch: e * 0.18, lift: Math.abs(Math.sin(time * 14)) * e * 0.05, squash: 1 };
      case 'swim': return { ...R, pitch: e * 0.06, lift: Math.sin(time * 3) * e * 0.03, squash: 1 };
      case 'fly': return { ...R, pitch: -e * 0.14, lift: Math.sin(time * 6) * e * 0.05, squash: 1 };
      case 'perch': return { ...R, pitch: e * 0.06, squash: 1 };
      case 'carry': return { ...R, pitch: Math.sin(time * 7) * 0.14, squash: 1.12, roll: Math.sin(time * 5) * 0.12 };
      default: return R;
    }
  }
}
