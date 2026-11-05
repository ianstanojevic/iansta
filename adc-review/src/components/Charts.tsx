/** Small hand-drawn SVG charts – no chart library needed for two line types. */
import { fmtNum } from './format';

export function GoldDiffChart({ curve, deaths = [], height = 200 }: { curve: number[]; deaths?: number[]; height?: number }) {
  if (curve.length < 2) return <p className="muted small">Ingen motståndardata för den här matchen.</p>;
  const w = 640;
  const pad = { l: 48, r: 12, t: 14, b: 26 };
  const raw = Math.max(1000, ...curve.map(Math.abs));
  const step = raw > 3000 ? 1000 : 500;
  const max = Math.ceil(raw / step) * step;
  const x = (m: number) => pad.l + (m / (curve.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + ((max - v) / (2 * max)) * (height - pad.t - pad.b);
  const line = curve.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(curve.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
  const ticks: number[] = [];
  for (let t = -max; t <= max; t += max / 2) ticks.push(t);
  const valueAt = (m: number) => {
    const i = Math.min(curve.length - 2, Math.floor(m));
    return curve[i] + (curve[i + 1] - curve[i]) * (m - i);
  };
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45].filter((m) => m < curve.length);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" role="img" aria-label="Guld-diff mot lane-motståndaren per minut">
        <defs>
          <linearGradient id="gd-good" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--good)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--good)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="gd-bad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--bad)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--bad)" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="gd-above"><rect x="0" y="0" width={w} height={y(0)} /></clipPath>
          <clipPath id="gd-below"><rect x="0" y={y(0)} width={w} height={height} /></clipPath>
        </defs>
        <rect x={x(0)} y={pad.t} width={x(Math.min(14, curve.length - 1)) - x(0)} height={height - pad.t - pad.b} fill="rgba(90,169,240,0.04)" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--border-strong)' : 'var(--border)'} strokeDasharray={t === 0 ? undefined : '2 4'} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t > 0 ? `+${fmtNum(t)}` : fmtNum(t)}</text>
          </g>
        ))}
        {minutes.map((m) => (
          <text key={m} x={x(m)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{m}′</text>
        ))}
        <path d={area} fill="url(#gd-good)" clipPath="url(#gd-above)" />
        <path d={area} fill="url(#gd-bad)" clipPath="url(#gd-below)" />
        <path d={line} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" />
        {deaths.filter((m) => m <= curve.length - 1).map((m, i) => (
          <g key={i}>
            <line x1={x(m)} x2={x(m)} y1={pad.t} y2={height - pad.b} stroke="var(--bad)" strokeOpacity="0.35" strokeDasharray="2 3" />
            <circle cx={x(m)} cy={y(valueAt(m))} r="4.5" fill="var(--bg)" stroke="var(--bad)" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div className="legend" style={{ marginTop: 6 }}>
        <span><i style={{ background: 'rgba(90,169,240,0.35)', borderRadius: 2 }} />lanefas</span>
        <span><i style={{ border: '2px solid var(--bad)' }} />ditt dödsfall</span>
      </div>
    </div>
  );
}

/** Per-game values as faint dots with a rolling average line on top. */
export function TrendChart({ values, label, format, window = 5, height = 130 }: {
  values: (number | null)[];
  label: string;
  format: (v: number) => string;
  window?: number;
  height?: number;
}) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 3) return null;
  const w = 380;
  const pad = { l: 44, r: 8, t: 10, b: 18 };
  const max = Math.max(...pts.map((p) => Math.abs(p.v))) || 1;
  const x = (i: number) => pad.l + (i / Math.max(1, values.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + ((max - v) / (2 * max)) * (height - pad.t - pad.b);
  const rolling = pts.map((p, k) => {
    const slice = pts.slice(Math.max(0, k - window + 1), k + 1);
    return { i: p.i, v: slice.reduce((s, q) => s + q.v, 0) / slice.length };
  });
  const latest = rolling[rolling.length - 1].v;
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>{label}</h3>
        <span className="xs muted">snitt senaste {window}: <b className={`num ${latest >= 0 ? 'good' : 'bad'}`} style={{ fontSize: '0.9rem' }}>{format(latest)}</b></span>
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" role="img" aria-label={`${label}, utveckling över matcher`} style={{ marginTop: 6 }}>
        <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />
        <text x={pad.l - 8} y={y(max) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)">{format(max)}</text>
        <text x={pad.l - 8} y={y(0) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)">0</text>
        <text x={pad.l - 8} y={y(-max) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)">{format(-max)}</text>
        {pts.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="2.6" fill={p.v >= 0 ? 'var(--good)' : 'var(--bad)'} fillOpacity="0.5" />
        ))}
        <path d={rolling.map((p, k) => `${k ? 'L' : 'M'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        <text x={pad.l} y={height - 3} fontSize="10" fill="var(--muted)">äldst</text>
        <text x={w - pad.r} y={height - 3} textAnchor="end" fontSize="10" fill="var(--muted)">senast</text>
      </svg>
    </div>
  );
}
