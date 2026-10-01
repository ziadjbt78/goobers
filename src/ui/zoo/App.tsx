/**
 * THE ZOO — the heredity layer, made visible.
 *
 * Every creature on this grid is a genome. Nothing here is modelled, textured
 * or painted by hand: the body, the palette, the proportions, the gait and the
 * face all come out of twenty-odd numbers run through the same builders the
 * hand-tuned heroes use. Reroll a cell and the animal changes while staying, by
 * construction, a valid one.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Stage } from '../../engine/scene/Stage';
import { Hero } from '../../engine/anim/Hero';
import { Loop } from '../../engine/core/loop';
import { buildMaterials } from '../../engine/render/hero/materials';
import { buildHero } from '../../engine/render/hero/HeroRenderer';
import { buildHeroTemplate } from '../../engine/hero/heroes';
import { applyDNA } from '../../engine/hero/reshape';
import { validateTemplate } from '../../engine/hero/validate';
import { scoreAppeal } from '../../engine/hero/appeal';
import { hexToLinear, paletteAt } from '../../engine/hero/palette';
import { randomDNA, mutate, mulberry32, dnaKey, type HeroDNA } from '../../engine/hero/dna';
import type { HeroId } from '../../engine/hero/types';
import { HERO_IDS } from '../../engine/hero/types';
import type { HeroTemplate } from '../../engine/hero/types';

const COLS = 4;
const ROWS = 2;
const COUNT = COLS * ROWS;
const SPACING_X = 1.86;
const SPACING_Z = 2.02;
const PEDESTAL = 0.70;

export interface CellMeta {
  key: string;
  hero: string;
  seed: number;
  palette: number;
  appeal: number;
  ok: boolean;
  failures: string[];
}

interface Cell {
  dna: HeroDNA;
  template: HeroTemplate;
  hero: Hero;
  x: number;
  z: number;
  meta: CellMeta;
}

export class Zoo {
  /** species forced by the picker; null = whatever the genome says */
  forceSpecies: HeroId | null = null;
  /** one big new creature lands in slot 0 */
  generate(): void {
    const i = 0;
    const hero = this.forceSpecies ?? HERO_IDS[Math.floor(this.rng() * HERO_IDS.length)];
    this.install(i, randomDNA(this.rng, hero));
  }

  readonly stage: Stage;
  readonly loop: Loop;
  readonly cells: Cell[] = [];
  setupMs = 0;
  private rng: () => number;

  constructor(canvas: HTMLCanvasElement, masterSeed: number) {
    buildMaterials();
    this.stage = new Stage(canvas);
    this.stage.setHome(new THREE.Vector3(0, 2.86, 7.35), new THREE.Vector3(0, 0.80, -0.10));
    this.rng = mulberry32(masterSeed);

    const t0 = performance.now();
    for (let i = 0; i < COUNT; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = (col - (COLS - 1) / 2) * SPACING_X;
      const z = (row - (ROWS - 1) / 2) * SPACING_Z;
      const hero = HERO_IDS[i % HERO_IDS.length];
      const dna = randomDNA(this.rng, hero);
      this.cells.push({ dna, template: null as never, hero: null as never, x, z, meta: null as never });
      this.install(i, dna);
    }
    this.setupMs = performance.now() - t0;

    this.loop = new Loop(
      (dt) => {
        for (const c of this.cells) {
          c.hero.setGait(0.45);
          c.hero.update(dt, null);
        }
      },
      (_a, dt) => {
        this.stage.update(dt);
        this.stage.render(dt * 1000);
      },
      30,
    );
  }

  /** Breed one cell into a fresh genome, or reseed it entirely. */
  reroll(i: number, fresh = true): void {
    const prev = this.cells[i];
    const dna = fresh && this.rng() < 0.55
      ? randomDNA(this.rng, prev.dna.hero)
      : mutate(prev.dna, this.rng, 1);
    this.install(i, dna);
  }

  rerollAll(fresh = false): void {
    for (let i = 0; i < COUNT; i++) this.reroll(i, fresh);
  }

  meta(): CellMeta[] {
    return this.cells.map((c) => ({ ...c.meta, failures: [...c.meta.failures] }));
  }

  /** Build (or rebuild) one cell: genome -> rig -> appeal score. */
  private install(i: number, dna: HeroDNA): void {
    const cell = this.cells[i];
    if (cell.hero) {
      this.stage.scene.remove(cell.hero.handle.group);
      cell.hero.handle.dispose();
    }
    const pal = paletteAt(dna.palette);
    // the builders want LINEAR rgb triples; buildHero wants the hex strings.
    // Passing hex here writes "#" into the colour buffer and every body renders
    // black, which is exactly what the first zoo shot caught.
    const colors = {
      base: hexToLinear(pal.base),
      belly: hexToLinear(pal.belly),
      limb: hexToLinear(pal.limb),
      accent: hexToLinear(pal.accent),
      deep: hexToLinear(pal.deep),
    };
    const template = applyDNA(buildHeroTemplate(dna.hero, colors), dna);
    const handle = buildHero(template, pal);
    handle.group.position.set(cell.x, 0, cell.z);
    this.stage.scene.add(handle.group);

    const v = validateTemplate(template);
    const a = scoreAppeal(template, v, pal);

    cell.dna = dna;
    cell.template = template;
    cell.hero = new Hero(template, handle);
    cell.meta = {
      key: dnaKey(dna),
      hero: template.name,
      seed: dna.seed,
      palette: dna.palette,
      appeal: Math.round(a.score),
      ok: v.ok,
      failures: v.failures,
    };

    const tint = new THREE.Color(pal.base).multiplyScalar(0.85);
    if (this.stage.pedestalCount() <= i) this.stage.addPedestal(cell.x, cell.z, PEDESTAL, tint);
    else this.stage.setPedestalTint(i, tint.clone().multiplyScalar(0.9));
  }

  start(): void { this.loop.start(); }
  stop(): void { this.loop.stop(); }

  /** Deterministic pose for the verification shots. */
  freeze(t: number): void {
    this.stop();
    const steps = Math.round(t * 60);
    for (let i = 0; i < steps; i++) for (const c of this.cells) c.hero.update(1 / 60, null);
    this.stage.update(1 / 60);
    this.stage.render(16.6);
  }
}

