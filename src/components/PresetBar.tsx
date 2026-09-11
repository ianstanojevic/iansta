import { motion } from 'framer-motion';
import { PRESETS } from '../domain/alloys';
import { CHROME } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { useCopy } from '../i18n';

/** One-click jumps to the alloys people actually ask about. */
export function PresetBar() {
  const copy = useCopy();
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];
  const preset = useAppStore((s) => s.preset);
  const applyPreset = useAppStore((s) => s.applyPreset);
  const active = PRESETS.find((item) => item.id === preset);

  return (
    <div>
      <div className="flex flex-wrap gap-[3px]">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            title={`${copy.presets[item.id].name} — ${copy.presets[item.id].note}`}
            onClick={() => applyPreset(item.id, item.c, item.T)}
            className={`chip num !px-[7px] !text-[11px] ${preset === item.id ? 'chip-active' : ''}`}
          >
            {item.short}
          </button>
        ))}
      </div>
      <motion.p
        key={preset ?? 'none'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-1.5 text-[10.5px] leading-snug"
        style={{ color: chrome.textMuted }}
      >
        {active ? (
          <>
            <span style={{ color: chrome.text }}>{copy.presets[active.id].name}</span> ·{' '}
            {copy.presets[active.id].note}
          </>
        ) : (
          copy.controls.dragHint
        )}
      </motion.p>
    </div>
  );
}
