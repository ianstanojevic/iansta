/**
 * Dev-server middleware that forwards requests to the Riot API.
 *
 * The browser cannot call api.riotgames.com directly (no CORS headers, and the
 * key must not live in client code), so the app calls
 *   /riot/<host>/<path>   e.g. /riot/europe/lol/match/v5/matches/EUW1_123
 * and this middleware adds the X-Riot-Token header and forwards it.
 *
 * Finished matches never change, so match and timeline responses are cached on
 * disk in .cache/: re-analysing 100 games costs no API calls the second time,
 * which matters with a development key's 100-requests-per-2-minutes limit.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const HOSTS: Record<string, string> = {
  europe: 'europe.api.riotgames.com',
  americas: 'americas.api.riotgames.com',
  asia: 'asia.api.riotgames.com',
  sea: 'sea.api.riotgames.com',
  ddragon: 'ddragon.leagueoflegends.com',
};

/** Responses that are immutable and therefore safe to keep forever. */
function isCacheable(host: string, pathname: string): boolean {
  if (host === 'ddragon') return /^\/cdn\/\d/.test(pathname);
  return /^\/lol\/match\/v5\/matches\/[A-Z0-9]+_\d+(\/timeline)?$/.test(pathname);
}

export function riotProxy(options: { apiKey?: string; cacheDir: string }): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const match = /^\/riot\/([a-z]+)(\/.*)$/.exec(url.pathname);
    if (!match || req.method !== 'GET') return send(res, 404, { error: 'Okänd proxyväg' });
    const [, hostKey, pathname] = match;
    const host = HOSTS[hostKey];
    if (!host) return send(res, 400, { error: `Okänd värd: ${hostKey}` });

    const cacheable = isCacheable(hostKey, pathname);
    const cacheFile = path.join(
      options.cacheDir,
      createHash('sha1').update(hostKey + pathname + url.search).digest('hex') + '.json',
    );
    if (cacheable) {
      try {
        const body = await readFile(cacheFile);
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.setHeader('x-cache', 'hit');
        return res.end(body);
      } catch {
        /* not cached yet */
      }
    }

    const headers: Record<string, string> = {};
    if (hostKey !== 'ddragon') {
      const key = (req.headers['x-riot-token'] as string | undefined)?.trim() || options.apiKey;
      if (!key) {
        return send(res, 401, {
          error: 'Ingen Riot API-nyckel. Lägg RIOT_API_KEY i adc-review/.env.local eller klistra in den under Inställningar.',
        });
      }
      headers['X-Riot-Token'] = key;
    }

    let upstream: Response;
    try {
      upstream = await fetch(`https://${host}${pathname}${url.search}`, { headers });
    } catch (err) {
      return send(res, 502, { error: `Kunde inte nå ${host}: ${(err as Error).message}` });
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.statusCode = upstream.status;
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) res.setHeader('retry-after', retryAfter);
    res.end(body);

    if (cacheable && upstream.ok) {
      await mkdir(options.cacheDir, { recursive: true });
      await writeFile(cacheFile, body).catch(() => undefined);
    }
  };

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/riot/')) return next();
    handle(req, res).catch((err) => send(res, 500, { error: String(err) }));
  };

  return {
    name: 'riot-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}
