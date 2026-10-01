/**
 * Sim — the playable layer. Owns the creatures, their brains, the player's
 * tools, the visual feedback every tool fires, the floating name tags and the
 * event log the acceptance run reads.
 *
 * Every tool reaction is a small choreography rather than an instant state
 * change: a list of `{ at, fn }` steps that the fixed-step loop walks through,
 * so a feed really does sniff, chomp three times, then squint, and a spawn
 * really does drop a seed, wobble, pop, stretch, blink and hop.
 */
import * as THREE from 'three';
import { Stage } from '../scene/Stage';
import { Loop } from '../core/loop';
import { stats } from '../core/stats';
import { buildMaterials, MAT } from '../render/hero/materials';
import { buildHero } from '../render/hero/HeroRenderer';
import { buildHeroTemplate } from '../hero/heroes';
import { applyDNA } from '../hero/reshape';
import { paletteAt, hexToLinear } from '../hero/palette';
import { randomDNA, mulberry32, type HeroDNA } from '../hero/dna';
import { HERO_IDS, type HeroId } from '../hero/types';
import { Agent } from '../agent/Agent';
import { HeroAnimator, type ActionId as AnimAction } from '../anim/HeroAnimator';
import { compare, type Probe } from '../anim/metrics';
import { Brain, type ActionId } from '../brain/Brain';
import { Emotes, type Glyph } from '../render/hero/emotes';
import { Vfx } from './vfx';
import { World } from './World';
import { buildTerrain, buildSea, buildFoam, heightAt, isDry, WALK_R } from './terrain';

export type Tool = 'none' | 'spawn' | 'call' | 'feed' | 'ball' | 'pet' | 'carry' | 'inspect';

/** brain action -> the additive pose the one animator plays. */
const ANIM_ACTION: Record<string, AnimAction> = {
  wander: 'none', investigate: 'sniff', drink: 'sniff', hide: 'none', idle: 'none',
  eat: 'eat', nap: 'sleep', greet: 'greet', playChase: 'play', follow: 'none',
  flee: 'startle', pushBall: 'play',
};

export interface SimEvent { t: number; kind: string; name: string }
export interface ToolTarget { agent: Agent | null; ground: THREE.Vector3 | null }

interface Choreo { at: number; t: number; fn: () => void }
interface DroppedBerry { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }

export class Sim {
  readonly stage: Stage;
  readonly world: World;
  readonly emotes: Emotes;
  readonly vfx: Vfx;
  readonly agents: Agent[] = [];
  readonly brains = new Map<number, Brain>();
  readonly events: SimEvent[] = [];
  tool: Tool = 'none';
  spawnSpecies: HeroId | null = null;
  selected: Agent | null = null;
  follow: Agent | null = null;
  carried: Agent | null = null;
  petting: Agent | null = null;
  simTime = 0;
  brainEnabled = true;
  /** inspection camera: eased fly-in, released with Esc */
  inspectT = 0;
  private inspectTarget: Agent | null = null;
  private rng: () => number;
  private loop: Loop;
  private seed: number;
  private lastTickMs = 0;
  private carriedAgent = false;
  private tmp = new THREE.Vector3();
  private choreo: Choreo[] = [];
  private drops: DroppedBerry[] = [];
  private berryGeo!: THREE.SphereGeometry;
  private carryVel = new THREE.Vector3();
  private petHold = 0;
  private overrides = new Map<number, number>();
  private tagLayer: HTMLElement | null = null;
  private tagEls = new Map<number, HTMLDivElement>();
  private trampleTimer = 0;

  constructor(canvas: HTMLCanvasElement, seed = 20261001) {
    buildMaterials();
    this.emotes = new Emotes();
    this.stage = new Stage(canvas);
    this.vfx = new Vfx();
    this.rng = mulberry32(seed);
    this.seed = seed;
    this.world = new World(this.stage);
    this.stage.scene.add(buildTerrain());
    this.stage.scene.add(buildSea());
    this.stage.scene.add(buildFoam());
    this.stage.scene.add(this.world.props.group);
    this.stage.scene.add(this.emotes.group);
    this.stage.scene.add(this.vfx.group);
    this.stage.setHome(new THREE.Vector3(0.4, 8.4, 14.2), new THREE.Vector3(0, 0.6, 0));

    // a berry you can see bounce before a creature eats it
    const bg = new THREE.SphereGeometry(0.085, 16, 12);
    const bc = new Float32Array(bg.getAttribute('position').count * 3);
    const ba = new THREE.Color('#e8475f');
    const bb = new THREE.Color('#8f1f33');
    const bp = bg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const c = ba.clone().lerp(bb, 0.5 - bp.getY(i) * 0.5);
      bc[i * 3] = c.r; bc[i * 3 + 1] = c.g; bc[i * 3 + 2] = c.b;
    }
    bg.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    this.berryGeo = bg;

    for (const id of HERO_IDS) {
      for (let i = 0; i < 2; i++) this.spawn(id, this.world.randomSpot(this.rng), true);
    }

