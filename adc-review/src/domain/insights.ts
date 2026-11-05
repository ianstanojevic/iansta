import type { GameAnalysis, LineStats } from './analyzeGame';
import type { JournalEntry } from './journal';
import { ZONE_LABEL, type Zone } from './map';
import { clamp01, mean, meanDiff, winrate } from './stats';

export type Category = 'Laning' | 'Positionering' | 'Farm & makro' | 'Teamfight' | 'Vision' | 'Championpool' | 'Mental';

export interface Insight {
  id: string;
  kind: 'weakness' | 'strength';
  category: Category;
  /** 0–1, used to rank. */
  severity: number;
  title: string;
  detail: string;
  /** What to practise. Only on weaknesses. */
  tip?: string;
  /** Matches that illustrate the point, newest first, for jumping straight to the review. */
  examples: string[];
}

/** Below this many games the numbers are mostly noise. */
export const MIN_GAMES = 5;

const pct = (v: number) => `${Math.round(v * 100)} %`;
const pp = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)} pp`;
const signed = (v: number, digits = 0) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;

type Rule = (games: GameAnalysis[], journal: Map<string, JournalEntry>) => Insight[];

const withOpp = (games: GameAnalysis[]) =>
  games.filter((g): g is GameAnalysis & { opp: LineStats } => g.opp !== null);

/** Matches where `score` is largest, newest first among ties, at most three. */
function worst<T extends GameAnalysis>(games: T[], score: (g: T) => number | null): string[] {
  return games
    .map((g) => ({ id: g.matchId, s: score(g) }))
    .filter((x): x is { id: string; s: number } => x.s !== null && x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.id);
}

const laneCs: Rule = (games) => {
  const g = withOpp(games);
  const d10 = meanDiff(g, (x) => x.me.cs10, (x) => x.opp.cs10);
  const d15 = meanDiff(g, (x) => x.me.cs15, (x) => x.opp.cs15);
  if (d10 === null) return [];
  const detail = `CS-diff mot lane-motståndaren: ${signed(d10, 1)} vid 10 min${d15 !== null ? `, ${signed(d15, 1)} vid 15 min` : ''}.`;
  if (d10 <= -4)
    return [
      {
        id: 'lane-cs',
        kind: 'weakness',
        category: 'Laning',
        severity: clamp01(-d10 / 14),
        title: 'Du tappar farm i lanen',
        detail,
        tip: 'Gå igenom de första 10 minuterna i replay med fokus på varje missad cannon och varje wave du lämnar för att trada. Byt till att trada bara när fienden last-hittar, och planera recalls så att du inte tappar en wave i tornet.',
        examples: worst(g, (x) => (x.opp.cs10 ?? 0) - (x.me.cs10 ?? 0)),
      },
    ];
  if (d10 >= 4)
    return [{ id: 'lane-cs', kind: 'strength', category: 'Laning', severity: clamp01(d10 / 14), title: 'Stark farm i lanen', detail, examples: [] }];
  return [];
};

const laneGold: Rule = (games) => {
  const g = withOpp(games);
  const d = meanDiff(g, (x) => x.me.gold15, (x) => x.opp.gold15);
  if (d === null) return [];
  const losing = g.filter((x) => x.me.gold15 !== null && x.opp.gold15 !== null && x.me.gold15 - x.opp.gold15 < -500);
  const detail = `Genomsnittlig guld-diff vid 15 min: ${signed(d)} g. Du ligger efter med mer än 500 g i ${losing.length} av ${g.length} matcher.`;
  if (d <= -250)
    return [
      {
        id: 'lane-gold',
        kind: 'weakness',
        category: 'Laning',
        severity: clamp01(-d / 1000),
        title: 'Du kommer ur lanen efter i guld',
        detail,
        tip: 'Kolla om underskottet kommer från CS, plates eller dödsfall (se dödskartan). Matchups där det upprepas är värda att öva separat i normals eller practice tool.',
        examples: worst(g, (x) => (x.opp.gold15 ?? 0) - (x.me.gold15 ?? 0)),
      },
    ];
  if (d >= 350)
    return [{ id: 'lane-gold', kind: 'strength', category: 'Laning', severity: clamp01(d / 1000), title: 'Du vinner lanen', detail, examples: [] }];
  return [];
};

const earlyDeaths: Rule = (games) => {
  const g = withOpp(games);
  const mine = mean(g.map((x) => x.me.deathsPre15)) ?? 0;
  const theirs = mean(g.map((x) => x.opp.deathsPre15)) ?? 0;
  const share = g.filter((x) => x.me.deathsPre15 > 0).length / Math.max(1, g.length);
  const ganked = games.flatMap((x) => x.deathList).filter((d) => d.minute < 15 && d.killers.length >= 3).length;
  const all = games.flatMap((x) => x.deathList).filter((d) => d.minute < 15).length;
  const detail = `${mine.toFixed(2)} dödsfall före 15 min per match (motståndaren: ${theirs.toFixed(2)}). Du dör tidigt i ${pct(share)} av matcherna${all ? `, och ${ganked} av ${all} av de dödsfallen var mot 3+ fiender (ganks/dives)` : ''}.`;
  if (mine - theirs >= 0.3 || (mine >= 1.1 && mine > theirs))
    return [
      {
        id: 'early-deaths',
        kind: 'weakness',
        category: 'Laning',
        severity: clamp01((mine - theirs) / 1 + (mine - 0.8) / 2),
        title: 'För många dödsfall i lanen',
        detail,
        tip:
          ganked > all / 2
            ? 'De flesta tidiga dödsfallen är ganks. Tracka fiendens jungler från första clear, och var vid tornet när han kan vara bot. Fråga dig före varje push: var är junglern och har vi ward?'
            : 'De flesta tidiga dödsfallen är 2v2. Granska vilka all-ins du tar och mot vilka level-spikes (2, 3, 6), och om du räknade med summoners och fiendens våg.',
        examples: worst(g, (x) => x.me.deathsPre15),
      },
    ];
  if (theirs - mine >= 0.3)
    return [{ id: 'early-deaths', kind: 'strength', category: 'Laning', severity: clamp01(theirs - mine), title: 'Du dör sällan i lanen', detail, examples: [] }];
  return [];
};

const isolatedDeaths: Rule = (games) => {
  const deaths = games.flatMap((g) => g.deathList.map((d) => ({ ...d, matchId: g.matchId }))).filter((d) => d.phase !== 'lane');
  if (deaths.length < 6) return [];
  const iso = deaths.filter((d) => d.isolated);
  const share = iso.length / deaths.length;
  const zones = new Map<Zone, number>();
  for (const d of iso) zones.set(d.zone, (zones.get(d.zone) ?? 0) + 1);
  const top = [...zones.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const detail = `${iso.length} av dina ${deaths.length} dödsfall efter lanefasen (${pct(share)}) skedde utan någon allierad i närheten${top.length ? ` – oftast i ${top.map(([z, n]) => `${ZONE_LABEL[z]} (${n})`).join(' och ')}` : ''}.`;
  if (share >= 0.35)
    return [
      {
        id: 'isolated',
        kind: 'weakness',
        category: 'Positionering',
        severity: clamp01((share - 0.2) / 0.4),
        title: 'Du blir catchad ensam',
        detail,
        tip: 'Isolerade dödsfall som ADC är nästan alltid en informationsfråga. Innan du går in i sidlane eller jungeln: räkna hur många fiender som syns på kartan. Saknas tre eller fler, pusha inte förbi mitten av lanen.',
        examples: worst(games, (g) => g.deathList.filter((d) => d.isolated && d.phase !== 'lane').length),
      },
    ];
  if (share <= 0.15)
    return [{ id: 'isolated', kind: 'strength', category: 'Positionering', severity: 0.4, title: 'Du blir sällan catchad ensam', detail, examples: [] }];
  return [];
};

const objectiveDeaths: Rule = (games) => {
  if (games.length < MIN_GAMES) return [];
  const affected = games.filter((g) => g.deathList.some((d) => d.objectiveLost && d.phase !== 'lane'));
  const events = games.flatMap((g) => g.deathList).filter((d) => d.objectiveLost && d.phase !== 'lane');
  const share = affected.length / games.length;
  if (share < 0.3) return [];
  const kinds = new Map<string, number>();
  for (const e of events) kinds.set(e.objectiveLost!, (kinds.get(e.objectiveLost!) ?? 0) + 1);
  return [
    {
      id: 'objective-deaths',
      kind: 'weakness',
      category: 'Farm & makro',
      severity: clamp01((share - 0.15) / 0.45),
      title: 'Dina dödsfall kostar objectives',
      detail: `I ${pct(share)} av matcherna tog fienden ett objective inom 90 s efter att du dog (${[...kinds.entries()].map(([k, n]) => `${k} ×${n}`).join(', ')}).`,
      tip: 'Sätt en mental timer 60 s före varje drake/baron: då ska vågen vara pushad, du ska ha recallat och du ska inte vara längre fram än din support. Ett dödsfall precis innan är sämre än att missa två waves.',
      examples: worst(games, (g) => g.deathList.filter((d) => d.objectiveLost && d.phase !== 'lane').length),
    },
  ];
};

const damage: Rule = (games) => {
  const g = withOpp(games);
  const share = meanDiff(g, (x) => x.me.damageShare, (x) => x.opp.damageShare);
  const perGold = mean(g.map((x) => (x.opp.damagePerGold ? x.me.damagePerGold / x.opp.damagePerGold : null)));
  const myShare = mean(g.map((x) => x.me.damageShare)) ?? 0;
  if (share === null || perGold === null) return [];
  const detail = `Damage-andel ${pct(myShare)} av laget (${pp(share)} mot motståndaren). Skada per guld: ${pct(perGold)} av motståndarens.`;
  if (share <= -0.02 || perGold <= 0.9)
    return [
      {
        id: 'damage',
        kind: 'weakness',
        category: 'Teamfight',
        severity: clamp01(-share / 0.06 + (1 - perGold) / 0.3),
        title: 'Du får ut mindre skada än du borde',
        detail,
        tip:
          perGold <= 0.9
            ? 'Låg skada per guld betyder att du har items men inte slår. Titta på fights i replay: hur många sekunder står du utan att autoa? Öva att hålla närmaste säkra mål i range i stället för att vänta på det perfekta.'
            : 'Du har mindre guld än motståndaren och därmed mindre skada. Fixa farmen först – se laning- och farm-punkterna.',
        examples: worst(g, (x) => x.opp.damageShare - x.me.damageShare),
      },
    ];
  if (share >= 0.03 && perGold >= 1.05)
    return [{ id: 'damage', kind: 'strength', category: 'Teamfight', severity: clamp01(share / 0.06), title: 'Hög skada i fights', detail, examples: [] }];
  return [];
};

const damageTaken: Rule = (games) => {
  const g = withOpp(games);
  const d = meanDiff(g, (x) => x.me.damageTakenShare, (x) => x.opp.damageTakenShare);
  if (d === null || d < 0.025) return [];
  return [
    {
      id: 'damage-taken',
      kind: 'weakness',
      category: 'Positionering',
      severity: clamp01(d / 0.07),
      title: 'Du tar för mycket skada',
      detail: `Din andel av lagets mottagna skada är ${pp(d)} högre än motståndarens. För en ADC tyder det på att du står inom räckhåll för fiendens frontline eller blir pokad före fights.`,
      tip: 'Under nästa fem matcher: i varje fight, ställ dig vid kanten av din attack range mot närmaste fiende och flytta bara framåt när fiendens engage-verktyg (flash, ult, hook) är använda.',
      examples: worst(g, (x) => x.me.damageTakenShare - x.opp.damageTakenShare),
    },
  ];
};

const killParticipation: Rule = (games) => {
  const g = withOpp(games);
  const d = meanDiff(g, (x) => x.me.killParticipation, (x) => x.opp.killParticipation);
  if (d === null) return [];
  const mine = mean(g.map((x) => x.me.killParticipation)) ?? 0;
  if (d <= -0.06)
    return [
      {
        id: 'kp',
        kind: 'weakness',
        category: 'Farm & makro',
        severity: clamp01(-d / 0.15),
        title: 'Du är inte med när laget slåss',
        detail: `Kill participation ${pct(mine)} (${pp(d)} mot motståndaren).`,
        tip: 'Du farmar troligen sidlanes när fights startar. Titta på minimapen var 3–5 sekund mid game och gå mot laget när din jungler och support rör sig mot ett objective – inte när fighten redan har börjat.',
        examples: worst(g, (x) => x.opp.killParticipation - x.me.killParticipation),
      },
    ];
  if (d >= 0.06)
    return [{ id: 'kp', kind: 'strength', category: 'Farm & makro', severity: clamp01(d / 0.15), title: 'Du är med i fighterna', detail: `Kill participation ${pct(mine)} (${pp(d)} mot motståndaren).`, examples: [] }];
  return [];
};

const midgameFarm: Rule = (games) => {
  const g = withOpp(games);
  const d = meanDiff(g, (x) => x.me.csPerMinPost15, (x) => x.opp.csPerMinPost15);
  const mine = mean(g.map((x) => x.me.csPerMinPost15));
  if (d === null || mine === null) return [];
  const detail = `${mine.toFixed(1)} CS/min efter 15 min (${signed(d, 2)} mot motståndaren).`;
  if (d <= -0.4)
    return [
      {
        id: 'midgame-farm',
        kind: 'weakness',
        category: 'Farm & makro',
        severity: clamp01(-d / 1.2),
        title: 'Du tappar farm efter lanefasen',
        detail,
        tip: 'Efter tornen faller ska du hela tiden veta vilken lane som har nästa wave på väg mot dig. Ta sidlane-waves som ligger på din sida av kartan innan objectives, och ta jungle camps på vägen när du roterar.',
        examples: worst(g, (x) => (x.opp.csPerMinPost15 ?? 0) - (x.me.csPerMinPost15 ?? 0)),
      },
    ];
  if (d >= 0.4)
    return [{ id: 'midgame-farm', kind: 'strength', category: 'Farm & makro', severity: clamp01(d / 1.2), title: 'Bra farm mid/late game', detail, examples: [] }];
  return [];
};

const vision: Rule = (games) => {
  const g = withOpp(games);
  const d = meanDiff(g, (x) => x.me.visionPerMin, (x) => x.opp.visionPerMin);
  const pinks = mean(g.map((x) => x.me.controlWards)) ?? 0;
  const oppPinks = mean(g.map((x) => x.opp.controlWards)) ?? 0;
  if (d === null) return [];
  const detail = `Vision score ${signed(d, 2)} per minut mot motståndaren, ${pinks.toFixed(1)} control wards per match (motståndaren: ${oppPinks.toFixed(1)}).`;
  if (d <= -0.08)
    return [
      {
        id: 'vision',
        kind: 'weakness',
        category: 'Vision',
        severity: clamp01(-d / 0.3),
        title: 'Lägre vision score än motståndaren',
        detail,
        tip: 'Byt till Farsight efter första item och använd den innan du går in i sidlanen. Köp en control ward vid varje recall där du har 75 g över. Ett ward vid din sidlane är billigare än ett dödsfall.',
        examples: worst(g, (x) => x.opp.visionPerMin - x.me.visionPerMin),
      },
    ];
  if (pinks < 1 && g.length >= MIN_GAMES)
    return [
      {
        id: 'vision',
        kind: 'weakness',
        category: 'Vision',
        severity: clamp01((1 - pinks) * 0.4),
        title: 'Du köper nästan inga control wards',
        detail,
        tip: 'Gör det till en vana att alltid ha en control ward i inventoryt efter första item. Placera den i sidlane-bushen eller vid drakpiten innan objectives.',
        examples: worst(g, (x) => (x.me.controlWards === 0 ? 1 : 0)),
      },
    ];
  if (d >= 0.15)
    return [{ id: 'vision', kind: 'strength', category: 'Vision', severity: clamp01(d / 0.4), title: 'Bra vision för en ADC', detail, examples: [] }];
  return [];
};

const timeDead: Rule = (games) => {
  const g = withOpp(games);
  const d = meanDiff(g, (x) => x.me.timeDeadShare, (x) => x.opp.timeDeadShare);
  const mine = mean(g.map((x) => x.me.timeDeadShare)) ?? 0;
  if (d === null || d < 0.02) return [];
  return [
    {
      id: 'time-dead',
      kind: 'weakness',
      category: 'Positionering',
      severity: clamp01(d / 0.06),
      title: 'Du är död en stor del av matchen',
      detail: `Du är död ${pct(mine)} av speltiden, ${pp(d)} mer än lane-motståndaren. Sena dödsfall väger tyngst eftersom respawntiden växer.`,
      tip: 'Sortera dina dödsfall efter 25 min på dödskartan – varje sådant dödsfall bör ha en tydlig förklaring i journalen.',
      examples: worst(g, (x) => x.me.timeDeadShare - x.opp.timeDeadShare),
    },
  ];
};

const firstItem: Rule = (games) => {
  const g = withOpp(games);
  const d = meanDiff(g, (x) => x.me.firstItemMin, (x) => x.opp.firstItemMin);
  const mine = mean(g.map((x) => x.me.firstItemMin));
  if (d === null || mine === null) return [];
  const fmt = (m: number) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
  if (d >= 0.75)
    return [
      {
        id: 'first-item',
        kind: 'weakness',
        category: 'Farm & makro',
        severity: clamp01(d / 2.5),
        title: 'Ditt första item kommer sent',
        detail: `Första legendary item i snitt ${fmt(mine)}, ${d.toFixed(1)} min senare än motståndaren.`,
        tip: 'Planera första recall: kolla vilket guldbelopp du behöver för en komponent som ger effekt, och recalla när vågen just har kraschat i deras torn – inte när du råkar ha guld.',
        examples: worst(g, (x) => (x.me.firstItemMin ?? 0) - (x.opp.firstItemMin ?? 0)),
      },
    ];
  if (d <= -0.75)
    return [{ id: 'first-item', kind: 'strength', category: 'Farm & makro', severity: clamp01(-d / 2.5), title: 'Snabba item-spikes', detail: `Första legendary item ${(-d).toFixed(1)} min före motståndaren.`, examples: [] }];
  return [];
};

const leadConversion: Rule = (games) => {
  const ahead = games.filter((g) => (g.goldDiffCurve[15] ?? 0) >= 500);
  const behind = games.filter((g) => g.goldDiffCurve.length > 15 && (g.goldDiffCurve[15] ?? 0) <= -500);
  const out: Insight[] = [];
  if (ahead.length >= 4) {
    const wr = winrate(ahead.map((g) => g.win))!;
    if (wr < 0.6)
      out.push({
        id: 'lead-conversion',
        kind: 'weakness',
        category: 'Farm & makro',
        severity: clamp01((0.75 - wr) / 0.4),
        title: 'Du omvandlar inte leads till vinster',
        detail: `Du vann bara ${pct(wr)} av de ${ahead.length} matcher där du var 500+ g före vid 15 min.`,
        tip: 'Med lead är din uppgift att göra laget starkare, inte att jaga mer kills: ta plates och torn, flytta mid med din support, och undvik att ge tillbaka bounty. Granska vad som hände mellan 15 och 25 min i de här matcherna.',
        examples: ahead.filter((g) => !g.win).slice(-3).reverse().map((g) => g.matchId),
      });
    else if (wr >= 0.75)
      out.push({ id: 'lead-conversion', kind: 'strength', category: 'Farm & makro', severity: 0.5, title: 'Du stänger matcher när du är före', detail: `${pct(wr)} vinst i ${ahead.length} matcher med 500+ g lead vid 15 min.`, examples: [] });
  }
  if (behind.length >= 4) {
    const wr = winrate(behind.map((g) => g.win))!;
    if (wr >= 0.45)
      out.push({ id: 'comeback', kind: 'strength', category: 'Mental', severity: 0.4, title: 'Du spelar bra från underläge', detail: `${pct(wr)} vinst i ${behind.length} matcher där du var 500+ g efter vid 15 min.`, examples: [] });
  }
  return out;
};

const championPool: Rule = (games) => {
  if (games.length < 10) return [];
  const overall = winrate(games.map((g) => g.win))!;
  const byChamp = new Map<string, GameAnalysis[]>();
  for (const g of games) byChamp.set(g.me.champion, [...(byChamp.get(g.me.champion) ?? []), g]);
  const out: Insight[] = [];
  for (const [champ, list] of byChamp) {
    if (list.length < 4) continue;
    const wr = winrate(list.map((g) => g.win))!;
    const csd = meanDiff(withOpp(list), (x) => x.me.cs10, (x) => x.opp.cs10);
    const detail = `${list.length} matcher, ${pct(wr)} vinst (totalt ${pct(overall)})${csd !== null ? `, CS-diff@10 ${signed(csd, 1)}` : ''}.`;
    if (wr <= overall - 0.15)
      out.push({
        id: `champ-${champ}`,
        kind: 'weakness',
        category: 'Championpool',
        severity: clamp01((overall - wr) / 0.35),
        title: `${champ} går sämre än resten av poolen`,
        detail,
        tip: `Antingen är det matchups eller förståelse av ${champ}s power spikes. Jämför dina ${champ}-förluster med dina bästa matcher på champen, eller spela den mindre i ranked tills vidare.`,
        examples: list.filter((g) => !g.win).slice(-3).reverse().map((g) => g.matchId),
      });
    else if (wr >= overall + 0.15)
      out.push({ id: `champ-${champ}`, kind: 'strength', category: 'Championpool', severity: clamp01((wr - overall) / 0.35), title: `${champ} är din starkaste champ`, detail, examples: [] });
  }
  return out;
};

/** Gap between one game's end and the next game's start that still counts as the same session. */
const SESSION_GAP_MS = 45 * 60_000;

const tilt: Rule = (games) => {
  if (games.length < 15) return [];
  const sorted = [...games].sort((a, b) => a.gameCreation - b.gameCreation);
  const afterLoss: boolean[] = [];
  const afterWin: boolean[] = [];
  const early: boolean[] = [];
  const late: boolean[] = [];
  let index = 0;
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const g = sorted[i];
    const sameSession = prev && g.gameCreation - (prev.gameCreation + prev.durationMin * 60_000) < SESSION_GAP_MS;
    index = sameSession ? index + 1 : 0;
    (index < 3 ? early : late).push(g.win);
    if (sameSession) (prev.win ? afterWin : afterLoss).push(g.win);
  }
  const out: Insight[] = [];
  const wl = winrate(afterLoss);
  const ww = winrate(afterWin);
  if (wl !== null && ww !== null && afterLoss.length >= 5 && ww - wl >= 0.15)
    out.push({
      id: 'tilt',
      kind: 'weakness',
      category: 'Mental',
      severity: clamp01((ww - wl) / 0.4),
      title: 'Förluster smittar av sig på nästa match',
      detail: `${pct(wl)} vinst i matcher direkt efter en förlust (${afterLoss.length} st), mot ${pct(ww)} efter en vinst.`,
      tip: 'Gör en kort review (2 min, en tagg och ett fokus) efter varje förlust innan du köar igen. Om du inte kan formulera ett fokus är det ett tecken på att ta paus.',
      examples: [],
    });
  const we = winrate(early);
  const wlate = winrate(late);
  if (we !== null && wlate !== null && late.length >= 5 && we - wlate >= 0.15)
    out.push({
      id: 'session-length',
      kind: 'weakness',
      category: 'Mental',
      severity: clamp01((we - wlate) / 0.4),
      title: 'Du blir sämre i långa sessioner',
      detail: `${pct(we)} vinst i dina tre första matcher per session, ${pct(wlate)} från fjärde matchen och framåt (${late.length} st).`,
      tip: 'Sätt ett tak på tre ranked-matcher per session och utvärdera innan du fortsätter.',
      examples: [],
    });
  return out;
};

const journalTags: Rule = (games, journal) => {
  const ids = new Set(games.map((g) => g.matchId));
  const entries = [...journal.values()].filter((e) => ids.has(e.matchId) && e.tags.length);
  if (entries.length < 3) return [];
  const counts = new Map<string, string[]>();
  for (const e of entries) for (const t of e.tags) counts.set(t, [...(counts.get(t) ?? []), e.matchId]);
  return [...counts.entries()]
    .filter(([, list]) => list.length >= 3 && list.length / entries.length >= 0.25)
    .map(([tag, list]) => ({
      id: `tag-${tag}`,
      kind: 'weakness' as const,
      category: 'Mental' as Category,
      severity: clamp01(list.length / entries.length),
      title: `Återkommer i dina reviews: ”${tag}”`,
      detail: `Du har taggat det i ${list.length} av ${entries.length} granskade matcher.`,
      tip: 'Gör det här till ditt enda fokus de nästa fem matcherna och skriv efter varje match om det hände igen.',
      examples: list.slice(-3).reverse(),
    }));
};

const RULES: Rule[] = [
  laneCs,
  laneGold,
  earlyDeaths,
  isolatedDeaths,
  objectiveDeaths,
  damage,
  damageTaken,
  killParticipation,
  midgameFarm,
  vision,
  timeDead,
  firstItem,
  leadConversion,
  championPool,
  tilt,
  journalTags,
];

export function findInsights(games: GameAnalysis[], journal: Map<string, JournalEntry> = new Map()): Insight[] {
  if (games.length < MIN_GAMES) return [];
  return RULES.flatMap((rule) => rule(games, journal)).sort((a, b) => b.severity - a.severity);
}
