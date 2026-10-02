/**
 * save.ts: persistence for the World. One JSON record in localStorage.
 * Disabled under automation (navigator.webdriver) so watch.sh runs stay comparable.
 * ?fresh in the URL skips the restore; Shift+N wipes and starts a new island.
 */
import type { HeroDNA } from '../hero/dna';
import type { HeroId } from '../hero/types';

export const SAVE_KEY = 'goobers.save.v1';

export interface SavedCreature {
  hero: HeroId; dna: HeroDNA; seed: number;
  x: number; z: number; h: number;
  needs?: Record<string, number>;
}
export interface SaveFile { v: 1; build: string; seed: number; simTime: number; day: number; creatures: SavedCreature[] }

let wiping = false;

export function storageOK(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
    return true;
  } catch { return false; }
}

export function writeSave(json: string): void {
  if (wiping || !storageOK()) return;
  try { localStorage.setItem(SAVE_KEY, json); } catch { /* quota or private mode */ }
}

export function readSave(): SaveFile | null {
  if (!storageOK()) return null;
  try {
    if (typeof location !== 'undefined' && /[?&]fresh\b/.test(location.search)) return null;
    const t = localStorage.getItem(SAVE_KEY);
    if (!t) return null;
    const j = JSON.parse(t) as SaveFile;
    return j && j.v === 1 && Array.isArray(j.creatures) && j.creatures.length ? j : null;
  } catch { return null; }
}

export function clearSave(): void {
  wiping = true;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
