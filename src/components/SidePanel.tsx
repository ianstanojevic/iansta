/**
 * Live read-out for the current marker position: which phases, how much of
 * each, and what that alloy actually is.
 */

import { motion } from 'framer-motion';
import type { PointState } from '../domain/diagram';
import type { Microstructure } from '../domain/microstructure';
import { PHASE_META } from '../domain/phases';
import { formatFraction } from '../domain/leverRule';
import { CHROME, PHASE_COLORS, PHASE_COLORS_LIGHT } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { formatNumber, useCopy } from '../i18n';
import { LeverRuleCalculator } from './LeverRuleCalculator';
import { PhaseChip } from './PhaseChip';

interface Props {
  state: PointState;
  structure: Microstructure;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-3">
      <h2 className="panel-title mb-2">{title}</h2>
      {children}
    </section>
  );
}

export function SidePanel({ state, structure }: Props) {
  const copy = useCopy();
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const setInfo = useAppStore((s) => s.setInfo);
  const chrome = CHROME[theme];
  const colors = theme === 'dark' ? PHASE_COLORS : PHASE_COLORS_LIGHT;
  const dominant = state.phases.reduce((a, b) => (a.fraction >= b.fraction ? a : b));

  return (
    <div className="scroll-slim flex flex-col gap-2.5 overflow-y-auto pr-1">
      {/* Screen-reader summary: the diagram itself is a picture, this is the text. */}
      <p aria-live="polite" className="sr-only">
        {formatNumber(state.c, 2, language)} % C, {Math.round(state.T)} °C.{' '}
        {copy.alloyClass[structure.alloyClass].name}.{' '}
        {state.phases
          .map((p) => `${copy.phases[p.phase].name} ${formatFraction(p.fraction)} %`)
          .join(', ')}
        .
      </p>

      <Card title={copy.panel.state}>
        <div className="flex items-center justify-between gap-2">
          <motion.span key={state.field} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
            <PhaseChip phases={state.phases.map((p) => p.phase)} />
          </motion.span>
          <span className="num text-right text-xs leading-tight" style={{ color: chrome.textMuted }}>
            {formatNumber(state.c, 2, language)} % C
            <br />
            {Math.round(state.T)} °C
          </span>
        </div>

        <h3 className="mt-2.5 text-[13px] font-semibold" style={{ color: chrome.text }}>
          {copy.alloyClass[structure.alloyClass].name}
        </h3>
        <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: chrome.textMuted }}>
          {copy.alloyClass[structure.alloyClass].desc}
        </p>

        {state.invariant && (
          <button
            type="button"
            onClick={() => setInfo(state.invariant!)}
            className="mt-2.5 w-full rounded-md px-2.5 py-1.5 text-left text-[11px] font-semibold transition-colors"
            style={{ background: `${chrome.marker}1c`, color: chrome.marker }}
          >
            {copy.points[state.invariant].title} · {copy.points[state.invariant].value} →
          </button>
        )}

        <div className="mt-3 space-y-2">
          {state.phases.map((phase) => (
            <div key={phase.phase}>
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate" style={{ color: chrome.text }}>
                  <span className="font-semibold" style={{ color: colors[phase.phase] }}>
                    {PHASE_META[phase.phase].symbol}
                  </span>{' '}
                  {copy.phases[phase.phase].name}
                  <span className="ml-1 text-[9.5px]" style={{ color: chrome.textMuted }}>
                    {PHASE_META[phase.phase].structure}
                  </span>
                </span>
                <span className="num shrink-0" style={{ color: chrome.textMuted }}>
                  {formatNumber(phase.composition, phase.composition < 0.1 ? 3 : 2, language)} % C
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div
                  className="flex h-1.5 flex-1 overflow-hidden rounded-full"
                  style={{ background: chrome.grid }}
                >
                  <motion.div
                    className="h-full"
                    initial={false}
                    animate={{ width: `${phase.fraction * 100}%` }}
                    transition={{ type: 'spring', stiffness: 240, damping: 28 }}
                    style={{ background: colors[phase.phase] }}
                  />
                </div>
                <span className="num w-12 text-right text-[10px]" style={{ color: chrome.text }}>
                  {formatFraction(phase.fraction)} %
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-2.5 text-[11px] leading-snug" style={{ color: chrome.textMuted }}>
          <span className="font-semibold" style={{ color: colors[dominant.phase] }}>
            {copy.phases[dominant.phase].name}
          </span>{' '}
          — {copy.phases[dominant.phase].desc}
        </p>
      </Card>

      <Card title={copy.panel.lever}>
        <LeverRuleCalculator state={state} />
      </Card>
    </div>
  );
}
