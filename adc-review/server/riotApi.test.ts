import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../api/riot';

const upstream = vi.fn();

beforeEach(() => {
  upstream.mockReset();
  upstream.mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', upstream);
  process.env.RIOT_API_KEY = 'RGAPI-server-key';
  delete process.env.APP_PASSWORD;
});
afterEach(() => vi.unstubAllGlobals());

// How Vercel calls the function after the /riot/:path* rewrite in vercel.json.
const call = (rest: string, query = '', headers: Record<string, string> = {}) =>
  GET(new Request(`https://app.example/api/riot?p=${encodeURIComponent(rest)}${query}`, { headers }));

describe('api/riot', () => {
  it('forwards an allowed call with the server key and the original query', async () => {
    const res = await call('europe/lol/match/v5/matches/by-puuid/abc-123/ids', '&queue=420&start=0&count=20');
    expect(res.status).toBe(200);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe('https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/abc-123/ids?queue=420&start=0&count=20');
    expect(init.headers['X-Riot-Token']).toBe('RGAPI-server-key');
  });

  it('lets finished matches be cached by the browser', async () => {
    const res = await call('europe/lol/match/v5/matches/EUW1_7000000001/timeline');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('refuses endpoints the app does not use', async () => {
    for (const rest of ['europe/lol/summoner/v4/summoners/me', 'euw1/lol/status/v4/platform-data', 'ddragon/cdn/16.22.1/img/x.png']) {
      const res = await call(rest);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('requires the app password when one is configured', async () => {
    process.env.APP_PASSWORD = 'hemligt';
    const path = 'europe/riot/account/v1/accounts/by-riot-id/Kaori/EUW33';
    const denied = await call(path);
    expect(denied.status).toBe(401);
    expect(((await denied.json()) as { code: string }).code).toBe('password');
    expect((await call(path, '', { 'x-app-password': 'fel' })).status).toBe(401);
    expect((await call(path, '', { 'x-app-password': 'hemligt' })).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('serves Data Dragon without password or key', async () => {
    process.env.APP_PASSWORD = 'hemligt';
    delete process.env.RIOT_API_KEY;
    const res = await call('ddragon/api/versions.json');
    expect(res.status).toBe(200);
    expect(upstream.mock.calls[0][1].headers).toEqual({});
  });

  it('passes on Riot rate limits so the client can wait', async () => {
    upstream.mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '7' } }));
    const res = await call('europe/lol/match/v5/matches/EUW1_1');
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('7');
  });

  it('explains a missing key', async () => {
    delete process.env.RIOT_API_KEY;
    const res = await call('europe/lol/match/v5/matches/EUW1_1');
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('no-key');
  });
});
