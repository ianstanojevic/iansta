/**
 * Vercel serverless function behind /riot/* (see vercel.json), and the Riot API
 * forwarding logic that the local dev server (server/riotProxy.ts) reuses.
 *
 * This file deliberately imports nothing local: Vercel compiles each function
 * file on its own as an ES module, where extensionless relative imports fail.
 *
 * The browser cannot call api.riotgames.com directly (no CORS headers, and the
 * key must stay secret), so the app calls /riot/<host>/<path> and this adds the
 * key server-side. Only the handful of endpoints the app uses are forwarded, so
 * a deployed instance cannot be used as a general-purpose proxy for your key.
 */
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

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

/**
 * The Vercel entry point. Uses the classic Node (req, res) signature, which
 * every Vercel Node runtime supports. The key comes from RIOT_API_KEY and never
 * reaches the browser; APP_PASSWORD, if set, keeps others from spending it.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // vercel.json rewrites /riot/<rest> to /api/riot?p=<rest>, keeping the original query.
    const rest = url.searchParams.get('p');
    url.searchParams.delete('p');
    const parsed = parseProxyPath(rest !== null ? `/riot/${rest.replace(/^\/+/, '')}` : url.pathname);
    if (!parsed || (req.method && req.method !== 'GET')) {
      return writeResult(res, json(404, { error: 'Okänd proxyväg' }));
    }
    const query = url.searchParams.toString();
    const header = (name: string) => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    const result = await forwardRiot(
      { ...parsed, search: query ? `?${query}` : '', clientKey: header('x-riot-token'), password: header('x-app-password') },
      { apiKey: process.env.RIOT_API_KEY, appPassword: process.env.APP_PASSWORD },
    );
    // Finished matches never change: let the browser keep them.
    if (result.status === 200 && isImmutable(parsed.hostKey, parsed.pathname))
      res.setHeader('cache-control', 'private, max-age=31536000, immutable');
    writeResult(res, result);
  } catch (err) {
    writeResult(res, json(500, { error: `Serverfel i Riot-proxyn: ${(err as Error).message}` }));
  }
}

export function writeResult(res: ServerResponse, result: ForwardResult) {
  res.statusCode = result.status;
  res.setHeader('content-type', result.contentType);
  if (result.retryAfter) res.setHeader('retry-after', result.retryAfter);
  res.end(Buffer.from(result.body));
}
