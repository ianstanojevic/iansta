import { AnimatePresence, motion } from 'framer-motion';
import { CHROME } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { useCopy } from '../i18n';

/** Expandable explanation for a named point or line on the diagram. */
export function InfoCard() {
  const copy = useCopy();
  const info = useAppStore((s) => s.info);
  const setInfo = useAppStore((s) => s.setInfo);
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];

  return (
    <AnimatePresence>
      {info && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setInfo(null)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="panel fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: chrome.text }}>
                  {copy.points[info].title}
                </h2>
                <p className="num mt-0.5 text-xs" style={{ color: chrome.marker }}>
                  {copy.points[info].value}
                </p>
              </div>
              <button
                type="button"
                className="chip !px-2 !py-0.5"
                onClick={() => setInfo(null)}
                aria-label={copy.ui.close}
              >
                ✕
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: chrome.textMuted }}>
              {copy.points[info].body}
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
