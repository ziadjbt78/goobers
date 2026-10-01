import * as THREE from 'three';

/** The four hand-tuned hero templates. */
export type HeroId = 'pip' | 'mochi' | 'bop' | 'zik';

export const HERO_IDS: HeroId[] = ['pip', 'mochi', 'bop', 'zik'];

export const HERO_NAMES: Record<HeroId, string> = {
  pip: 'PIP',
  mochi: 'MOCHI',
  bop: 'BOP',
  zik: 'ZIK',
};

/** Declared shape family of a part, used for the automated embedding test. */
export type ProxyKind = 'ellipsoid' | 'box' | 'capsule';

export interface PartProxy {
  kind: ProxyKind;
  /** semi-axes in the part's own local space */
  half: [number, number, number];
}

export interface HeroBoneDef {
  name: string;
  parent: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

export type PartRole = 'body' | 'head' | 'limb' | 'limbTip' | 'detail' | 'face';

export interface HeroPartDef {
  name: string;
  /** geometry in the part's own local space */
  geo: THREE.BufferGeometry;
  /** index of the bone this part is rigidly welded to */
  bone: number;
  /** transform from the bone's rest frame into the part's local space */
  matrix: THREE.Matrix4;
  /** flat authored vertex colour before the belly / accent pass */
  color: [number, number, number];
  /** how far the outline colour is darkened from the part colour, 0..1 */
  outlineDark: number;
  role: PartRole;
  /** radius of the rounded end at the part's own pivot (limbs only) */
  rootRadius: number;
  proxy: PartProxy;
  /** true for the dominant mass in each size tier */
  hero?: boolean;
}

export interface FootDef {
  /** bone of the limb tip (the shoe is welded here) */
  bone: number;
  /** index of the leg chain bones, root first: [hip, knee, ankle] */
  chain: [number, number, number];
  /** creature-space rest position of the planted point */
  plant: THREE.Vector3;
  /** step length along +Z */
  step: number;
  /** lift height during the swing phase */
  lift: number;
  /** 0..1 phase offset around the gait cycle */
  phase: number;
  side: number;
}

export interface EyeDef {
  /** creature-space anchor on the surface of the head */
  anchor: THREE.Vector3;
  /** outward unit direction */
  dir: THREE.Vector3;
  /** eye radius before the 0.6 depth flattening */
  radius: number;
  side: number;
}

export interface ExpressionSpec {
  /** neutral mouth width as a fraction of head width */
  mouthWidth: number;
  /** creature-space mouth centre */
  mouthCenter: THREE.Vector3;
  /** creature-space blush centres, one per cheek */
  blush: THREE.Vector3[];
  /** creature-space brow centres, one per eye */
  brows: THREE.Vector3[];
}

export interface HeroTemplate {
  id: HeroId;
  name: string;
  bones: HeroBoneDef[];
  parts: HeroPartDef[];
  eyes: EyeDef[];
  feet: FootDef[];
  expression: ExpressionSpec;
  /** index of the body bone that carries bob / lean / squash */
  bodyBone: number;
  headBone: number;
  /** overall creature height, used for framing */
  height: number;
  /** half-extent of the whole creature, used for framing */
  radius: number;
  /** per-hero locomotion */
  locomotion: 'walk' | 'hop' | 'skitter';
}

/** Layout variation applied inside a template's safe ranges (never breaks art direction). */
export interface HeroVariant {
  /** uniform size multiplier, clamped to 0.8 .. 1.2 */
  scale: number;
  paletteIndex: number;
  earStyle: number;
  tailStyle: number;
  antennaStyle: number;
}
