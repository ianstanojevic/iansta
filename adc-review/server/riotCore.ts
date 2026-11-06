/**
 * The Riot API forwarding logic, shared by the local dev-server middleware
 * (server/riotProxy.ts) and the hosted serverless function (api/riot.ts).
 *
 * The browser cannot call api.riotgames.com directly (no CORS headers, and the
 * key must stay secret), so the app calls /riot/<host>/<path> and this adds the
 * key server-side. Only the handful of endpoints the app uses are forwarded, so
 * a deployed instance cannot be used as a general-purpose proxy for your key.
 */
import { timingSafeEqual } from 'node:crypto';

export const HOSTS: Record<string, string> = {
  europe: 'europe.api.riotgames.com',
  americas: 'americas.api.riotgames.com',
  asia: 'asia.api.riotgames.com',
  sea: 'sea.api.riotgames.com',
  ddragon: 'ddragon.leagueoflegends.com',
};

const RIOT_PATHS = [
  /^\/riot\/account\/v1\/accounts\/by-riot-id\/[^/]+\/[^/]+$/,
  /^\/lol\/match\/v5\/matches\/by-puuid\/[\w-]+\/ids$/,
  /^\/lol\/match\/v5\/matches\/[A-Z0-9]+_\d+(\/timeline)?$/,
];
const DDRAGON_PATHS = [/^\/api\/versions\.json$/, /^\/cdn\/[\d.]+\/data\/[a-z]{2}_[A-Z]{2}\/item\.json$/];

/** Responses that never change and can be cached forever. */
export function isImmutable(hostKey: string, pathname: string): boolean {
  if (hostKey === 'ddragon') return pathname.startsWith('/cdn/');
  return /^\/lol\/match\/v5\/matches\/[A-Z0-9]+_\d+(\/timeline)?$/.test(pathname);
}

export interface ForwardRequest {
  hostKey: string;
  pathname: string;
  search: string;
  /** Key sent by the client (x-riot-token), used if the server has none. */
  clientKey?: string;
  /** Password sent by the client (x-app-password). */
  password?: string;
}

export interface ForwardConfig {
  apiKey?: string;
  /** When set, every Riot request must carry this password. */
  appPassword?: string;
}

export interface ForwardResult {
  status: number;
  contentType: string;
  body: Uint8Array;
  retryAfter?: string | null;
}

const json = (status: number, payload: unknown): ForwardResult => ({
  status,
  contentType: 'application/json',
  body: new TextEncoder().encode(JSON.stringify(payload)),
});

function samePassword(given: string | undefined, expected: string): boolean {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function forwardRiot(req: ForwardRequest, config: ForwardConfig): Promise<ForwardResult> {
  const host = HOSTS[req.hostKey];
  if (!host) return json(400, { error: `Okänd värd: ${req.hostKey}` });
  const isDDragon = req.hostKey === 'ddragon';
  const allowed = (isDDragon ? DDRAGON_PATHS : RIOT_PATHS).some((re) => re.test(req.pathname));
  if (!allowed) return json(403, { error: 'Det anropet släpps inte igenom av proxyn.' });

  const headers: Record<string, string> = {};
  if (!isDDragon) {
    // Data Dragon is public static data; only Riot API calls spend the key.
    if (config.appPassword && !samePassword(req.password, config.appPassword))
      return json(401, { error: 'Fel eller saknat applösenord.', code: 'password' });
    const key = req.clientKey?.trim() || config.apiKey;
    if (!key) {
      return json(401, {
        error: 'Ingen Riot API-nyckel. Sätt RIOT_API_KEY (i adc-review/.env.local lokalt, eller som Environment Variable på Vercel).',
        code: 'no-key',
      });
    }
    headers['X-Riot-Token'] = key;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`https://${host}${req.pathname}${req.search}`, { headers });
  } catch (err) {
    return json(502, { error: `Kunde inte nå ${host}: ${(err as Error).message}` });
  }
  return {
    status: upstream.status,
    contentType: upstream.headers.get('content-type') ?? 'application/json',
    body: new Uint8Array(await upstream.arrayBuffer()),
    retryAfter: upstream.headers.get('retry-after'),
  };
}

/** Splits "/riot/<host>/<path>" into its parts. */
export function parseProxyPath(path: string): { hostKey: string; pathname: string } | null {
  const m = /^\/riot\/([a-z]+)(\/.*)$/.exec(path);
  return m ? { hostKey: m[1], pathname: m[2] } : null;
}
