import { analyzeGame, NotAdcGameError, type GameAnalysis } from '../domain/analyzeGame';
import { DEMO_LEGENDARY_MIN_ID, DEMO_PUUID, demoGames } from '../domain/demo';
import { legendaryItems, riotClient } from '../riot/client';
import { getState, setState } from './store';
import { getSyncStatus, setSyncStatus } from './syncStatus';

export interface Progress {
  phase: string;
  done: number;
  total: number;
}

/** Remakes are not worth reviewing. */
const MIN_DURATION_S = 5 * 60;

export async function syncFromRiot(onProgress: (p: Progress) => void): Promise<{ added: number; skipped: number }> {
  const { settings } = getState();
  const gameName = settings.gameName.trim();
  const tagLine = settings.tagLine.trim().replace(/^#/, '');
  if (!gameName || !tagLine) throw new Error('Fyll i Riot ID (namn och tagg) under Inställningar.');

  let last: Progress = { phase: 'Slår upp konto …', done: 0, total: 0 };
  const report = (p: Progress) => onProgress((last = p));
  const client = riotClient(settings.region, settings.apiKey.trim() || undefined, (s) =>
    onProgress({ ...last, phase: `Rate limit – väntar ${s} s …` }),
  );
  report(last);

  const account = await client.account(gameName, tagLine);
  if (getState().puuid !== account.puuid)
    setState({ puuid: account.puuid, games: [], skipped: [], demo: false });
  setState({ playerLabel: `${account.gameName}#${account.tagLine}`, demo: false });

  report({ phase: 'Hämtar matchlista …', done: 0, total: 0 });
  const ids = await client.matchIds(account.puuid, settings.count);
  const known = new Set([...getState().games.map((g) => g.matchId), ...getState().skipped]);
  const todo = ids.filter((id) => !known.has(id));

  let legendary = new Set<number>();
  try {
    legendary = await legendaryItems();
  } catch {
    /* Data Dragon unreachable: first-item timing is simply left out */
  }

  let added = 0;
  let skipped = 0;
  for (const [i, id] of todo.entries()) {
    if (getSyncStatus().cancelRequested) break;
    report({ phase: `Analyserar ${id}`, done: i, total: todo.length });
    const match = await client.match(id);
    const me = match.info.participants.find((p) => p.puuid === account.puuid);
    if (!me || me.teamPosition !== 'BOTTOM' || match.info.gameDuration < MIN_DURATION_S) {
      setState((s) => ({ skipped: [...s.skipped, id] }));
      skipped++;
      continue;
    }
    const timeline = await client.timeline(id);
    let analysis: GameAnalysis;
    try {
      analysis = analyzeGame(match, timeline, account.puuid, (item) => legendary.has(item));
    } catch (err) {
      if (err instanceof NotAdcGameError) {
        setState((s) => ({ skipped: [...s.skipped, id] }));
        skipped++;
        continue;
      }
      throw err;
    }
    setState((s) => ({ games: [...s.games, analysis].sort((a, b) => a.gameCreation - b.gameCreation) }));
    added++;
  }
  report({ phase: 'Klart', done: todo.length, total: todo.length });
  return { added, skipped };
}

/** Runs a sync and publishes its progress, so any part of the UI can show it. */
export async function runSync(): Promise<number> {
  if (getSyncStatus().running) return 0;
  setSyncStatus({ running: true, phase: 'Startar …', done: 0, total: 0, error: null, result: null, cancelRequested: false });
  try {
    const { added, skipped } = await syncFromRiot((p) => setSyncStatus(p));
    const cancelled = getSyncStatus().cancelRequested;
    setSyncStatus({
      running: false,
      result:
        `${added} nya ADC-matcher analyserade` +
        (skipped ? `, ${skipped} hoppades över (annan roll eller remake)` : '') +
        (cancelled ? ' – avbrutet' : '') +
        '.',
    });
    return added;
  } catch (err) {
    setSyncStatus({ running: false, error: (err as Error).message });
    return 0;
  }
}

export const cancelSync = () => setSyncStatus({ cancelRequested: true, phase: 'Avbryter efter pågående match …' });

export function loadDemo() {
  const games = demoGames().map((g) =>
    analyzeGame(g.match, g.timeline, DEMO_PUUID, (id) => id >= DEMO_LEGENDARY_MIN_ID),
  );
  setState({ puuid: DEMO_PUUID, playerLabel: 'Demo-spelare', demo: true, games, skipped: [], journal: {} });
}

export function clearData() {
  setState({ puuid: null, playerLabel: null, demo: false, games: [], skipped: [], journal: {} });
}
