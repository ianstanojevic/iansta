import type { Microstructure } from '../domain/microstructure';
import { formatFraction } from '../domain/leverRule';
import { CHROME, CONSTITUENT_COLORS } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { useCopy } from '../i18n';
import { MicrostructureView } from './MicrostructureView';

/** Micrograph plus the constituent breakdown that produced it. */
export function MicrostructureCard({ structure }: { structure: Microstructure }) {
  const copy = useCopy();
  const theme = useAppStore((s) => s.theme);
  const temperature = useAppStore((s) => s.temperature);
  const chrome = CHROME[theme];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex shrink-0 items-baseline justify-between gap-2">
        <h2 className="panel-title">{copy.panel.micro}</h2>
        <span className="num shrink-0 text-[10px]" style={{ color: chrome.textMuted }}>
          {copy.micro.schematic} · {Math.round(temperature)} °C
        </span>
      </div>

      <div className="min-h-0 flex-1" title={copy.micro.grainNote}>
        <MicrostructureView structure={structure} />
      </div>

      <div className="mt-2 shrink-0 space-y-1">
        {structure.constituents.map((constituent) => (
          <div key={constituent.id} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: CONSTITUENT_COLORS[constituent.id] }}
            />
            <span className="flex-1 truncate text-[11px]" style={{ color: chrome.text }}>
              {copy.constituents[constituent.id].name}
            </span>
            <span className="num text-[11px]" style={{ color: chrome.textMuted }}>
              {formatFraction(constituent.fraction)} %
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
