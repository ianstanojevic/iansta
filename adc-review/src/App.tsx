import { useEffect, useState } from 'react';
import { MatchDetail } from './components/MatchDetail';
import { Matches } from './components/Matches';
import { Overview } from './components/Overview';
import { Settings, SyncPanel } from './components/Settings';
import { loadDemo } from './state/sync';
import { useStore } from './state/store';

type Tab = 'overview' | 'matches' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Översikt' },
  { id: 'matches', label: 'Matcher' },
  { id: 'settings', label: 'Hämta data' },
];

export function App() {
  const hasGames = useStore((s) => s.games.length > 0);
  const player = useStore((s) => s.playerLabel);
  const demo = useStore((s) => s.demo);
  const [tab, setTab] = useState<Tab>('overview');
  const [open, setOpen] = useState<string | null>(null);

  // ?demo in the URL loads the demo set directly (handy for a first look).
  useEffect(() => {
    if (new URLSearchParams(location.search).has('demo') && !hasGames) loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openMatch = (id: string) => {
    setOpen(id);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--surface-2)" />
            <path d="M6 26 L26 6 M20 6 H26 V12" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          ADC Review
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className="tab" aria-current={tab === t.id && !open ? 'page' : undefined} onClick={() => { setTab(t.id); setOpen(null); }}>
              {t.label}
            </button>
          ))}
        </nav>
        {player && (
          <div className="player">
            <strong>{player}</strong>{demo && ' · påhittad data'}
          </div>
        )}
      </header>

      {open ? (
        <MatchDetail matchId={open} onBack={() => setOpen(null)} onOpen={openMatch} />
      ) : !hasGames && tab !== 'settings' ? (
        <div className="empty">
          <h2>Hitta det som håller tillbaka din ADC</h2>
          <p>
            Appen läser dina ranked-matcher från Riot API och jämför dig med fiendens ADC i varje match. Den jämför CS,
            guld, var och när du dör, skada och farm efter lanefasen. Sedan rangordnar den dina svagheter, och dina egna
            reviews räknas in.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SyncPanel onDone={() => setTab('overview')} />
          </div>
        </div>
      ) : tab === 'overview' ? (
        <Overview onOpen={openMatch} />
      ) : tab === 'matches' ? (
        <Matches onOpen={openMatch} />
      ) : (
        <Settings onDone={() => setTab('overview')} />
      )}
    </div>
  );
}
