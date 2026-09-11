import { motion } from 'framer-motion';
import type { PointState } from '../domain/diagram';
import { PHASE_META } from '../domain/phases';
import { CHROME, PHASE_COLORS, PHASE_COLORS_LIGHT } from '../theme/palette';
import { PhaseChip } from './PhaseChip';
import { formatFraction } from '../domain/leverRule';
import { useAppStore } from '../store/useAppStore';
import { formatNumber, useCopy } from '../i18n';

interface Props {
  state: PointState;
  left: number;
  top: number;
  width: number;
}

/** Hover read-out: where you are, what is there, and how much of it. */
export function DiagramTooltip({ state, left, top, width }: Props) {
  const copy = useCopy();
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];
  const phaseColors = theme === 'dark' ? PHASE_COLORS : PHASE_COLORS_LIGHT;

  const flip = left > width - 210;
  const fieldKey = state.field as keyof typeof copy.fields;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.12 }}
      className="panel pointer-events-none absolute z-20 w-[196px] px-3 py-2.5"
      style={{
        left,
        top,
        transform: `translate(${flip ? 'calc(-100% - 16px)' : '16px'}, -50%)`,
        // Opaque on purpose: the panel glass is lovely over a plain background
        // but unreadable over the shaded fields.
        background: theme === 'dark' ? 'rgba(10, 15, 22, 0.96)' : 'rgba(255, 255, 255, 0.97)',
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="num text-sm font-semibold" style={{ color: chrome.text }}>
          {Math.round(state.T)} °C
        </span>
        <span className="num text-xs" style={{ color: chrome.textMuted }}>
          {formatNumber(state.c, 2, language)} % C
        </span>
      </div>

      <div className="mt-2">
        <PhaseChip phases={state.phases.map((p) => p.phase)} size="sm" />
      </div>

      <p className="mt-2 text-[11px] leading-snug" style={{ color: chrome.textMuted }}>
        {copy.fields[fieldKey]}
      </p>

      {state.lever && (
        <div className="mt-2 space-y-1">
          {state.phases.map((phase) => (
            <div key={phase.phase} className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: phaseColors[phase.phase] }}
              />
              <span className="w-10 text-[11px]" style={{ color: chrome.text }}>
                {PHASE_META[phase.phase].symbol}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${phase.fraction * 100}%`,
                    background: phaseColors[phase.phase],
                  }}
                />
              </div>
              <span className="num w-11 text-right text-[11px]" style={{ color: chrome.textMuted }}>
                {formatFraction(phase.fraction)} %
              </span>
            </div>
          ))}
        </div>
      )}

      {state.invariant && (
        <div
          className="mt-2 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: `${chrome.marker}1f`, color: chrome.marker }}
        >
          {copy.points[state.invariant].title}
        </div>
      )}
    </motion.div>
  );
}
