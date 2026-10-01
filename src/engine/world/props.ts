/**
 * Everything on the island that is not a creature: the pond, grass, flowers,
 * berry bushes that actually run out and come back, rocks, logs and the ball.
 * Grass, flowers and berries are instanced, so the whole meadow is a handful of
 * draw calls no matter how much of it there is.
 *
 * Scale rules (creatures are the stars):
 *   rocks  no taller than ~0.8 x a creature
 *   bushes no taller than ~0.6 x a creature
 *   grass  60% shorter and 50% thinner than it used to be, and trampled flat
 *          in a 1.5-unit circle around every creature so legs stay visible
 */
import * as THREE from 'three';
import { MAT } from '../render/hero/materials';
import { heightAt, isDry, normalAt, POND, WATER_Y, WALK_R } from './terrain';

export interface Bush {
  pos: THREE.Vector3;
  /** seconds until this berry comes back; 0 while it is on the bush */
  ripe: number[];
  slot: number[];
  /** set when the bush is shaken, so it can wobble */
  shake: number;
}

export interface Rock { pos: THREE.Vector3; radius: number }

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

/** Half of what it was: the meadow no longer hides the creatures. */
const GRASS_N = 2600;
const FLOWER_N = 260;
const BERRIES_PER_BUSH = 7;
/** No grass inside this radius of a creature's feet. */
const TRAMPLE_R = 1.5;

export class Props {
  readonly group = new THREE.Group();
  readonly bushes: Bush[] = [];
  readonly rocks: Rock[] = [];
  readonly logs: { pos: THREE.Vector3; dir: THREE.Vector3; len: number; radius: number }[] = [];
  readonly ball = { pos: new THREE.Vector3(-2.2, 0.4, 2.6), vel: new THREE.Vector3(), radius: 0.30, spin: 0 };
  readonly ballMesh: THREE.Mesh;
  private berryMesh!: THREE.InstancedMesh;
  private berrySlots: { bush: number; berry: number; pos: THREE.Vector3 }[] = [];
  private grass!: THREE.InstancedMesh;
  private grassBase: { x: number; y: number; z: number; rot: number; sx: number; sy: number }[] = [];
  private grassHidden: boolean[] = [];
  private trampleDirty = true;
  private bushMeshes: THREE.Mesh[] = [];
  private dummy = new THREE.Object3D();
  private tmpN = new THREE.Vector3();

