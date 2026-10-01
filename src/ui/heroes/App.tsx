import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Stage } from '../../engine/scene/Stage';
import { Hero } from '../../engine/anim/Hero';
import { Loop } from '../../engine/core/loop';
import { stats } from '../../engine/core/stats';
import { buildMaterials, MAT } from '../../engine/render/hero/materials';
import { buildHero } from '../../engine/render/hero/HeroRenderer';
import { buildHeroTemplate } from '../../engine/hero/heroes';
import { hexToLinear, paletteAt } from '../../engine/hero/palette';
import { HERO_IDS, HERO_NAMES, type HeroId } from '../../engine/hero/types';
import { useLab } from './store';

const SLOT_X = 1.62;

interface Slot {
  id: HeroId;
  hero: Hero;
  x: number;
}

export class Lab {
  stage: Stage;
  loop: Loop;
  heroes: Slot[] = [];
  setupMs = 0;
  private pointer = new THREE.Vector2(0, 0);
  private pointerOn = false;
  private lookAt = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private tmp = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    buildMaterials();
    this.stage = new Stage(canvas);

    const t0 = performance.now();
    HERO_IDS.forEach((id, i) => {
      const pal = paletteAt(i * 4 + 1);
      const template = buildHeroTemplate(id, {
        base: hexToLinear(pal.base),
        belly: hexToLinear(pal.belly),
        limb: hexToLinear(pal.limb),
        accent: hexToLinear(pal.accent),
        deep: hexToLinear(pal.deep),
      });
      const handle = buildHero(template, pal);
      const hero = new Hero(template, handle);
      const x = (i - (HERO_IDS.length - 1) / 2) * SLOT_X;
      handle.group.position.x = x;
      this.stage.scene.add(handle.group);
      this.stage.addPedestal(x, 0, 0.63, new THREE.Color(pal.base).multiplyScalar(0.85));
      this.stage.setPedestalTint(i, new THREE.Color(pal.base).multiplyScalar(0.78));
      this.heroes.push({ id, hero, x });
    });
    this.setupMs = performance.now() - t0;

    this.loop = new Loop(
      (dt) => {
        const gait = useLab.getState().gait;
        for (const s of this.heroes) {
          s.hero.setGait(gait);
          s.hero.update(dt, this.pointerOn ? this.lookAt : null);
        }
      },
      (_a, dt) => {
        this.stage.update(dt);
        this.stage.render(dt * 1000);
      },
      30,
    );
  }

  start(): void { this.loop.start(); }
  stop(): void { this.loop.stop(); }
  resize(w: number, h: number): void { this.stage.resize(w, h); }

  onPointer(x: number, y: number, w: number, h: number): void {
    const ndc = new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1);
    this.pointer.copy(ndc);
    this.pointerOn = true;
    this.ray.setFromCamera(this.pointer, this.stage.camera);
    const p = this.ray.ray.intersectPlane(this.plane, this.tmp);
    if (p) this.lookAt.copy(p);
  }

  onClick(x: number, y: number, w: number, h: number): void {
    const ndc = new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.stage.camera);
    for (const s of this.heroes) {
      const hit = this.ray.intersectObject(s.hero.handle.shell, false);
      if (hit.length > 0) { s.hero.hop(); return; }
    }
  }

  /** Deterministic pose for the verification shots. */
  freezeAt(t: number, gait: number): void {
    for (const s of this.heroes) {
      s.hero.setGait(gait);
      const steps = Math.round(t * 60);
      for (let i = 0; i < steps; i++) s.hero.update(1 / 60, null);
    }
  }
}

