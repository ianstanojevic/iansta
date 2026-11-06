/**
 * Vercel serverless function behind /riot/* (see vercel.json). The Riot key
 * comes from the RIOT_API_KEY environment variable and never reaches the
 * browser; set APP_PASSWORD too so that only you can spend it.
 */
import { forwardRiot, isImmutable, parseProxyPath } from '../server/riotCore';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // vercel.json rewrites /riot/<rest> to /api/riot?p=<rest>, keeping the original query.
  const rest = url.searchParams.get('p');
  url.searchParams.delete('p');
  const parsed = parseProxyPath(rest !== null ? `/riot/${rest}` : url.pathname);
  if (!parsed) return Response.json({ error: 'Okänd proxyväg' }, { status: 404 });

  const search = url.searchParams.size ? `?${url.searchParams}` : '';
  const result = await forwardRiot(
    {
      ...parsed,
      search,
      clientKey: request.headers.get('x-riot-token') ?? undefined,
      password: request.headers.get('x-app-password') ?? undefined,
    },
    { apiKey: process.env.RIOT_API_KEY, appPassword: process.env.APP_PASSWORD },
  );

  const headers = new Headers({ 'content-type': result.contentType });
  if (result.retryAfter) headers.set('retry-after', result.retryAfter);
  // Finished matches never change: let the browser keep them.
  if (result.status === 200 && isImmutable(parsed.hostKey, parsed.pathname))
    headers.set('cache-control', 'private, max-age=31536000, immutable');
  return new Response(result.body, { status: result.status, headers });
}
