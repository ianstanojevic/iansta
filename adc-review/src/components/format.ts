export const fmtPct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '–' : `${(v * 100).toFixed(digits).replace('.', ',')} %`;

const nf = (digits: number) =>
  new Intl.NumberFormat('sv-SE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtSigned = (v: number | null | undefined, digits = 0) => {
  if (v === null || v === undefined) return '–';
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${nf(digits).format(Math.abs(r))}`;
};

export const fmtNum = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '–' : nf(digits).format(v).replace('-', '−');

export const fmtClock = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined) return '–';
  const total = Math.round(minutes * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });

/** "3 timmar sedan", "igår", … */
export function fmtAgo(ms: number, now = Date.now()) {
  const rtf = new Intl.RelativeTimeFormat('sv', { numeric: 'auto' });
  const min = Math.round((ms - now) / 60_000);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

/** Data Dragon-style ids (KSante, MonkeyKing) to something readable. */
const NAMES: Record<string, string> = { MonkeyKing: 'Wukong', KSante: "K'Sante", Kaisa: "Kai'Sa", Xinzhao: 'Xin Zhao', XinZhao: 'Xin Zhao', LeeSin: 'Lee Sin', MissFortune: 'Miss Fortune', KogMaw: "Kog'Maw", TwistedFate: 'Twisted Fate', Belveth: "Bel'Veth", Velkoz: "Vel'Koz", Chogath: "Cho'Gath", Khazix: "Kha'Zix", RekSai: "Rek'Sai", Kaisaa: "Kai'Sa", Nunu: 'Nunu & Willump', JarvanIV: 'Jarvan IV', DrMundo: 'Dr. Mundo', MasterYi: 'Master Yi', TahmKench: 'Tahm Kench', AurelionSol: 'Aurelion Sol', RenataGlasc: 'Renata Glasc', LeBlanc: 'LeBlanc' };
export const champ = (id: string | null | undefined) => (id ? (NAMES[id] ?? id) : '–');

export const tone = (v: number | null | undefined, goodWhenPositive = true) =>
  v === null || v === undefined || v === 0 ? '' : (v > 0) === goodWhenPositive ? 'good' : 'bad';
