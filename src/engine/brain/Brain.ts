/**
 * Brain — needs, personality and a utility picker.
 *
 * The brain decides ONE action at a time and re-decides on its own staggered
 * clock, so twelve creatures never all think on the same frame. It never
 * touches the body: it sets a goal, and the Agent walks there.
 */
import * as THREE from 'three';
import type { Agent } from '../agent/Agent';
import type { World } from '../world/World';
import { POND } from '../world/terrain';

export type ActionId =
  | 'wander' | 'investigate' | 'eat' | 'drink' | 'nap' | 'greet'
  | 'playChase' | 'follow' | 'flee' | 'hide' | 'pushBall';

export const ACTION_LABEL: Record<ActionId, string> = {
  wander: 'wandering',
  investigate: 'investigating',
  eat: 'eating berries',
  drink: 'drinking',
  nap: 'sleeping',
  greet: 'greeting a friend',
  playChase: 'playing chase',
  follow: 'following a friend',
  flee: 'running away',
  hide: 'hiding',
  pushBall: 'pushing the ball',
};

export interface Needs { hunger: number; energy: number; social: number; fun: number }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export class Brain {
  needs: Needs = { hunger: 0.42, energy: 0.60, social: 0.45, fun: 0.40 };
  action: ActionId = 'wander';
  /** how long the current action has been running */
  actionAge = 0;
  /** seconds until the next decision */
  private clock = 0;
  private period: number;
  private rng: () => number;
  /** how much this creature likes each other creature, by id */
  readonly likes = new Map<number, number>();
  partnerId: number | null = null;
  lastAction: ActionId = 'wander';
  /** incremented every time an action completes — the sim log reads this */
  events: { kind: string; id: number; name: string }[] = [];

  constructor(seed: number) {
    this.rng = mulberry(seed ^ 0x5bf03635);
    // stagger every creature's clock so ticks spread across frames
    this.period = 1 / (5.5 + this.rng() * 4);
    this.clock = this.rng() * this.period;
  }

  /** 0..1 affinity with a creature, defaulting to a neutral acquaintance. */
  affinity(id: number): number { return this.likes.get(id) ?? 0.3; }
  bump(id: number, amount: number): void {
    this.likes.set(id, clamp01(this.affinity(id) + amount));
  }
  friends(all: { id: number }[]): number[] {
    return all.filter((a) => a.id !== 0 && this.affinity(a.id) > 0.62).map((a) => a.id);
  }

  update(dt: number, a: Agent, w: World): void {
    const n = this.needs;
    // needs drift: hunger and boredom rise, energy falls, company is missed
    n.hunger = clamp01(n.hunger + dt * 0.030);
    n.fun = clamp01(n.fun - dt * 0.032);
    n.social = clamp01(n.social - dt * 0.026);
    n.energy = clamp01(n.energy - dt * (this.action === 'nap' ? -0.16 : 0.028) * (w.isNight ? 1.9 : 1));

    this.clock -= dt;
    if (this.clock <= 0) {
      this.clock += this.period * (0.7 + this.rng() * 0.6);
      this.decide(a, w);
    }
    this.run(dt, a, w);
  }

  private log(kind: string, a: Agent): void {
    this.events.push({ kind, id: a.id, name: a.name });
    // the log only exists for the acceptance run; do not let it grow forever
    if (this.events.length > 64) this.events.shift();
  }

