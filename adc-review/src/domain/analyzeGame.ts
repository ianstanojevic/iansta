import type { MatchDto, ParticipantDto, TimelineDto, TimelineEvent, Position } from '../riot/types';
import { distance, zoneOf, type Zone } from './map';

/** A death counts as isolated when no ally was within this range at the nearest frame. */
export const ISOLATION_RANGE = 2200;
/** An enemy objective this soon after your death is treated as a consequence of it. */
export const OBJECTIVE_WINDOW_MS = 90_000;
/** Turret plates fall at 14:00 – the conventional end of the laning phase. */
export const LANE_PHASE_END_MIN = 14;

export type GamePhase = 'lane' | 'mid' | 'late';

export interface DeathInfo {
  minute: number;
  position: Position;
  zone: Zone;
  phase: GamePhase;
  /** No ally within ISOLATION_RANGE at the frame nearest the death. Frames are 60 s apart, so this is approximate. */
  isolated: boolean;
  /** Enemy champions credited with the kill (killer first). */
  killers: string[];
  /** Enemy objective taken within OBJECTIVE_WINDOW_MS after the death, if any. */
  objectiveLost: string | null;
}

/** The same statistics for you and for your lane opponent, so they can be compared like for like. */
export interface LineStats {
  champion: string;
  cs10: number | null;
  cs15: number | null;
  gold10: number | null;
  gold15: number | null;
  xp15: number | null;
  csPerMin: number;
  /** Farm after laning – a proxy for wave management and side-lane farming. Null for games under 20 min. */
  csPerMinPost15: number | null;
  damageShare: number;
  damageTakenShare: number;
  killParticipation: number;
  damagePerGold: number;
  visionPerMin: number;
  controlWards: number;
  kills: number;
  deaths: number;
  assists: number;
  deathsPre15: number;
  timeDeadShare: number;
  firstItemMin: number | null;
}

export interface GameAnalysis {
  matchId: string;
  gameCreation: number;
  durationMin: number;
  win: boolean;
  /** Blue side has its base bottom-left. */
  side: 'blue' | 'red';
  support: string | null;
  enemySupport: string | null;
  me: LineStats;
  opp: LineStats | null;
  /** Your gold minus your lane opponent's, one value per minute. */
  goldDiffCurve: number[];
  deathList: DeathInfo[];
}

export type IsLegendary = (itemId: number) => boolean;

export class NotAdcGameError extends Error {}

const OBJECTIVE_NAME: Record<string, string> = {
  DRAGON: 'drake',
  BARON_NASHOR: 'baron',
  RIFTHERALD: 'herald',
  HORDE: 'grubs',
  ATAKHAN: 'atakhan',
};

export function analyzeGame(
  match: MatchDto,
  timeline: TimelineDto,
  puuid: string,
  isLegendary: IsLegendary = () => false,
): GameAnalysis {
  const players = match.info.participants;
  const me = players.find((p) => p.puuid === puuid);
  if (!me) throw new Error(`Spelaren finns inte i ${match.metadata.matchId}`);
  if (me.teamPosition !== 'BOTTOM') throw new NotAdcGameError(match.metadata.matchId);

  const opp = players.find((p) => p.teamId !== me.teamId && p.teamPosition === 'BOTTOM') ?? null;
  const support = players.find((p) => p.teamId === me.teamId && p.teamPosition === 'UTILITY') ?? null;
  const enemySupport = players.find((p) => p.teamId !== me.teamId && p.teamPosition === 'UTILITY') ?? null;
  const durationMin = match.info.gameDuration / 60;
  const frames = timeline.info.frames;
  const events = frames.flatMap((f) => f.events);

  const goldDiffCurve: number[] = [];
  if (opp) {
    for (const frame of frames) {
      const a = frame.participantFrames[String(me.participantId)];
      const b = frame.participantFrames[String(opp.participantId)];
      if (a && b) goldDiffCurve.push(a.totalGold - b.totalGold);
    }
  }

  return {
    matchId: match.metadata.matchId,
    gameCreation: match.info.gameCreation,
    durationMin,
    win: me.win,
    side: me.teamId === 100 ? 'blue' : 'red',
    support: support?.championName ?? null,
    enemySupport: enemySupport?.championName ?? null,
    me: lineStats(me, players, timeline, events, durationMin, isLegendary),
    opp: opp ? lineStats(opp, players, timeline, events, durationMin, isLegendary) : null,
    goldDiffCurve,
    deathList: deaths(me, players, timeline, events),
  };
}

const objectiveName = (type: string) => OBJECTIVE_NAME[type] ?? type.toLowerCase();

