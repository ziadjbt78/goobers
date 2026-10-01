/**
 * THE WORLD — the playable page.
 *
 * Everything the player can do goes through the toolbar at the bottom. The
 * simulation lives in Sim; this file is the hands.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Sim, type Tool } from '../../engine/world/Sim';
import { stats } from '../../engine/core/stats';
import { HERO_IDS, type HeroId } from '../../engine/hero/types';
import { ACTION_LABEL } from '../../engine/brain/Brain';
import type { Agent } from '../../engine/agent/Agent';

const TOOLS: { id: Tool; key: string; icon: string; label: string; hint: string }[] = [
  { id: 'spawn', key: '1', icon: '\u{1F331}', label: 'Spawn', hint: 'pick a species, then click the ground' },
  { id: 'call', key: '2', icon: '\u{1F4E3}', label: 'Call', hint: 'click the ground — nearby creatures react' },
  { id: 'feed', key: '3', icon: '\u{1FAD0}', label: 'Feed', hint: 'drop a berry — the nearest creature eats' },
  { id: 'ball', key: '4', icon: '\u26BD', label: 'Ball', hint: 'throw the ball to a spot' },
  { id: 'pet', key: '5', icon: '\u{1F450}', label: 'Pet', hint: 'hold the click on a creature — hold 2s to roll it over' },
  { id: 'carry', key: '6', icon: '\u{1F44C}', label: 'Pick up', hint: 'click a creature, fling it, click again to drop' },
  { id: 'inspect', key: '7', icon: '\u{1F50D}', label: 'Inspect', hint: 'click a creature — camera flies in; Esc releases' },
];

interface Card {
  name: string;
  species: string;
  action: string;
  mood: string;
  needs: { hunger: number; energy: number; social: number; fun: number };
  friends: number;
  liked: number;
}

export function WorldPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const [tool, setTool] = useState<Tool>('spawn');
  const [species, setSpecies] = useState<HeroId | 'random'>('random');
  const [card, setCard] = useState<Card | null>(null);
  const [status, setStatus] = useState('loading the island…');
  const [hideUi, setHideUi] = useState(false);
  const [paused, setPaused] = useState(false);
  const ray = useRef(new THREE.Raycaster());
  const [simDone, setSimDone] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const q = new URLSearchParams(location.search);
    const seed = Number(q.get('seed') ?? '20261001');
    const sim = new Sim(canvasRef.current, seed);
    simRef.current = sim;
    sim.tool = 'spawn';
    setStatus('8 creatures living here · seed ' + seed);
    if (tagsRef.current) sim.attachTags(tagsRef.current);

    const resize = () => sim.stage.resize(canvasRef.current?.clientWidth ?? 1280, canvasRef.current?.clientHeight ?? 720);
    resize();
    window.addEventListener('resize', resize);

    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const t = TOOLS.find((x) => x.key === k);
      if (t) { setTool(t.id); sim.tool = t.id; }
      if (k === 'Escape') { sim.endInspect(); setCard(null); }
      if (k === 'h') setHideUi((v) => !v);
      if (k === ' ') { e.preventDefault(); setPaused((p) => { if (p) sim.start(); else sim.stop(); return !p; }); }
    };
    window.addEventListener('keydown', onKey);

    // ---- pointer: raycast the ground and the creatures ---------------------
    const ndcOf = (e: PointerEvent): THREE.Vector2 => {
      const r = canvasRef.current?.getBoundingClientRect();
      return new THREE.Vector2(
        (((e.clientX - (r?.left ?? 0)) / (r?.width ?? 1)) * 2) - 1,
        -(((e.clientY - (r?.top ?? 0)) / (r?.height ?? 1)) * 2) + 1,
      );
    };
    const groundAt = (ndc: THREE.Vector2): THREE.Vector3 | null => {
      ray.current.setFromCamera(ndc, sim.stage.camera);
      const terrain = sim.stage.scene.getObjectByName('terrain');
      if (!terrain) return null;
      const hit = ray.current.intersectObject(terrain, false)[0];
      return hit ? hit.point.clone() : null;
    };
    const creatureAt = (ndc: THREE.Vector2): Agent | null => {
      ray.current.setFromCamera(ndc, sim.stage.camera);
      return sim.pick(ray.current);
    };

    let down = false;
    // pointer velocity, so a fling throws the creature rather than dropping it
    const prev = { x: 0, y: 0, t: 0 };
    const vel = new THREE.Vector3();
    const onDown = (e: PointerEvent) => {
      const ndc = ndcOf(e);
      const a = creatureAt(ndc);
      down = true;
      prev.x = e.clientX; prev.y = e.clientY; prev.t = performance.now();
      vel.set(0, 0, 0);
      switch (sim.tool) {
        case 'pet': if (a) sim.pet(a); break;
        case 'carry': {
          if (sim.carried) sim.drop(groundAt(ndc) ?? undefined);
          else if (a) sim.pickUp(a);
          break;
        }
        case 'inspect': {
          if (a) {
            sim.inspect(a);
            const b = sim.brains.get(a.id);
            setCard({
              name: a.name, species: a.template.name,
              action: ACTION_LABEL[sim.actionOf(a) ?? 'wander'],
              mood: a.mood,
              needs: b ? { ...b.needs } : { hunger: 0, energy: 0, social: 0, fun: 0 },
              friends: b ? [...b.likes.values()].filter((v) => v > 0.62).length : 0,
              liked: b ? b.likes.size : 0,
            });
          }
          break;
        }
        case 'call': { const g = groundAt(ndc); if (g) sim.call(g); break; }
        case 'feed': { const g = groundAt(ndc); if (g) sim.dropBerry(g); break; }
        case 'ball': { const g = groundAt(ndc); if (g) sim.throwBall(g); break; }
        default: {
          if (sim.tool === 'spawn') {
            const g = groundAt(ndc);
            if (g) {
              const hero = species === 'random'
                ? HERO_IDS[Math.floor(Math.random() * HERO_IDS.length)]
                : species;
              sim.spawn(hero, g);
            }
          }
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const dt = Math.max(0.001, (now - prev.t) / 1000);
      if (down) {
        vel.set((e.clientX - prev.x) / dt * 0.012, 0, (e.clientY - prev.y) / dt * 0.012);
        vel.clampLength(0, 6);
        sim.setCarryVelocity(vel);
      }
      prev.x = e.clientX; prev.y = e.clientY; prev.t = now;
      if (sim.tool === 'pet' && down) {
        const g = groundAt(ndcOf(e));
        if (g) sim.aimPet(g);
        const a = creatureAt(ndcOf(e));
        if (a && a !== sim.petting) sim.pet(a);
      }
    };
    const onUp = () => { down = false; if (sim.tool === 'pet') sim.endPet(); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    stats.visible = true;
    stats.toggle();
    stats.toggle();

    if (q.get('sim') === '1') {
      try {
        sim.stop();
        sim.headlessRun(Number(q.get('seconds') ?? '60'));
        sim.drainBrainEvents();
        const summary = sim.summary();
        const payload = {
          seconds: 60,
          creatures: sim.agents.length,
          events: sim.events.length,
          summary,
          log: sim.events,
          creatures_state: sim.agents.map((a) => ({
            name: a.name,
            species: a.template.name,
            action: String(sim.actionOf(a) ?? 'wander'),
            mood: a.mood,
            pos: [Number(a.pos.x.toFixed(2)), Number(a.pos.y.toFixed(2)), Number(a.pos.z.toFixed(2))],
          })),
        };
        (window as unknown as { __sim: unknown }).__sim = payload;
        setSimDone({ summary, events: sim.events.length, creatures: sim.agents.length });
      } catch (err) {
        (window as unknown as { __simError: string }).__simError = String((err && (err as Error).stack) || err);
      }
      (window as unknown as { __lab: Sim }).__lab = sim;
      requestAnimationFrame(() => { (window as unknown as { __READY: boolean }).__READY = true; });
    } else {
      sim.start();
      (window as unknown as { __lab: Sim }).__lab = sim;
      document.getElementById('boot')?.remove();
      requestAnimationFrame(() => { (window as unknown as { __READY: boolean }).__READY = true; });
    }

    // ---- name tags + inspect fly-in on a light timer ------------------------
    const camTimer = window.setInterval(() => {
      sim.tickUi(sim.stage.camera, 0.05);
      const a = sim.follow;
      if (!a) return;
      const b = sim.brains.get(a.id);
      if (b) {
        setCard((c) => (c ? {
          ...c,
          action: ACTION_LABEL[sim.actionOf(a) ?? 'wander'],
          mood: a.mood,
          needs: { ...b.needs },
          friends: [...b.likes.values()].filter((v) => v > 0.62).length,
        } : c));
      }
    }, 50);

    const camUpdater = window.setInterval(() => sim.updateCarried(sim.stage.camera), 16);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.clearInterval(camTimer);
      window.clearInterval(camUpdater);
      sim.stop();
    };
  }, []);

  const simSummary = (simDone?.summary ?? null) as Record<string, number> | null;

  return (
    <div className="w-root">
      <canvas className="w-canvas" ref={canvasRef} />
      <div className="w-tags" ref={tagsRef} />
      {!hideUi && (
        <>
          <header className="w-head">
            <h1>GOOBERS · WORLD</h1>
            <p>{status}</p>
          </header>

          {tool === 'spawn' && (
            <div className="w-species">
              <button className={species === 'random' ? 'w-chip w-chip-on' : 'w-chip'} onClick={() => setSpecies('random')}>Random</button>
              {HERO_IDS.map((h) => (
                <button key={h} className={species === h ? 'w-chip w-chip-on' : 'w-chip'} onClick={() => setSpecies(h)}>{h.toUpperCase()}</button>
              ))}
            </div>
          )}

          {card && (
            <aside className="w-card">
              <h2>{card.name}</h2>
              <p className="w-card-sub">{card.species} · {card.mood} · {card.action}</p>
              {(['hunger', 'energy', 'social', 'fun'] as const).map((k) => (
                <div className="w-bar" key={k}>
                  <span>{k}</span>
                  <i><b style={{ width: `${Math.round(card.needs[k] * 100)}%` }} /></i>
                </div>
              ))}
              <p className="w-card-foot">{card.friends} friend{card.friends === 1 ? '' : 's'} · knows {card.liked} creatures</p>
              <p className="w-card-foot">Esc releases the camera</p>
            </aside>
          )}

          {simSummary && (
            <aside className="w-simlog">
              <h2>60 s acceptance run</h2>
              {Object.entries(simSummary).map(([k, v]) => <p key={k}><b>{v}</b> {k}</p>)}
            </aside>
          )}

          <div className="w-tools">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`w-tool${tool === t.id ? ' w-tool-on' : ''}`}
                title={`${t.hint}  (${t.key})`}
                onClick={() => { setTool(t.id); if (simRef.current) simRef.current.tool = t.id; }}
              >
                <em>{t.icon}</em>
                <span>{t.label}</span>
                <kbd>{t.key}</kbd>
              </button>
            ))}
            <div className="w-sep" />
            <button className="w-tool" title="pause / resume (space)" onClick={() => {
              const s = simRef.current;
              if (!s) return;
              setPaused((p) => { if (p) s.start(); else s.stop(); return !p; });
            }}>
              <em>{paused ? '\u25B6' : '\u23F8'}</em>
              <span>{paused ? 'Resume' : 'Pause'}</span>
              <kbd>spc</kbd>
            </button>
          </div>
          <p className="w-hint">1–7 tools · click the ground or a creature · drag to orbit · wheel to zoom · right-drag to pan · <b>Esc</b> releases the camera · <b>H</b> hides the UI · <b>`</b> stats</p>
        </>
      )}
    </div>
  );
}