export function ZooPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const zooRef = useRef<Zoo | null>(null);
  const [cells, setCells] = useState<CellMeta[]>([]);
  const [status, setStatus] = useState('building genomes…');
  const [hideUi, setHideUi] = useState(false);
  const [, setGen] = useState(0);
  const [species, setSpecies] = useState<HeroId | 'random'>('random');

  useEffect(() => {
    if (!canvasRef.current) return;
    const q = new URLSearchParams(location.search);
    const seed = Number(q.get('seed') ?? '20261001');
    const zoo = new Zoo(canvasRef.current, seed);
    zooRef.current = zoo;
    (window as unknown as { __lab: Zoo }).__lab = zoo;
    setCells(zoo.meta());
    setStatus(`${COUNT} genomes · seed ${seed} · built in ${Math.round(zoo.setupMs)} ms`);

    const onResize = () => zoo.stage.resize(wrapRef.current?.clientWidth ?? 1280, wrapRef.current?.clientHeight ?? 720);
    onResize();
    window.addEventListener('resize', onResize);

    const refresh = () => { setCells(zoo.meta()); setGen((g) => g + 1); };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'h') setHideUi((v) => !v);
      if (k === 'r') { zoo.rerollAll(false); refresh(); }
    };
    window.addEventListener('keydown', onKey);

    const onClick = (e: PointerEvent) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (!r) return;
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, zoo.stage.camera);
      for (let i = 0; i < zoo.cells.length; i++) {
        if (ray.intersectObject(zoo.cells[i].hero.handle.shell, false).length) {
          zoo.reroll(i, false);
          refresh();
          return;
        }
      }
    };
    window.addEventListener('pointerdown', onClick);

    document.getElementById('boot')?.remove();
    zoo.forceSpecies = null;
    if (q.get('freeze') === '1') {
      zoo.freeze(Number(q.get('t') ?? '1.4'));
      if (q.get('cam') === 'close') {
        const c = zoo.cells[0];
        zoo.stage.camera.position.set(c.x + 0.30, 0.74, c.z + 1.94);
        zoo.stage.controls.target.set(c.x, 0.50, c.z);
        zoo.stage.camera.lookAt(c.x, 0.50, c.z);
        zoo.stage.render(16.6);
      }
      requestAnimationFrame(() => { (window as unknown as { __READY: boolean }).__READY = true; });
    } else {
      zoo.start();
    }

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onClick);
      zoo.stop();
    };
  }, []);

  return (
    <div className="zoo-root" ref={wrapRef}>
      <canvas className="zoo-canvas" ref={canvasRef} />
      {!hideUi && (
        <>
          <header className="zoo-head">
            <h1>GOOBERS · ZOO</h1>
            <p>{status}</p>
          </header>
          <aside className="zoo-panel">
            <div className="zoo-row zoo-row-h">
              <span>#</span><span>species</span><span>seed</span><span>app</span>
            </div>
            {cells.map((c, i) => (
              <button
                className="zoo-row"
                key={i}
                onClick={() => { zooRef.current?.reroll(i, false); if (zooRef.current) setCells(zooRef.current.meta()); setGen((g) => g + 1); }}
              >
                <span className="zoo-dim">{String(i + 1).padStart(2, '0')}</span>
                <span>{c.hero}</span>
                <span className="zoo-dim">{c.seed}</span>
                <span className={c.appeal >= 75 ? 'zoo-good' : c.appeal >= 60 ? 'zoo-mid' : 'zoo-low'}>{c.appeal}</span>
              </button>
            ))}
            {!cells.some((c) => !c.ok)
              ? <p className="zoo-note zoo-good">all rigs valid</p>
              : <p className="zoo-note zoo-low">invalid rig present — run tools/zooTest</p>}
            <div className="zoo-species">
              <button className={species === 'random' ? 'zoo-chip zoo-chip-on' : 'zoo-chip'} onClick={() => { setSpecies('random'); if (zooRef.current) zooRef.current.forceSpecies = null; }}>Random</button>
              {HERO_IDS.map((h) => (
                <button key={h} className={species === h ? 'zoo-chip zoo-chip-on' : 'zoo-chip'} onClick={() => { setSpecies(h); if (zooRef.current) zooRef.current.forceSpecies = h; }}>{h.toUpperCase()}</button>
              ))}
            </div>
            <button className="zoo-action zoo-generate" onClick={() => { zooRef.current?.generate(); if (zooRef.current) setCells(zooRef.current.meta()); setGen((g) => g + 1); }}>
              Generate
            </button>
            <button className="zoo-action" onClick={() => { zooRef.current?.rerollAll(false); if (zooRef.current) setCells(zooRef.current.meta()); setGen((g) => g + 1); }}>
              Reroll all
            </button>
            <p className="zoo-hint">click a creature to reroll it · <b>R</b> rerolls all · <b>H</b> hides this panel</p>
          </aside>
        </>
      )}
    </div>
  );
}