function frameAt(timeline: TimelineDto, minute: number) {
  const f = timeline.info.frames[minute];
  return f && Math.abs(f.timestamp - minute * 60_000) < 30_000 ? f : undefined;
}

function lineStats(
  p: ParticipantDto,
  players: ParticipantDto[],
  timeline: TimelineDto,
  events: TimelineEvent[],
  durationMin: number,
  isLegendary: IsLegendary,
): LineStats {
  const team = players.filter((q) => q.teamId === p.teamId);
  const sum = (f: (q: ParticipantDto) => number) => team.reduce((s, q) => s + f(q), 0);
  const teamKills = sum((q) => q.kills);
  const teamDamage = sum((q) => q.totalDamageDealtToChampions);
  const teamTaken = sum((q) => q.totalDamageTaken);

  const at = (minute: number) => frameAt(timeline, minute)?.participantFrames[String(p.participantId)];
  const csAt = (minute: number) => {
    const pf = at(minute);
    return pf ? pf.minionsKilled + pf.jungleMinionsKilled : null;
  };
  const totalCs = p.totalMinionsKilled + p.neutralMinionsKilled;
  const cs15 = csAt(15);

  const firstItem = events.find(
    (e) => e.type === 'ITEM_PURCHASED' && e.participantId === p.participantId && isLegendary(e.itemId as number),
  );
  const deathsPre15 = events.filter(
    (e) => e.type === 'CHAMPION_KILL' && e.victimId === p.participantId && e.timestamp < 15 * 60_000,
  ).length;

  return {
    champion: p.championName,
    cs10: csAt(10),
    cs15,
    gold10: at(10)?.totalGold ?? null,
    gold15: at(15)?.totalGold ?? null,
    xp15: at(15)?.xp ?? null,
    csPerMin: totalCs / durationMin,
    csPerMinPost15: cs15 !== null && durationMin >= 20 ? (totalCs - cs15) / (durationMin - 15) : null,
    damageShare: teamDamage ? p.totalDamageDealtToChampions / teamDamage : 0,
    damageTakenShare: teamTaken ? p.totalDamageTaken / teamTaken : 0,
    killParticipation: teamKills ? (p.kills + p.assists) / teamKills : 0,
    damagePerGold: p.goldEarned ? p.totalDamageDealtToChampions / p.goldEarned : 0,
    visionPerMin: p.visionScore / durationMin,
    controlWards: p.visionWardsBoughtInGame,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    deathsPre15,
    timeDeadShare: p.totalTimeSpentDead / (durationMin * 60),
    firstItemMin: firstItem ? firstItem.timestamp / 60_000 : null,
  };
}

function deaths(
  me: ParticipantDto,
  players: ParticipantDto[],
  timeline: TimelineDto,
  events: TimelineEvent[],
): DeathInfo[] {
  const byId = new Map(players.map((p) => [p.participantId, p]));
  const allies = players.filter((p) => p.teamId === me.teamId && p.participantId !== me.participantId);
  const frames = timeline.info.frames;

  return events.flatMap((e) => {
    if (e.type !== 'CHAMPION_KILL' || e.victimId !== me.participantId) return [];
    const kill = e as Extract<TimelineEvent, { type: 'CHAMPION_KILL' }>;
    const frame = frames[Math.min(frames.length - 1, Math.round(kill.timestamp / 60_000))];
    const allyDistances = allies
      .map((a) => frame?.participantFrames[String(a.participantId)]?.position)
      .filter((pos): pos is Position => !!pos)
      .map((pos) => distance(pos, kill.position));
    const isolated = allyDistances.length > 0 && Math.min(...allyDistances) > ISOLATION_RANGE;

    const objective = events.find(
      (o) =>
        o.type === 'ELITE_MONSTER_KILL' &&
        o.killerTeamId !== me.teamId &&
        o.timestamp >= kill.timestamp &&
        o.timestamp - kill.timestamp <= OBJECTIVE_WINDOW_MS,
    );

    const minute = kill.timestamp / 60_000;
    return [
      {
        minute,
        position: kill.position,
        zone: zoneOf(kill.position, me.teamId),
        phase: minute < LANE_PHASE_END_MIN ? 'lane' : minute < 25 ? 'mid' : 'late',
        isolated,
        killers: [...new Set([kill.killerId, ...(kill.assistingParticipantIds ?? [])])]
          .map((id) => byId.get(id)?.championName)
          .filter((n): n is string => !!n),
        objectiveLost: objective ? objectiveName(String((objective as { monsterType?: string }).monsterType)) : null,
      } satisfies DeathInfo,
    ];
  });
}
