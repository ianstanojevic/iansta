/** Your own review of a game – the part match data cannot capture. */
export interface JournalEntry {
  matchId: string;
  tags: string[];
  notes: string;
  /** One concrete thing to focus on next game. */
  focus: string;
  /** How well you played, regardless of the result (1–5). */
  rating: number | null;
  updatedAt: number;
}

export const TAG_GROUPS: { group: string; tags: string[] }[] = [
  {
    group: 'Laning',
    tags: [
      'Förlorade level 2-racet',
      'Dåliga trades / fel cooldown-fönster',
      'Fel wave-state inför recall',
      'Missade CS under tryck',
      'Gankad utan ward/info',
      'Saknade prio inför drake',
    ],
  },
  {
    group: 'Mid game',
    tags: [
      'Stannade för länge i sidlane',
      'Gick in i fog utan vision',
      'Sen rotation till objective',
      'Dålig recall-timing',
      'Tappade wave/plates i onödan',
    ],
  },
  {
    group: 'Teamfight',
    tags: [
      'Stod för långt fram',
      'Fel target (slog frontline)',
      'Blev catchad innan fighten',
      'Använde inte summoners',
      'Kitade inte bakåt',
    ],
  },
  {
    group: 'Build & mental',
    tags: ['Fel itemization mot comp', 'Tiltade / chattade', 'Autopilot – ingen plan'],
  },
];

export const EMPTY_ENTRY = (matchId: string): JournalEntry => ({
  matchId,
  tags: [],
  notes: '',
  focus: '',
  rating: null,
  updatedAt: 0,
});
