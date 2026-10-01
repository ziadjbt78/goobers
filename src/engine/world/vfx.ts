/**
 * World VFX — every player tool needs something you can SEE from across the
 * island. Two instanced meshes cover all of it:
 *   rings  flat on the ground: call ripples, impact dust rings, spawn shockwaves
 *   puffs  billboards: dust bursts, seed sparkles, landing poufs
 * One material each, so feedback costs two draw calls no matter how much fires.
 */
import * as THREE from 'three';
import { MAT } from '../render/hero/materials';

interface Ring { x: number; y: number; z: number; t: number; life: number; r0: number; r1: number; c: THREE.Color }
interface Puff { pos: THREE.Vector3; vel: THREE.Vector3; t: number; life: number; size: number; c: THREE.Color; floor: number }

const RING_CAP = 32;
const PUFF_CAP = 180;

export class Vfx {
  readonly group = new THREE.Group();

  private ringsMesh: THREE.InstancedMesh;
  private puffsMesh: THREE.InstancedMesh;
  private rings: Ring[] = [];
  private puffs: Puff[] = [];
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();

  constructor() {
    // ---- rings: a flat annulus that grows and fades ------------------------
    const rgeo = new THREE.RingGeometry(0.62, 1.0, 40);
    rgeo.rotateX(-Math.PI / 2);
    const rcol = new Float32Array(rgeo.getAttribute('position').count * 3).fill(1);
    rgeo.setAttribute('color', new THREE.BufferAttribute(rcol, 3));
    this.ringsMesh = new THREE.InstancedMesh(rgeo, MAT.vfxRing, RING_CAP);
    this.ringsMesh.name = 'vfx_rings';
    this.ringsMesh.frustumCulled = false;
    this.ringsMesh.renderOrder = 4;
    this.group.add(this.ringsMesh);

    const pgeo = new THREE.SphereGeometry(1, 10, 8);
    const pcol = new Float32Array(pgeo.getAttribute('position').count * 3).fill(1);
    pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
    this.puffsMesh = new THREE.InstancedMesh(pgeo, MAT.vfxPuff, PUFF_CAP);
    this.puffsMesh.name = 'vfx_puffs';
    this.puffsMesh.frustumCulled = false;
    this.puffsMesh.renderOrder = 4;
    this.group.add(this.puffsMesh);
  }

  /** An expanding ring lying flat on the ground. */
  ring(x: number, y: number, z: number, opts: { r0?: number; r1?: number; life?: number; color?: string; width?: number } = {}): void {
    if (this.rings.length >= RING_CAP) this.rings.shift();
    const r0 = opts.r0 ?? 0.15;
    const r1 = opts.r1 ?? 2.6;
    this.rings.push({
      x, y: y + 0.02, z, t: 0, life: opts.life ?? 0.75,
      r0, r1, c: new THREE.Color(opts.color ?? '#fff4c2'),
    });
    void opts.width;
  }

  /** A burst of little spheres. `spread` fans them out, `up` lifts them. */
  puff(x: number, y: number, z: number, n: number, opts: { life?: number; size?: number; spread?: number; up?: number; color?: string } = {}): void {
    const life = opts.life ?? 0.7;
    const size = opts.size ?? 0.07;
    const spread = opts.spread ?? 1.1;
    const up = opts.up ?? 1.2;
    const color = opts.color ?? '#e8d9b8';
    for (let i = 0; i < n; i++) {
      if (this.puffs.length >= PUFF_CAP) this.puffs.shift();
      const a = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random() * 0.6) * spread;
      this.puffs.push({
        pos: new THREE.Vector3(x, y + 0.05, z),
        vel: new THREE.Vector3(Math.cos(a) * s, (0.5 + Math.random()) * up, Math.sin(a) * s),
        t: 0, life: life * (0.7 + Math.random() * 0.6),
        size: size * (0.7 + Math.random() * 0.7),
        c: new THREE.Color(color),
        floor: y,
      });
    }
  }

  /** The one call a creature's foot makes on landing: a small ground pouf. */
  dust(x: number, y: number, z: number, power: number): void {
    this.puff(x, y, z, 3 + Math.round(power * 4), { life: 0.5, size: 0.055, spread: 0.75, up: 0.75, color: '#efe4cb' });
    this.ring(x, y, z, { r0: 0.10, r1: 0.55 + power * 0.5, life: 0.42, color: '#fff8e2' });
  }

  update(dt: number, camera: THREE.Camera): void {
    // ---- rings -------------------------------------------------------------
    let ri = 0;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) { this.rings.splice(i, 1); continue; }
      const u = r.t / r.life;
      const e = 1 - (1 - u) * (1 - u);                 // ease-out: fast then settle
      const rad = r.r0 + (r.r1 - r.r0) * e;
      this.dummy.position.set(r.x, r.y, r.z);
      this.dummy.quaternion.identity();
      this.dummy.scale.set(rad, 1, rad);
      this.dummy.updateMatrix();
      this.ringsMesh.setMatrixAt(ri, this.dummy.matrix);
      const fade = 1 - u;
      this.col.copy(r.c).multiplyScalar(1.6);
      this.ringsMesh.setColorAt(ri, this.col);
      void fade;
      ri++;
    }
    for (let i = ri; i < RING_CAP; i++) {
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0.0001, 0.0001, 0.0001);
      this.dummy.updateMatrix();
      this.ringsMesh.setMatrixAt(i, this.dummy.matrix);
      this.ringsMesh.setColorAt(i, this.col.setRGB(0, 0, 0));
    }
    this.ringsMesh.count = RING_CAP;
    this.ringsMesh.instanceMatrix.needsUpdate = true;
    if (this.ringsMesh.instanceColor) this.ringsMesh.instanceColor.needsUpdate = true;

    // ---- puffs -------------------------------------------------------------
    let pi = 0;
    const q = camera.quaternion;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      if (p.t >= p.life) { this.puffs.splice(i, 1); continue; }
      p.vel.y -= 5.5 * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor + 0.02) { p.pos.y = p.floor + 0.02; p.vel.set(0, 0, 0); }
      const u = p.t / p.life;
      const s = p.size * (1 + u * 0.9) * (1 - u * u);
      this.dummy.position.copy(p.pos);
      this.dummy.quaternion.copy(q);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.puffsMesh.setMatrixAt(pi, this.dummy.matrix);
      this.col.copy(p.c).multiplyScalar(1.5);
      this.puffsMesh.setColorAt(pi, this.col);
      pi++;
    }
    for (let i = pi; i < PUFF_CAP; i++) {
      this.dummy.position.set(0, -999, 0);
      this.dummy.quaternion.identity();
      this.dummy.scale.set(0.0001, 0.0001, 0.0001);
      this.dummy.updateMatrix();
      this.puffsMesh.setMatrixAt(i, this.dummy.matrix);
      this.puffsMesh.setColorAt(i, this.col.setRGB(0, 0, 0));
    }
    this.puffsMesh.count = PUFF_CAP;
    this.puffsMesh.instanceMatrix.needsUpdate = true;
    if (this.puffsMesh.instanceColor) this.puffsMesh.instanceColor.needsUpdate = true;
  }
}
