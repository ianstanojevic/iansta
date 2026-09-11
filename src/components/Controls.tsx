import { C_MAX, ROOM_T, T_MAX } from '../domain/constants';
import { EUTECTIC } from '../domain/constants';
import { CHROME, PHASE_COLORS } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { formatNumber, useCopy } from '../i18n';

const SPEEDS = [0.5, 1, 2];

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  digits,
  track,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  digits: number;
  track: string;
  onChange: (value: number) => void;
}) {
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="panel-title">{label}</span>
        <span className="num text-sm font-semibold" style={{ color: chrome.text }}>
          {formatNumber(value, digits, language)}
          <span className="ml-1 text-[10px] font-normal opacity-60">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ ['--track' as string]: track }}
      />
    </div>
  );
}

export function Controls() {
  const copy = useCopy();
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];
  const carbon = useAppStore((s) => s.carbon);
  const temperature = useAppStore((s) => s.temperature);
  const playback = useAppStore((s) => s.playback);
  const speed = useAppStore((s) => s.speed);
  const setCarbon = useAppStore((s) => s.setCarbon);
  const setTemperature = useAppStore((s) => s.setTemperature);
  const setSpeed = useAppStore((s) => s.setSpeed);
  const play = useAppStore((s) => s.play);
  const pause = useAppStore((s) => s.pause);
  const stop = useAppStore((s) => s.stop);

  // Steel on the left of 2.14 %, cast iron on the right - shown in the track.
  const steelStop = (EUTECTIC.cGamma / C_MAX) * 100;
  const carbonTrack = `linear-gradient(90deg, ${PHASE_COLORS.alpha}66 0%, ${PHASE_COLORS.gamma}66 ${steelStop}%, ${PHASE_COLORS.Fe3C}66 100%)`;
  const temperatureTrack = `linear-gradient(90deg, ${chrome.grid} 0%, ${PHASE_COLORS.gamma}55 55%, ${PHASE_COLORS.L}88 100%)`;

  return (
    <div className="flex flex-col gap-3">
      <Slider
        label={copy.controls.carbon}
        value={carbon}
        min={0}
        max={C_MAX}
        step={0.01}
        unit="wt% C"
        digits={2}
        track={carbonTrack}
        onChange={setCarbon}
      />
      <Slider
        label={copy.controls.temperature}
        value={Math.round(temperature)}
        min={ROOM_T}
        max={T_MAX}
        step={1}
        unit="°C"
        digits={0}
        track={temperatureTrack}
        onChange={setTemperature}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={playback === 'playing' ? pause : play}
          className="chip chip-active flex-1 !py-1.5 text-center"
        >
          {playback === 'playing'
            ? copy.controls.pause
            : playback === 'paused'
              ? copy.controls.resume
              : copy.controls.play}
        </button>
        <button
          type="button"
          onClick={stop}
          className="chip !py-1.5"
          disabled={playback === 'idle'}
        >
          {copy.controls.stop}
        </button>
        <div className="flex overflow-hidden rounded-md border" style={{ borderColor: chrome.grid }}>
          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSpeed(option)}
              className="num px-1.5 py-1.5 text-[10px] transition-colors"
              style={{
                background: speed === option ? `${chrome.marker}22` : 'transparent',
                color: speed === option ? chrome.marker : chrome.textMuted,
              }}
            >
              {option}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
