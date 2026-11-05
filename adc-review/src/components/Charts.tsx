/** Small hand-drawn SVG charts – no chart library needed for two line types. */

export function GoldDiffChart({ curve, height = 160 }: { curve: number[]; height?: number }) {
  if (curve.length < 2) return <p className="muted small">Ingen motståndardata för den här matchen.</p>;
  const w = 600;
  const pad = { l: 44, r: 10, t: 10, b: 22 };
  const max = Math.max(1000, ...curve.map(Math.abs));
  const x = (i: number) => pad.l + (i / (curve.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + ((max - v) / (2 * max)) * (height - pad.t - pad.b);
  const line = curve.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(curve.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
  const ticks = [max, max / 2, 0, -max / 2, -max].map((v) => Math.round(v / 100) * 100);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" role="img" aria-label="Guld-diff mot lane-motståndaren per minut">
      <defs>
        <clipPath id="gd-above"><rect x="0" y="0" width={w} height={y(0)} /></clipPath>
        <clipPath id="gd-below"><rect x="0" y={y(0)} width={w} height={height} /></clipPath>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1.2 : 0.6} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{t > 0 ? `+${t}` : t}</text>
        </g>
      ))}
      {[10, 15, 20, 25, 30, 35].filter((m) => m < curve.length).map((m) => (
        <text key={m} x={x(m)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{m}</text>
      ))}
      <path d={area} fill="var(--good)" fillOpacity="0.18" clipPath="url(#gd-above)" />
      <path d={area} fill="var(--bad)" fillOpacity="0.18" clipPath="url(#gd-below)" />
      <path d={line} fill="none" stroke="var(--text)" strokeWidth="1.6" />
    </svg>
  );
}

/** Per-game values as faint dots with a rolling average line on top. */
export function TrendChart({ values, label, format, window = 5, height = 120 }: {
  values: (number | null)[];
  label: string;
  format: (v: number) => string;
  window?: number;
  height?: number;
}) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 3) return null;
  const w = 360;
  const pad = { l: 40, r: 8, t: 8, b: 8 };
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
        <span className={`num small ${latest >= 0 ? 'good' : 'bad'}`}>senaste {window}: {format(latest)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" role="img" aria-label={`${label}, utveckling över matcher`}>
        <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        <text x={pad.l - 6} y={y(max) + 8} textAnchor="end" fontSize="10" fill="var(--muted)">{format(max)}</text>
        <text x={pad.l - 6} y={y(-max)} textAnchor="end" fontSize="10" fill="var(--muted)">{format(-max)}</text>
        {pts.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="2.2" fill={p.v >= 0 ? 'var(--good)' : 'var(--bad)'} fillOpacity="0.45" />
        ))}
        <path
          d={rolling.map((p, k) => `${k ? 'L' : 'M'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
