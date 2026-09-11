import { PHASE_META, type Phase } from '../domain/phases';
import { CHROME, PHASE_COLORS, PHASE_COLORS_LIGHT } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { useCopy } from '../i18n';

const ORDER: Phase[] = ['L', 'delta', 'gamma', 'alpha', 'Fe3C'];

/**
 * The legend explains the *rule* rather than listing eleven fields: each phase
 * owns a colour, and two-phase fields are the blend of their two phases.
 */
export function Legend() {
  const copy = useCopy();
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];
  const colors = theme === 'dark' ? PHASE_COLORS : PHASE_COLORS_LIGHT;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {ORDER.map((phase) => (
        <div key={phase} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: colors[phase], boxShadow: `0 0 10px -2px ${colors[phase]}` }}
          />
          <span className="text-[11px]" style={{ color: chrome.text }}>
            {PHASE_META[phase].symbol}
          </span>
          <span className="text-[10px]" style={{ color: chrome.textMuted }}>
            {copy.phases[phase].name}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <svg width="26" height="11" className="rounded-[3px]">
          <defs>
            <linearGradient id="legend-blend" x1="0" x2="1">
              <stop offset="0%" stopColor={colors.alpha} stopOpacity={0.85} />
              <stop offset="100%" stopColor={colors.Fe3C} stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <rect width="26" height="11" fill="url(#legend-blend)" />
        </svg>
        <span className="text-[10px]" style={{ color: chrome.textMuted }}>
          2 {copy.panel.phase.toLowerCase()}
        </span>
      </div>
    </div>
  );
}
