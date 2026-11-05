/**
 * A deterministic set of fake ranked games in Riot's own payload shape, so the
 * whole pipeline (analysis, insights, UI) can be tried without an API key.
 *
 * The fake player has a deliberate profile: strong laning, but isolated
 * mid-game deaths in side lanes that hand the enemy objectives, a weak
 * Zeri, and a habit of losing the game after a loss.
 */
import type { MatchDto, ParticipantDto, ParticipantFrameDto, Position, TimelineDto, TimelineEvent } from '../riot/types';

export const DEMO_PUUID = 'demo-puuid';
export const DEMO_LEGENDARY_MIN_ID = 9000;

const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const CHAMPS: Record<(typeof ROLES)[number], string[]> = {
  TOP: ['Aatrox', 'Ornn', 'KSante', 'Renekton', 'Jax', 'Gragas'],
  JUNGLE: ['Viego', 'LeeSin', 'Sejuani', 'Vi', 'Nidalee', 'Xinzhao'],
  MIDDLE: ['Ahri', 'Azir', 'Orianna', 'Sylas', 'Taliyah', 'Yone'],
  BOTTOM: ['Kalista', 'Ashe', 'Caitlyn', 'Ezreal', 'Varus', 'Xayah', 'Sivir', 'Smolder'],
  UTILITY: ['Nautilus', 'Rakan', 'Rell', 'Lulu', 'Braum', 'Alistar', 'Karma'],
};
const MY_POOL = ['Jinx', 'Jinx', 'Kaisa', 'Kaisa', 'Ezreal', 'Varus', 'Zeri'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoGame {
  match: MatchDto;
  timeline: TimelineDto;
}

export function demoGames(count = 50, seed = 1): DemoGame[] {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const around = (p: Position, spread: number): Position => ({
    x: Math.round(Math.max(300, Math.min(14_500, p.x + (r() - 0.5) * spread))),
    y: Math.round(Math.max(300, Math.min(14_500, p.y + (r() - 0.5) * spread))),
  });

  const games: DemoGame[] = [];
  let clock = Date.UTC(2026, 9, 1, 17, 0);
  let lastWin = true;

  for (let n = 0; n < count; n++) {
    const blue = r() < 0.5;
    const myTeam = blue ? 100 : 200;
    const myId = blue ? 4 : 9;
    const oppId = blue ? 9 : 4;
    const myChamp = pick(MY_POOL);
    const duration = Math.round((24 + r() * 14) * 60);
    const minutes = Math.floor(duration / 60);

    // Laning is a strength: +6 CS at 10 on average.
    const myCsRate = 9.0 + r() * 0.8 + (myChamp === 'Zeri' ? -0.6 : 0);
    const oppCsRate = 8.2 + r() * 0.8;
    // After 15 min the demo player farms less than their opponent.
    const myLateRate = oppCsRate - 0.6;
    const oppLateRate = oppCsRate;

    // Deaths: few in lane, several isolated ones mid-game, some right before objectives.
    const myDeaths: { t: number; isolated: boolean; objective: string | null }[] = [];
    if (r() < 0.3) myDeaths.push({ t: 4 + r() * 9, isolated: false, objective: null });
    const midDeaths = 1 + Math.floor(r() * 4);
    for (let i = 0; i < midDeaths; i++) {
      const t = 15 + r() * (minutes - 17);
      const isolated = r() < 0.6;
      myDeaths.push({ t, isolated, objective: isolated && r() < 0.55 ? (t > 25 ? 'BARON_NASHOR' : 'DRAGON') : null });
    }
    myDeaths.sort((a, b) => a.t - b.t);

    const winChance: number = 0.7 - (myChamp === 'Zeri' ? 0.4 : 0) - (lastWin ? 0 : 0.2) - midDeaths * 0.03;
    const win: boolean = r() < winChance;
    lastWin = win;

    const participants: ParticipantDto[] = [];
    for (let id = 1; id <= 10; id++) {
      const teamId = id <= 5 ? 100 : 200;
      const role = ROLES[(id - 1) % 5];
      const isMe = id === myId;
      const champ = isMe ? myChamp : pick(CHAMPS[role]);
      const kills = Math.floor(r() * (role === 'BOTTOM' ? 9 : 6));
      participants.push({
        puuid: isMe ? DEMO_PUUID : `p-${n}-${id}`,
        participantId: id,
        teamId,
        teamPosition: role,
        championName: champ,
        riotIdGameName: isMe ? 'Du' : champ,
        win: teamId === myTeam ? win : !win,
        kills,
        deaths: isMe ? myDeaths.length : Math.floor(r() * 6),
        assists: Math.floor(r() * 12),
        totalMinionsKilled: 0,
        neutralMinionsKilled: 0,
        goldEarned: 0,
        totalDamageDealtToChampions: Math.round(
          (role === 'BOTTOM' ? 26_000 : role === 'UTILITY' ? 9_000 : 18_000) * (0.75 + r() * 0.5) * (duration / 1800),
        ),
        totalDamageTaken: Math.round(
          (role === 'TOP' || role === 'JUNGLE' ? 32_000 : role === 'BOTTOM' ? 19_000 : 20_000) *
            (0.8 + r() * 0.4) *
            (isMe ? 1.1 : 1) *
            (duration / 1800),
        ),
        visionScore: Math.round((role === 'UTILITY' ? 2.2 : role === 'JUNGLE' ? 1.4 : 0.8) * (duration / 60) * (0.8 + r() * 0.4)),
        wardsPlaced: Math.round(r() * 20),
        wardsKilled: Math.round(r() * 8),
        visionWardsBoughtInGame: Math.floor(r() * 4),
        totalTimeSpentDead: isMe ? Math.round(myDeaths.reduce((s, d) => s + 10 + d.t * 1.2, 0)) : Math.round(r() * 150),
      });
    }

    // Frames: cumulative CS / gold / xp, plus positions.
    const frames: TimelineDto['info']['frames'] = [];
    const cs = new Array(11).fill(0);
    const gold = new Array(11).fill(500);
    const xp = new Array(11).fill(0);
    const deathMinutes = new Set(myDeaths.map((d) => Math.round(d.t)));
    for (let m = 0; m <= minutes; m++) {
      const participantFrames: Record<string, ParticipantFrameDto> = {};
      for (let id = 1; id <= 10; id++) {
        const role = ROLES[(id - 1) % 5];
        if (m > 0) {
          const rate =
            id === myId ? (m <= 15 ? myCsRate : myLateRate)
            : id === oppId ? (m <= 15 ? oppCsRate : oppLateRate)
            : role === 'UTILITY' ? 0.9
            : role === 'JUNGLE' ? 5.6
            : 7.4;
          const gained = m < 2 ? 0 : Math.max(0, Math.round(rate + (r() - 0.5) * 3));
          cs[id] += gained;
          gold[id] += gained * 21 + 125 + Math.round(r() * 80);
          xp[id] += 380 + Math.round(r() * 120);
        }
        const deathFrameIsolated = myDeaths.find((d) => Math.round(d.t) === m)?.isolated;
        const sameTeam = (id <= 5) === (myId <= 5);
        let pos: Position;
        if (m < 14 && (role === 'BOTTOM' || role === 'UTILITY')) pos = around({ x: 12_000, y: 2_200 }, 2500);
        else if (sameTeam && id !== myId && deathMinutes.has(m))
          pos = deathFrameIsolated ? around({ x: 9_500, y: 5_000 }, 2000) : around({ x: 3_000, y: 10_500 }, 800);
        else pos = around({ x: 7_400, y: 7_400 }, 7000);
        participantFrames[String(id)] = {
          participantId: id,
          minionsKilled: role === 'JUNGLE' ? Math.round(cs[id] * 0.15) : cs[id],
          jungleMinionsKilled: role === 'JUNGLE' ? Math.round(cs[id] * 0.85) : 0,
          totalGold: gold[id],
          xp: xp[id],
          level: Math.min(18, 1 + Math.floor(Math.sqrt(xp[id] / 90))),
          position: pos,
        };
      }
      frames.push({ timestamp: m * 60_000 + (m ? Math.round(r() * 500) : 0), participantFrames, events: [] });
    }

    const enemyIds = blue ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
    const addEvent = (e: TimelineEvent) => {
      const f = frames[Math.min(frames.length - 1, Math.ceil(e.timestamp / 60_000))];
      f.events.push(e);
    };
    for (const d of myDeaths) {
      const ts = Math.round(d.t * 60_000);
      const position =
        d.t < 14 ? around({ x: 12_000, y: 2_000 }, 1500)
        : d.isolated ? around(r() < 0.5 ? { x: 1_800, y: 9_800 } : { x: 9_000, y: 11_000 }, 3200)
        : around({ x: 3_000, y: 10_500 }, 1000);
      const gank = d.t < 14 && r() < 0.5;
      addEvent({
        type: 'CHAMPION_KILL',
        timestamp: ts,
        killerId: d.t < 14 ? oppId : pick(enemyIds),
        victimId: myId,
        assistingParticipantIds: gank ? [blue ? 10 : 5, blue ? 7 : 2] : d.isolated ? [pick(enemyIds)] : [pick(enemyIds), pick(enemyIds)],
        position,
      });
      if (d.objective)
        addEvent({ type: 'ELITE_MONSTER_KILL', timestamp: ts + 30_000 + Math.round(r() * 50_000), killerTeamId: blue ? 200 : 100, monsterType: d.objective });
    }
    // The lane opponent dies in lane about as often as you do.
    if (r() < 0.35)
      addEvent({
        type: 'CHAMPION_KILL',
        timestamp: Math.round((4 + r() * 9) * 60_000),
        killerId: myId,
        victimId: oppId,
        assistingParticipantIds: [blue ? 5 : 10],
        position: around({ x: 12_000, y: 2_000 }, 1500),
      });
    addEvent({ type: 'ITEM_PURCHASED', timestamp: Math.round((9.5 + r() * 2.5) * 60_000), participantId: myId, itemId: 9001 });
    addEvent({ type: 'ITEM_PURCHASED', timestamp: Math.round((10 + r() * 2.5) * 60_000), participantId: oppId, itemId: 9002 });

    const last = frames[frames.length - 1].participantFrames;
    for (const p of participants) {
      const lf = last[String(p.participantId)];
      p.totalMinionsKilled = lf.minionsKilled + Math.round(cs[p.participantId] * (duration / 60 - minutes) * 0.1);
      p.neutralMinionsKilled = lf.jungleMinionsKilled;
      p.goldEarned = lf.totalGold;
    }

    const matchId = `DEMO_${1000 + n}`;
    games.push({
      match: {
        metadata: { matchId, participants: participants.map((p) => p.puuid) },
        info: { gameCreation: clock, gameDuration: duration, queueId: 420, participants },
      },
      timeline: {
        metadata: { matchId },
        info: { frameInterval: 60_000, participants: participants.map((p) => ({ participantId: p.participantId, puuid: p.puuid })), frames },
      },
    });
    // Next game: same session most of the time, otherwise the next evening.
    clock += duration * 1000 + (r() < 0.75 ? 5 * 60_000 : 20 * 3600_000);
  }
  return games;
}
