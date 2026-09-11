import { PHASE_META, type Phase } from '../domain/phases';
import { CHROME, PHASE_COLORS, PHASE_COLORS_LIGHT } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';

/**
 * "α + Fe₃C" with each symbol in its own phase colour - the same colours the
 * diagram uses, so the chip and the shaded field read as the same thing.
 */
export function PhaseChip({ phases, size = 'md' }: { phases: Phase[]; size?: 'sm' | 'md' }) {
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];
  const colors = theme === 'dark' ? PHASE_COLORS : PHASE_COLORS_LIGHT;
  const tint = phases.map((phase) => `${colors[phase]}1c`);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-semibold ${
        size === 'md' ? 'px-2.5 py-1 text-base' : 'px-2 py-0.5 text-xs'
      }`}
      style={{
        background:
          phases.length === 2
            ? `linear-gradient(90deg, ${tint[0]}, ${tint[1]})`
            : tint[0],
      }}
    >
      {phases.map((phase, index) => (
        <span key={phase} className="flex items-center gap-1">
          {index > 0 && (
            <span style={{ color: chrome.textMuted, fontWeight: 400 }}>+</span>
          )}
          <span style={{ color: colors[phase] }}>{PHASE_META[phase].symbol}</span>
        </span>
      ))}
    </span>
  );
}
