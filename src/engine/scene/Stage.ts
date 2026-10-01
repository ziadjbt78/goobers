/**
 * Stage — the room the heroes stand in.
 * Sky with a real horizon, graded ground, one round pedestal per hero, and a
 * soft blob contact shadow painted onto each pedestal top. All of it is
 * vertex-coloured and drawn with the single flat material, so it costs no extra
 * shader program.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MAT } from '../render/hero/materials';
import { stats } from '../core/stats';

const SKY_TOP = new THREE.Color('#4a92e0');
const SKY_MID = new THREE.Color('#a8d4f0');
const SKY_HORIZON = new THREE.Color('#f3e2c4');
// The far ground is underwater now: the toon sea reaches the horizon, so the
// old green/brown outer ring is gone and the horizon reads as open water.
const GROUND_NEAR = new THREE.Color('#8fdccb');
const GROUND_FAR = new THREE.Color('#2f6fb0');

/** Reverse triangle winding: a dome must face INWARD to be seen from inside. */
function flipWinding(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = geo.getIndex();
  if (!idx) return geo;
  const a = idx.array as Uint16Array | Uint32Array;
  for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
  idx.needsUpdate = true;
  return geo;
}

/** Seconds in one full day. Four minutes, as specified. */
export const DAY_SECONDS = 240;

