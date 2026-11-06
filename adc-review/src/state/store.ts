/**
 * App state, persisted to localStorage. Analyses are small (a few KB per game),
 * so hundreds of games fit comfortably; the raw Riot payloads live in the dev
 * server's disk cache instead.
 */
import { useSyncExternalStore } from 'react';
import type { GameAnalysis } from '../domain/analyzeGame';
import type { JournalEntry } from '../domain/journal';
import type { Region } from '../riot/client';

export interface Settings {
  gameName: string;
  tagLine: string;
  region: Region;
  count: number;
  /** Optional: only needed when RIOT_API_KEY is not set on the server. */
  apiKey: string;
  /** Password for a hosted instance (the server's APP_PASSWORD). */
  appPassword: string;
}

export interface State {
  settings: Settings;
  /** Whose games are loaded, so switching account does not mix data. */
  puuid: string | null;
  playerLabel: string | null;
  demo: boolean;
  games: GameAnalysis[];
  /** Matches that are not ADC games (or remakes) – remembered so they are not fetched again. */
  skipped: string[];
  journal: Record<string, JournalEntry>;
}

const KEY = 'adc-review/v1';

const initial: State = {
  settings: { gameName: '', tagLine: '', region: 'europe', count: 50, apiKey: '', appPassword: '' },
  puuid: null,
  playerLabel: null,
  demo: false,
  games: [],
  skipped: [],
  journal: {},
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      return { ...initial, ...parsed, settings: { ...initial.settings, ...parsed.settings } };
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return initial;
}

let state = load();
const listeners = new Set<() => void>();

export function getState() {
  return state;
}

export function setState(update: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof update === 'function' ? update(state) : update) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode: keep working in memory */
  }
  listeners.forEach((l) => l());
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

export function saveJournal(entry: JournalEntry) {
  setState((s) => ({ journal: { ...s.journal, [entry.matchId]: { ...entry, updatedAt: Date.now() } } }));
}
