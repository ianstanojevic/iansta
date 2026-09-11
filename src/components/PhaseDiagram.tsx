/**
 * The phase diagram itself.
 *
 * Division of labour: D3 owns the maths (scales, zoom behaviour, path
 * generation) and React owns the DOM. Nothing is appended imperatively, so the
 * whole picture is a pure function of (size, zoom transform, marker, theme).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { scaleLinear } from 'd3-scale';
import { line as d3line } from 'd3-shape';
import { AnimatePresence } from 'framer-motion';

import { C_MAX, ROOM_T, T_MAX } from '../domain/constants';
import { clamp } from '../domain/curves';
import { classifyPoint } from '../domain/diagram';
import { DRAWN_BOUNDARIES, INVARIANT_POINTS } from '../domain/annotations';
import { FIELD_LABEL_ANCHORS, buildFieldPolygons } from '../domain/regions';
import { fieldLabel, isTwoPhase } from '../domain/phases';
import type { CoolingPath } from '../domain/cooling';
import {
  CHROME,
  PHASE_COLORS,
  PHASE_COLORS_LIGHT,
  fieldColor,
  fieldGradient,
  fieldOpacity,
  fieldSlug,
} from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { useElementSize } from '../hooks/useElementSize';
import { useZoomBehaviour } from '../hooks/useZoomBehaviour';
import { useCopy, formatNumber } from '../i18n';
import { DiagramTooltip } from './DiagramTooltip';

const MARGIN = { top: 16, right: 22, bottom: 42, left: 56 };

/** Computed once: the shaded fields never change, only their projection does. */
const FIELD_POLYGONS = buildFieldPolygons();

