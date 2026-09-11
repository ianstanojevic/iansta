import { motion } from 'framer-motion';
import type { CoolingPath } from '../domain/cooling';
import { CHROME } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { useCopy } from '../i18n';
import { formatFraction } from '../domain/leverRule';

/** The reactions an alloy goes through, in the order they happen. */
export function CoolingTimeline({ path }: { path: CoolingPath }) {
  const copy = useCopy();
  const theme = useAppStore((s) => s.theme);
  const temperature = useAppStore((s) => s.temperature);
  const chrome = CHROME[theme];

  const events = path.events.filter((event) => event.kind !== 'start');
  // The current step is the last reaction the alloy has already cooled past.
  let activeIndex = -1;
  events.forEach((event, index) => {
    if (temperature <= event.T) activeIndex = index;
  });

  return (
    <ol className="scroll-slim h-full space-y-1 overflow-y-auto pr-1">
      {events.map((event, index) => {
        const passed = temperature <= event.T;
        const active = index === activeIndex;
        return (
          <motion.li
            key={`${index}-${event.kind}`}
            initial={false}
            animate={{ opacity: passed ? 1 : 0.42 }}
            className="flex items-start gap-2 rounded-md px-1.5 py-1"
            style={{ background: active ? `${chrome.marker}14` : 'transparent' }}
          >
            <span
              className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: event.invariant ? chrome.marker : chrome.textMuted,
                boxShadow: event.invariant && passed ? `0 0 8px ${chrome.marker}` : undefined,
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="truncate text-[11px]"
                  style={{ color: chrome.text }}
                  title={copy.cooling.events[event.kind]}
                >
                  {copy.cooling.events[event.kind]}
                </span>
                <span
                  className="num shrink-0 text-[10px]"
                  style={{ color: event.invariant ? chrome.marker : chrome.textMuted }}
                >
                  {event.kind === 'end' ? `${Math.round(event.T)} °C` : `${event.T.toFixed(0)} °C`}
                </span>
              </div>
              {event.transformedFraction != null && (
                <span className="num text-[10px]" style={{ color: chrome.textMuted }}>
                  {formatFraction(event.transformedFraction)} % {copy.cooling.transformed}
                </span>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
