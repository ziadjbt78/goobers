/**
 * STUDIO-LITE — one creature, big, with its genome on five sliders.
 * The same ladder the zoo uses, pointed at a single animal.
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
import { randomDNA, mulberry32, type HeroDNA } from '../../engine/hero/dna';
import { HERO_IDS, type HeroId } from '../../engine/hero/types';

const SLIDERS = [
  { key: 'scale', label: 'size', min: 0.86, max: 1.18 },
  { key: 'headSize', label: 'head', min: 0.90, max: 1.14 },
  { key: 'eyeSize', label: 'eyes', min: 0.92, max: 1.10 },
  { key: 'legLen', label: 'legs', min: 1.0, max: 1.12 },
  { key: 'girth', label: 'girth', min: 0.95, max: 1.07 },
] as const;

export function StudioPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const loopRef = useRef<Loop | null>(null);
  const heroRef = useRef<Hero | null>(null);
  const rngRef = useRef(mulberry32(0x51d3));
  const [dna, setDna] = useState<HeroDNA>(() => randomDNA(mulberry32(0x51d3), 'pip'));
  const [appeal, setAppeal] = useState(0);
  const [ok, setOk] = useState(true);
  const [hideUi, setHideUi] = useState(false);

  // ---- stage, once --------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current) return;
    buildMaterials();
    const stage = new Stage(canvasRef.current);
    stage.setHome(new THREE.Vector3(0.9, 1.35, 3.05), new THREE.Vector3(0, 0.58, 0));
    stageRef.current = stage;
    loopRef.current = new Loop(
      () => undefined,
      (_a, dt) => {
        heroRef.current?.setGait(0.35);
        heroRef.current?.update(dt, null);
        stage.update(dt);
        stage.render(dt * 1000);
      },
      30,
    );
    loopRef.current.start();
    document.getElementById('boot')?.remove();
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'h') setHideUi((v) => !v); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); loopRef.current?.stop(); stage.dispose(); };
  }, []);

  // ---- rebuild whenever the genome changes --------------------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (heroRef.current) {
      stage.scene.remove(heroRef.current.handle.group);
      heroRef.current.handle.dispose();
    }
    const pal = paletteAt(dna.palette);
    const colors = {
      base: hexToLinear(pal.base), belly: hexToLinear(pal.belly), limb: hexToLinear(pal.limb),
      accent: hexToLinear(pal.accent), deep: hexToLinear(pal.deep),
    };
    const template = applyDNA(buildHeroTemplate(dna.hero, colors), dna);
    const handle = buildHero(template, pal);
    stage.scene.add(handle.group);
    heroRef.current = new Hero(template, handle);
    const v = validateTemplate(template);
    setAppeal(Math.round(scoreAppeal(template, v, pal).score));
    setOk(v.ok);
    stage.addPedestal(0, 0, 0.86, new THREE.Color(pal.base).multiplyScalar(0.85));
    stage.setPedestalTint(stage.pedestalCount() - 1, new THREE.Color(pal.base).multiplyScalar(0.78));
  }, [dna]);

  const reroll = (hero?: HeroId): void => {
    setDna(randomDNA(rngRef.current, hero ?? dna.hero));
  };

  return (
    <div className="st-root">
      <canvas className="st-canvas" ref={canvasRef} />
      {!hideUi && (
        <>
          <header className="st-head">
            <h1>GOOBERS · STUDIO-LITE</h1>
            <p>{dna.hero.toUpperCase()} · seed {dna.seed} · appeal {appeal}{ok ? '' : ' · RIG INVALID'}</p>
          </header>
          <aside className="st-panel">
            <div className="st-species">
              {HERO_IDS.map((h) => (
                <button key={h} className={dna.hero === h ? 'st-chip st-chip-on' : 'st-chip'} onClick={() => reroll(h)}>{h}</button>
              ))}
            </div>
            {SLIDERS.map((s) => (
              <label className="st-slider" key={s.key}>
                <span>{s.label}</span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={0.005}
                  value={dna[s.key]}
                  onChange={(e) => setDna({ ...dna, [s.key]: Number(e.target.value) })}
                />
                <b>{dna[s.key].toFixed(2)}</b>
              </label>
            ))}
            <label className="st-slider">
              <span>palette</span>
              <input
                type="range" min={0} max={11} step={1}
                value={dna.palette}
                onChange={(e) => setDna({ ...dna, palette: Number(e.target.value) })}
              />
              <b>{paletteAt(dna.palette).name}</b>
            </label>
            <button className="st-action" onClick={() => reroll()}>New genome</button>
            <p className="st-hint">drag to orbit · wheel to zoom</p>
          </aside>
        </>
      )}
    </div>
  );
}