  constructor() {
    const rng = mulberry(0x9e3779b9);
    this.group.add(this.buildPond());
    this.buildGrass(rng);
    this.buildFlowers(rng);
    this.buildRocks(rng);
    this.buildLogs(rng);
    this.buildBushes(rng);

    // ---- the ball ---------------------------------------------------------
    const bg = new THREE.SphereGeometry(this.ball.radius, 28, 20);
    const bc = new Float32Array(bg.getAttribute('position').count * 3);
    const base = new THREE.Color('#f2f6ff');
    const stripe = new THREE.Color('#e8543f');
    const p = bg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = Math.abs(p.getY(i) / this.ball.radius);
      const c = t < 0.32 ? stripe : base;
      bc[i * 3] = c.r; bc[i * 3 + 1] = c.g; bc[i * 3 + 2] = c.b;
    }
    bg.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    this.ball.pos.y = heightAt(this.ball.pos.x, this.ball.pos.z) + this.ball.radius;
    this.ballMesh = new THREE.Mesh(bg, MAT.lit);
    this.ballMesh.name = 'ball';
    this.group.add(this.ballMesh);
  }

  /** The pond: a water disc trimmed exactly to the waterline, with a foam lip. */
  private buildPond(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'pondGroup';
    let waterR = POND.r * 0.5;
    for (let i = 0; i <= 120; i++) {
      const r = (i / 120) * POND.r * 1.1;
      if (heightAt(POND.x + r, POND.z) < WATER_Y) waterR = r;
    }
    const geo = new THREE.CircleGeometry(waterR, 56);
    geo.rotateX(-Math.PI / 2);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const deep = new THREE.Color('#2f8fc8');
    const shallow = new THREE.Color('#9fe6e0');
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i)) / Math.max(0.01, waterR);
      c.copy(deep).lerp(shallow, r * r);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, MAT.lit);
    mesh.position.set(POND.x, WATER_Y + 0.006, POND.z);
    mesh.name = 'pond';
    g.add(mesh);

    // a soft white lip so the pond edge reads against the grass
    const lip = new THREE.RingGeometry(waterR * 0.93, waterR + 0.10, 56, 1);
    lip.rotateX(-Math.PI / 2);
    const lp = lip.getAttribute('position') as THREE.BufferAttribute;
    const lcol = new Float32Array(lp.count * 3);
    const white = new THREE.Color('#ffffff');
    const soft = new THREE.Color('#cdeef0');
    for (let i = 0; i < lp.count; i++) {
      const r = Math.hypot(lp.getX(i), lp.getZ(i));
      c.copy(soft).lerp(white, Math.min(1, Math.max(0, (r - waterR * 0.93) / (waterR * 0.12))));
      lcol[i * 3] = c.r; lcol[i * 3 + 1] = c.g; lcol[i * 3 + 2] = c.b;
    }
    lip.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
    const lipMesh = new THREE.Mesh(lip, MAT.lit);
    lipMesh.position.set(POND.x, WATER_Y + 0.018, POND.z);
    g.add(lipMesh);
    return g;
  }

  /**
   * A single blade, swelled at the base. 60% shorter and thinner than v6 — the
   * creatures must read as the tallest thing on the meadow.
   */
  private bladeGeo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const w = 0.021;
    const h = 0.165;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -w, 0, 0, w, 0, 0, w * 0.55, h * 0.55, 0, -w * 0.55, h * 0.55, 0, 0, h, 0,
    ]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4]);
    g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array([0, 0, 0.3, 0.3, 1]), 1));
    const col = new Float32Array(5 * 3);
    const lo = new THREE.Color('#5aa63f');
    const hi = new THREE.Color('#a8e070');
    const c = new THREE.Color();
    for (let i = 0; i < 5; i++) {
      c.copy(lo).lerp(hi, i / 4);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  private buildGrass(rng: () => number): void {
    this.grass = new THREE.InstancedMesh(this.bladeGeo(), MAT.foliage, GRASS_N);
    this.grass.name = 'grass';
    this.grass.frustumCulled = false;
    const col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < GRASS_N * 6 && n < GRASS_N; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * WALK_R * 1.04;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      if (!isDry(x, z)) continue;
      const y = heightAt(x, z);
      const rot = rng() * Math.PI;
      const sx = 0.55 + rng() * 0.5;
      const sy = sx * (0.55 + rng() * 0.5);
      this.grassBase.push({ x, y, z, rot, sx, sy });
      this.grassHidden.push(false);
      this.dummy.position.set(x, y - 0.015, z);
      this.dummy.rotation.set(0, rot, 0);
      this.dummy.scale.set(sx, sy, sx);
      this.dummy.updateMatrix();
      this.grass.setMatrixAt(n, this.dummy.matrix);
      col.setHSL(0.26 + rng() * 0.06, 0.42 + rng() * 0.22, 0.72 + rng() * 0.22);
      this.grass.setColorAt(n, col);
      n++;
    }
    this.grass.count = n;
    if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
    this.group.add(this.grass);
  }

  /**
   * Flatten every blade inside TRAMPLE_R of a creature's feet. Cheap enough to
   * run at a few Hz: it only rewrites the instances that changed state.
   */
  trample(points: { x: number; z: number }[]): void {
    if (!points.length) return;
    let changed = false;
    for (let i = 0; i < this.grassBase.length; i++) {
      const b = this.grassBase[i];
      let near = false;
      for (const p of points) {
        const dx = b.x - p.x;
        const dz = b.z - p.z;
        if (dx * dx + dz * dz < TRAMPLE_R * TRAMPLE_R) { near = true; break; }
      }
      if (near !== this.grassHidden[i]) {
        this.grassHidden[i] = near;
        const s = near ? 0.12 : 1;
        this.dummy.position.set(b.x, b.y - 0.015, b.z);
        this.dummy.rotation.set(0, b.rot, 0);
        this.dummy.scale.set(b.sx * s, b.sy * s, b.sx * s);
        this.dummy.updateMatrix();
        this.grass.setMatrixAt(i, this.dummy.matrix);
        changed = true;
      }
    }
    if (changed) this.grass.instanceMatrix.needsUpdate = true;
  }

  private buildFlowers(rng: () => number): void {
    const g = new THREE.CircleGeometry(0.062, 7);
    const pet = new THREE.Color('#ffffff');
    const col = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = pet.r; col[i + 1] = pet.g; col[i + 2] = pet.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(0.25), 1));
    const mesh = new THREE.InstancedMesh(g, MAT.foliage, FLOWER_N);
    mesh.name = 'flowers';
    mesh.frustumCulled = false;
    const hue = ['#fff2a8', '#ff9ec4', '#c9a8ff', '#ffffff', '#ffce6a'];
    const c = new THREE.Color();
    let n = 0;
    for (let i = 0; i < FLOWER_N * 6 && n < FLOWER_N; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * WALK_R * 0.98;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      if (!isDry(x, z)) continue;
      this.dummy.position.set(x, heightAt(x, z) + 0.075 + rng() * 0.06, z);
      this.dummy.rotation.set(-Math.PI * 0.42, rng() * Math.PI * 2, 0);
      const s = 0.70 + rng() * 0.6;
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(n, this.dummy.matrix);
      c.set(hue[Math.floor(rng() * hue.length) % hue.length]).multiplyScalar(1.35);
      mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
  }

  /**
   * Soft rounded pastel rocks with a toon outline — no dark low-poly boulders.
   * Height is capped at roughly 0.8 of a creature so the creatures stay the
   * biggest thing on screen.
   */
  private buildRocks(rng: () => number): void {
    const g = new THREE.IcosahedronGeometry(1, 2);
    g.computeVertexNormals();
    const col = new Float32Array(g.getAttribute('position').count * 3);
    const a1 = new THREE.Color('#e6e0d4');
    const a2 = new THREE.Color('#c3b8a8');
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const c = a1.clone().lerp(a2, 0.5 + 0.5 * p.getY(i));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const N = 11;
    const mesh = new THREE.InstancedMesh(g, MAT.lit, N);
    mesh.name = 'rocks';
    mesh.frustumCulled = false;
    // The outline shares the instance buffer, so it can never drift out of sync.
    const line = new THREE.InstancedMesh(g, MAT.propOutline, N);
    line.name = 'rocks_outline';
    line.frustumCulled = false;
    line.renderOrder = -1;
    line.instanceMatrix = mesh.instanceMatrix;

    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 40; k++) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * WALK_R * 0.9;
        x = Math.cos(a) * rr;
        z = Math.sin(a) * rr;
        const far = Math.hypot(x - POND.x, z - POND.z) > POND.r + 0.5;
        if (isDry(x, z) && far) break;
      }
      const radius = 0.18 + rng() * 0.24;
      this.rocks.push({ pos: new THREE.Vector3(x, heightAt(x, z) + radius * 0.40, z), radius });
      this.dummy.position.copy(this.rocks[i].pos);
      this.dummy.rotation.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
      this.dummy.scale.set(radius, radius * (0.66 + rng() * 0.34), radius * (0.86 + rng() * 0.3));
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      // instanceColor multiplies vertexColors: keep it near white
      c.setHSL(0.09, 0.06, 0.94 + rng() * 0.14);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    this.group.add(line);
  }

  private buildLogs(rng: () => number): void {
    const N = 4;
    for (let i = 0; i < N; i++) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 40; k++) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * WALK_R * 0.85;
        x = Math.cos(a) * rr;
        z = Math.sin(a) * rr;
        if (isDry(x, z) && Math.hypot(x - POND.x, z - POND.z) > POND.r + 0.6) break;
      }
      const dir = new THREE.Vector3(Math.cos(rng() * Math.PI * 2), 0, Math.sin(rng() * Math.PI * 2)).normalize();
      const len = 1.4 + rng() * 1.2;
      const radius = 0.15 + rng() * 0.07;
      const y = heightAt(x, z) + radius * 0.85;
      const geo = new THREE.CylinderGeometry(radius, radius * 0.94, len, 18, 1, false);
      const p = geo.getAttribute('position') as THREE.BufferAttribute;
      const col = new Float32Array(p.count * 3);
      const bark = new THREE.Color('#a9805a');
      const barkDark = new THREE.Color('#7a5a3c');
      const ring = new THREE.Color('#dcc39a');
      const c = new THREE.Color();
      for (let v = 0; v < p.count; v++) {
        const radial = Math.abs(p.getY(v)) > len * 0.49 ? ring : bark;
        c.copy(p.getY(v) < 0 ? barkDark : bark).lerp(radial, radial === ring ? 1 : 0);
        c.offsetHSL(0, 0, (Math.sin(v * 1.7) * 0.03));
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, MAT.lit);
      mesh.position.set(x, y, z);
      mesh.rotation.z = Math.PI * 0.5;
      mesh.rotation.y = Math.atan2(dir.z, dir.x);
      mesh.name = `log${i}`;
      const outline = new THREE.Mesh(geo, MAT.propOutline);
      outline.scale.setScalar(1.055);
      mesh.add(outline);
      this.logs.push({ pos: new THREE.Vector3(x, y, z), dir, len, radius });
      this.group.add(mesh);
    }
  }

  private buildBushes(rng: () => number): void {
    const N = 7;
    const berryGeo = new THREE.SphereGeometry(0.075, 16, 12);
    const bc = new Float32Array(berryGeo.getAttribute('position').count * 3);
    const berryA = new THREE.Color('#e8475f');
    const berryB = new THREE.Color('#a8253c');
    const bp = berryGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const c = berryA.clone().lerp(berryB, 0.5 - bp.getY(i) * 0.5);
      bc[i * 3] = c.r; bc[i * 3 + 1] = c.g; bc[i * 3 + 2] = c.b;
    }
    berryGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));

    const total = N * BERRIES_PER_BUSH;
    this.berryMesh = new THREE.InstancedMesh(berryGeo, MAT.lit, total);
    this.berryMesh.name = 'berries';
    this.berryMesh.frustumCulled = false;

    for (let i = 0; i < N; i++) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 60; k++) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * WALK_R * 0.92;
        x = Math.cos(a) * rr;
        z = Math.sin(a) * rr;
        if (isDry(x, z) && Math.hypot(x - POND.x, z - POND.z) > POND.r + 0.8) break;
      }
      const y = heightAt(x, z);
      const bush: Bush = { pos: new THREE.Vector3(x, y, z), ripe: [], slot: [], shake: 0 };
      // a leafy mound: three merged spheres, scaled down so the creatures tower
      const leaf: THREE.BufferGeometry[] = [];
      for (let s = 0; s < 3; s++) {
        const g = new THREE.SphereGeometry((0.36 - s * 0.06) * 0.60, 18, 13);
        g.translate((s - 1) * 0.16, (0.20 + Math.abs(s - 1) * 0.06), (s - 1) * 0.08);
        const p = g.getAttribute('position') as THREE.BufferAttribute;
        const col = new Float32Array(p.count * 3);
        const a = new THREE.Color('#4a8f3a');
        const b = new THREE.Color('#79c455');
        const c = new THREE.Color();
        for (let v = 0; v < p.count; v++) {
          c.copy(a).lerp(b, 0.5 + 0.5 * p.getY(v) * 2);
          col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        leaf.push(g);
      }
      const leafGeo = mergeSimple(leaf);
      const mesh = new THREE.Mesh(leafGeo, MAT.lit);
      mesh.position.copy(bush.pos);
      mesh.rotation.y = rng() * Math.PI * 2;
      mesh.name = `bush${i}`;
      const outline = new THREE.Mesh(leafGeo, MAT.propOutline);
      outline.scale.setScalar(1.07);
      mesh.add(outline);
      this.group.add(mesh);
      this.bushMeshes.push(mesh);

      for (let b = 0; b < BERRIES_PER_BUSH; b++) {
        const a = (b / BERRIES_PER_BUSH) * Math.PI * 2 + rng() * 0.5;
        const rr = 0.15 + rng() * 0.11;
        const pos = new THREE.Vector3(
          Math.cos(a) * rr,
          0.22 + rng() * 0.18,
          Math.sin(a) * rr,
        ).add(bush.pos);
        bush.ripe.push(0);
        bush.slot.push(this.berrySlots.length);
        this.berrySlots.push({ bush: i, berry: b, pos });
      }
      this.bushes.push(bush);
    }
    this.group.add(this.berryMesh);
    this.refreshBerries();
  }

  /** Eats one ripe berry. Returns false when the bush is bare. */
  eat(bushIndex: number): boolean {
    const bush = this.bushes[bushIndex];
    if (!bush) return false;
    const i = bush.ripe.findIndex((v) => v === 0);
    if (i < 0) return false;
    bush.ripe[i] = 26 + Math.random() * 20; // seconds to regrow
    bush.shake = 1;
    this.refreshBerries();
    return true;
  }

  bushHasFruit(bushIndex: number): boolean {
    return (this.bushes[bushIndex]?.ripe.findIndex((v) => v === 0) ?? -1) >= 0;
  }

  nearestFruitingBush(p: THREE.Vector3, maxDist: number): number {
    let best = -1;
    let bestD = maxDist;
    for (let i = 0; i < this.bushes.length; i++) {
      if (!this.bushHasFruit(i)) continue;
      const d = this.bushes[i].pos.distanceTo(p);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  private refreshBerries(): void {
    for (const bush of this.bushes) {
      for (let b = 0; b < bush.ripe.length; b++) {
        const slot = bush.slot[b];
        const ripe = bush.ripe[b] === 0;
        this.dummy.position.copy(this.berrySlots[slot].pos);
        const s = ripe ? 1 : 0.0001;
        this.dummy.scale.set(s, s, s);
        this.dummy.updateMatrix();
        this.berryMesh.setMatrixAt(slot, this.dummy.matrix);
      }
    }
    this.berryMesh.instanceMatrix.needsUpdate = true;
  }

  /** Push the ball. Called by the brain when a creature noses into it. */
  pushBall(from: THREE.Vector3, dir: THREE.Vector3, power: number): void {
    const d = this.ball.pos.clone().sub(from).setY(0);
    if (d.lengthSq() < 1e-6) d.copy(dir).setY(0);
    d.normalize();
    this.ball.vel.addScaledVector(d, power);
    this.ball.vel.addScaledVector(dir.clone().setY(0).normalize(), power * 0.4);
    const max = 6.5;
    if (this.ball.vel.length() > max) this.ball.vel.setLength(max);
  }

  update(dt: number): void {
    // berries regrow
    let dirty = false;
    for (const bush of this.bushes) {
      for (let i = 0; i < bush.ripe.length; i++) {
        if (bush.ripe[i] > 0) {
          bush.ripe[i] -= dt;
          if (bush.ripe[i] <= 0) { bush.ripe[i] = 0; dirty = true; }
        }
      }
    }
    if (dirty) this.refreshBerries();

    // a picked bush wobbles, so you can see which one gave up its fruit
    for (let i = 0; i < this.bushes.length; i++) {
      const bush = this.bushes[i];
      if (bush.shake <= 0) continue;
      bush.shake = Math.max(0, bush.shake - dt * 2.6);
      const m = this.bushMeshes[i];
      if (m) {
        const w = bush.shake * Math.sin(bush.shake * 34) * 0.16;
        m.rotation.z = w;
        m.rotation.x = w * 0.5;
      }
    }

    // ball: roll, slow down, and never leave the meadow
    const b = this.ball;
    if (b.vel.lengthSq() > 1e-5) {
      b.pos.addScaledVector(b.vel, dt);
      const ground = heightAt(b.pos.x, b.pos.z) + b.radius;
      if (b.pos.y < ground) b.pos.y = ground;
      b.spin += b.vel.length() * dt * 6;
      const rr = Math.hypot(b.pos.x, b.pos.z);
      if (rr > WALK_R + 0.6) {
        const n = new THREE.Vector3(-b.pos.x, 0, -b.pos.z).normalize();
        b.vel.reflect(n).multiplyScalar(0.5);
        b.pos.x = n.x * (WALK_R + 0.6) * -1;
        b.pos.z = n.z * (WALK_R + 0.6) * -1;
      }
      b.vel.multiplyScalar(Math.max(0, 1 - dt * 1.15));
      if (b.vel.lengthSq() < 0.0015) b.vel.set(0, 0, 0);
    } else {
      b.pos.y += (heightAt(b.pos.x, b.pos.z) + b.radius - b.pos.y) * Math.min(1, dt * 8);
    }
    this.ballMesh.position.copy(b.pos);
    this.ballMesh.rotation.x = b.spin * 0.6;
    this.ballMesh.rotation.z = b.spin * 0.9;
    void this.tmpN;
    void normalAt;
    void this.trampleDirty;
  }
}

/** Tiny local merge, so the props module does not pull in the geometry utils. */
function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.getAttribute('position').count;
    iCount += g.getIndex() ? (g.getIndex() as THREE.BufferAttribute).count : g.getAttribute('position').count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i); pos[(vo + i) * 3 + 1] = p.getY(i); pos[(vo + i) * 3 + 2] = p.getZ(i);
      nrm[(vo + i) * 3] = n.getX(i); nrm[(vo + i) * 3 + 1] = n.getY(i); nrm[(vo + i) * 3 + 2] = n.getZ(i);
      col[(vo + i) * 3] = c.getX(i); col[(vo + i) * 3 + 1] = c.getY(i); col[(vo + i) * 3 + 2] = c.getZ(i);
    }
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx[io + i] = vo + gi.getX(i);
    else for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
    io += gi ? gi.count : p.count;
    vo += p.count;
    g.dispose();
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
