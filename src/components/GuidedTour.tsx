/**
 * Five-step walkthrough. Each step also *drives* the app (moves the marker,
 * starts the cooling run), which makes it a decent script for a screen
 * recording as well as a first-time explainer.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EUTECTOID } from '../domain/constants';
import { CHROME } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { useCopy } from '../i18n';

export function GuidedTour() {
  const copy = useCopy();
  const step = useAppStore((s) => s.tourStep);
  const setTourStep = useAppStore((s) => s.setTourStep);
  const setPoint = useAppStore((s) => s.setPoint);
  const play = useAppStore((s) => s.play);
  const stop = useAppStore((s) => s.stop);
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];
  const steps = copy.tour.steps;

  useEffect(() => {
    if (step === null) return;
    switch (step) {
      case 0:
        stop();
        setPoint(0.45, 400);
        break;
      case 2:
        setPoint(EUTECTOID.cGamma, 760);
        break;
      case 3:
        setPoint(0.45, 780);
        break;
      case 4:
        setPoint(0.45, 1560);
        play();
        break;
      default:
        break;
    }
  }, [step, setPoint, play, stop]);

  const close = () => {
    stop();
    setTourStep(null);
  };

  return (
    <AnimatePresence>
      {step !== null && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className="panel fixed bottom-5 left-1/2 z-40 w-[min(94vw,460px)] -translate-x-1/2 p-4"
        >
          <div className="flex items-center justify-between">
            <span className="panel-title">
              {copy.ui.step} {step + 1} {copy.ui.of} {steps.length}
            </span>
            <button type="button" className="chip !px-2 !py-0.5" onClick={close}>
              {copy.ui.tourExit}
            </button>
          </div>
          <h3 className="mt-2 text-sm font-semibold" style={{ color: chrome.text }}>
            {steps[step].title}
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: chrome.textMuted }}>
            {steps[step].body}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1.5">
              {steps.map((_, index) => (
                <span
                  key={index}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: index === step ? 18 : 6,
                    background: index === step ? chrome.marker : chrome.grid,
                  }}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="chip"
                disabled={step === 0}
                onClick={() => setTourStep(Math.max(0, step - 1))}
              >
                {copy.ui.previous}
              </button>
              <button
                type="button"
                className="chip chip-active"
                onClick={() => (step === steps.length - 1 ? close() : setTourStep(step + 1))}
              >
                {step === steps.length - 1 ? copy.ui.done : copy.ui.next}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
