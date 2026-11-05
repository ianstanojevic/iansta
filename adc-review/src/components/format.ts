export const fmtPct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '–' : `${(v * 100).toFixed(digits)} %`;

export const fmtSigned = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;

export const fmtNum = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '–' : v.toFixed(digits);

export const fmtClock = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined) return '–';
  const total = Math.round(minutes * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Data Dragon-style ids (KSante, MonkeyKing) to something readable. */
const NAMES: Record<string, string> = { MonkeyKing: 'Wukong', KSante: "K'Sante", Kaisa: "Kai'Sa", Xinzhao: 'Xin Zhao', XinZhao: 'Xin Zhao', LeeSin: 'Lee Sin', MissFortune: 'Miss Fortune', KogMaw: "Kog'Maw", TwistedFate: 'Twisted Fate', Belveth: "Bel'Veth", Velkoz: "Vel'Koz", Chogath: "Cho'Gath", Khazix: "Kha'Zix", RekSai: "Rek'Sai", Kaisaa: "Kai'Sa", Nunu: 'Nunu & Willump', JarvanIV: 'Jarvan IV', DrMundo: 'Dr. Mundo', MasterYi: 'Master Yi', TahmKench: 'Tahm Kench', AurelionSol: 'Aurelion Sol', RenataGlasc: 'Renata Glasc', LeBlanc: 'LeBlanc' };
export const champ = (id: string | null | undefined) => (id ? (NAMES[id] ?? id) : '–');

export const tone = (v: number | null | undefined, goodWhenPositive = true) =>
  v === null || v === undefined || v === 0 ? '' : (v > 0) === goodWhenPositive ? 'good' : 'bad';