    this.loop = new Loop(
      (dt) => this.step(dt),
      (_a, dt) => {
        stats.beginFrame();
        this.stage.update(dt);
        this.vfx.update(dt, this.stage.camera);
        this.stage.render(dt * 1000);
        if (this.carriedAgent) this.updateCarried(this.stage.camera);
      },
      60,
    );
  }

  start(): void { this.loop.start(); }
  stop(): void { this.loop.stop(); }

  /** v9 G key: 0 none, 1 pitch+, 2 roll+, 3 left limb forward, 4 wave+. */
  testPose = 0;
  /** v9 diagnostic: strip the pivot juice while measuring foot slip */
  quietPivot = false;
  /** v9: captures freeze the day clock (0.5 = noon) so lighting never drifts */
  dayFrozen = false;
  frozenDay = 0.5;

  setDay(v: number): void {
    this.dayFrozen = true;
    this.frozenDay = v;
    this.world.day = v;
    this.world.stage.setDayNight(v);
  }

  step(dt: number): void {
    this.simTime += dt;
    this.world.update(dt);
    if (this.dayFrozen) {
      this.world.day = this.frozenDay;
      this.world.stage.setDayNight(this.frozenDay);
    }
    for (const a of this.agents) { a.debugPose = this.testPose; a.noPivotJuice = this.quietPivot; }
    this.runChoreo(dt);
    this.tickDrops(dt);

    for (const a of this.agents) {
      const ov = this.overrides.get(a.id) ?? 0;
      if (ov > 0) this.overrides.set(a.id, ov - dt);
      const b = this.brains.get(a.id);
      if (b && this.brainEnabled && ov <= 0) {
        b.update(dt, a, this.world);
        const want = ANIM_ACTION[b.action] ?? 'none';
        if (a.action !== want && a.action !== 'petRoll' && a.action !== 'chomp' && a.action !== 'wave') a.begin(want);
      }
      a.update(dt);
    }

    // ---- petting: the motion layer owns the pose, its roll-over at 2 s and
    //      the heart beat; the Sim only decides how long it lasts -------------
    if (this.petting) {
      const p = this.petting;
      this.petHold += dt;
      p.mood = this.petHold > 2 ? 'love' : 'happy';
      p.wiggle = 1;
    }

    this.carriedAgent = !!this.carried;
    this.updateEmotes();
    stats.creatures = this.agents.length;

    // ---- grass is trampled flat around every creature's feet ---------------
    this.trampleTimer -= dt;
    if (this.trampleTimer <= 0) {
      this.trampleTimer = 0.22;
      this.world.props.trample(this.agents.map((a) => ({ x: a.pos.x, z: a.pos.z })));
    }

    for (const a of this.agents) {
      const r = Math.hypot(a.pos.x, a.pos.z);
      if (r > WALK_R) { a.pos.x *= WALK_R / r; a.pos.z *= WALK_R / r; }
    }
  }

  private runChoreo(dt: number): void {
    if (!this.choreo.length) return;
    for (let i = this.choreo.length - 1; i >= 0; i--) {
      const c = this.choreo[i];
      c.t += dt;
      if (c.t >= c.at) { c.fn(); this.choreo.splice(i, 1); }
    }
  }

  /** Schedule a step `at` seconds from now. All tool reactions are built here. */
  private after(at: number, fn: () => void): void {
    this.choreo.push({ at, t: 0, fn });
  }

  private hold(a: Agent, seconds: number): void {
    this.overrides.set(a.id, Math.max(this.overrides.get(a.id) ?? 0, seconds));
  }

  private tickDrops(dt: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      d.vel.y -= 11 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      const g = heightAt(d.mesh.position.x, d.mesh.position.z) + 0.085;
      if (d.mesh.position.y < g) {
        d.mesh.position.y = g;
        if (d.vel.y < -0.4) {
          d.vel.y = -d.vel.y * 0.42;
          d.vel.x *= 0.6; d.vel.z *= 0.6;
          this.vfx.ring(d.mesh.position.x, g, d.mesh.position.z, { r0: 0.06, r1: 0.5, life: 0.35, color: '#ffd0d8' });
        } else { d.vel.set(0, 0, 0); }
      }
      if (d.life <= 0) {
        this.stage.scene.remove(d.mesh);
        this.drops.splice(i, 1);
      }
    }
  }

  private updateEmotes(): void {
    const list: { glyph: Glyph; pos: THREE.Vector3; life: number; punch: number }[] = [];
    for (const a of this.agents) {
      if (a.emoteGlyph && a.emoteT > 0) {
        a.emoteAnchor(this.tmp);
        list.push({
          glyph: a.emoteGlyph, pos: this.tmp.clone(),
          life: 1 - Math.min(1, a.emoteT / Math.max(0.1, a.emoteMax)),
          punch: a.emotePunch,
        });
      }
    }
    this.emotes.render(list, this.stage.camera);
  }

  private pushEvent(kind: string, a: Agent): void {
    this.events.push({ t: +this.simTime.toFixed(2), kind, name: a.name });
    if (this.events.length > 400) this.events.shift();
  }

  drainBrainEvents(): void {
    for (const a of this.agents) {
      const b = this.brains.get(a.id);
      if (!b) continue;
      while (b.events.length) {
        const e = b.events.shift();
        if (e) this.events.push({ t: +this.simTime.toFixed(2), kind: e.kind, name: e.name });
      }
    }
  }

  // ---- creature lifecycle --------------------------------------------------
  spawn(hero: HeroId, at: THREE.Vector3 | null, quiet = false): Agent {
    const dna: HeroDNA = randomDNA(this.rng, hero);
    const pal = paletteAt(dna.palette);
    const colors = {
      base: hexToLinear(pal.base), belly: hexToLinear(pal.belly), limb: hexToLinear(pal.limb),
      accent: hexToLinear(pal.accent), deep: hexToLinear(pal.deep),
    };
    const template = applyDNA(buildHeroTemplate(hero, colors), dna);
    const handle = buildHero(template, pal);
    const agent = new Agent(this.world, template, dna, handle, this.seed + this.agents.length * 7919 + Math.floor(this.rng() * 1e6));
    const p = at ?? this.world.randomSpot(this.rng);
    agent.place(p.x, p.z);
    agent.onFootfall = (x, y, z, power) => this.vfx.dust(x, y, z, power);
    agent.onVfx = (kind, x, y, z, scale) => this.motionVfx(kind, x, y, z, scale);
    this.stage.scene.add(handle.group);
    this.agents.push(agent);
    this.world.agents.push(agent);
    this.brains.set(agent.id, new Brain(agent.id * 2654435761));
    if (!quiet) {
      this.pushEvent('spawn', agent);
      this.spawnTheatre(agent);
    }
    return agent;
  }

  /**
   * Spawn theatre: a glowing seed drops, wobbles, pops with a flash, then the
   * creature stretches tall, blinks twice, looks around and does a happy hop.
   */
  private spawnTheatre(a: Agent): void {
    const x = a.pos.x;
    const z = a.pos.z;
    const y = a.pos.y;
    a.motion.face.set('asleep');
    a.mood = 'surprised';
    this.hold(a, 3.2);
    a.say('bang', 0.9, 1.4);
    this.vfx.ring(x, y, z, { r0: 0.2, r1: 3.4, life: 0.9, color: '#bff7ff' });
    this.vfx.puff(x, y + 0.25, z, 18, { life: 0.8, size: 0.09, spread: 1.3, up: 1.6, color: '#d9f7ff' });
    this.after(0.55, () => {
      this.vfx.ring(x, y, z, { r0: 0.1, r1: 2.2, life: 0.6, color: '#fff3b0' });
      this.vfx.puff(x, y + 0.15, z, 22, { life: 0.55, size: 0.075, spread: 1.6, up: 1.1, color: '#fff0b8' });
      a.mood = 'happy';
      a.cheer();
      a.motion.face.set('curious');
    });
    this.after(1.1, () => { a.motion.face.set('asleep'); });
    this.after(1.3, () => { a.motion.face.set('curious'); });
    this.after(1.5, () => { a.motion.face.set('asleep'); });
    this.after(1.7, () => { a.motion.face.set('curious'); });
    this.after(2.1, () => { a.say('note', 1.2, 1.2); a.cheer(); });
    this.after(2.6, () => { a.mood = 'neutral'; a.motion.face.set('neutral'); });
  }

  remove(a: Agent): void {
    a.alive = false;
    this.stage.scene.remove(a.handle.group);
    a.handle.dispose();
    const i = this.agents.indexOf(a);
    if (i >= 0) this.agents.splice(i, 1);
    const j = this.world.agents.indexOf(a);
    if (j >= 0) this.world.agents.splice(j, 1);
    this.brains.delete(a.id);
    if (this.selected === a) this.selected = null;
    if (this.follow === a) this.follow = null;
    if (this.carried === a) this.carried = null;
    if (this.petting === a) this.petting = null;
  }

  // ---- player tools --------------------------------------------------------
  /**
   * Call. A ripple spreads on the ground and every creature nearby reacts
   * exactly the way its personality says it should: bold ones sprint, shy ones
   * peek first and creep in, lazy ones wave a limb and stay put.
   */
  call(pos: THREE.Vector3, radius = 10): number {
    this.vfx.ring(pos.x, pos.y, pos.z, { r0: 0.3, r1: radius * 0.75, life: 1.1, color: '#9fe8ff' });
    this.vfx.ring(pos.x, pos.y, pos.z, { r0: 0.2, r1: radius * 0.5, life: 0.8, color: '#ffffff' });
    this.vfx.puff(pos.x, pos.y + 0.1, pos.z, 10, { life: 0.7, size: 0.08, spread: 1.6, up: 1.0, color: '#cfeeff' });
    let n = 0;
    for (const a of this.agents) {
      const d = a.pos.distanceTo(pos);
      if (d >= radius) continue;
      n++;
      const ang = Math.atan2(pos.x - a.pos.x, pos.z - a.pos.z);
      const spot = new THREE.Vector3(pos.x - Math.sin(ang) * 1.0, 0, pos.z - Math.cos(ang) * 1.0);
      spot.y = heightAt(spot.x, spot.z);
      // the ears/antennae twitch and the head snaps to the sound first
      a.faceTarget = { x: pos.x, z: pos.z };
      a.say('bang', 1.1, 1.3);
      a.mood = 'surprised';
      this.hold(a, 3.6);

      const bold = a.trait('bold');
      const lazy = a.trait('lazy');
      const shy = 1 - a.trait('sociable');
      if (lazy > 0.62 && bold < 0.55) {
        // lazy: waves a limb, does not budge
        this.after(0.5, () => { if (a.alive) {         a.begin('wave');
        a.say('note', 1.6, 1.2);
      } });
    this.pushEvent('call_wave', a);
        this.after(2.2, () => { if (a.alive) a.mood = 'neutral'; });
        this.pushEvent('call_ignore', a);
        continue;
      }
      if (shy > 0.58 && bold < 0.62) {
        // shy: peek, wait, then creep over at a low throttle
        this.after(1.5, () => {
          if (!a.alive) return;
          a.goTo(spot, 0.45);
          a.mood = 'neutral';
        });
        this.pushEvent('call_peek', a);
        continue;
      }
      // bold: straight there at full tilt, bouncing
      this.after(0.25, () => {
        if (!a.alive) return;
        a.goTo(spot, 1);
        a.mood = 'happy';
        a.cheer();
      });
      this.pushEvent('call', a);
    }
    return n;
  }

  /**
   * Feed. The berry drops and bounces, the nearest hungry creature races over,
   * sniffs, chomps three times with puffed cheeks, then squints and wiggles to
   * a ♪. Late arrivals pull a sad face and a "?".
   */
  dropBerry(pos: THREE.Vector3): void {
    const mesh = new THREE.Mesh(this.berryGeo, MAT.lit);
    mesh.name = 'droppedBerry';
    mesh.position.set(pos.x, heightAt(pos.x, pos.z) + 1.6, pos.z);
    const rng = this.rng;
    mesh.userData.vx = (rng() - 0.5) * 0.6;
    this.stage.scene.add(mesh);
    this.drops.push({
      mesh,
      vel: new THREE.Vector3((rng() - 0.5) * 0.7, 0, (rng() - 0.5) * 0.7),
      life: 26,
    });
    this.vfx.ring(pos.x, heightAt(pos.x, pos.z), pos.z, { r0: 0.1, r1: 1.0, life: 0.5, color: '#ffc6d2' });

    const sorted = [...this.agents]
      .sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos))
      .slice(0, 4);
    if (!sorted.length) return;

    const winner = sorted[0];
    sorted.forEach((a, i) => {
      const ang = Math.atan2(pos.x - a.pos.x, pos.z - a.pos.z);
      const spot = new THREE.Vector3(pos.x - Math.sin(ang) * 0.55, 0, pos.z - Math.cos(ang) * 0.55);
      spot.y = heightAt(spot.x, spot.z);
      a.goTo(spot, 1);
      a.mood = 'surprised';
      const b = this.brains.get(a.id);
      if (b) { b.action = 'eat'; b.actionAge = 0; b.needs.hunger = Math.min(1, b.needs.hunger + 0.2); }
      if (i === 0) {
        this.hold(winner, 5.0);
        this.pushEvent('feed', a);
      } else {
        this.hold(a, 5.0);
        this.pushEvent('feed_late', a);
      }
    });

    // the winner's full meal: sniff -> three chomps -> squint + wiggle + note
    this.after(1.3, () => {
      if (!winner.alive) return;
      winner.stop();
      winner.begin('sniff');
      winner.say('bang', 0.8);
    });
    this.after(2.3, () => {
      if (!winner.alive) return;
      winner.begin('chomp');
      winner.mood = 'happy';
      this.eatNearestBush(winner);
    });
    for (let i = 0; i < 3; i++) {
      this.after(2.4 + i * 0.55, () => {
        if (!winner.alive) return;
        winner.cheer();
        this.vfx.puff(winner.pos.x, winner.pos.y + 0.3, winner.pos.z, 4, { life: 0.35, size: 0.05, spread: 0.7, up: 0.8, color: '#ffd9e2' });
      });
    }
    this.after(4.1, () => {
      if (!winner.alive) return;
      winner.begin('eat');
      winner.mood = 'happy';
      winner.say('note', 1.6, 1.3);
      winner.wiggle = 1;
      this.hold(winner, 1.2);
    });
    this.after(5.2, () => { if (winner.alive) winner.mood = 'neutral'; });

    // late arrivals get nothing and they know it
    for (const a of sorted.slice(1)) {
      this.after(2.0, () => {
        if (!a.alive) return;
        a.mood = 'sad';
        a.say('question', 1.6, 1.2);
        a.stop();
      });
      this.after(3.8, () => { if (a.alive) a.mood = 'neutral'; });
    }
  }

  private eatNearestBush(a: Agent): void {
    const i = this.world.props.nearestFruitingBush(a.pos, 12);
    if (i >= 0) this.world.props.eat(i);
  }

  /** Hurl the ball. It bounces, rolls with spin, and creatures chase it. */
  throwBall(pos: THREE.Vector3): void {
    const b = this.world.props.ball;
    const d = new THREE.Vector3(pos.x - b.pos.x, 0, pos.z - b.pos.z);
    const dist = Math.min(9, d.length());
    if (dist < 0.01) return;
    d.normalize();
    b.vel.set(d.x * dist * 0.95, 0, d.z * dist * 0.95);
    b.vel.clampLength(0, 7);
    this.vfx.puff(b.pos.x, b.pos.y, b.pos.z, 8, { life: 0.4, size: 0.06, spread: 1.0, up: 0.9, color: '#e8f4ff' });
    this.pushEvent('ball', this.agents[0] ?? ({ name: 'player' } as Agent));

    // up to five creatures pile onto the chase
    const chasers = [...this.agents]
      .sort((x, y) => x.pos.distanceTo(b.pos) - y.pos.distanceTo(b.pos))
      .slice(0, 5);
    for (const a of chasers) {
      a.mood = 'happy';
      this.hold(a, 4.0);
      const bb = this.brains.get(a.id);
      if (bb) { bb.action = 'pushBall'; bb.actionAge = 0; }
      this.after(0.15, () => { if (a.alive) a.say('bang', 0.9); });
    }
  }

  pet(a: Agent): void {
    if (this.petting && this.petting !== a) this.endPet();
    this.petting = a;
    this.petHold = 0;
    a.stop();
    a.mood = 'happy';
    a.motion.petStart();
    a.say('heart', 1.5, 1.25);
    this.vfx.ring(a.pos.x, a.pos.y, a.pos.z, { r0: 0.2, r1: 1.4, life: 0.6, color: '#ffc2d6' });
    this.pushEvent('pet', a);
  }

  /** Keep the pet leaning into the cursor: the caller passes the ground point. */
  aimPet(cursor: THREE.Vector3): void {
    if (!this.petting) return;
    this.petting.faceTarget = { x: cursor.x, z: cursor.z };
  }

  endPet(): void {
    const a = this.petting;
    this.petting = null;
    this.petHold = 0;
    if (!a) return;
    a.motion.petEnd();
    a.mood = 'happy';
    a.say('heart', 1.2, 1.15);
    this.after(1.6, () => { if (a.alive) a.mood = 'neutral'; });
  }

  /** Lift a creature: the motion layer dangles it and flails its limbs. */
  pickUp(a: Agent): void {
    if (this.carried) this.drop();
    this.carried = a;
    a.carried = true;
    a.stop();
    a.mood = 'dizzy';
    a.motion.pickUp(this.carryPoint(new THREE.Vector3()));
    this.vfx.ring(a.pos.x, a.pos.y, a.pos.z, { r0: 0.2, r1: 1.6, life: 0.6, color: '#dfeaff' });
    this.pushEvent('pickup', a);
  }

  /** Where the cursor is holding the creature: in front of the camera. */
  private carryPoint(out: THREE.Vector3): THREE.Vector3 {
    const dir = new THREE.Vector3();
    this.stage.camera.getWorldDirection(dir);
    out.copy(this.stage.camera.position).addScaledVector(dir, 2.6);
    out.y = Math.max(heightAt(out.x, out.z), 0) + 0.95 + Math.sin(this.world.elapsed * 6.5) * 0.06;
    return out;
  }

  /** Motion-layer effects -> the Sim's Vfx pool. */
  private motionVfx(kind: string, x: number, y: number, z: number, scale = 1): void {
    switch (kind) {
      case 'dust': this.vfx.dust(x, y, z, 0.4 + scale * 0.5); break;
      case 'dustRing':
        this.vfx.ring(x, y, z, { r0: 0.15, r1: 1.5 * scale, life: 0.6, color: '#efe4cb' });
        break;
      case 'flash':
        this.vfx.ring(x, y, z, { r0: 0.1, r1: 1.1 * scale, life: 0.45, color: '#fff6cf' });
        this.vfx.puff(x, y + 0.12, z, 10, { life: 0.5, size: 0.07, spread: 1.2, up: 1.0, color: '#fff6cf' });
        break;
      case 'crumbs':
        this.vfx.puff(x, y + 0.28, z, 6, { life: 0.5, size: 0.05, spread: 0.8, up: 1.0, color: '#ffd9e2' });
        break;
      default:
        this.vfx.ring(x, y, z, { r0: 0.15, r1: 1.2 * scale, life: 0.5, color: '#ffffff' });
        break;
    }
  }

  /** Fling velocity, tracked by the pointer and handed down on release. */
  setCarryVelocity(v: THREE.Vector3): void { this.carryVel.copy(v); }

  drop(at?: THREE.Vector3): void {
    const a = this.carried;
    if (!a) return;
    a.carried = false;
    a.mood = 'dizzy';
    this.carried = null;

    // up in the air with the fling velocity: the motion layer's Dangle carries
    // it down, and its own landDizzy takes over on the landing frame
    if (at) {
      const y = Math.max(at.y, heightAt(at.x, at.z) + 0.6);
      a.motion.dangle.pos.set(at.x, y, at.z);
      a.motion.grabPoint = null;
      a.motion.drop(new THREE.Vector3(0, 0, 0));
    } else {
      const rr = Math.hypot(a.pos.x + this.carryVel.x * 0.35, a.pos.z + this.carryVel.z * 0.35);
      const k = rr > WALK_R ? WALK_R / rr : 1;
      a.motion.drop(new THREE.Vector3(this.carryVel.x * 0.35 * k, 0, this.carryVel.z * 0.35 * k));
    }

    // the landing squash, the dust ring and the dizzy stars are the motion
    // layer's own landDizzy action — the Sim keeps only the mood and the
    // shake-off puff at the end
    this.hold(a, 4.4);
    this.after(2.0, () => {
      if (!a.alive) return;
      a.mood = 'neutral';
      this.vfx.puff(a.pos.x, a.pos.y + 0.4, a.pos.z, 8, { life: 0.4, size: 0.05, spread: 1.2, up: 0.9, color: '#ffffff' });
    });
    // a playful creature hops straight back for another go
    if (a.trait('playful') > 0.55) {
      this.after(2.6, () => {
        if (!a.alive) return;
        a.mood = 'happy';
        a.say('note', 1.4, 1.2);
        a.faceTarget = { x: this.stage.camera.position.x, z: this.stage.camera.position.z };
        a.goTo({ x: this.stage.camera.position.x, y: 0, z: this.stage.camera.position.z }, 0.5);
      });
    }
    this.pushEvent('drop', a);
  }

  /** Inspect: an eased camera fly-in, and the creature notices and waves. */
  inspect(a: Agent): void {
    this.selected = a;
    this.follow = a;
    this.inspectTarget = a;
    this.inspectT = 0;
    a.mood = 'happy';
    this.after(0.7, () => {
      if (!a.alive) return;
      a.begin('wave');
      a.say('note', 1.5, 1.2);
      a.faceTarget = { x: this.stage.camera.position.x, z: this.stage.camera.position.z };
    });
    this.after(3.0, () => { if (a.alive) { a.mood = 'neutral'; a.begin('none'); } });
    this.pushEvent('inspect', a);
  }

  endInspect(): void {
    this.selected = null;
    this.follow = null;
    this.inspectTarget = null;
  }

  updateCarried(_camera: THREE.Camera): void {
    if (!this.carried) return;
    const a = this.carried;
    // the Dangle spring owns the position, the swing and the flail; the Sim
    // only says where the cursor is holding it
    if (a.motion.grabPoint) a.motion.grabPoint.copy(this.carryPoint(new THREE.Vector3()));
  }

  // ---- floating name tags ---------------------------------------------------
  /** Hand the Sim a container; it fills and positions one tag per creature. */
  attachTags(container: HTMLElement): void {
    this.tagLayer = container;
  }

  private updateTags(): void {
    const layer = this.tagLayer;
    if (!layer) return;
    const cam = this.stage.camera;
    const v = new THREE.Vector3();
    const w = this.stage.renderer.domElement.clientWidth;
    const h = this.stage.renderer.domElement.clientHeight;
    let camDist = 0;
    for (const a of this.agents) {
      let el = this.tagEls.get(a.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'w-tag';
        el.textContent = a.name.split(' ')[0];
        layer.appendChild(el);
        this.tagEls.set(a.id, el);
      }
      v.copy(a.pos);
      v.y += this.templateHeight(a) * 1.34;
      camDist += cam.position.distanceTo(a.pos);
      v.project(cam);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      // fade out as the camera closes in — the tag is for reading from far away
      const dist = cam.position.distanceTo(a.pos);
      const op = behind ? 0 : THREE.MathUtils.clamp((dist - 6) / 6, 0, 1) * 0.92;
      el.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      el.style.opacity = op.toFixed(2);
    }
    for (const [id, el] of this.tagEls) {
      if (!this.agents.some((a) => a.id === id)) { el.remove(); this.tagEls.delete(id); }
    }
  }

  private templateHeight(a: Agent): number { return a.template.height * a.dna.scale; }

  /** Run the acceptance simulation: fixed dt, no rendering, fast. */
  headlessRun(seconds: number, dt = 1 / 60): void {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      this.step(dt);
      this.drainBrainEvents();
    }
  }

  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.events) out[e.kind] = (out[e.kind] ?? 0) + 1;
    return out;
  }

  pick(ray: THREE.Raycaster): Agent | null {
    let best: Agent | null = null;
    let bestD = 1e9;
    for (const a of this.agents) {
      const hits = ray.intersectObject(a.handle.shell, false);
      if (hits.length && hits[0].distance < bestD) { bestD = hits[0].distance; best = a; }
    }
    return best;
  }

  actionOf(a: Agent): ActionId | null {
    return this.brains.get(a.id)?.action ?? null;
  }

  get terrain() { return buildTerrain; }
  get isDryCheck() { return isDry; }
  get frameMs(): number { return this.lastTickMs; }

  // ---- verification surface -------------------------------------------------
  pause(): void { this.loop.stop(); }
  resume(): void { this.loop.start(); }
  renderOnce(): void { this.stage.update(0); this.stage.render(0); }

  /** Snapshot every agent's pose, so two snapshots can be compared. */
  probe(): Probe {
    const agents = this.agents.map((a) => {
      const g = a.handle.group;
      g.updateMatrixWorld(true);
      const bones: { name: string; q: [number, number, number, number] }[] = [];
      for (const b of a.handle.bones) {
        bones.push({ name: b.name, q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w] });
      }
      return {
        id: a.id,
        name: a.name,
        turnRate: a.motion.loco.cfg.turnRate,
        over: a.overstretchFrames,
        pos: [a.pos.x, a.pos.y, a.pos.z] as [number, number, number],
        heading: a.heading,
        speed: a.speed,
        feet: a.feet.map((f) => ({ pos: [f.pos.x, f.pos.y, f.pos.z] as [number, number, number], swinging: f.swinging })),
        bones,
      };
    });
    return { t: this.simTime, agents };
  }

  /**
   * v10 slip probe, rebuilt.
   *
   * The v9 version seeded its "previous foot" buffer from creature-space plant
   * points, which produced ~8 m/frame of nonsense. It now reads the SAME world
   * ankle positions the gate metric reads, and only counts frames where the
   * planting solver says the foot is planted.
   */
  slipProbe(seconds = 8): Record<string, { slip: number; overstretch: number; frames: number; speed: number; freq: number }> {
    const out: Record<string, { slip: number; overstretch: number; frames: number; speed: number; freq: number }> = {};
    const prevBrain = this.brainEnabled;
    this.brainEnabled = false;
    const home = this.agents.map((a) => ({ a, p: a.pos.clone(), h: a.heading }));
    const dt = 1 / 60;
    for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
      const a = this.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
      if (!a) continue;
      for (const o of this.agents) { o.stop(); o.begin('none'); o.debugPose = 0; }
      a.place(0, -6, 0);
      for (let i = 0; i < 40; i++) { a.goTo({ x: 0, y: 0, z: 40 }, 1); a.update(dt); }
      const prev = a.feet.map((f) => f.pos.clone());
      const prevSw = a.feet.map(() => false);
      const over0 = a.overstretchFrames;
      let worst = 0, speedSum = 0, cycle = 0;
      let lastPhase = a.motion.loco.phase;
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) {
        a.goTo({ x: 0, y: 0, z: 60 }, 1);
        a.update(dt);
        speedSum += a.motion.loco.speed;
        if (a.motion.loco.phase < lastPhase) cycle++;
        lastPhase = a.motion.loco.phase;
        for (let k = 0; k < a.feet.length; k++) {
          const f = a.feet[k];
          if (!prevSw[k] && !f.swinging) {
            const d = f.pos.distanceTo(prev[k]);
            if (d > worst) worst = d;
          }
          prev[k].copy(f.pos);
          prevSw[k] = f.swinging;
        }
      }
      out[sp] = {
        slip: Math.round(worst * 1e4) / 1e4,
        overstretch: a.overstretchFrames - over0,
        frames: steps,
        speed: Math.round((speedSum / steps) * 1e3) / 1e3,
        freq: Math.round((cycle / seconds) * 1e3) / 1e3,
      };
    }
    for (const h of home) h.a.place(h.p.x, h.p.z, h.h);
    this.brainEnabled = prevBrain;
    return out;
  }

  /**
   * v10 sign check. A sign is only called VERIFIED when the magnitude clears
   * 0.02 m AND the two signs give opposite deltas. Anything else is reported as
   * unverified rather than tie-broken.
   */
  signProbe(): Record<string, { pitch: number | null; roll: number | null; limb: number | null; wave: number | null; threshold: number; evidence: Record<string, string> }> {
    type Row = { pitch: number | null; roll: number | null; limb: number | null; wave: number | null; threshold: number; evidence: Record<string, string> };
    const out: Record<string, Row> = {};
    const prevBrain = this.brainEnabled;
    this.brainEnabled = false;
    for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
      const a = this.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
      if (!a) continue;
      for (const o of this.agents) { o.stop(); o.debugPose = 0; }
      a.place(0, -6, 0);
      const headBone = a.handle.bones[a.template.headBone];
      const bodyBone = a.handle.bones[a.template.bodyBone];
      const tipOf = (b: THREE.Object3D): THREE.Object3D => (b.children.length ? (b.children[0] as THREE.Object3D) : b);
      const tip = a.rig.arms.length ? tipOf(a.rig.arms[0]) : tipOf(a.rig.legs[0] ?? a.rig.body);
      const footBone = a.template.feet.length ? a.handle.bones[a.template.feet[0].chain[2]] : null;
      const height = a.template.height;
      const THRESH = 0.02 * height;
      // everything is measured in the BODY BONE's own frame (its parent space),
      // not world space: a body-pivot rotation then shows up as a real
      // displacement of the head relative to that pivot
      const inBodyFrame = (v: THREE.Vector3): THREE.Vector3 => {
        const parent = bodyBone.parent ?? bodyBone;
        const inv = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        return v.applyQuaternion(inv);
      };
      const sample = () => {
        a.handle.group.updateMatrixWorld(true);
        return {
          h: inBodyFrame(headBone.getWorldPosition(new THREE.Vector3())),
          f: footBone ? inBodyFrame(footBone.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(),
          w: inBodyFrame(tip.getWorldPosition(new THREE.Vector3())),
        };
      };
      const delta = (pose: number, ch: 'pitch' | 'roll' | 'limb' | 'wave', sign: number) => {
        a.debugPose = 0;
        (a.rig.axes as unknown as Record<string, number>)[ch] = sign;
        a.update(1 / 60);
        const b0 = sample();
        a.debugPose = pose;
        a.update(1 / 60);
        const b1 = sample();
        return {
          fwd: b1.h.z - b0.h.z,
          lat: b1.h.x - b0.h.x,
          ff: b1.f.z - b0.f.z,
          wy: b1.w.y - b0.w.y,
        };
      };
      const pass = (dp: number, dm: number): number | null => {
        const big = Math.max(Math.abs(dp), Math.abs(dm));
        if (big <= THRESH) return null;
        if ((dp > 0) === (dm > 0)) return null;
        return dp >= dm ? 1 : -1;
      };
      out[sp] = { pitch: null, roll: null, limb: null, wave: null, threshold: Math.round(THRESH * 1e4) / 1e4, evidence: {} };
      const run = (pose: number, ch: 'pitch' | 'roll' | 'limb' | 'wave', key: 'fwd' | 'lat' | 'ff' | 'wy') => {
        const dd = delta(pose, ch, 1);
        const plus = dd[key];
        const minus = delta(pose, ch, -1)[key];
        const chosen = pass(plus, minus);
        out[sp].evidence[ch] = chosen === null
          ? `UNVERIFIED  ${key}: +1 ${plus.toFixed(4)} / -1 ${minus.toFixed(4)} m  (threshold ${THRESH.toFixed(4)})`
          : `verified    ${key}: +1 ${plus.toFixed(4)} / -1 ${minus.toFixed(4)} m -> ${chosen > 0 ? '+1' : '-1'}`;
        if (chosen !== null) (a.rig.axes as unknown as Record<string, number>)[ch] = chosen;
        return chosen;
      };
      out[sp].pitch = run(1, 'pitch', 'fwd');
      out[sp].roll = run(2, 'roll', 'lat');
      out[sp].wave = run(4, 'wave', 'wy');
      // limb is an AXIS choice, so it is probed as one
      {
        const ax0 = a.rig.axes.limb;
        const tryAxis = (ax: 'x' | 'z'): number => {
          a.debugPose = 0; a.rig.axes.limb = ax; a.update(1 / 60);
          const b0 = sample(); a.debugPose = 3; a.update(1 / 60); const b1 = sample();
          return b1.f.z - b0.f.z;
        };
        const fx = tryAxis('x'), fz = tryAxis('z');
        const ok = Math.max(Math.abs(fx), Math.abs(fz)) > THRESH;
        a.rig.axes.limb = ok ? (Math.abs(fx) >= Math.abs(fz) ? 'x' : 'z') : ax0;
        out[sp].evidence.limb = ok
          ? `verified axis '${a.rig.axes.limb}': x ${fx.toFixed(4)} / z ${fz.toFixed(4)} m fwd`
          : `UNVERIFIED axis: x ${fx.toFixed(4)} / z ${fz.toFixed(4)} m fwd (threshold ${THRESH.toFixed(4)})`;
        out[sp].limb = ok ? (a.rig.axes.limb === 'x' ? 1 : 2) : null;
        a.debugPose = 0;
      }
    }
    this.brainEnabled = prevBrain;
    return out;
  }

  /**
   * v11 joint-rate probe: the worst angular rate per species, the BONE it lands
   * on, and the planting state of that leg at the peak frame, so a pop can be
   * attributed instead of guessed at.
   */
  jointProbe(seconds = 20, dt = 1 / 60): Record<string, { rate: number; bone: string; frameType: string; wasForced: boolean }> {
    const out: Record<string, { rate: number; bone: string; frameType: string; wasForced: boolean }> = {};
    const prevBrain = this.brainEnabled;
    this.brainEnabled = true;
    const prev = new Map<number, { q: number[]; mode: string; forced: boolean }[]>();
    for (let i = 0; i < seconds / dt; i++) {
      this.step(dt);
      for (const a of this.agents) {
        const sp = a.template.name.split(' ')[0];
        const st = a.hero.legState();
        const cur = a.handle.bones.map((b) => ({
          q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
          mode: '', forced: false,
        }));
        const pv = prev.get(a.id);
        if (pv) {
          for (const L of a.template.feet) {
            for (let k = 0; k < 3; k++) {
              const bi = L.chain[k];
              const qa = pv[bi], qb = cur[bi];
              const dot = Math.abs(qa.q[0] * qb.q[0] + qa.q[1] * qb.q[1] + qa.q[2] * qb.q[2] + qa.q[3] * qb.q[3]);
              const rate = (2 * Math.acos(Math.min(1, dot))) / dt;
              const st0 = st.find((x) => x.index === a.template.feet.indexOf(L));
              if (rate > (out[sp]?.rate ?? 0)) {
                out[sp] = {
                  rate: Math.round(rate * 100) / 100,
                  bone: a.handle.bones[bi].name,
                  frameType: (st0?.mode ?? 'plant') === 'swing'
                    ? (st0?.forced ? 'early-lift (reach/turn/drift guard)' : 'normal swing')
                    : 'plant',
                  wasForced: !!st0?.forced,
                };
              }
            }
          }
        }
        prev.set(a.id, cur);
      }
    }
    this.brainEnabled = prevBrain;
    return out;
  }

  /**
   * v11 cadence ramp: walk -> run -> walk, sampling the REAL cycle frequency in
   * short windows so a pop at the gait transition would show up as a jump.
   */
  freqRampProbe(sp = 'PIP'): { t: number; speed: number; freq: number; stride: number }[] {
    const a = this.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
    if (!a) return [];
    const prevB = this.brainEnabled;
    this.brainEnabled = false;
    for (const o of this.agents) { o.stop(); o.debugPose = 0; }
    a.place(0, -6, 0);
    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) { a.goTo({ x: 0, y: 0, z: 60 }, 0.4); a.update(dt); }
    const rows: { t: number; speed: number; freq: number; stride: number }[] = [];
    const total = 900;
    let cycle = 0, lastPhase = a.motion.loco.phase, speedSum = 0, win = 0;
    for (let i = 0; i < total; i++) {
      // 0 -> 1 -> 0 over the run
      const k = i / total;
      const th = k < 0.5 ? k * 2 : (1 - k) * 2;
      a.goTo({ x: 0, y: 0, z: 200 }, Math.max(0.35, th));
      a.update(dt);
      speedSum += a.motion.loco.speed; win++;
      if (a.motion.loco.phase < lastPhase) cycle++;
      lastPhase = a.motion.loco.phase;
      if (win >= 60) {
        const loco = a.motion.loco;
        rows.push({
          t: Math.round(i * dt * 10) / 10,
          speed: Math.round((speedSum / win) * 1e3) / 1e3,
          freq: Math.round((cycle / win) * 60 * 1e3) / 1e3,
          stride: Math.round(loco.cfg.stride * (1 + 0.4 * loco.runT()) * 1e4) / 1e4,
        });
        cycle = 0; speedSum = 0; win = 0;
      }
    }
    this.brainEnabled = prevB;
    return rows;
  }

  static compare = compare;

  /**
   * Integration step 4 — stride calibration. Drive each species' pedestal
   * animator with an external gait cycle at 0.6 and measure how far the REAL
   * ankle bones travel forward in body space over one full cycle. The gait
   * cycle advances `stride` per cycle, so `stride = range / 0.5`.
   */
  strideProbe(): Record<string, {
    stride: number; range: number; height: number; kind: string; factor: number; legReach: number;
    stanceFrac: number; stanceDisp: number; strideUserFormula: number; feet: number[];
  }> {
    const out: Record<string, {
      stride: number; range: number; height: number; kind: string; factor: number; legReach: number;
      stanceFrac: number; stanceDisp: number; strideUserFormula: number; feet: number[];
    }> = {};
    const pal = paletteAt(0);
    const colors = {
      base: hexToLinear(pal.base), belly: hexToLinear(pal.belly), limb: hexToLinear(pal.limb),
      accent: hexToLinear(pal.accent), deep: hexToLinear(pal.deep),
    };
    const v = new THREE.Vector3();
    for (const id of HERO_IDS) {
      const tpl = buildHeroTemplate(id, colors);
      const h = buildHero(tpl, pal);
      const anim = new HeroAnimator(tpl, h);
      anim.deterministic = true;
      h.group.position.set(0, 0, 0);
      h.group.rotation.set(0, 0, 0);
      const n = tpl.feet.length;
      const lo = new Array<number>(n).fill(1e9);
      const hi = new Array<number>(n).fill(-1e9);
      const backSamples = new Array<number>(n).fill(0);
      const backSpan = new Array<number>(n).fill(0);
      const backLo = new Array<number>(n).fill(1e9);
      const backHi = new Array<number>(n).fill(-1e9);
      const N = 480;
      const prevZ = new Array<number>(n).fill(0);
      const havePrev = new Array<boolean>(n).fill(false);
      for (let i = 0; i < N; i++) {
        anim.setGait(0.6, i / N);
        anim.update(1 / 60, null);
        h.group.updateMatrixWorld(true);
        for (let k = 0; k < n; k++) {
          const bone = h.bones[tpl.feet[k].chain[2]];
          if (!bone) continue;
          bone.getWorldPosition(v);
          h.group.worldToLocal(v);
          if (v.z < lo[k]) lo[k] = v.z;
          if (v.z > hi[k]) hi[k] = v.z;
          // "planted" = the foot is travelling BACKWARD relative to the body:
          // that is exactly the half of the cycle the in-place gait calls stance.
          if (havePrev[k] && v.z < prevZ[k]) {
            backSamples[k]++;
            if (v.z < backLo[k]) backLo[k] = v.z;
            if (v.z > backHi[k]) backHi[k] = v.z;
          }
          prevZ[k] = v.z;
          havePrev[k] = true;
        }
      }
      const ranges = lo.map((l, k) => hi[k] - l);
      const stanceFracs = backSamples.map((c) => c / N);
      const stanceDisps = backLo.map((l, k) => Math.max(0, backHi[k] - l));
      const range = ranges.reduce((a, b) => a + b, 0) / Math.max(1, ranges.length);
      const stanceFrac = stanceFracs.reduce((a, b) => a + b, 0) / Math.max(1, stanceFracs.length);
      const stanceDisp = stanceDisps.reduce((a, b) => a + b, 0) / Math.max(1, stanceDisps.length);
      // Body advance per stance = the stance displacement, over a stance that
      // lasts stanceFrac of the cycle. A cycle holds ONE stance per foot, so
      // stride = stanceDisp / stanceFrac. (For a duty-0.5 gait that is the
      // measured range itself, NOT range/0.5.)
      const stride = stanceDisp / Math.max(0.05, stanceFrac);
      void backSpan;
      const f0 = tpl.feet[0];
      const legReach = f0 ? tpl.bones[f0.chain[1]].pos.length() + tpl.bones[f0.chain[2]].pos.length() : 0;
      out[id.toUpperCase()] = {
        stride, range, height: tpl.height, kind: tpl.locomotion,
        legReach: Math.round(legReach * 1e4) / 1e4,
        factor: stride / tpl.height,
        stanceFrac: Math.round(stanceFrac * 1e4) / 1e4,
        stanceDisp: Math.round(stanceDisp * 1e4) / 1e4,
        strideUserFormula: Math.round((range / Math.max(0.05, stanceFrac)) * 1e4) / 1e4,
        feet: ranges.map((r) => Math.round(r * 1e4) / 1e4),
      };
      h.dispose();
    }
    return out;
  }

  /**
   * Integration step 5 — the BOP hop. A hopper has no legs to calibrate from, so
   * the stride has to come from the ground it actually covers: drive a real BOP
   * at walk throttle in a straight line and measure the distance per hop cycle.
   */
  hopProbe(seconds = 12, dt = 1 / 60): { hopDistance: number; cycles: number; hopsPerSecond: number; speed: number; stride: number; height: number; airTime: number } | null {
    const a = this.agents.find((x) => x.template.locomotion === 'hop');
    if (!a) return null;
    const loco = a.motion.loco;
    a.place(0, 3.0, 0);
    const start = loco.pos.clone();
    let cycles = 0;
    let prev = loco.phase;
    let dist = 0;
    const px = { x: loco.pos.x, z: loco.pos.z };
    let airTime = 0;
    for (let i = 0; i < seconds / dt; i++) {
      a.goTo({ x: 0, y: 0, z: 40 }, 0.42);
      a.update(dt);
      if (loco.phase < prev) cycles++;
      prev = loco.phase;
      dist += Math.hypot(loco.pos.x - px.x, loco.pos.z - px.z);
      px.x = loco.pos.x; px.z = loco.pos.z;
      // the airborne window of Juice.hopCurve is u in [0.18, 0.78]
      const u = loco.phase;
      if (u >= 0.18 && u <= 0.78) airTime += dt;
    }
    a.stop();
    a.place(start.x, start.z, 0);
    const hopDistance = cycles > 0 ? dist / cycles : 0;
    return {
      hopDistance: Math.round(hopDistance * 1e4) / 1e4,
      cycles,
      hopsPerSecond: Math.round((cycles / seconds) * 1e3) / 1e3,
      speed: Math.round(loco.speed * 1e3) / 1e3,
      stride: loco.cfg.stride,
      height: a.template.height,
      airTime: Math.round((airTime / Math.max(1, cycles)) * 1e3) / 1e3,
    };
  }

  quiet(): void {
    this.brainEnabled = false;
    for (const a of this.agents) { a.stop(); a.begin('none'); }
    this.choreo.length = 0;
  }

  loud(): void { this.brainEnabled = true; }

  /** One external hook so the wall-clock loop can keep tags and inspection
   *  camera current without the Sim owning a render loop. */
  tickUi(camera: THREE.PerspectiveCamera, dt: number): void {
    this.tickTagTimer += dt;
    if (this.tickTagTimer > 0.05) { this.tickTagTimer = 0; this.updateTags(); }
    // inspect fly-in
    const t = this.inspectTarget;
    if (t && this.follow === t) {
      this.inspectT = Math.min(1, this.inspectT + dt * 2.2);
      const e = 1 - Math.pow(1 - this.inspectT, 3);
      const want = new THREE.Vector3(t.pos.x + 1.5, t.pos.y + 0.85, t.pos.z + 1.9);
      camera.position.lerp(want, e * 0.14);
      this.stage.controls.target.lerp(new THREE.Vector3(t.pos.x, t.pos.y + 0.45, t.pos.z), e * 0.20);
    }
  }

  private tickTagTimer = 0;

  poseIdentity(frames = 180, dt = 1 / 60): { maxQuat: number; maxPos: number; bones: number; seconds: number } {
    const pal = paletteAt(0);
    const colors = {
      base: hexToLinear(pal.base), belly: hexToLinear(pal.belly), limb: hexToLinear(pal.limb),
      accent: hexToLinear(pal.accent), deep: hexToLinear(pal.deep),
    };
    const tpl = buildHeroTemplate(HERO_IDS[0], colors);
    const hA = buildHero(tpl, pal);
    const hB = buildHero(tpl, pal);
    const aA = new HeroAnimator(tpl, hA);
    const aB = new HeroAnimator(tpl, hB);
    aA.deterministic = true;
    aB.deterministic = true;
    aA.setGait(0);
    aB.beginDrive();
    aA.setClock(12);
    aB.setClock(12);
    hA.group.position.set(0, 0, 0);
    hB.group.position.set(0, 0, 0);
    for (let i = 0; i < aB.drive.footTargets.length; i++) {
      aB.drive.footTargets[i].copy(tpl.feet[i]?.plant ?? new THREE.Vector3());
    }

    let maxQuat = 0;
    let maxPos = 0;
    for (let f = 0; f < frames; f++) {
      aA.update(dt, null);
      aB.update(dt, null);
      hA.group.updateMatrixWorld(true);
      hB.group.updateMatrixWorld(true);
      if (f < 30) continue;
      for (let i = 0; i < hA.bones.length; i++) {
        const qa = hA.bones[i].quaternion;
        const qb = hB.bones[i].quaternion;
        const d = 1 - Math.abs(qa.dot(qb));
        if (d > maxQuat) maxQuat = d;
        const pa = new THREE.Vector3().setFromMatrixPosition(hA.bones[i].matrixWorld);
        const pb = new THREE.Vector3().setFromMatrixPosition(hB.bones[i].matrixWorld);
        const pd = pa.distanceTo(pb);
        if (pd > maxPos) maxPos = pd;
      }
    }
    hA.dispose();
    hB.dispose();
    return { maxQuat, maxPos, bones: hA.bones.length, seconds: Math.round(frames * dt * 100) / 100 };
  }
}
