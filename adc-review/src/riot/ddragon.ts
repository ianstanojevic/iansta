/**
 * Champion portraits and the Summoner's Rift minimap from Riot's Data Dragon
 * CDN. Images load straight from the CDN; only the version list goes through
 * the dev-server proxy. Everything degrades to text/schematics when offline.
 */
import { useSyncExternalStore } from 'react';

const CDN = 'https://ddragon.leagueoflegends.com/cdn';
const KEY = 'adc-review/ddragon-version';

let version: string | null = null;
try {
  version = localStorage.getItem(KEY);
} catch {
  /* storage unavailable */
}
const listeners = new Set<() => void>();
let requested = false;

function ensureVersion() {
  if (requested) return;
  requested = true;
  fetch('/riot/ddragon/api/versions.json')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((list: string[]) => {
      if (list[0] && list[0] !== version) {
        version = list[0];
        try {
          localStorage.setItem(KEY, version);
        } catch {
          /* ignore */
        }
        listeners.forEach((l) => l());
      }
    })
    .catch(() => undefined);
}

export function useDDragonVersion(): string | null {
  ensureVersion();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

/** Match-v5 championName → Data Dragon id, where they differ. */
const ID_FIX: Record<string, string> = { FiddleSticks: 'Fiddlesticks' };

export const championIcon = (v: string, championName: string) =>
  `${CDN}/${v}/img/champion/${ID_FIX[championName] ?? championName}.png`;

export const mapImage = (v: string) => `${CDN}/${v}/img/map/map11.png`;
