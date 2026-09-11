/**
 * Cooling curve + reaction timeline.
 *
 * The curve is a genuine integration of Newtonian cooling with latent heat, so
 * the thermal arrests appear where the diagram says they must - and their
 * length is proportional to how much of the alloy actually transforms.
 */

import { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { scaleLinear } from 'd3-scale';
import { line as d3line, curveMonotoneX } from 'd3-shape';

import type { CoolingPath } from '../domain/cooling';
import { temperatureAtTime } from '../domain/cooling';
import { ROOM_T } from '../domain/constants';
import { CHROME } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { useElementSize } from '../hooks/useElementSize';
import { useCopy } from '../i18n';

const MARGIN = { top: 10, right: 10, bottom: 20, left: 34 };

export function CoolingCurve({ path }: { path: CoolingPath }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const copy = useCopy();
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];
  const temperature = useAppStore((s) => s.temperature);
  const progress = useAppStore((s) => s.progress);
  const setProgress = useAppStore((s) => s.setProgress);
  const pause = useAppStore((s) => s.pause);
  const playback = useAppStore((s) => s.playback);

  const width = Math.max(0, size.width - MARGIN.left - MARGIN.right);
  const height = Math.max(0, size.height - MARGIN.top - MARGIN.bottom);

  const x = useMemo(() => scaleLinear().domain([0, 1]).range([0, width]), [width]);
  const y = useMemo(
    () => scaleLinear().domain([ROOM_T, path.startT]).range([height, 0]),
    [height, path.startT],
  );

  const curve = useMemo(
    () =>
      d3line<{ t: number; T: number }>()
        .x((d) => x(d.t))
        .y((d) => y(d.T))
        .curve(curveMonotoneX)(path.samples) ?? '',
    [path.samples, x, y],
  );

  const travelled = useMemo(() => {
    const visible = path.samples.filter((s) => s.t <= progress);
    return (
      d3line<{ t: number; T: number }>()
        .x((d) => x(d.t))
        .y((d) => y(d.T))
        .curve(curveMonotoneX)(visible) ?? ''
    );
  }, [path.samples, progress, x, y]);

  // Dragging on the curve scrubs the run, like a video scrubber.
  const scrub = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.buttons === 0 && event.type === 'pointermove') return;
    if (playback === 'playing') pause();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = Math.max(0, Math.min(1, (event.clientX - rect.left - MARGIN.left) / (width || 1)));
    setProgress(t, temperatureAtTime(path, t));
  };

  const ready = width > 20 && height > 20;

  return (
    <div ref={ref} className="h-full w-full">
      {ready && (
        <svg
          ref={svgRef}
          width={size.width}
          height={size.height}
          className="block cursor-ew-resize touch-none"
          onPointerDown={scrub}
          onPointerMove={scrub}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {y.ticks(4).map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line x2={width} stroke={chrome.grid} />
                <text
                  x={-6}
                  dy={3}
                  textAnchor="end"
                  fontSize={9}
                  fontFamily="JetBrains Mono, monospace"
                  fill={chrome.textMuted}
                >
                  {tick}
                </text>
              </g>
            ))}

            {/* reaction lines */}
            {path.events.map((event, index) =>
              event.kind === 'start' || event.kind === 'end' ? null : (
                <g key={`${event.kind}-${index}`}>
                  <line
                    x1={x(path.eventTimes[index])}
                    x2={width}
                    y1={y(event.T)}
                    y2={y(event.T)}
                    stroke={event.invariant ? chrome.marker : chrome.textMuted}
                    strokeOpacity={event.invariant ? 0.5 : 0.28}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={x(path.eventTimes[index])}
                    cy={y(event.T)}
                    r={event.invariant ? 3.4 : 2.4}
                    fill={event.invariant ? chrome.marker : chrome.textMuted}
                  />
                </g>
              ),
            )}

            <path d={curve} fill="none" stroke={chrome.textMuted} strokeOpacity={0.45} strokeWidth={1.6} />
            <path
              d={travelled}
              fill="none"
              stroke={chrome.marker}
              strokeWidth={2.4}
              strokeLinecap="round"
            />

            <motion.circle
              initial={false}
              cx={x(progress)}
              cy={y(Math.max(ROOM_T, temperature))}
              animate={{ cx: x(progress), cy: y(Math.max(ROOM_T, temperature)) }}
              transition={{ type: 'spring', stiffness: 900, damping: 50 }}
              r={4.5}
              fill={chrome.marker}
              stroke={chrome.surface}
              strokeWidth={1.5}
            />

            <text
              x={0}
              y={height + 14}
              fontSize={9}
              fill={chrome.textMuted}
              fontFamily="JetBrains Mono, monospace"
            >
              {copy.cooling.relativeTime} →
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}
