import type { InfoKey } from '../domain/annotations';
import { useAppStore } from '../store/useAppStore';
import { useCopy } from '../i18n';

const KEYS: InfoKey[] = ['eutectoid', 'eutectic', 'peritectic', 'a3', 'acm', 'delta'];

/** Quick access to the short explanations of the named points and lines. */
export function KeyPoints() {
  const copy = useCopy();
  const setInfo = useAppStore((s) => s.setInfo);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="chip !px-2 !py-0.5 !text-[10px]"
          onClick={() => setInfo(key)}
        >
          {copy.points[key].title}
        </button>
      ))}
    </div>
  );
}
