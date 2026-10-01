/**
 * Hero — historical name for the one animation pipeline.
 *
 * The implementation now lives in `HeroAnimator.ts`. This shim exists so every
 * existing call site (heroes, zoo, studio, agent) keeps working while there is
 * exactly ONE animator in the codebase.
 */
export { HeroAnimator, ACTION_MIN } from './HeroAnimator';
export type { Mood, ActionId, Drive } from './HeroAnimator';

import { HeroAnimator } from './HeroAnimator';
/** @deprecated use HeroAnimator — same class, clearer name. */
export const Hero = HeroAnimator;
/** Type position too, so `let h: Hero` keeps compiling. */
export type Hero = HeroAnimator;
