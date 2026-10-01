/**
 * Floating emote icons. One atlas texture, one instanced quad per glyph —
 * adding a glyph costs nothing, and the whole system is a few draw calls.
 *
 * Emotes scale UP with camera distance so they stay readable when the island is
 * viewed from far away, and the billboard is rebuilt from the camera quaternion
 * every frame so it always faces the viewer.
 */
import * as THREE from 'three';
import { MAT } from './materials';

export type Glyph = 'heart' | 'bang' | 'question' | 'zzz' | 'note' | 'star' | 'sweat';
export const GLYPHS: Glyph[] = ['heart', 'bang', 'question', 'zzz', 'note', 'star', 'sweat'];

const TILE = 64;
const COLS = GLYPHS.length;

function drawGlyph(ctx: CanvasRenderingContext2D, glyph: Glyph, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(28,20,40,0.92)';
  ctx.lineWidth = 7;
  const stroke = (draw: () => void): void => { ctx.stroke(); draw(); };
  switch (glyph) {
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.bezierCurveTo(-22, -2, -14, -22, 0, -10);
      ctx.bezierCurveTo(14, -22, 22, -2, 0, 16);
      ctx.closePath();
      ctx.fillStyle = '#ff5d7e';
      stroke(() => { ctx.fill(); });
      break;
    }
    case 'bang': {
      ctx.beginPath();
      ctx.moveTo(-5, -22); ctx.lineTo(5, -22); ctx.lineTo(3, 4); ctx.lineTo(-3, 4);
      ctx.closePath();
      ctx.fillStyle = '#ffd34d';
      stroke(() => { ctx.fill(); });
      ctx.beginPath();
      ctx.arc(0, 15, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd34d';
      stroke(() => { ctx.fill(); });
      break;
    }
    case 'question': {
      ctx.font = 'bold 46px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#8ad4ff';
      ctx.lineWidth = 8;
      ctx.strokeText('?', 0, 2);
      ctx.fillText('?', 0, 2);
      break;
    }
    case 'zzz': {
      ctx.font = 'bold 30px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.strokeText('z', -9, 8);
      ctx.fillText('z', -9, 8);
      ctx.font = 'bold 40px ui-rounded, system-ui, sans-serif';
      ctx.strokeText('z', 9, -6);
      ctx.fillText('z', 9, -6);
      break;
    }
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 22 : 9;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffe680';
      stroke(() => { ctx.fill(); });
      break;
    }
    case 'sweat': {
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.bezierCurveTo(13, -6, 13, 10, 0, 16);
      ctx.bezierCurveTo(-13, 10, -13, -6, 0, -22);
      ctx.closePath();
      ctx.fillStyle = '#8fd8ff';
      stroke(() => { ctx.fill(); });
      break;
    }
    default: {
      ctx.font = 'bold 48px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffa8e0';
      ctx.lineWidth = 7;
      ctx.strokeText('\u266a', 0, 2);
      ctx.fillText('\u266a', 0, 2);
      break;
    }
  }
  ctx.restore();
}

function buildAtlas(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = TILE * COLS;
  cv.height = TILE;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, cv.width, cv.height);
  GLYPHS.forEach((g, i) => drawGlyph(ctx, g, i * TILE + TILE / 2, TILE / 2, 1.0));
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface EmoteRequest {
  glyph: Glyph;
  pos: THREE.Vector3;
  /** 0..1 through the emote's life */
  life: number;
  /** optional size multiplier, for a creature that screams rather than mutters */
  punch?: number;
}

const CAP = 32;
/** Emotes grow with distance so a far-away "!" still reads as a "!". */
const NEAR = 7;
const FAR = 34;
const GROW = 2.5;

export class Emotes {
  readonly group = new THREE.Group();
  private meshes = new Map<Glyph, THREE.InstancedMesh>();
  private dummy = new THREE.Object3D();
  private tmp = new THREE.Vector3();
  private camPos = new THREE.Vector3();

  constructor() {
    const tex = buildAtlas();
    MAT.emote.map = tex;
    MAT.emote.needsUpdate = true;
    const plane = new THREE.PlaneGeometry(1, 1);
    GLYPHS.forEach((g, i) => {
      const geo = plane.clone();
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      const u0 = i / COLS;
      for (let v = 0; v < uv.count; v++) uv.setX(v, u0 + uv.getX(v) / COLS);
      uv.needsUpdate = true;
      const mesh = new THREE.InstancedMesh(geo, MAT.emote, CAP);
      mesh.name = `emote_${g}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.meshes.set(g, mesh);
    });
  }

  /** Requests are consumed each frame; anything not asked for is hidden. */
  render(list: EmoteRequest[], camera: THREE.Camera): void {
    const counts = new Map<Glyph, number>();
    const q = camera.quaternion;
    camera.getWorldPosition(this.camPos);
    for (const req of list) {
      const mesh = this.meshes.get(req.glyph);
      if (!mesh) continue;
      const n = counts.get(req.glyph) ?? 0;
      if (n >= CAP) continue;
      const t = req.life;
      const rise = t * 0.55;
      const pop = t < 0.18 ? t / 0.18 : 1;
      const dist = this.tmp.copy(req.pos).distanceTo(this.camPos);
      const zoom = 1 + Math.min(1, Math.max(0, (dist - NEAR) / (FAR - NEAR))) * (GROW - 1);
      const s = 0.34 * pop * (0.9 + 0.1 * Math.sin(t * 14)) * zoom * (req.punch ?? 1);
      this.tmp.copy(req.pos);
      this.tmp.y += 0.30 + rise;
      this.dummy.position.copy(this.tmp);
      this.dummy.quaternion.copy(q);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(n, this.dummy.matrix);
      counts.set(req.glyph, n + 1);
    }
    for (const [g, mesh] of this.meshes) {
      const used = counts.get(g) ?? 0;
      for (let i = used; i < CAP; i++) {
        this.dummy.position.set(0, -999, 0);
        this.dummy.quaternion.identity();
        this.dummy.scale.set(0.0001, 0.0001, 0.0001);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }
      mesh.count = CAP;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
