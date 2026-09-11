/**
 * Global UI state.
 *
 * Deliberately small: the marker position, the playback state and the two
 * display toggles. Everything else (phases, fractions, microstructure, cooling
 * path) is *derived* from carbon + temperature, so there is no way for the
 * panels to disagree with each other.
 */

import { create } from 'zustand';
import { C_MAX, C_MIN, ROOM_T, T_MAX } from '../domain/constants';
import { clamp } from '../domain/curves';
import type { PresetId } from '../domain/alloys';
import type { InfoKey } from '../domain/annotations';
import type { Language } from '../i18n';
import type { ThemeMode } from '../theme/palette';

export type Playback = 'idle' | 'playing' | 'paused';

export type { InfoKey };

export interface AppState {
  language: Language;
  theme: ThemeMode;
  /** Marker composition, wt% C. */
  carbon: number;
  /** Marker temperature, degC. */
  temperature: number;
  /** Pointer read-out, null when the pointer is outside the plot. */
  hover: { c: number; T: number } | null;
  /** Which preset chip is active (cleared as soon as the marker moves). */
  preset: PresetId | null;
  playback: Playback;
  /** Normalised position along the cooling curve, 0..1. */
  progress: number;
  speed: number;
  /** Expanded info card, or null. */
  info: InfoKey | null;
  /** Guided tour step, or null when the tour is not running. */
  tourStep: number | null;

  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  setCarbon: (c: number) => void;
  setTemperature: (T: number) => void;
  setPoint: (c: number, T: number) => void;
  setHover: (hover: { c: number; T: number } | null) => void;
  applyPreset: (id: PresetId, c: number, T: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setProgress: (progress: number, temperature: number) => void;
  setSpeed: (speed: number) => void;
  setInfo: (info: InfoKey | null) => void;
  startTour: () => void;
  setTourStep: (step: number | null) => void;
}

const initialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem('fe-c-theme');
  return stored === 'light' ? 'light' : 'dark';
};

const initialLanguage = (): Language => {
  if (typeof window === 'undefined') return 'sv';
  const stored = window.localStorage.getItem('fe-c-lang');
  if (stored === 'sv' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('sv') ? 'sv' : 'en';
};

export const useAppStore = create<AppState>((set) => ({
  language: initialLanguage(),
  theme: initialTheme(),
  carbon: 0.45,
  temperature: 400,
  hover: null,
  preset: '1045',
  playback: 'idle',
  progress: 0,
  speed: 1,
  info: null,
  tourStep: null,

  setLanguage: (language) => {
    window.localStorage.setItem('fe-c-lang', language);
    set({ language });
  },
  setTheme: (theme) => {
    window.localStorage.setItem('fe-c-theme', theme);
    set({ theme });
  },
  setCarbon: (c) =>
    set({ carbon: clamp(c, C_MIN, C_MAX), preset: null, playback: 'idle', progress: 0 }),
  setTemperature: (T) => set({ temperature: clamp(T, ROOM_T, T_MAX), playback: 'idle' }),
  setPoint: (c, T) =>
    set({
      carbon: clamp(c, C_MIN, C_MAX),
      temperature: clamp(T, ROOM_T, T_MAX),
      preset: null,
      playback: 'idle',
    }),
  setHover: (hover) => set({ hover }),
  applyPreset: (id, c, T) =>
    set({ preset: id, carbon: c, temperature: T, playback: 'idle', progress: 0 }),
  play: () => set((state) => ({ playback: 'playing', progress: state.playback === 'paused' ? state.progress : 0 })),
  pause: () => set({ playback: 'paused' }),
  stop: () => set({ playback: 'idle', progress: 0 }),
  setProgress: (progress, temperature) => set({ progress, temperature }),
  setSpeed: (speed) => set({ speed }),
  setInfo: (info) => set({ info }),
  startTour: () => set({ tourStep: 0, info: null }),
  setTourStep: (tourStep) => set({ tourStep }),
}));
