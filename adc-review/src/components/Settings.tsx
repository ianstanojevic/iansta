import { useState } from 'react';
import { REGIONS, type Region } from '../riot/client';
import { setState, useStore } from '../state/store';
import { clearData, loadDemo, syncFromRiot, type Progress } from '../state/sync';

export function SyncPanel({ onDone }: { onDone: () => void }) {
  const settings = useStore((s) => s.settings);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const busy = progress !== null && progress.phase !== 'Klart';
  const set = (patch: Partial<typeof settings>) => setState((s) => ({ settings: { ...s.settings, ...patch } }));

  const sync = async () => {
    setError(null);
    setResult(null);
    try {
      const { added, skipped } = await syncFromRiot(setProgress);
      setResult(`${added} nya ADC-matcher analyserade${skipped ? `, ${skipped} hoppades över (annan roll eller remake)` : ''}.`);
      setProgress(null);
      if (added) onDone();
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    }
  };

  return (
    <div className="card stack" style={{ maxWidth: 640 }}>
      <div>
        <h2>Hämta dina matcher</h2>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Ranked solo/duo-matcher där du spelade bot. Matcher som redan är analyserade hämtas inte igen.
        </p>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 2, minWidth: 160 }}>
          <span>Riot ID</span>
          <input type="text" value={settings.gameName} onChange={(e) => set({ gameName: e.target.value })} placeholder="Namn" />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 90 }}>
          <span>Tagg</span>
          <input type="text" value={settings.tagLine} onChange={(e) => set({ tagLine: e.target.value })} placeholder="EUW" />
        </label>
      </div>
      <div className="row">
        <label className="field" style={{ flex: 2, minWidth: 200 }}>
          <span>Region</span>
          <select value={settings.region} onChange={(e) => set({ region: e.target.value as Region })}>
            {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 120 }}>
          <span>Antal senaste matcher</span>
          <select value={settings.count} onChange={(e) => set({ count: Number(e.target.value) })}>
            {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Riot API-nyckel (valfri)</span>
        <input type="password" value={settings.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder="Lämna tom om RIOT_API_KEY finns i .env.local" autoComplete="off" />
        Sparas bara i den här webbläsaren och skickas bara till din lokala dev-server. Skaffa en på developer.riotgames.com.
      </label>
      <div className="row">
        <button className="btn primary" onClick={sync} disabled={busy}>{busy ? 'Hämtar …' : 'Hämta & analysera'}</button>
        <button className="btn" onClick={() => { loadDemo(); onDone(); }} disabled={busy}>Prova med demodata</button>
      </div>
      {progress && (
        <div>
          <div className="small muted num">{progress.phase}{progress.total ? ` (${progress.done}/${progress.total})` : ''}</div>
          <div className="progress"><div style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '4%' }} /></div>
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
      {result && <div className="notice">{result}</div>}
    </div>
  );
}

export function Settings({ onDone }: { onDone: () => void }) {
  const games = useStore((s) => s.games.length);
  const demo = useStore((s) => s.demo);
  const journal = useStore((s) => Object.keys(s.journal).length);
  return (
    <div className="stack">
      <SyncPanel onDone={onDone} />
      <div className="card stack" style={{ maxWidth: 640 }}>
        <h2>Data</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {games} analyserade matcher{demo ? ' (demo)' : ''} och {journal} reviews sparade i webbläsaren.
        </p>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              if (confirm('Radera alla analyserade matcher och dina reviews?')) clearData();
            }}
          >
            Radera allt
          </button>
          <ExportButton />
        </div>
      </div>
    </div>
  );
}

function ExportButton() {
  const journal = useStore((s) => s.journal);
  const games = useStore((s) => s.games);
  return (
    <button
      className="btn"
      onClick={() => {
        const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), games, journal }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'adc-review-export.json';
        a.click();
        URL.revokeObjectURL(a.href);
      }}
    >
      Exportera som JSON
    </button>
  );
}
