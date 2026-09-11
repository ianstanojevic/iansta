/**
 * The lever rule, drawn as a lever.
 *
 * The tie line becomes a balance beam, the alloy composition becomes the
 * fulcrum, and the two phases hang at the ends with a mass proportional to
 * their weight fraction. The whole point of the picture is that the *opposite*
 * arm sets the amount - which is exactly what trips people up in the formula.
 */

import { motion } from 'framer-motion';
import type { PointState } from '../domain/diagram';
import { PHASE_META } from '../domain/phases';
import { formatFraction } from '../domain/leverRule';
import { CHROME, PHASE_COLORS, PHASE_COLORS_LIGHT } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { formatNumber, useCopy } from '../i18n';

const W = 320;
const H = 98;
/** SVG transforms are animated with CSS, which keeps them in user units. */
const EASE = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), x1 220ms, x2 220ms';
const PAD = 30;
const BEAM_Y = 46;

export function LeverRuleCalculator({ state }: { state: PointState }) {
  const copy = useCopy();
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];
  const colors = theme === 'dark' ? PHASE_COLORS : PHASE_COLORS_LIGHT;

  if (!state.lever || state.phases.length < 2) {
    return (
      <p className="text-[11px] leading-relaxed" style={{ color: chrome.textMuted }}>
        {copy.panel.noLever}
      </p>
    );
  }

  const { lever } = state;
  const [left, right] = state.phases;
  const span = W - PAD * 2;
  const toX = (c: number) => PAD + ((c - lever.cLeft) / lever.tieLine) * span;
  const fulcrum = toX(Math.min(Math.max(lever.c0, lever.cLeft), lever.cRight));
  const chipX = Math.min(W - 36, Math.max(36, fulcrum));
  const blockSize = (fraction: number) => 8 + fraction * 16;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {/* the alloy composition, marking where the beam balances */}
        <g transform={`translate(${chipX},0)`} style={{ transition: EASE }}>
          <rect x={-33} y={0} width={66} height={15} rx={4} fill={chrome.marker} fillOpacity={0.16} />
          <text
            y={11}
            textAnchor="middle"
            fontSize={10}
            fontFamily="JetBrains Mono, monospace"
            fill={chrome.marker}
            fontWeight={600}
          >
            C₀ {formatNumber(lever.c0, 2, language)}
          </text>
        </g>
        <line
          x1={fulcrum}
          x2={fulcrum}
          y1={17}
          y2={BEAM_Y - 4}
          stroke={chrome.marker}
          strokeOpacity={0.4}
          strokeDasharray="2 3"
          style={{ transition: EASE }}
        />

        {/* arm that sets the LEFT phase fraction runs to the RIGHT end */}
        <line
          x1={fulcrum}
          x2={toX(lever.cRight)}
          y1={BEAM_Y}
          y2={BEAM_Y}
          stroke={colors[left.phase]}
          strokeWidth={5}
          strokeLinecap="round"
          opacity={0.9}
        />
        <line
          x1={toX(lever.cLeft)}
          x2={fulcrum}
          y1={BEAM_Y}
          y2={BEAM_Y}
          stroke={colors[right.phase]}
          strokeWidth={5}
          strokeLinecap="round"
          opacity={0.9}
        />

        {/* hanging masses: heavier phase, bigger block */}
        {[left, right].map((phase, index) => {
          const cx = index === 0 ? toX(lever.cLeft) : toX(lever.cRight);
          const size = blockSize(phase.fraction);
          return (
            <g key={phase.phase}>
              <text
                x={cx}
                y={BEAM_Y - 11}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill={colors[phase.phase]}
              >
                {PHASE_META[phase.phase].symbol}
              </text>
              <line
                x1={cx}
                x2={cx}
                y1={BEAM_Y}
                y2={BEAM_Y + 10}
                stroke={chrome.textMuted}
                strokeWidth={1}
              />
              <motion.rect
                initial={false}
                animate={{ width: size, height: size, x: cx - size / 2, y: BEAM_Y + 10 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                rx={3}
                fill={colors[phase.phase]}
                fillOpacity={0.9}
              />
              <text
                x={cx}
                y={H - 2}
                textAnchor="middle"
                fontSize={9.5}
                fontFamily="JetBrains Mono, monospace"
                fill={chrome.textMuted}
              >
                {formatNumber(phase.composition, phase.composition < 0.1 ? 3 : 2, language)}
              </text>
            </g>
          );
        })}

        {/* fulcrum */}
        <path
          transform={`translate(${fulcrum},0)`}
          style={{ transition: EASE }}
          d={`M 0 ${BEAM_Y + 3} L -7 ${BEAM_Y + 15} L 7 ${BEAM_Y + 15} Z`}
          fill={chrome.marker}
        />
      </svg>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        {[left, right].map((phase, index) => (
          <span key={phase.phase} className={index === 1 ? 'text-right' : undefined}>
            <span className="font-medium" style={{ color: colors[phase.phase] }}>
              {copy.lever.arm} {formatNumber(index === 0 ? lever.armLeft : lever.armRight, 2, language)}
            </span>
            <span className="num ml-1.5 font-semibold" style={{ color: chrome.text }}>
              {formatFraction(phase.fraction)} %
            </span>
          </span>
        ))}
      </div>

      <div
        className="num mt-2 rounded-md px-2.5 py-1.5 text-[10px] leading-relaxed"
        style={{ background: chrome.grid, color: chrome.textMuted }}
      >
        W({PHASE_META[left.phase].symbol}) = ({formatNumber(lever.cRight, 2, language)} −{' '}
        {formatNumber(lever.c0, 2, language)}) / ({formatNumber(lever.cRight, 2, language)} −{' '}
        {formatNumber(lever.cLeft, 3, language)}) ={' '}
        <span style={{ color: chrome.text }}>{formatFraction(left.fraction, 1)} %</span>
      </div>

      <p className="mt-1.5 text-[10px] leading-snug" style={{ color: chrome.textMuted }}>
        {copy.lever.note}
      </p>
    </div>
  );
}
