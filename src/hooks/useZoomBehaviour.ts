import { useCallback, useEffect, useRef, useState } from 'react';
import { easeCubicInOut } from 'd3-ease';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import type { ScaleLinear } from 'd3-scale';

export interface ZoomControls {
  transform: ZoomTransform;
  /** Animate the view to a data-space window. */
  fitTo: (c0: number, c1: number, T0: number, T1: number) => void;
  reset: () => void;
  zoomed: boolean;
}

const MAX_SCALE = 60;
const DURATION = 520;

/**
 * Wheel-zoom / shift-drag-pan on the plot, kept in React state so the axes and
 * every drawn element can be re-projected with the rescaled scales. Plain
 * dragging is left alone - that belongs to the marker.
 */
export function useZoomBehaviour(
  target: SVGRectElement | null,
  width: number,
  height: number,
  baseX: ScaleLinear<number, number>,
  baseY: ScaleLinear<number, number>,
): ZoomControls {
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const behaviour = useRef<ReturnType<typeof zoom<SVGRectElement, unknown>> | null>(null);
  const animation = useRef(0);

  useEffect(() => {
    if (!target || width <= 0 || height <= 0) return;
    const instance = zoom<SVGRectElement, unknown>()
      .scaleExtent([1, MAX_SCALE])
      .extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      // Dragging moves the marker; panning is shift-drag or a two-finger drag.
      .filter((event: MouseEvent | WheelEvent | TouchEvent) => {
        if (event.type === 'wheel') return true;
        if ('touches' in event) return event.touches.length > 1;
        return event.shiftKey;
      })
      .on('zoom', (event: { transform: ZoomTransform }) => setTransform(event.transform));

    behaviour.current = instance;
    select(target).call(instance);
    return () => {
      select(target).on('.zoom', null);
      behaviour.current = null;
    };
  }, [target, width, height]);

  const applyTransform = useCallback(
    (next: ZoomTransform) => {
      if (!target || !behaviour.current) return;
      const start = transform;
      const t0 = performance.now();
      cancelAnimationFrame(animation.current);

      const step = (now: number) => {
        const progress = Math.min(1, (now - t0) / DURATION);
        const eased = easeCubicInOut(progress);
        const interpolated = zoomIdentity
          .translate(start.x + (next.x - start.x) * eased, start.y + (next.y - start.y) * eased)
          .scale(start.k + (next.k - start.k) * eased);
        behaviour.current?.transform(select(target), interpolated);
        if (progress < 1) animation.current = requestAnimationFrame(step);
      };
      animation.current = requestAnimationFrame(step);
    },
    [target, transform],
  );

  const fitTo = useCallback(
    (c0: number, c1: number, T0: number, T1: number) => {
      const x0 = baseX(c0);
      const x1 = baseX(c1);
      const y0 = baseY(T1);
      const y1 = baseY(T0);
      const k = Math.min(MAX_SCALE, Math.min(width / (x1 - x0), height / (y1 - y0)));
      const tx = (width - (x0 + x1) * k) / 2;
      const ty = (height - (y0 + y1) * k) / 2;
      applyTransform(zoomIdentity.translate(tx, ty).scale(k));
    },
    [applyTransform, baseX, baseY, width, height],
  );

  const reset = useCallback(() => applyTransform(zoomIdentity), [applyTransform]);

  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  return { transform, fitTo, reset, zoomed: transform.k > 1.001 };
}