  private decide(a: Agent, w: World): void {
    const p = a.dna;
    const n = this.needs;
    const night = w.nightness;
    const neighbour = w.nearest(a.pos, 6.0, a.id) as Agent | null;
    const friend = w.nearby(a.pos, 6.5, a.id)
      .filter((o) => this.affinity(o.id) > 0.6)
      .sort((x, y) => this.affinity(y.id) - this.affinity(x.id))[0] as Agent | undefined;
    const bush = w.props.nearestFruitingBush(a.pos, 14);
    const ballD = w.props.ball.pos.distanceTo(a.pos);
    const threat = w.nearby(a.pos, 3.4, a.id)
      .filter((o) => o.bulk > a.bulk * 1.22)
      .sort((x, y) => x.pos.distanceTo(a.pos) - y.pos.distanceTo(a.pos))[0] as Agent | undefined;

    const scores: [ActionId, number][] = [
      ['nap', (1 - n.energy) * 2.0 * (0.7 + p.lazy * 0.6) + night * 2.4 - 0.45],
      ['eat', n.hunger * 2.4 + (bush >= 0 ? 0.25 : -1.6) - 0.55],
      ['drink', n.hunger * 0.6 + 0.05],
      ['greet', n.social * (1.25 + p.sociable * 0.9) + (neighbour ? 0.55 : -1.4) - night * 0.6 - 0.25],
      ['playChase', n.fun * (1.3 + p.playful * 0.9) + (neighbour ? 0.5 : -1.2) - night * 1.2 - 0.2],
      ['follow', (friend ? 0.85 + p.sociable * 0.4 : -1.0) - night * 0.8 - 0.15],
      ['pushBall', (ballD < 6 ? 0.85 : -1.2) + p.playful * 0.7 + n.fun * 0.8 - night * 1.2 - 0.35],
      ['investigate', p.curious * 0.95 + (ballD < 12 ? 0.2 : 0) - night * 0.7 - 0.3],
      ['flee', threat ? (1 - p.bold) * 2.1 + 0.5 : -2],
      ['hide', threat ? (1 - p.bold) * 1.1 : -2],
      ['wander', 0.45 + p.curious * 0.20 - night * 1.5],
    ];

    let best: ActionId = 'wander';
    let bestScore = -1e9;
    for (const [id, base] of scores) {
      const s = base + this.rng() * 0.22;
      if (s > bestScore) { bestScore = s; best = id; }
    }
    if (best === this.action && this.actionAge < 3) return;

    if (best !== this.action) this.log(best, a);
    this.action = best;
    this.actionAge = 0;
    this.start(a, w, neighbour, friend);
  }

  private start(a: Agent, w: World, neighbour: Agent | null, friend: Agent | undefined): void {
    const props = w.props;
    switch (this.action) {
      case 'eat': {
        const b = props.nearestFruitingBush(a.pos, 16);
        if (b >= 0) a.goTo(props.bushes[b].pos, 0.75);
        else { this.action = 'wander'; a.goTo(w.randomSpot(this.rng, a.pos, 5)); }
        break;
      }
      case 'drink': {
        const ang = this.rng() * Math.PI * 2;
        const spot = new THREE.Vector3(
          POND.x + Math.cos(ang) * (POND.r + 0.5), 0,
          POND.z + Math.sin(ang) * (POND.r + 0.5),
        );
        spot.y = w.ground(spot.x, spot.z);
        a.goTo(spot, 0.7);
        break;
      }
      case 'greet': {
        if (neighbour) {
          this.partnerId = neighbour.id;
          a.goTo(this.stopShort(a, neighbour.pos, 1.15), 0.85);
        } else { this.action = 'wander'; a.goTo(w.randomSpot(this.rng, a.pos, 4)); }
        break;
      }
      case 'playChase': {
        const target = friend ?? neighbour;
        if (target) { this.partnerId = target.id; a.goTo(target.pos, 1); }
        else { this.action = 'wander'; a.goTo(w.randomSpot(this.rng, a.pos, 4)); }
        break;
      }
      case 'follow': {
        if (friend) { this.partnerId = friend.id; a.goTo(this.stopShort(a, friend.pos, 1.5), 0.8); }
        else this.action = 'wander';
        break;
      }
      case 'pushBall': {
        const b = props.ball.pos;
        a.goTo(new THREE.Vector3(b.x, 0, b.z), 1);
        break;
      }
      case 'investigate': {
        const b = props.ball.pos;
        const rock = props.rocks[Math.floor(this.rng() * props.rocks.length)];
        const spot = b.distanceTo(a.pos) < 12 ? b : rock.pos;
        a.goTo(new THREE.Vector3(spot.x, 0, spot.z), 0.85);
        a.say('question', 1.4);
        break;
      }
      case 'flee': {
        const dir = new THREE.Vector3().subVectors(a.pos, this.threatPos ?? a.pos).setY(0).normalize();
        const spot = new THREE.Vector3(a.pos.x + dir.x * 5.5, 0, a.pos.z + dir.z * 5.5);
        if (Math.hypot(spot.x, spot.z) > 9.4) spot.multiplyScalar(0.6);
        spot.y = w.ground(spot.x, spot.z);
        a.goTo(spot, 1);
        a.say('bang', 1.2);
        break;
      }
      case 'hide': {
        let best = props.rocks[0];
        let bestD = 1e9;
        for (const r of props.rocks) {
          const d = r.pos.distanceTo(this.threatPos ?? a.pos);
          const away = r.pos.distanceTo(a.pos);
          const s = away + (this.threatPos ? -Math.min(6, d) * 0.4 : 0);
          if (s < bestD) { bestD = s; best = r; }
        }
        a.goTo(new THREE.Vector3(best.pos.x + 0.5, 0, best.pos.z + 0.5), 0.9);
        break;
      }
      case 'nap': {
        a.goTo(w.randomSpot(this.rng, a.pos, 2.2), 0.5);
        a.say('zzz', 2.0);
        break;
      }
      default: {
        a.goTo(w.randomSpot(this.rng, a.pos, 5.5), 0.7);
        break;
      }
    }
    this.actionAge = 0;
  }