function paintVertices(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => void): THREE.BufferGeometry {
  const p = geo.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  contextLost = false;

  private sky: THREE.Mesh;
  private skyMat!: THREE.MeshBasicMaterial;
  private stars!: THREE.Points;
  private starsMat!: THREE.PointsMaterial;
  /** the far meadow owns its material so night can dim it with the sky */
  private groundMat!: THREE.MeshBasicMaterial;
  /** a solid dome that fades in after dark so the horizon band cannot stay bright */
  private nightDome!: THREE.Mesh;
  private nightMat!: THREE.MeshBasicMaterial;
  private hemi!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private bounceLight!: THREE.DirectionalLight;
  /** 0..1 through the day: 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk */
  day = 0.5;
  private ground: THREE.Mesh;
  private pedestals: THREE.Mesh[] = [];
  private onLost?: (m: string) => void;
  private onRestored?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(new THREE.Color('#a8d4f0'), 1);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 300);
    this.camera.position.set(2.45, 1.10, 5.55);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.52, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 30;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.update();

    // ---- lighting: warm key, cool fill, hemisphere sky/ground --------------
    this.hemi = new THREE.HemisphereLight(new THREE.Color('#bfe0ff'), new THREE.Color('#7fa855'), 1.15);
    this.scene.add(this.hemi);
    this.keyLight = new THREE.DirectionalLight(new THREE.Color('#fff2d8'), 1.55);
    this.keyLight.position.set(4.2, 6.5, 5.0);
    this.scene.add(this.keyLight);
    this.fillLight = new THREE.DirectionalLight(new THREE.Color('#c6d8ff'), 0.55);
    this.fillLight.position.set(-5.0, 2.6, -3.4);
    this.scene.add(this.fillLight);
    this.bounceLight = new THREE.DirectionalLight(new THREE.Color('#e8f0c0'), 0.25);
    this.bounceLight.position.set(0, -3, 1.5);
    this.scene.add(this.bounceLight);

    // ---- sky dome with a visible horizon -----------------------------------
    const skyGeo = flipWinding(new THREE.SphereGeometry(120, 48, 28));
    paintVertices(skyGeo, (_x, y, _z, out) => {
      const h = y / 120;
      if (h > 0.04) out.copy(SKY_MID).lerp(SKY_TOP, Math.min(1, (h - 0.04) / 0.62));
      else if (h > 0) out.copy(SKY_HORIZON).lerp(SKY_MID, h / 0.04);
      else out.copy(SKY_HORIZON).lerp(GROUND_FAR, Math.min(1, -h / 0.35));
    });
    // the sky owns its material so day/night can tint it without recolouring
    // the ground, which shares the same program
    this.skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // ---- star field: only exists after dark, so night reads as night -------
    const nStars = 700;
    const sPos = new Float32Array(nStars * 3);
    for (let i = 0; i < nStars; i++) {
      // upper hemisphere only, biased away from the horizon band
      const u = Math.random(), v = Math.random();
      const theta = Math.acos(0.10 + u * 0.90);
      const phi = v * Math.PI * 2;
      sPos[i * 3] = Math.sin(theta) * Math.cos(phi) * 118;
      sPos[i * 3 + 1] = Math.cos(theta) * 118;
      sPos[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * 118;
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    this.starsMat = new THREE.PointsMaterial({ color: 0xe6eeff, size: 3.0, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sGeo, this.starsMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 3;
    this.scene.add(this.stars);

    // ---- night dome: a solid deep-blue shell drawn over the graded sky -------
    // The day sky's horizon band is a pale warm colour; multiplying it by a dark
    // tint yields muddy olive-green, so after dark a flat shell covers it. The
    // day look is untouched (opacity 0); stars sit inside it and draw on top.
    const ndGeo = flipWinding(new THREE.SphereGeometry(119, 32, 20));
    this.nightMat = new THREE.MeshBasicMaterial({ color: 0x0a1230, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.nightDome = new THREE.Mesh(ndGeo, this.nightMat);
    this.nightDome.frustumCulled = false;
    this.nightDome.renderOrder = 2;
    this.scene.add(this.nightDome);

    // ---- graded ground -----------------------------------------------------
    this.groundMat = MAT.flat.clone();
    const gGeo = new THREE.CircleGeometry(90, 96, 1);
    paintVertices(gGeo, (x, _y, z, out) => {
      const d = Math.min(1, Math.hypot(x, z) / 34);
      out.copy(GROUND_NEAR).lerp(GROUND_FAR, d * d);
    });
    this.ground = new THREE.Mesh(gGeo, this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.42;
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);
  }

  /**
   * Push the whole rig through the day. Lights AND the sky tint move together,
   * so dawn is warm on the ground as well as on the horizon.
   */
  setDayNight(t: number): void {
    this.day = ((t % 1) + 1) % 1;
    // 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset
    const sunHeight = Math.sin((this.day - 0.25) * Math.PI * 2); // -1..1
    const day01 = Math.max(0, Math.min(1, (sunHeight + 0.22) / 0.9));
    const dusk = Math.max(0, 1 - Math.abs(sunHeight) * 2.2);

    const keyCol = new THREE.Color('#fff2d8').lerp(new THREE.Color('#ff9c5a'), dusk * 0.85);
    this.keyLight.color.copy(keyCol);
    this.keyLight.intensity = 0.28 + day01 * 1.32;
    this.keyLight.position.set(Math.cos(this.day * Math.PI * 2) * 6.5, 2.0 + day01 * 6.0, 4.6 - this.day * 3.0);

    this.hemi.color.copy(new THREE.Color('#1c2540').lerp(new THREE.Color('#bfe0ff'), day01));
    this.hemi.groundColor.copy(new THREE.Color('#1a2418').lerp(new THREE.Color('#7fa855'), day01));
    this.hemi.intensity = 0.52 + day01 * 0.68;

    this.fillLight.color.set('#c6d8ff');
    this.fillLight.intensity = 0.18 + day01 * 0.40;
    this.fillLight.position.set(-5.0, 2.6, -3.4 + Math.sin(this.day * Math.PI * 2) * 3);
    this.bounceLight.intensity = 0.06 + day01 * 0.20;

    // the sky dims rather than going black, so the night still reads as a place
    const skyTint = new THREE.Color('#0e1733').lerp(new THREE.Color('#ffffff'), Math.pow(day01, 0.8));
    this.skyMat.color.copy(skyTint);
    // the distant meadow dims with it, otherwise night is a bright green field
    this.groundMat.color.copy(new THREE.Color('#5c6a92').lerp(new THREE.Color('#ffffff'), Math.pow(day01, 0.7)));
    // stars fade in as the sun goes down and are gone by mid-morning
    this.starsMat.opacity = Math.max(0, 1 - day01 * 3.2) * 0.95;
    this.nightMat.opacity = Math.max(0, 1 - day01 * 2.4) * 0.92;
    this.renderer.toneMappingExposure = 0.74 + day01 * 0.31;
  }

  /** How many pedestals exist, so a grid can grow in place. */
  pedestalCount(): number { return this.pedestals.length; }

  /** Move the default camera, for pages that frame a grid instead of a line. */
  setHome(pos: THREE.Vector3, target: THREE.Vector3): void {
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.controls.update();
  }

  /** A round pedestal with a painted contact shadow on its top face. */
  addPedestal(x: number, z: number, radius: number, tint: THREE.Color): void {
    const h = 0.16;
    const geo = new THREE.CylinderGeometry(radius, radius * 1.06, h, 48, 3, false);
    paintVertices(geo, (px, py, _pz, out) => {
      const r = Math.hypot(px, _pz) / radius;
      const top = py > 0;
      if (top) {
        const shade = THREE.MathUtils.smoothstep(r, 0.12, 1.0);
        out.copy(tint).multiplyScalar(0.42 + shade * 0.58);
      } else {
        out.copy(tint).multiplyScalar(0.30 + (1 - r) * 0.10);
      }
    });
    const m = new THREE.Mesh(geo, MAT.flat);
    m.position.set(x, -h * 0.5 + 0.002, z);
    this.pedestals.push(m);
    this.scene.add(m);
  }

  /** Re-tint the pedestals so each hero sits on its own colour. */
  setPedestalTint(i: number, c: THREE.Color): void {
    const m = this.pedestals[i];
    if (!m) return;
    const geo = m.geometry;
    geo.computeBoundingBox();
    const bbox = geo.boundingBox as THREE.Box3;
    const radius = Math.max(bbox.max.x, bbox.max.z);
    paintVertices(geo, (px, py, pz, out) => {
      const r = Math.hypot(px, pz) / radius;
      if (py > 0) out.copy(c).multiplyScalar(0.42 + THREE.MathUtils.smoothstep(r, 0.12, 1.0) * 0.58);
      else out.copy(c).multiplyScalar(0.30 + (1 - r) * 0.10);
    });
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  watchContext(onLost: (m: string) => void, onRestored: () => void): void {
    this.onLost = onLost;
    this.onRestored = onRestored;
    const c = this.renderer.domElement;
    c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; this.onLost?.('WebGL context lost'); }, false);
    c.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.onRestored?.(); }, false);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.controls.update();
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.nightDome.position.copy(this.camera.position);
    void dt;
  }

  render(dtMs: number): void {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info;
    stats.endFrame(dtMs, {
      calls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
    });
  }

  dispose(): void {
    this.controls.dispose();
    this.renderer.dispose();
  }
}
