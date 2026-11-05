import { useEffect, useState } from 'react';
import { MatchDetail } from './components/MatchDetail';
import { Matches } from './components/Matches';
import { Overview } from './components/Overview';
import { Settings, SyncPanel } from './components/Settings';
import { cancelSync, loadDemo } from './state/sync';
import { useStore } from './state/store';
import { useSyncStatus } from './state/syncStatus';

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
  const [name, tag] = (player ?? '').split('#');

  return (
    <>
      <div className="topbar-wrap">
        <header className="topbar">
          <div className="brand">
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
              <defs>
                <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#f3c97a" />
                  <stop offset="1" stopColor="#c98b2e" />
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="8" fill="#19212f" />
              <path d="M7 25 L23 9" stroke="url(#logo)" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M17 8 H24 V15" fill="none" stroke="url(#logo)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 19 V25 H13" fill="none" stroke="#5aa9f0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
            </svg>
            <span>ADC Review</span>
          </div>
          {hasGames && (
            <nav className="tabs" aria-label="Huvudmeny">
              {TABS.map((t) => (
                <button key={t.id} className="tab" aria-current={tab === t.id && !open ? 'page' : undefined} onClick={() => { setTab(t.id); setOpen(null); }}>
                  {t.label}
                </button>
              ))}
            </nav>
          )}
          {player && (
            <div className="player">
              <span>
                <span className="name">{name}</span>
                {tag && <span className="tag"> #{tag}</span>}
                {demo && <span className="badge" style={{ marginLeft: 8 }}>demo</span>}
              </span>
              <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
            </div>
          )}
        </header>
        <SyncBanner />
      </div>

      <main className="app">
        {open ? (
          <MatchDetail matchId={open} onBack={() => setOpen(null)} onOpen={openMatch} />
        ) : !hasGames ? (
          <Welcome onDone={() => setTab('overview')} />
        ) : tab === 'overview' ? (
          <Overview onOpen={openMatch} />
        ) : tab === 'matches' ? (
          <Matches onOpen={openMatch} />
        ) : (
          <Settings onDone={() => setTab('overview')} />
        )}
      </main>
    </>
  );
}

function SyncBanner() {
  const s = useSyncStatus();
  if (!s.running) return null;
  return (
    <div className="sync-banner" role="status">
      <div className="inner">
        <span className="spinner" />
        <span className="num nowrap">{s.phase}{s.total ? ` · ${s.done}/${s.total}` : ''}</span>
        <div className="bar"><div style={{ width: s.total ? `${(s.done / s.total) * 100}%` : '3%' }} /></div>
        <button className="btn ghost sm" onClick={cancelSync} disabled={s.cancelRequested}>Avbryt</button>
      </div>
    </div>
  );
}

function Welcome({ onDone }: { onDone: () => void }) {
  return (
    <section className="hero">
      <div>
        <h1>Se exakt var du tappar mot <em>andra ADC:er på din nivå</em></h1>
        <p className="lead">
          ADC Review läser dina ranked-matcher från Riot API och jämför dig med fiendens ADC i varje match. Sedan
          rangordnar den dina återkommande svagheter och säger vad du ska öva på.
        </p>
        <ul>
          <li>CS- och guld-diff i lanefasen, och om dina tidiga dödsfall är ganks eller 2v2</li>
          <li>Var och när du dör ensam, och vilka objectives det kostar laget</li>
          <li>Farm efter lanefasen, damage per guld, och om du stänger matcher när du är före</li>
          <li>En journal per match med ADC-specifika taggar. Det du taggar ofta blir en svaghet.</li>
        </ul>
      </div>
      <SyncPanel onDone={onDone} compact />
    </section>
  );
}