  private threatPos: THREE.Vector3 | null = null;

  private stopShort(a: Agent, target: THREE.Vector3, gap: number): THREE.Vector3 {
    const dir = new THREE.Vector3().subVectors(a.pos, target).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize().multiplyScalar(gap);
    return new THREE.Vector3(target.x + dir.x, 0, target.z + dir.z);
  }

  private run(dt: number, a: Agent, w: World): void {
    this.actionAge += dt;
    const props = w.props;
    const dist = a.goal ? a.pos.distanceTo(a.goal) : 0;

    switch (this.action) {
      case 'eat': {
        if (!a.goal && this.actionAge > 0.25) {
          let ate = false;
          for (let i = 0; i < props.bushes.length; i++) {
            if (props.bushes[i].pos.distanceTo(a.pos) < 1.3 && props.eat(i)) { ate = true; break; }
          }
          if (ate) {
            this.needs.hunger = clamp01(this.needs.hunger - 0.42);
            a.say('note', 1.5);
            this.log('eat', a);
            this.action = 'wander';
            this.goAgain(a, w);
          } else if (this.actionAge > 1.2) {
            this.goAgain(a, w);
          }
        }
        break;
      }
      case 'drink': {
        if (!a.goal || dist < 1.0) {
          this.needs.hunger = clamp01(this.needs.hunger - 0.22);
          if (this.actionAge > 1.0) {
            a.say('note', 1.4);
            this.log('drink', a);
            this.goAgain(a, w);
          }
        }
        break;
      }
      case 'greet': {
        const other = w.agents.find((o) => o.id === this.partnerId) as Agent | undefined;
        if (other && !other.alive) { this.partnerId = null; this.action = 'wander'; break; }
        if (!a.goal && this.actionAge > 0.5 && other) {
          // face each other and bounce. The brain asks; the heading spring
          // turns the body. Writing `heading` directly is what used to snap the
          // body 80 rad/s in a single step.
          a.goal = null;
          a.faceTarget = { x: other.pos.x, z: other.pos.z };
          if (this.actionAge < 1.2) {
            a.say('heart', 1.8);
            a.hero.hop(2.2);
          }
          this.bump(other.id, 0.26);
          if (this.actionAge > 1.7) { this.log('greet', a); this.goAgain(a, w); }
        }
        break;
      }
      case 'playChase': {
        const other = w.agents.find((o) => o.id === this.partnerId) as Agent | undefined;
        if (!other || !other.alive) { this.partnerId = null; this.goAgain(a, w); break; }
        // keep re-targeting the runner — that is what makes it a chase
        a.goal = new THREE.Vector3(other.pos.x, 0, other.pos.z);
        a.throttle = 1;
        if (a.pos.distanceTo(other.pos) < 1.1) {
          this.bump(other.id, 0.05);
          this.needs.fun = clamp01(this.needs.fun + 0.16);
          if (this.actionAge > 0.6) a.say('note', 1.0);
        }
        if (this.actionAge > 5.5) {
          this.needs.fun = clamp01(this.needs.fun + 0.22);
          this.bump(other.id, 0.16);
          this.log('playChase', a);
          this.goAgain(a, w);
        }
        break;
      }
      case 'follow': {
        const other = w.agents.find((o) => o.id === this.partnerId) as Agent | undefined;
        if (!other || !other.alive) { this.partnerId = null; this.goAgain(a, w); break; }
        if (a.pos.distanceTo(other.pos) > 2.2) {
          a.goal = this.stopShort(a, other.pos, 1.6);
          a.throttle = 0.8;
        }
        if (this.actionAge > 6) this.goAgain(a, w);
        break;
      }
      case 'pushBall': {
        const b = props.ball.pos;
        if (a.pos.distanceTo(b) < 0.95) {
          const dir = new THREE.Vector3(Math.sin(a.heading), 0, Math.cos(a.heading));
          props.pushBall(a.pos, dir, 3.1);
          a.say('note', 1.1);
          this.needs.fun = clamp01(this.needs.fun + 0.18);
          this.log('ball', a);
        }
        if (a.goal && a.goal.distanceTo(b) > 1.2) { a.goal.set(b.x, 0, b.z); }
        if (this.actionAge > 7) this.goAgain(a, w);
        break;
      }
      case 'nap': {
        if (!a.goal && this.actionAge > 1.0) {
          this.needs.energy = clamp01(this.needs.energy + dt * 0.16);
          a.mood = 'sleepy';
          a.stop();
          if (this.needs.energy > 0.94 || this.actionAge > 14) {
            this.log('nap', a);
            this.goAgain(a, w);
          }
        }
        break;
      }
      case 'flee': {
        if (this.actionAge > 2.6 || !a.goal) { this.log('flee', a); this.goAgain(a, w); }
        break;
      }
      case 'hide': {
        if (this.actionAge > 4) this.goAgain(a, w);
        break;
      }
      case 'investigate': {
        if (this.actionAge > 4.5 || !a.goal) this.goAgain(a, w);
        break;
      }
      default: {
        if (!a.goal && this.actionAge > 0.4) this.goAgain(a, w);
        break;
      }
    }

    // threat memory, used by flee and hide
    const threat = w.nearby(a.pos, 3.6, a.id)
      .filter((o) => o.bulk > a.bulk * 1.22)[0];
    if (threat) this.threatPos = threat.pos.clone();

    // mood from the action, if the action did not pick one itself
    if (a.mood !== 'sleepy') {
      const m = a.mood;
      if (m !== 'dizzy') {
        a.mood = this.action === 'playChase' || this.action === 'greet' || this.action === 'pushBall'
          ? 'happy'
          : this.action === 'flee' || this.action === 'hide' ? 'scared' : 'neutral';
      }
    }
    void this.lastAction;
  }

  private goAgain(a: Agent, w: World): void {
    this.lastAction = this.action;
    this.action = 'wander';
    this.actionAge = 0;
    a.mood = 'neutral';
    a.goTo(w.randomSpot(this.rng, a.pos, 4.5), 0.65);
  }
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
