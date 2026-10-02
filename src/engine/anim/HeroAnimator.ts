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
const LEG_RATE = 12;
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
  private _worldFootTarget(L: LegRig, out: THREE.Vector3, dt: number): void {
    const gp = this.handle.group.position;
    const hd = this.drive.heading;
    const sh = Math.sin(hd), ch = Math.cos(hd);
    const speed = this.drive.speed;
    const stride = Math.max(0.05, this.drive.stride);
    const ground = this.drive.groundY;
    const gy = (x: number, z: number): number => (ground ? ground(x, z) : gp.y) + L.plant.y;
    const reach = (L.L1 + L.L2) * 0.95;

    const restX = gp.x + (L.plant.x * ch + L.plant.z * sh);
    const restZ = gp.z + (-L.plant.x * sh + L.plant.z * ch);
    const restY = gy(restX, restZ);

    if (!L.init) {
      L.lock.set(restX, restY, restZ);
      L.bodyAtPlant.copy(gp);
      L.init = true;
    }
    L.hip.getWorldPosition(this._vw);

    const cycleTime = speed > 0.02 ? stride / speed : 1.2;
    const duty = 0.62;
    const u = (this.externalPhase + L.phase) % 1;
    const stretch = this._vw.distanceTo(L.lock);
    const restErr = Math.hypot(L.lock.x - restX, L.lock.z - restZ);
    const drift = Math.hypot(gp.x - L.bodyAtPlant.x, gp.z - L.bodyAtPlant.z);

    // turn-in-place error: how far the planted foot has swung away from its
    // rest direction in BODY space
    const relX = L.lock.x - gp.x, relZ = L.lock.z - gp.z;
    let angErr = this._wrapPi(Math.atan2(relX, relZ) - hd - L.restAngle);

    const forceStep = stretch > reach
      || restErr > 0.6 * stride
      || Math.abs(angErr) > 25 * Math.PI / 180
      || (speed < 0.05 && drift > 0.3 * stride);

    if (L.mode === 'plant') {
      if (forceStep || u >= duty) {
        L.mode = 'swing';
        L.forced = forceStep;
        L.swingT = 0;
        L.swingFrom.set(L.lock.x, gy(L.lock.x, L.lock.z), L.lock.z);
        // a step taken to keep up (turn, idle drift, overstretch) does NOT
        // reach forward; a walking step lands half a stride ahead
        // v12: a step forced while WALKING must still reach forward; landing under
        // the hip left it behind the body and forced it again (the forced-lift loop).
        // Turning in place keeps lead 0.
        const turning = Math.abs(angErr) > 25 * Math.PI / 180;
        const lead = speed > 0.05 && !turning ? 0.5 * stride + speed * 0.10 : 0;
        let lx = gp.x + sh * lead + (L.plant.x * ch + L.plant.z * sh);
        let lz = gp.z + ch * lead + (-L.plant.x * sh + L.plant.z * ch);
        // Reach guard on the NEW target. `reach` is a 3D budget, so the
        // HORIZONTAL allowance is only sqrt(reach^2 - dy^2): the hip sits a
        // whole leg above the foot, and using `reach` as a flat allowance asked
        // for a step the leg could not make, so the solver clamped every stance
        // frame — that was the remaining slip, the overstretch and the pop.
        const vx = lx - this._vw.x, vz = lz - this._vw.z;
        const vd = Math.hypot(vx, vz);
        const dyHip = Math.max(0, this._vw.y - gy(this._vw.x, this._vw.z));
        // v12: place at 80% of the flat allowance, not 100%. Planting exactly on the
        // reach limit meant the very next frame re-measured it as out of reach.
        const maxFlat = 0.80 * Math.sqrt(Math.max(0.0025, reach * reach - dyHip * dyHip));
        if (vd > maxFlat) { lx = this._vw.x + (vx / Math.max(1e-6, vd)) * maxFlat; lz = this._vw.z + (vz / Math.max(1e-6, vd)) * maxFlat; }
        L.swingTo.set(lx, gy(lx, lz), lz);
        L.swingDur = Math.min(0.45, Math.max(0.12, (u >= duty && !forceStep)
          ? (1 - duty) * cycleTime
          : 0.18));
      }
    } else {
      L.swingT += dt / Math.max(0.02, L.swingDur);
      if (L.swingT >= 1) {
        L.swingT = 1;
        L.mode = 'plant';
        L.lock.copy(L.swingTo);
        L.lock.y = gy(L.lock.x, L.lock.z);
        L.bodyAtPlant.copy(gp);
      }
    }

    if (L.mode === 'plant') {
      L.lock.y = gy(L.lock.x, L.lock.z);
      out.copy(L.lock);
    } else {
      const s = L.swingT;
      out.lerpVectors(L.swingFrom, L.swingTo, s);
      out.y = gy(out.x, out.z) + Math.sin(s * Math.PI) * L.lift;
    }
    void angErr;
  }

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
