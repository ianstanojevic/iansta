/**
 * The subset of Riot's match-v5 and timeline payloads this app reads.
 * Field names match the API exactly so real responses can be passed straight in.
 */

export interface MatchDto {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameCreation: number;
    gameDuration: number; // seconds
    queueId: number;
    gameVersion?: string;
    participants: ParticipantDto[];
  };
}

export interface ParticipantDto {
  puuid: string;
  participantId: number;
  teamId: number;
  teamPosition: string; // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY | ''
  championName: string;
  riotIdGameName?: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  visionWardsBoughtInGame: number;
  totalTimeSpentDead: number;
  gameEndedInEarlySurrender?: boolean;
  item0?: number;
  item1?: number;
  item2?: number;
  item3?: number;
  item4?: number;
  item5?: number;
  item6?: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface ParticipantFrameDto {
  participantId: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  totalGold: number;
  xp: number;
  level: number;
  position: Position;
}

export type TimelineEvent =
  | {
      type: 'CHAMPION_KILL';
      timestamp: number;
      killerId: number;
      victimId: number;
      assistingParticipantIds?: number[];
      position: Position;
    }
  | {
      type: 'ELITE_MONSTER_KILL';
      timestamp: number;
      killerTeamId: number;
      monsterType: string; // DRAGON | BARON_NASHOR | RIFTHERALD | HORDE | ATAKHAN
      monsterSubType?: string;
    }
  | { type: 'ITEM_PURCHASED'; timestamp: number; participantId: number; itemId: number }
  | { type: 'TURRET_PLATE_DESTROYED'; timestamp: number; killerId: number; teamId: number; laneType: string }
  | { type: string; timestamp: number; [key: string]: unknown };

export interface TimelineDto {
  metadata: { matchId: string };
  info: {
    frameInterval: number;
    participants?: { participantId: number; puuid: string }[];
    frames: {
      timestamp: number;
      participantFrames: Record<string, ParticipantFrameDto>;
      events: TimelineEvent[];
    }[];
  };
}

export interface AccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}
