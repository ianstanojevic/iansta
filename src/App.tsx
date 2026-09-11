import { useEffect, useMemo } from 'react';

import { classifyPoint } from './domain/diagram';
import { coolingCurve } from './domain/cooling';
import { microstructureAt } from './domain/microstructure';
import { CHROME } from './theme/palette';
import { DICTIONARIES, LanguageContext, useCopy } from './i18n';
import { useAppStore } from './store/useAppStore';
import { useCoolingPlayback } from './hooks/useCoolingPlayback';

import { Header } from './components/Header';
import { PhaseDiagram } from './components/PhaseDiagram';
import { CoolingCurve } from './components/CoolingCurve';
import { CoolingTimeline } from './components/CoolingTimeline';
import { Controls } from './components/Controls';
import { PresetBar } from './components/PresetBar';
import { Legend } from './components/Legend';
import { KeyPoints } from './components/KeyPoints';
import { SidePanel } from './components/SidePanel';
import { MicrostructureCard } from './components/MicrostructureCard';
import { InfoCard } from './components/InfoCard';
import { GuidedTour } from './components/GuidedTour';

function Workspace() {
  const copy = useCopy();
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const carbon = useAppStore((s) => s.carbon);
  const temperature = useAppStore((s) => s.temperature);
  const setCarbon = useAppStore((s) => s.setCarbon);
  const setTemperature = useAppStore((s) => s.setTemperature);
  const chrome = CHROME[theme];

  // Everything below is derived - one marker position, one set of answers.
  const state = useMemo(() => classifyPoint(carbon, temperature), [carbon, temperature]);
  const structure = useMemo(() => microstructureAt(carbon, temperature), [carbon, temperature]);
  const path = useMemo(() => coolingCurve(carbon), [carbon]);
  useCoolingPlayback(path);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.lang = language;
  }, [theme, language]);

  // Arrow keys nudge the marker; the range inputs keep their own behaviour.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const fine = event.shiftKey ? 0.2 : 1;
      switch (event.key) {
        case 'ArrowLeft':
          setCarbon(carbon - 0.01 * fine * 5);
          break;
        case 'ArrowRight':
          setCarbon(carbon + 0.01 * fine * 5);
          break;
        case 'ArrowUp':
          setTemperature(temperature + 10 * fine);
          break;
        case 'ArrowDown':
          setTemperature(temperature - 10 * fine);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [carbon, temperature, setCarbon, setTemperature]);

  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-2.5 p-3 lg:h-screen lg:overflow-hidden lg:p-3.5">
      <Header />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_368px]">
        <div className="flex min-h-0 flex-col gap-2.5">
          <section className="panel relative flex min-h-[460px] flex-1 flex-col p-2 lg:min-h-0">
            <div className="min-h-0 flex-1">
              <PhaseDiagram path={path} />
            </div>
            <div
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-2 pt-2"
              style={{ borderColor: chrome.grid }}
            >
              <Legend />
              <KeyPoints />
            </div>
          </section>

          <div className="grid shrink-0 grid-cols-1 gap-2.5 lg:h-[238px] lg:grid-cols-[minmax(0,1fr)_286px]">
            <section className="panel grid h-[238px] min-h-0 grid-cols-1 gap-3 overflow-hidden p-3 sm:grid-cols-[minmax(0,1fr)_212px] lg:h-auto">
              <div className="flex min-h-0 flex-col">
                <div className="flex items-baseline justify-between">
                  <h2 className="panel-title">{copy.panel.coolingCurve}</h2>
                  <span className="num text-[10px]" style={{ color: chrome.textMuted }}>
                    {copy.cooling.subtitle}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <CoolingCurve path={path} />
                </div>
              </div>
              <div className="hidden min-h-0 flex-col sm:flex">
                <h2 className="panel-title mb-1">{copy.panel.timeline}</h2>
                <div className="min-h-0 flex-1">
                  <CoolingTimeline path={path} />
                </div>
              </div>
            </section>

            <section className="panel h-[238px] min-h-0 overflow-hidden p-3 lg:h-auto">
              <MicrostructureCard structure={structure} />
            </section>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-2.5">
          <section className="panel shrink-0 p-3">
            <h2 className="panel-title mb-2">{copy.controls.presets}</h2>
            <PresetBar />
            <div className="mt-3">
              <Controls />
            </div>
          </section>
          <SidePanel state={state} structure={structure} />
        </aside>
      </main>

      <footer
        className="hidden shrink-0 items-center justify-between text-[10px] lg:flex"
        style={{ color: chrome.textMuted }}
      >
        <span>{copy.footer.source}</span>
        <span>{copy.footer.metastable}</span>
      </footer>

      <InfoCard />
      <GuidedTour />
    </div>
  );
}

export default function App() {
  const language = useAppStore((s) => s.language);
  return (
    <LanguageContext.Provider value={DICTIONARIES[language]}>
      <Workspace />
    </LanguageContext.Provider>
  );
}
