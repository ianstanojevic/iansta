/**
 * Dev-server middleware: serves /riot/* through forwardRiot and keeps finished
 * matches in .cache/ on disk, so re-analysing costs no API calls.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { forwardRiot, isImmutable, parseProxyPath, writeResult, type ForwardConfig } from '../api/riot';

export function riotProxy(options: ForwardConfig & { cacheDir: string }): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parsed = parseProxyPath(url.pathname);
    if (!parsed || req.method !== 'GET') return send(res, 404, 'application/json', Buffer.from('{"error":"Okänd proxyväg"}'));

    const cacheable = isImmutable(parsed.hostKey, parsed.pathname);
    const cacheFile = path.join(
      options.cacheDir,
      createHash('sha1').update(parsed.hostKey + parsed.pathname + url.search).digest('hex') + '.json',
    );
    if (cacheable) {
      try {
        return send(res, 200, 'application/json', await readFile(cacheFile));
      } catch {
        /* not cached yet */
      }
    }

    const result = await forwardRiot(
      {
        ...parsed,
        search: url.search,
        clientKey: req.headers['x-riot-token'] as string | undefined,
        password: req.headers['x-app-password'] as string | undefined,
      },
      options,
    );
    writeResult(res, result);

    if (cacheable && result.status === 200) {
      await mkdir(options.cacheDir, { recursive: true });
      await writeFile(cacheFile, result.body).catch(() => undefined);
    }
  };

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/riot/')) return next();
    handle(req, res).catch((err) => send(res, 500, 'application/json', Buffer.from(JSON.stringify({ error: String(err) }))));
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

function send(res: ServerResponse, status: number, contentType: string, body: Buffer) {
  res.statusCode = status;
  res.setHeader('content-type', contentType);
  res.end(body);
}
