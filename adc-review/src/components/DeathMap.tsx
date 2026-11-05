import { MAP_SIZE } from '../domain/map';
import type { DeathInfo, GamePhase } from '../domain/analyzeGame';
import { mapImage, useDDragonVersion } from '../riot/ddragon';
import { fmtClock } from './format';

export interface MapDeath extends DeathInfo {
  side: 'blue' | 'red';
  matchId?: string;
}

export const PHASE_COLOR: Record<GamePhase, string> = { lane: '#5aa9f0', mid: '#f3c04f', late: '#f0716a' };
const PHASE_LABEL: Record<GamePhase, string> = { lane: 'Lanefas (före 14 min)', mid: '14–25 min', late: '25+ min' };

/**
 * Summoner's Rift with deaths plotted. With `normalize`, red-side games are
 * mirrored so your base is always bottom-left and many games share one map.
 */
export function DeathMap({ deaths, normalize = false, onSelect, highlight }: {
  deaths: MapDeath[];
  normalize?: boolean;
  onSelect?: (matchId: string) => void;
  /** Index of a death to emphasise (e.g. hovered in a list). */
  highlight?: number | null;
}) {
  const version = useDDragonVersion();
  const s = (v: number) => (v / MAP_SIZE) * 100;
  const pt = (d: MapDeath) => {
    const flip = normalize && d.side === 'red';
    const x = flip ? MAP_SIZE - d.position.x : d.position.x;
    const y = flip ? MAP_SIZE - d.position.y : d.position.y;
    return { cx: s(x), cy: 100 - s(y) };
  };
  return (
    <div>
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1' }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block' }} role="img" aria-label="Karta över var du dog">
          <rect width="100" height="100" fill="#0e1915" />
          <path d="M 8 8 L 92 92" stroke="#173a4a" strokeWidth="9" strokeLinecap="round" />
          <g stroke="#2c3a33" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 8 84 L 8 8 L 84 8" />
            <path d="M 16 92 L 92 92 L 92 16" />
            <path d="M 16 84 L 84 16" />
          </g>
          {version && (
            <image href={mapImage(version)} x="0" y="0" width="100" height="100" preserveAspectRatio="none" opacity="0.55" style={{ filter: 'saturate(0.6) brightness(0.8)' }} />
          )}
          <rect width="100" height="100" fill="url(#vignette)" />
          <defs>
            <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
              <stop offset="60%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
            </radialGradient>
          </defs>
          {deaths.map((d, i) => {
            const { cx, cy } = pt(d);
            const color = PHASE_COLOR[d.phase];
            const hl = highlight === i;
            return (
              <g key={i} style={{ cursor: onSelect && d.matchId ? 'pointer' : undefined }} onClick={() => onSelect && d.matchId && onSelect(d.matchId)}>
                <title>{`${fmtClock(d.minute)}${d.isolated ? ' · ensam' : ''}${d.objectiveLost ? ` · fienden tog ${d.objectiveLost}` : ''}`}</title>
                {d.objectiveLost && <circle cx={cx} cy={cy} r={hl ? 4.4 : 3.4} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="0.45" strokeDasharray="1.1 0.8" />}
                {d.isolated ? (
                  <circle cx={cx} cy={cy} r={hl ? 2.8 : 2} fill="rgba(0,0,0,0.35)" stroke={color} strokeWidth="0.9" />
                ) : (
                  <circle cx={cx} cy={cy} r={hl ? 2.6 : 1.7} fill={color} stroke="rgba(0,0,0,0.6)" strokeWidth="0.35" />
                )}
              </g>
            );
          })}
        </svg>
        {normalize && <span className="xs" style={{ position: 'absolute', left: 10, bottom: 8, color: 'rgba(255,255,255,0.7)' }}>din bas</span>}
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        {(['lane', 'mid', 'late'] as GamePhase[]).map((p) => (
          <span key={p}><i style={{ background: PHASE_COLOR[p] }} />{PHASE_LABEL[p]}</span>
        ))}
        <span><i style={{ border: '1.5px solid var(--text-2)' }} />ensam</span>
        <span><i style={{ border: '1px dashed var(--text)' }} />objective förlorat inom 90 s</span>
      </div>
    </div>
  );
}