export function PhaseDiagram({ path }: { path: CoolingPath }) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const overlayRef = useRef<SVGRectElement | null>(null);
  const [overlay, setOverlay] = useState<SVGRectElement | null>(null);
  const dragging = useRef(false);

  const copy = useCopy();
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const carbon = useAppStore((s) => s.carbon);
  const temperature = useAppStore((s) => s.temperature);
  const hover = useAppStore((s) => s.hover);
  const playback = useAppStore((s) => s.playback);
  const progress = useAppStore((s) => s.progress);
  const tourStep = useAppStore((s) => s.tourStep);
  const setPoint = useAppStore((s) => s.setPoint);
  const setHover = useAppStore((s) => s.setHover);
  const setInfo = useAppStore((s) => s.setInfo);

  const chrome = CHROME[theme];
  const innerWidth = Math.max(0, size.width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, size.height - MARGIN.top - MARGIN.bottom);

  const baseX = useMemo(
    () => scaleLinear().domain([0, C_MAX]).range([0, innerWidth]),
    [innerWidth],
  );
  const baseY = useMemo(
    () => scaleLinear().domain([0, T_MAX]).range([innerHeight, 0]),
    [innerHeight],
  );

  const { transform, fitTo, reset, zoomed } = useZoomBehaviour(
    overlay,
    innerWidth,
    innerHeight,
    baseX,
    baseY,
  );
  const x = useMemo(() => transform.rescaleX(baseX), [transform, baseX]);
  const y = useMemo(() => transform.rescaleY(baseY), [transform, baseY]);

  const project = useMemo(
    () =>
      d3line<[number, number]>()
        .x((p) => x(p[0]))
        .y((p) => y(p[1])),
    [x, y],
  );

  const state = useMemo(() => classifyPoint(carbon, temperature), [carbon, temperature]);
  const hoverState = useMemo(() => (hover ? classifyPoint(hover.c, hover.T) : null), [hover]);

  /* ---- pointer interaction ------------------------------------------- */

  const readPointer = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        c: clamp(x.invert(event.clientX - rect.left), 0, C_MAX),
        T: clamp(y.invert(event.clientY - rect.top), ROOM_T, T_MAX),
      };
    },
    [x, y],
  );

  const handleDown = (event: React.PointerEvent<SVGRectElement>) => {
    if (event.shiftKey || event.button !== 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = readPointer(event);
    setPoint(point.c, point.T);
    setHover(point);
  };

  const handleMove = (event: React.PointerEvent<SVGRectElement>) => {
    const point = readPointer(event);
    setHover(point);
    if (dragging.current) setPoint(point.c, point.T);
  };

  const handleUp = (event: React.PointerEvent<SVGRectElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /* ---- ticks ---------------------------------------------------------- */

  const xTicks = useMemo(() => x.ticks(zoomed ? 8 : 7), [x, zoomed]);
  const yTicks = useMemo(() => y.ticks(zoomed ? 8 : 9), [y, zoomed]);

  const ready = innerWidth > 20 && innerHeight > 20;
  // On a narrow plot the sliver labels and the point read-outs collide; drop
  // them rather than shipping an unreadable pile of text.
  const compact = innerWidth < 520;
  const markerX = x(carbon);
  const markerY = y(temperature);
  const highlightEutectoid = tourStep === 2;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {ready && (
        <svg
          width={size.width}
          height={size.height}
          className="block touch-none select-none"
          role="img"
          aria-label={copy.app.title}
        >
          <defs>
            <clipPath id="plot-clip">
              <rect x={0} y={0} width={innerWidth} height={innerHeight} />
            </clipPath>
            <pattern
              id="two-phase-hatch"
              patternUnits="userSpaceOnUse"
              width={7}
              height={7}
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={7} stroke={chrome.hatch} strokeWidth={0.9} />
            </pattern>
            <filter id="marker-glow" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="3.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {FIELD_POLYGONS.filter(({ field }) => isTwoPhase(field)).map(({ field }) => {
              const [from, to] = fieldGradient(field, theme);
              return (
                <linearGradient
                  key={field}
                  id={`fill-${fieldSlug(field)}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  <stop offset="0%" stopColor={from} />
                  <stop offset="100%" stopColor={to} />
                </linearGradient>
              );
            })}
            <linearGradient id="plot-bg" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={theme === 'dark' ? '#101826' : '#ffffff'}
                stopOpacity={theme === 'dark' ? 0.85 : 0.9}
              />
              <stop
                offset="100%"
                stopColor={theme === 'dark' ? '#080c12' : '#eef3f7'}
                stopOpacity={0.92}
              />
            </linearGradient>
            <linearGradient id="cooling-trail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chrome.marker} stopOpacity={0.05} />
              <stop offset="100%" stopColor={chrome.marker} stopOpacity={0.85} />
            </linearGradient>
          </defs>

          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            <rect
              width={innerWidth}
              height={innerHeight}
              rx={8}
              fill="url(#plot-bg)"
              stroke={chrome.gridStrong}
            />

            <g clipPath="url(#plot-clip)">
              {/* grid */}
              <g pointerEvents="none">
                {xTicks.map((tick) => (
                  <line
                    key={`gx-${tick}`}
                    x1={x(tick)}
                    x2={x(tick)}
                    y1={0}
                    y2={innerHeight}
                    stroke={chrome.grid}
                  />
                ))}
                {yTicks.map((tick) => (
                  <line
                    key={`gy-${tick}`}
                    x1={0}
                    x2={innerWidth}
                    y1={y(tick)}
                    y2={y(tick)}
                    stroke={chrome.grid}
                  />
                ))}
              </g>

              {/* shaded phase fields */}
              <g pointerEvents="none">
                {FIELD_POLYGONS.map(({ field, points }) => {
                  const d = project(points) ?? '';
                  const active = state.field === field;
                  const twoPhase = isTwoPhase(field);
                  return (
                    <g key={field}>
                      <path
                        d={d}
                        fill={twoPhase ? `url(#fill-${fieldSlug(field)})` : fieldColor(field, theme)}
                        fillOpacity={fieldOpacity(field, theme) * (active ? 1.55 : 1)}
                        style={{ transition: 'fill-opacity 260ms ease' }}
                      />
                      {twoPhase && <path d={d} fill="url(#two-phase-hatch)" />}
                    </g>
                  );
                })}
              </g>
            </g>

            {/* interaction surface: sits under the annotations so the labelled
                points stay clickable, over the fills so scrubbing is smooth */}
            <rect
              ref={(node) => {
                overlayRef.current = node;
                setOverlay(node);
              }}
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              cursor="crosshair"
              role="application"
              aria-label={`${copy.axis.carbon} / ${copy.axis.temperature}`}
              onPointerDown={handleDown}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
              onPointerLeave={() => {
                dragging.current = false;
                setHover(null);
              }}
            />

            <g clipPath="url(#plot-clip)" pointerEvents="none">
              {/* boundary lines */}
              {DRAWN_BOUNDARIES.map((boundary) => {
                const d = project(boundary.points) ?? '';
                const strong = boundary.weight === 'strong';
                const lit = highlightEutectoid && boundary.id === 'eutectoid';
                return (
                  <g key={boundary.id}>
                    {strong && (
                      <path
                        d={d}
                        fill="none"
                        stroke={chrome.marker}
                        strokeOpacity={lit ? 0.55 : 0.22}
                        strokeWidth={lit ? 9 : 6}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-opacity 300ms ease' }}
                      />
                    )}
                    <path
                      d={d}
                      fill="none"
                      stroke={strong ? chrome.boundaryStrong : chrome.boundary}
                      strokeWidth={strong ? 1.9 : 1.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}

              {/* composition isopleth + cooling trail */}
              <line
                x1={markerX}
                x2={markerX}
                y1={0}
                y2={innerHeight}
                stroke={chrome.marker}
                strokeOpacity={0.22}
                strokeDasharray="2 5"
              />
              {playback !== 'idle' && (
                <>
                  <line
                    x1={markerX}
                    x2={markerX}
                    y1={y(path.startT)}
                    y2={markerY}
                    stroke="url(#cooling-trail)"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                  {path.events
                    .filter((event) => event.kind !== 'start' && event.kind !== 'end')
                    .map((event, index) => (
                      <line
                        key={`${index}-${event.kind}`}
                        x1={markerX - 7}
                        x2={markerX + 7}
                        y1={y(event.T)}
                        y2={y(event.T)}
                        stroke={chrome.marker}
                        strokeOpacity={temperature <= event.T ? 0.95 : 0.3}
                        strokeWidth={1.6}
                      />
                    ))}
                </>
              )}

              {/* tie line through the marker */}
              {state.lever && (
                <g>
                  <line
                    x1={x(state.lever.cLeft)}
                    x2={x(state.lever.cRight)}
                    y1={markerY}
                    y2={markerY}
                    stroke={chrome.marker}
                    strokeOpacity={0.75}
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                  />
                  {state.phases.map((phase) => (
                    <circle
                      key={phase.phase}
                      cx={x(phase.composition)}
                      cy={markerY}
                      r={4}
                      fill={(theme === 'dark' ? PHASE_COLORS : PHASE_COLORS_LIGHT)[phase.phase]}
                      stroke={chrome.surface}
                      strokeWidth={1.4}
                    />
                  ))}
                </g>
              )}

              {/* field labels */}
              {FIELD_LABEL_ANCHORS.filter((anchor) => !compact || !anchor.small).map((anchor) => (
                <g key={anchor.field}>
                  {anchor.leader && (
                    <line
                      x1={x(anchor.c)}
                      y1={y(anchor.T)}
                      x2={x(anchor.leader.c)}
                      y2={y(anchor.leader.T)}
                      stroke={chrome.textMuted}
                      strokeOpacity={0.5}
                      strokeWidth={1}
                    />
                  )}
                  <text
                    x={x(anchor.c)}
                    y={y(anchor.T)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={chrome.text}
                    fillOpacity={state.field === anchor.field ? 1 : 0.74}
                    fontSize={anchor.small ? 10.5 : 13}
                    fontWeight={state.field === anchor.field ? 700 : 500}
                    style={{ transition: 'fill-opacity 240ms ease' }}
                  >
                    {fieldLabel(anchor.field)}
                  </text>
                </g>
              ))}

              {/* line labels */}
              {DRAWN_BOUNDARIES.filter(
                (b) => b.label && b.labelAt && (!compact || b.weight === 'strong'),
              ).map((boundary) => (
                <text
                  key={`label-${boundary.id}`}
                  x={x(boundary.labelAt![0])}
                  y={y(boundary.labelAt![1]) - 7}
                  fill={chrome.textMuted}
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                  textAnchor="middle"
                >
                  {boundary.label}
                </text>
              ))}
            </g>

            {/* invariant points - clickable, so they sit above the overlay */}
            <g clipPath="url(#plot-clip)">
              {INVARIANT_POINTS.map((point) => {
                const px = x(point.c);
                const py = y(point.T);
                return (
                  <g
                    key={point.id}
                    className="cursor-pointer"
                    onClick={() => setInfo(point.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={copy.points[point.id].title}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setInfo(point.id);
                    }}
                  >
                    <circle cx={px} cy={py} r={11} fill="transparent" />
                    <circle
                      cx={px}
                      cy={py}
                      r={4.6}
                      fill={chrome.surface}
                      stroke={chrome.boundaryStrong}
                      strokeWidth={1.8}
                    />
                    <circle cx={px} cy={py} r={1.9} fill={chrome.boundaryStrong} />
                    {point.label && !compact && (
                      <text
                        x={px + point.dx}
                        y={py + point.dy}
                        textAnchor={point.anchor}
                        fill={chrome.textMuted}
                        fontSize={9.5}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {point.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* marker */}
            <g clipPath="url(#plot-clip)" pointerEvents="none">
              <motion.g
                animate={{ x: markerX, y: markerY }}
                transition={{ type: 'spring', stiffness: 900, damping: 52, mass: 0.5 }}
              >
                <circle
                  r={13}
                  fill="none"
                  stroke={chrome.marker}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  className="origin-center animate-pulse-ring"
                />
                <circle r={7.5} fill={chrome.marker} fillOpacity={0.16} />
                <circle
                  r={5}
                  fill={chrome.marker}
                  stroke={chrome.surface}
                  strokeWidth={1.6}
                  filter="url(#marker-glow)"
                />
              </motion.g>
            </g>

            {/* axes */}
            <g>
              <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} stroke={chrome.axis} />
              <line x1={0} x2={0} y1={0} y2={innerHeight} stroke={chrome.axis} />
              {xTicks.map((tick) => (
                <g key={`tx-${tick}`} transform={`translate(${x(tick)},${innerHeight})`}>
                  <line y2={5} stroke={chrome.axis} />
                  <text
                    y={17}
                    textAnchor="middle"
                    fill={chrome.textMuted}
                    fontSize={10.5}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {formatNumber(tick, tick % 1 === 0 ? 0 : zoomed ? 2 : 1, language)}
                  </text>
                </g>
              ))}
              {yTicks.map((tick) => (
                <g key={`ty-${tick}`} transform={`translate(0,${y(tick)})`}>
                  <line x2={-5} stroke={chrome.axis} />
                  <text
                    x={-9}
                    dy={3.5}
                    textAnchor="end"
                    fill={chrome.textMuted}
                    fontSize={10.5}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {Math.round(tick)}
                  </text>
                </g>
              ))}
              <text
                x={innerWidth / 2}
                y={innerHeight + 36}
                textAnchor="middle"
                fill={chrome.textMuted}
                fontSize={11}
                fontWeight={500}
              >
                {copy.axis.carbon}
              </text>
              <text
                transform={`translate(${-42},${innerHeight / 2}) rotate(-90)`}
                textAnchor="middle"
                fill={chrome.textMuted}
                fontSize={11}
                fontWeight={500}
              >
                {copy.axis.temperature}
              </text>

              {/* live read-out of the marker on both axes */}
              <g pointerEvents="none">
                <rect
                  x={markerX - 22}
                  y={innerHeight + 3}
                  width={44}
                  height={15}
                  rx={4}
                  fill={chrome.marker}
                  fillOpacity={0.92}
                />
                <text
                  x={markerX}
                  y={innerHeight + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                  fill="#04140f"
                  fontWeight={600}
                >
                  {formatNumber(carbon, 2, language)}
                </text>
                <rect
                  x={-46}
                  y={markerY - 8}
                  width={40}
                  height={15}
                  rx={4}
                  fill={chrome.marker}
                  fillOpacity={0.92}
                />
                <text
                  x={-26}
                  y={markerY + 3}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                  fill="#04140f"
                  fontWeight={600}
                >
                  {Math.round(temperature)}
                </text>
              </g>
            </g>
          </g>
        </svg>
      )}

      {/* zoom controls */}
      <div className="pointer-events-auto absolute right-3 top-3 flex gap-1.5">
        <button
          type="button"
          className="chip"
          onClick={() => fitTo(0.2, 1.5, 620, 1020)}
          title={copy.ui.zoomEutectoid}
        >
          {copy.ui.zoomEutectoid}
        </button>
        <button type="button" className="chip" onClick={reset} disabled={!zoomed}>
          {copy.ui.reset}
        </button>
      </div>

      {!compact && (
        <div
          className="pointer-events-none absolute bottom-1 right-3 text-[10px]"
          style={{ color: chrome.textMuted }}
        >
          {copy.ui.zoomHint}
        </div>
      )}

      <AnimatePresence>
        {hoverState && ready && (
          <DiagramTooltip
            state={hoverState}
            left={MARGIN.left + x(hoverState.c)}
            top={MARGIN.top + y(hoverState.T)}
            width={size.width}
          />
        )}
      </AnimatePresence>

      {/* progress read-out during the cooling animation */}
      <AnimatePresence>
        {playback !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="panel pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 px-3 py-1.5 text-[11px]"
          >
            <span className="num" style={{ color: chrome.marker }}>
              {Math.round(temperature)} °C
            </span>
            <span className="mx-2 opacity-40">·</span>
            <span className="num opacity-70">{Math.round(progress * 100)} %</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
