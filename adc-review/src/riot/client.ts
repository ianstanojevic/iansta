import type { AccountDto, MatchDto, TimelineDto } from './types';

export type Region = 'europe' | 'americas' | 'asia' | 'sea';

export const REGIONS: { id: Region; label: string }[] = [
  { id: 'europe', label: 'Europa (EUW, EUNE, TR, RU)' },
  { id: 'americas', label: 'Amerika (NA, BR, LAN, LAS)' },
  { id: 'asia', label: 'Asien (KR, JP)' },
  { id: 'sea', label: 'SEA (OCE, SG, TW, VN …)' },
];

export const RANKED_SOLO_QUEUE = 420;

export class RiotError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET through the local dev-server proxy (see server/riotProxy.ts). Rate-limit
 * responses are waited out using Riot's Retry-After header rather than failed,
 * because a development key runs into the 100-per-2-minutes limit at ~50 games.
 */
async function get<T>(host: string, path: string, token: string | undefined, onWait?: (s: number) => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`/riot/${host}${path}`, { headers: token ? { 'x-riot-token': token } : {} });
    if (res.ok) return res.json() as Promise<T>;
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const wait = Number(res.headers.get('retry-after')) || 2 ** attempt;
      onWait?.(wait);
      await sleep(wait * 1000 + 250);
      continue;
    }
    let message = `${res.status} från Riot`;
    try {
      const body = await res.json();
      message = body.error ?? body.status?.message ?? message;
    } catch {
      /* not JSON */
    }
    if (res.status === 401 || res.status === 403)
      message = `${message} – API-nyckeln saknas, är ogiltig eller har gått ut (utvecklarnycklar gäller 24 h).`;
    if (res.status === 404 && path.includes('by-riot-id')) message = 'Hittade inget konto med det Riot ID:t i den regionen.';
    throw new RiotError(message, res.status);
  }
}

export interface RiotClient {
  account(gameName: string, tagLine: string): Promise<AccountDto>;
  matchIds(puuid: string, count: number): Promise<string[]>;
  match(id: string): Promise<MatchDto>;
  timeline(id: string): Promise<TimelineDto>;
}

export function riotClient(region: Region, token?: string, onWait?: (s: number) => void): RiotClient {
  const call = <T,>(path: string) => get<T>(region, path, token, onWait);
  return {
    account: (gameName, tagLine) =>
      call(`/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`),
    async matchIds(puuid, count) {
      const ids: string[] = [];
      while (ids.length < count) {
        const batch = Math.min(100, count - ids.length);
        const page = await call<string[]>(
          `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${RANKED_SOLO_QUEUE}&start=${ids.length}&count=${batch}`,
        );
        ids.push(...page);
        if (page.length < batch) break;
      }
      return ids;
    },
    match: (id) => call(`/lol/match/v5/matches/${id}`),
    timeline: (id) => call(`/lol/match/v5/matches/${id}/timeline`),
  };
}

interface DDragonItem {
  into?: string[];
  requiredAlly?: string;
  gold: { total: number; purchasable: boolean };
  maps: Record<string, boolean>;
  tags?: string[];
}

/**
 * Item ids that count as a completed legendary on Summoner's Rift, from Data
 * Dragon: purchasable, 2200 g or more, builds into nothing, and not an Ornn
 * upgrade or boots.
 */
export async function legendaryItems(): Promise<Set<number>> {
  const versions = await get<string[]>('ddragon', '/api/versions.json', undefined);
  const items = await get<{ data: Record<string, DDragonItem> }>('ddragon', `/cdn/${versions[0]}/data/en_US/item.json`, undefined);
  const ids = new Set<number>();
  for (const [id, item] of Object.entries(items.data)) {
    if (
      item.gold.purchasable &&
      item.gold.total >= 2200 &&
      !item.into?.length &&
      !item.requiredAlly &&
      item.maps['11'] &&
      !item.tags?.includes('Boots')
    )
      ids.add(Number(id));
  }
  return ids;
}
