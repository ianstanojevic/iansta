import { REGIONS, type Region } from '../riot/client';
import { setState, useStore } from '../state/store';
import { clearData, loadDemo, runSync } from '../state/sync';
import { useSyncStatus } from '../state/syncStatus';

export function SyncPanel({ onDone, compact = false }: { onDone: () => void; compact?: boolean }) {
  const settings = useStore((s) => s.settings);
  const status = useSyncStatus();
  const set = (patch: Partial<typeof settings>) => setState((s) => ({ settings: { ...s.settings, ...patch } }));

  const sync = async () => {
    if ((await runSync()) > 0) onDone();
  };

  return (
    <div className="card stack" style={{ width: '100%', maxWidth: 640, gap: 18, padding: compact ? 24 : undefined }}>
      <div>
        <h2>Hämta dina matcher</h2>
        <p className="muted small" style={{ marginTop: 4 }}>
          Ranked solo/duo där du spelade bot. Redan analyserade matcher hämtas inte igen.
        </p>
      </div>
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
        <label className="field" style={{ flex: 3 }}>
          <span>Riot ID</span>
          <input type="text" value={settings.gameName} onChange={(e) => set({ gameName: e.target.value })} placeholder="Namn" />
        </label>
        <span className="muted" style={{ paddingBottom: 9 }}>#</span>
        <label className="field" style={{ flex: 1.3 }}>
          <span>Tagg</span>
          <input type="text" value={settings.tagLine} onChange={(e) => set({ tagLine: e.target.value.replace(/^#/, '') })} placeholder="EUW" />
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
          <span>Antal matcher</span>
          <select value={settings.count} onChange={(e) => set({ count: Number(e.target.value) })}>
            {[20, 50, 100, 200].map((n) => <option key={n} value={n}>Senaste {n}</option>)}
          </select>
        </label>
      </div>
      {!compact && (
        <label className="field">
          <span>Riot API-nyckel (valfri)</span>
          <input type="password" value={settings.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder="Lämna tom om RIOT_API_KEY finns i .env.local" autoComplete="off" />
          Sparas bara i den här webbläsaren och skickas bara till din lokala dev-server.
        </label>
      )}
      <div className="row">
        <button className="btn primary" onClick={sync} disabled={status.running}>{status.running ? 'Hämtar …' : 'Hämta & analysera'}</button>
        <button className="btn ghost" onClick={() => { loadDemo(); onDone(); }} disabled={status.running}>Prova med demodata</button>
      </div>
      {status.error && <div className="notice error">{status.error}</div>}
      {status.result && !status.running && <div className="notice success">{status.result}</div>}
    </div>
  );
}

export function Settings({ onDone }: { onDone: () => void }) {
  const games = useStore((s) => s.games.length);
  const demo = useStore((s) => s.demo);
  const journal = useStore((s) => Object.keys(s.journal).length);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Hämta data</h1>
          <p className="sub">Hämta nya matcher, byt konto eller hantera sparad data.</p>
        </div>
      </div>
      <div className="stack">
        <SyncPanel onDone={onDone} />
        <div className="card stack" style={{ maxWidth: 640 }}>
          <div>
            <h2>Sparad data</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              {games} analyserade matcher{demo ? ' (demo)' : ''} och {journal} reviews, sparade i den här webbläsaren.
            </p>
          </div>
          <div className="row">
            <ExportButton />
            <button className="btn ghost" onClick={() => { if (confirm('Radera alla analyserade matcher och dina reviews?')) clearData(); }}>
              Radera allt
            </button>
          </div>
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
