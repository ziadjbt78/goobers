/**
 * HEREDITY. A creature is a genome, not a hand-authored model.
 *
 * Every gene moves inside a range the art-direction bible already proved safe,
 * so any genome in the space is a valid, cute creature by construction; the
 * validator then re-checks the built rig rather than trusting that claim.
 */
import { HERO_IDS, type HeroId } from './types';

/** Deterministic PRNG. Same seed, same creature, on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HeroDNA {
  version: 1;
  hero: HeroId;
  seed: number;
  /** index into the 12 curated palettes */
  palette: number;
  /** uniform overall size */
  scale: number;
  /** head subtree scale, about the head bone */
  headSize: number;
  /** eyeball scale inside the 0.24-0.32 band */
  eyeSize: number;
  /** leg chain scale, about the hip. >= 1 only: legs grow, never shrink */
  legLen: number;
  /** body girth on x/z */
  girth: number;
  /** 0..2 shape style for the ear / tail / antenna details */
  earStyle: number;
  tailStyle: number;
  antStyle: number;
  /** 0..1 personality axes — behaviour, not anatomy */
  bold: number;
  curious: number;
  sociable: number;
  playful: number;
  lazy: number;
  /** metres per second at full walk */
  speed: number;
}

export interface GeneRange { min: number; max: number }

/** The safe range of every gene. Nothing may be authored outside these. */
export const GENE: Record<'scale' | 'headSize' | 'eyeSize' | 'legLen' | 'girth', GeneRange> = {
  scale: { min: 0.86, max: 1.18 },
  headSize: { min: 0.90, max: 1.14 },
  eyeSize: { min: 0.92, max: 1.10 },
  legLen: { min: 1.0, max: 1.12 },
  girth: { min: 0.95, max: 1.07 },
};

/** Detail-group scale per style index: a real silhouette change, never a stretch. */
export const DETAIL_SCALE = [0.82, 1.0, 1.18];

function clamp(v: number, r: GeneRange): number {
  return Math.min(r.max, Math.max(r.min, v));
}

const lerp = (r: GeneRange, u: number): number => r.min + (r.max - r.min) * u;

export function randomDNA(rng: () => number, hero: HeroId, seed = Math.floor(rng() * 1e9)): HeroDNA {
  return {
    version: 1,
    hero,
    seed,
    palette: Math.floor(rng() * 12) % 12,
    scale: lerp(GENE.scale, rng()),
    headSize: lerp(GENE.headSize, rng()),
    eyeSize: lerp(GENE.eyeSize, rng()),
    legLen: lerp(GENE.legLen, rng()),
    girth: lerp(GENE.girth, rng()),
    earStyle: Math.floor(rng() * 3) % 3,
    tailStyle: Math.floor(rng() * 3) % 3,
    antStyle: Math.floor(rng() * 3) % 3,
    bold: rng(),
    curious: rng(),
    sociable: rng(),
    playful: rng(),
    lazy: rng(),
    speed: 0.85 + rng() * 0.85,
  };
}

/** Breed: clone a parent with `amount` of drift. Used by the Reroll path. */
export function mutate(parent: HeroDNA, rng: () => number, amount = 1): HeroDNA {
  const g = (r: GeneRange, v: number): number => clamp(v + (rng() - 0.5) * (r.max - r.min) * 0.9 * amount, r);
  return {
    ...parent,
    seed: Math.floor(rng() * 1e9),
    palette: rng() < 0.45 ? Math.floor(rng() * 12) % 12 : parent.palette,
    scale: g(GENE.scale, parent.scale),
    headSize: g(GENE.headSize, parent.headSize),
    eyeSize: g(GENE.eyeSize, parent.eyeSize),
    legLen: g(GENE.legLen, parent.legLen),
    girth: g(GENE.girth, parent.girth),
    earStyle: rng() < 0.4 ? Math.floor(rng() * 3) % 3 : parent.earStyle,
    tailStyle: rng() < 0.4 ? Math.floor(rng() * 3) % 3 : parent.tailStyle,
    antStyle: rng() < 0.4 ? Math.floor(rng() * 3) % 3 : parent.antStyle,
    bold: 0.5 + (parent.bold - 0.5) * 0.8 + (rng() - 0.5) * 0.4,
    curious: 0.5 + (parent.curious - 0.5) * 0.8 + (rng() - 0.5) * 0.4,
    sociable: 0.5 + (parent.sociable - 0.5) * 0.8 + (rng() - 0.5) * 0.4,
    playful: 0.5 + (parent.playful - 0.5) * 0.8 + (rng() - 0.5) * 0.4,
    lazy: 0.5 + (parent.lazy - 0.5) * 0.8 + (rng() - 0.5) * 0.4,
    speed: Math.min(1.85, Math.max(0.7, parent.speed + (rng() - 0.5) * 0.5)),
  };
}

/** A stable one-line fingerprint, handy in logs and in the swarm grid. */
export function dnaKey(d: HeroDNA): string {
  return [
    d.hero,
    d.seed,
    `p${d.palette}`,
    d.scale.toFixed(3),
    d.headSize.toFixed(3),
    d.eyeSize.toFixed(3),
    d.legLen.toFixed(3),
    d.girth.toFixed(3),
    `e${d.earStyle}t${d.tailStyle}a${d.antStyle}`,
    `v${d.speed.toFixed(2)}`,
  ].join('|');
}

/** One genome for every hero, from one master seed. */
export function litter(masterSeed: number): HeroDNA[] {
  const rng = mulberry32(masterSeed);
  return HERO_IDS.map((h) => randomDNA(mulberry32(Math.floor(rng() * 1e9)), h));
}