export function HeroPage() {
  const gait = useLab((s) => s.gait);
  const hideUi = useLab((s) => s.hideUi);
  const s = useLab();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => HERO_IDS, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const q = new URLSearchParams(location.search);
    const instance = new Lab(canvasRef.current);
    window.__lab = instance;

    useLab.getState().set('programs', instance.stage.renderer.info.programs?.length ?? 0);
    useLab.getState().set('status', `4 heroes built in ${Math.round(instance.setupMs)} ms`);

    instance.stage.watchContext(
      (m) => useLab.getState().set('status', m),
      () => useLab.getState().set('status', 'context restored'),
    );

    const onResize = () => {
      instance.resize(wrapRef.current?.clientWidth ?? window.innerWidth, wrapRef.current?.clientHeight ?? window.innerHeight);
    };
    onResize();
    window.addEventListener('resize', onResize);

    const onMove = (e: PointerEvent) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (r) instance.onPointer(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    };
    const onDown = (e: PointerEvent) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (r) instance.onClick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'h') useLab.getState().set('hideUi', !useLab.getState().hideUi);
      if (k >= '1' && k <= '4' && window.__lab) {
        const i = Number(k) - 1;
        const hero = window.__lab.heroes[i];
        if (hero) {
          const c = hero.hero.handle.group;
          instance.stage.controls.target.set(c.position.x, 0.62, 0);
          instance.stage.camera.position.set(c.position.x + 0.35, 0.86, 2.05);
        }
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);

    const statTimer = window.setInterval(() => {
      useLab.getState().setStats({ fps: stats.fps, ms: stats.ms, draws: stats.drawCalls, tris: stats.triangles });
      useLab.getState().set('programs', instance.stage.renderer.info.programs?.length ?? 0);
    }, 200);

    instance.start();
    document.getElementById('boot')?.remove();

    if (q.get('freeze') === '1') {
      const t = Number(q.get('t') ?? '1.4');
      const g = Number(q.get('gait') ?? '0.5');
      instance.stop();
      const steps = Math.round(t * 60);
      for (const h of instance.heroes) h.hero.setGait(g);
      for (let i = 0; i < steps; i++) {
        for (const h of instance.heroes) h.hero.update(1 / 60, null);
      }
      instance.stage.update(1 / 60);
      instance.stage.render(16.6);
      const cam = q.get('view');
      if (cam === 'pip' || cam === 'mochi' || cam === 'bop' || cam === 'zik') {
        const idx = HERO_IDS.indexOf(cam as HeroId);
        const h = instance.heroes[idx];
        if (h) {
          const g = h.hero.handle.group;
          g.updateMatrixWorld(true);
          const eye = new THREE.Vector3().setFromMatrixPosition(h.hero.handle.eyes[0].sclera.matrixWorld);
          const cam = q.get('cam') ?? 'three';
          const H = h.hero.handle.height;
          instance.stage.controls.target.set(h.x, H * 0.46, 0);
          if (cam === 'face') {
            instance.stage.controls.target.set(eye.x, eye.y - 0.03, eye.z + 0.20);
            instance.stage.camera.position.set(eye.x + 0.15, eye.y + 0.07, eye.z + 0.66);
            instance.stage.camera.lookAt(eye.x, eye.y - 0.03, eye.z + 0.20);
          } else if (cam === 'front') {
            instance.stage.camera.position.set(h.x, H * 0.50, 2.30);
            instance.stage.camera.lookAt(h.x, H * 0.46, 0);
          } else if (cam === 'side') {
            instance.stage.camera.position.set(h.x + 2.30, H * 0.50, 0.18);
            instance.stage.camera.lookAt(h.x, H * 0.46, 0);
          } else {
            instance.stage.camera.position.set(h.x + 0.95, H * 0.56, 2.10);
            instance.stage.camera.lookAt(h.x, H * 0.46, 0);
          }
          instance.stage.render(16.6);
        }
      }
      requestAnimationFrame(() => { window.__READY = true; });
    }

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.clearInterval(statTimer);
      instance.stop();
      instance.stage.dispose();
    };
  }, []);

  return (
    <div className={'hp-root' + (hideUi ? ' hideui' : '')} ref={wrapRef}>
      <canvas ref={canvasRef} className="hp-canvas" />
      <div className="hp-title">GOOBERS</div>
      <div className="hp-status">{s.status} · {s.programs} programs</div>
      <div className="hp-fps">{s.fps} fps · {s.ms.toFixed(2)} ms · {s.draws} draws · {(s.tris / 1000).toFixed(0)}k tris</div>
      <div className="hp-bar">
        <span>Gait</span>
        <input
          type="range" min={0} max={1} step={0.02} value={gait}
          onChange={(e) => useLab.getState().set('gait', Number(e.target.value))}
        />
        <span className="hp-val">{gait.toFixed(2)}</span>
        {ids.map((id, i) => <span key={id} className="hp-name">{i + 1} {HERO_NAMES[id]}</span>)}
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __lab?: Lab;
    __READY?: boolean;
  }
}

export { MAT };
