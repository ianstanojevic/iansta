import { describe, expect, it } from 'vitest';
import { analyzeGame, NotAdcGameError } from './analyzeGame';
import { DEMO_LEGENDARY_MIN_ID, DEMO_PUUID, demoGames } from './demo';
import { findInsights, MIN_GAMES } from './insights';
import { zoneOf } from './map';
import type { MatchDto, TimelineDto } from '../riot/types';

const isLegendary = (id: number) => id >= DEMO_LEGENDARY_MIN_ID;
const games = demoGames().map((g) => analyzeGame(g.match, g.timeline, DEMO_PUUID, isLegendary));

describe('zoneOf', () => {
  it('classifies the main landmarks', () => {
    expect(zoneOf({ x: 1000, y: 1000 }, 100)).toBe('base');
    expect(zoneOf({ x: 12_000, y: 1500 }, 100)).toBe('botlane');
    expect(zoneOf({ x: 13_500, y: 6000 }, 100)).toBe('botlane');
    expect(zoneOf({ x: 1500, y: 9000 }, 100)).toBe('toplane');
    expect(zoneOf({ x: 7400, y: 7400 }, 100)).toBe('midlane');
    expect(zoneOf({ x: 9800, y: 4600 }, 100)).toBe('river');
    expect(zoneOf({ x: 4000, y: 7000 }, 100)).toBe('ownJungle');
    expect(zoneOf({ x: 4000, y: 7000 }, 200)).toBe('enemyJungle');
  });
});

describe('analyzeGame', () => {
  it('pairs you with your lane opponent and reads frame stats', () => {
    const { match, timeline } = demoGames(1)[0];
    const a = analyzeGame(match, timeline, DEMO_PUUID, isLegendary);
    const me = match.info.participants.find((p) => p.puuid === DEMO_PUUID)!;
    const f10 = timeline.info.frames[10].participantFrames[String(me.participantId)];
    expect(a.me.champion).toBe(me.championName);
    expect(a.opp).not.toBeNull();
    expect(a.me.cs10).toBe(f10.minionsKilled + f10.jungleMinionsKilled);
    expect(a.me.gold10).toBe(f10.totalGold);
    expect(a.goldDiffCurve[10]).toBe(a.me.gold10! - a.opp!.gold10!);
    expect(a.deathList).toHaveLength(me.deaths);
    expect(a.me.firstItemMin).toBeGreaterThan(9);
  });

  it('shares sum to one across a team', () => {
    const { match, timeline } = demoGames(1)[0];
    const total = match.info.participants
      .filter((p) => p.teamId === 100)
      .map((p) => analyzeGame({ ...match, info: { ...match.info, participants: match.info.participants.map((q) => ({ ...q, teamPosition: q.participantId === p.participantId ? 'BOTTOM' : q.teamPosition === 'BOTTOM' && q.teamId === 100 ? 'X' : q.teamPosition })) } }, timeline, p.puuid))
      .reduce((s, a) => s + a.me.damageShare, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('rejects games where you did not play bot', () => {
    const { match, timeline } = demoGames(1)[0];
    const moved: MatchDto = {
      ...match,
      info: { ...match.info, participants: match.info.participants.map((p) => (p.puuid === DEMO_PUUID ? { ...p, teamPosition: 'MIDDLE' } : p)) },
    };
    expect(() => analyzeGame(moved, timeline, DEMO_PUUID)).toThrow(NotAdcGameError);
  });

  it('marks a death isolated only when every ally is far away', () => {
    const { match, timeline } = demoGames(1)[0];
    const me = match.info.participants.find((p) => p.puuid === DEMO_PUUID)!;
    const ally = match.info.participants.find((p) => p.teamId === me.teamId && p.participantId !== me.participantId)!;
    const enemy = match.info.participants.find((p) => p.teamId !== me.teamId)!;
    const frames = timeline.info.frames.map((f) => ({ ...f, events: [] as TimelineDto['info']['frames'][number]['events'] }));
    const at = { x: 2000, y: 11_000 };
    for (const p of match.info.participants) frames[20].participantFrames[String(p.participantId)].position = { x: 12_000, y: 3000 };
    frames[20].events.push({ type: 'CHAMPION_KILL', timestamp: 20 * 60_000, killerId: enemy.participantId, victimId: me.participantId, position: at });
    frames[20].events.push({ type: 'ELITE_MONSTER_KILL', timestamp: 21 * 60_000, killerTeamId: enemy.teamId, monsterType: 'BARON_NASHOR' });
    const tl = { ...timeline, info: { ...timeline.info, frames } };

    const lonely = analyzeGame(match, tl, DEMO_PUUID).deathList;
    expect(lonely).toHaveLength(1);
    expect(lonely[0]).toMatchObject({ isolated: true, zone: 'toplane', phase: 'mid', objectiveLost: 'baron', killers: [enemy.championName] });

    frames[20].participantFrames[String(ally.participantId)].position = { x: 2500, y: 11_200 };
    expect(analyzeGame(match, tl, DEMO_PUUID).deathList[0].isolated).toBe(false);
  });
});

describe('findInsights', () => {
  it('needs a minimum sample', () => {
    expect(findInsights(games.slice(0, MIN_GAMES - 1))).toEqual([]);
  });

  it('finds the weaknesses planted in the demo profile', () => {
    const insights = findInsights(games);
    const weak = insights.filter((i) => i.kind === 'weakness').map((i) => i.id);
    const strong = insights.filter((i) => i.kind === 'strength').map((i) => i.id);
    expect(weak).toEqual(expect.arrayContaining(['isolated', 'objective-deaths', 'midgame-farm', 'champ-Zeri']));
    expect(strong).toContain('lane-cs');
    expect(weak).not.toContain('lane-cs');
    // Ranked by severity.
    const sev = insights.map((i) => i.severity);
    expect([...sev].sort((a, b) => b - a)).toEqual(sev);
  });

  it('surfaces tags you keep using in your own reviews', () => {
    const journal = new Map(
      games.slice(0, 6).map((g, i) => [
        g.matchId,
        { matchId: g.matchId, tags: i < 4 ? ['Stod för långt fram'] : ['Dålig recall-timing'], notes: '', focus: '', rating: null, updatedAt: 1 },
      ]),
    );
    const tagged = findInsights(games, journal).filter((i) => i.id.startsWith('tag-'));
    expect(tagged.map((i) => i.id)).toEqual(['tag-Stod för långt fram']);
    expect(tagged[0].examples).toHaveLength(3);
  });
});
