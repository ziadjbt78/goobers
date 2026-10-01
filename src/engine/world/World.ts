/**
 * The island as a system: day and night, the spatial hash every neighbour query
 * goes through, and the one place an Agent registers itself. Nothing in here
 * knows what a creature looks like.
 */
import * as THREE from 'three';
import { Stage, DAY_SECONDS } from '../scene/Stage';
import { Props } from './props';
import { WALK_R, ISLAND_R, heightAt, isDry } from './terrain';
import { MAT } from '../render/hero/materials';

export interface HashEntry {
  id: number;
  pos: THREE.Vector3;
  /** bigger creatures intimidate smaller ones */
  bulk: number;
  alive: boolean;
}

const CELL = 3.2;

export class World {
  readonly stage: Stage;
  readonly props = new Props();
  /** 0..1 through the day. Starts mid-morning so the first impression is bright. */
  day = 0.40;
  agents: HashEntry[] = [];
  /** set by the sim log so headless runs can be replayed exactly */
  elapsed = 0;
  private cells = new Map<string, HashEntry[]>();

  constructor(stage: Stage) {
    this.stage = stage;
    stage.scene.add(this.props.group);
    stage.setDayNight(this.day);
  }

  get isNight(): boolean { return this.day < 0.22 || this.day > 0.80; }
  /** 0 = wide awake, 1 = deep night */
  get nightness(): number {
    const d = this.day;
    if (d > 0.24 && d < 0.78) return 0;
    const edge = d <= 0.24 ? (0.24 - d) / 0.24 : (d - 0.78) / 0.22;
    return Math.min(1, Math.max(0, edge));
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.day = (this.day + dt / DAY_SECONDS) % 1;
    this.stage.setDayNight(this.day);
    // Night fix: outlines are unlit and the rim is additive, so both glowed like
    // neon after dark. Dim them with the night; daytime (nightness 0) is unchanged.
    // nightness only peaks at midnight, but the sky is dark by dusk: ramp ~3x faster
    const n0 = this.nightness;
    const n = n0 >= 0.35 ? 1 : (n0 / 0.35) * (n0 / 0.35) * (3 - 2 * (n0 / 0.35));
    if (MAT.built) {
      MAT.outline.color.setScalar(1 - 0.75 * n);
      MAT.rimStrength.value = 0.30 * (1 - 0.85 * n);
    }
    this.props.update(dt);
    this.rebuildHash();
  }

  private rebuildHash(): void {
    this.cells.clear();
    for (const a of this.agents) {
      if (!a.alive) continue;
      const key = cellKey(a.pos.x, a.pos.z);
      const arr = this.cells.get(key);
      if (arr) arr.push(a);
      else this.cells.set(key, [a]);
    }
  }

  /** Every live creature within `radius` of a point, via the 3x3 cell block. */
  nearby(pos: THREE.Vector3, radius: number, exclude?: number): HashEntry[] {
    const out: HashEntry[] = [];
    const span = Math.ceil(radius / CELL);
    const cx = Math.floor(pos.x / CELL);
    const cz = Math.floor(pos.z / CELL);
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        const arr = this.cells.get(`${cx + i},${cz + j}`);
        if (!arr) continue;
        for (const a of arr) {
          if (!a.alive || a.id === exclude) continue;
          if (a.pos.distanceTo(pos) <= radius) out.push(a);
        }
      }
    }
    return out;
  }

  nearest(pos: THREE.Vector3, radius: number, exclude?: number): HashEntry | null {
    let best: HashEntry | null = null;
    let bestD = radius;
    for (const a of this.nearby(pos, radius, exclude)) {
      const d = a.pos.distanceTo(pos);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  /** A random patch of dry land, used by wander / spawn / flee. */
  randomSpot(rng: () => number, near?: THREE.Vector3, spread = 5): THREE.Vector3 {
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * WALK_R * 0.92;
      let x = Math.cos(a) * rr;
      let z = Math.sin(a) * rr;
      if (near) {
        x = near.x + (rng() - 0.5) * spread * 2;
        z = near.z + (rng() - 0.5) * spread * 2;
      }
      if (Math.hypot(x, z) > WALK_R * 0.96) continue;
      if (!isDry(x, z)) continue;
      return new THREE.Vector3(x, heightAt(x, z), z);
    }
    return new THREE.Vector3(0, heightAt(0, 0), 0);
  }

  /** The one true ground query for anything that walks. */
  ground(x: number, z: number): number { return heightAt(x, z); }

  get islandRadius(): number { return ISLAND_R; }
}

function cellKey(x: number, z: number): string {
  return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
}
