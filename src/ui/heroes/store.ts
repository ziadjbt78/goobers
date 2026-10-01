import { create } from 'zustand';

export interface LabState {
  gait: number;
  hideUi: boolean;
  fps: number;
  ms: number;
  draws: number;
  tris: number;
  programs: number;
  status: string;
  set: <K extends keyof LabState>(k: K, v: LabState[K]) => void;
  setStats: (s: { fps: number; ms: number; draws: number; tris: number }) => void;
}

export const useLab = create<LabState>((set) => ({
  gait: 0.5,
  hideUi: false,
  fps: 0,
  ms: 0,
  draws: 0,
  tris: 0,
  programs: 0,
  status: 'building',
  set: (k, v) => set({ [k]: v } as never),
  setStats: (s) => set(s),
}));
