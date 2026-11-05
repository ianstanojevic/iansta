import { MAP_SIZE } from '../domain/map';
import type { DeathInfo, GamePhase } from '../domain/analyzeGame';

export interface MapDeath extends DeathInfo {
  side: 'blue' | 'red';
  matchId?: string;
}

const PHASE_COLOR: Record<GamePhase, string> = { lane: 'var(--blue)', mid: 'var(--accent)', late: 'var(--red)' };
const PHASE_LABEL: Record<GamePhase, string> = { lane: 'Lanefas (<14 min)', mid: '14–25 min', late: '25+ min' };

/**
 * Schematic Summoner's Rift with deaths plotted. With `normalize`, red-side
 * games are mirrored so your base is always bottom-left and several games can
 * share one map.
 */
export function DeathMap({ deaths, normalize = false, size = 320, onSelect }: {
  deaths: MapDeath[];
  normalize?: boolean;
  size?: number;
  onSelect?: (matchId: string) => void;
}) {
  const s = (v: number) => (v / MAP_SIZE) * 100;
  const pt = (d: MapDeath) => {
    const flip = normalize && d.side === 'red';
    const x = flip ? MAP_SIZE - d.position.x : d.position.x;
    const y = flip ? MAP_SIZE - d.position.y : d.position.y;
    return { cx: s(x), cy: 100 - s(y) };
  };
  return (
    <div>
      <svg viewBox="0 0 100 100" width="100%" style={{ maxWidth: size, display: 'block', borderRadius: 10 }} role="img" aria-label="Karta över var du dog">
        <rect width="100" height="100" fill="#0f1a17" />
        {/* river */}
        <path d="M 8 8 L 92 92" stroke="#173a4a" strokeWidth="9" strokeLinecap="round" />
        {/* lanes */}
        <g stroke="#2c3a33" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 8 84 L 8 8 L 84 8" />
          <path d="M 16 92 L 92 92 L 92 16" />
          <path d="M 16 84 L 84 16" />
        </g>
        <path d="M 0 100 L 0 76 A 24 24 0 0 0 24 100 Z" fill="rgba(90,169,240,0.28)" />
        <path d="M 100 0 L 76 0 A 24 24 0 0 0 100 24 Z" fill="rgba(240,113,106,0.28)" />
        {normalize && (
          <text x="3" y="97" fontSize="3.4" fill="var(--muted)">din bas</text>
        )}
        {deaths.map((d, i) => {
          const { cx, cy } = pt(d);
          const color = PHASE_COLOR[d.phase];
          return (
            <g
              key={i}
              style={{ cursor: onSelect && d.matchId ? 'pointer' : undefined }}
              onClick={() => onSelect && d.matchId && onSelect(d.matchId)}
            >
              <title>{`${Math.floor(d.minute)}:${String(Math.round((d.minute % 1) * 60)).padStart(2, '0')}${d.isolated ? ' · ensam' : ''}${d.objectiveLost ? ` · fienden tog ${d.objectiveLost}` : ''}`}</title>
              {d.isolated ? (
                <circle cx={cx} cy={cy} r="2" fill="none" stroke={color} strokeWidth="0.9" />
              ) : (
                <circle cx={cx} cy={cy} r="1.6" fill={color} fillOpacity="0.85" />
              )}
              {d.objectiveLost && <circle cx={cx} cy={cy} r="3.2" fill="none" stroke="var(--text)" strokeWidth="0.4" strokeDasharray="1 0.8" />}
            </g>
          );
        })}
      </svg>
      <div className="legend" style={{ marginTop: 10 }}>
        {(['lane', 'mid', 'late'] as GamePhase[]).map((p) => (
          <span key={p}><i style={{ background: PHASE_COLOR[p] }} />{PHASE_LABEL[p]}</span>
        ))}
        <span><i style={{ border: '1.5px solid var(--muted)' }} />ensam (ingen allierad nära)</span>
        <span><i style={{ border: '1px dashed var(--text)' }} />objective förlorat inom 90 s</span>
      </div>
    </div>
  );
}
