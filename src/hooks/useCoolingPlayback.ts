import { useEffect, useRef } from 'react';
import { temperatureAtTime, type CoolingPath } from '../domain/cooling';
import { useAppStore } from '../store/useAppStore';

/** Seconds of wall-clock time for one full run at speed 1. */
const RUN_SECONDS = 14;

/**
 * Drives the cooling animation.
 *
 * The animation owns nothing: it just advances `progress` and writes back the
 * temperature read off the cooling curve, so every panel in the app follows
 * along through the ordinary derived state.
 */
export function useCoolingPlayback(path: CoolingPath): void {
  const playback = useAppStore((s) => s.playback);
  const speed = useAppStore((s) => s.speed);
  const setProgress = useAppStore((s) => s.setProgress);
  const pause = useAppStore((s) => s.pause);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (playback !== 'playing') return;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = useAppStore.getState().progress;
      const next = current + (dt * speed) / RUN_SECONDS;

      if (next >= 1) {
        setProgress(1, pathRef.current.endT);
        pause();
        return;
      }
      setProgress(next, temperatureAtTime(pathRef.current, next));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playback, speed, setProgress, pause]);
}
