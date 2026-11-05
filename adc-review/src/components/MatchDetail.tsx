import { EMPTY_ENTRY, TAG_GROUPS, type JournalEntry } from '../domain/journal';
import { ZONE_LABEL } from '../domain/map';
import { saveJournal, useStore } from '../state/store';
import { GoldDiffChart } from './Charts';
import { DeathMap } from './DeathMap';
import { champ, fmtClock, fmtDate } from './format';
import { METRICS } from './metrics';

export function MatchDetail({ matchId, onBack, onOpen }: { matchId: string; onBack: () => void; onOpen: (id: string) => void }) {
  const games = useStore((s) => s.games);
  const journal = useStore((s) => s.journal);
  const index = games.findIndex((g) => g.matchId === matchId);
  const g = games[index];
  if (!g) return <p className="muted">Matchen finns inte längre. <button className="btn link" onClick={onBack}>Tillbaka</button></p>;
  const entry = journal[matchId] ?? EMPTY_ENTRY(matchId);
  const previous = games.slice(0, index).reverse().map((x) => journal[x.matchId]).find((e) => e?.focus?.trim());
  const prevGame = games[index - 1];
  const nextGame = games[index + 1];

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn link" onClick={onBack}>← Alla matcher</button>
        <div className="row">
          <button className="btn" disabled={!prevGame} onClick={() => prevGame && onOpen(prevGame.matchId)}>Äldre</button>
          <button className="btn" disabled={!nextGame} onClick={() => nextGame && onOpen(nextGame.matchId)}>Nyare</button>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'baseline' }}>
        <span className={`result ${g.win ? 'w' : 'l'}`} style={{ width: 'auto', padding: '2px 10px' }}>{g.win ? 'Vinst' : 'Förlust'}</span>
        <h2 style={{ fontSize: '1.5rem' }}>{champ(g.me.champion)} <span className="muted">vs</span> {champ(g.opp?.champion)}</h2>
        <span className="muted">
          med {champ(g.support)} mot {champ(g.enemySupport)} · {fmtClock(g.durationMin)} · {g.side === 'blue' ? 'blå' : 'röd'} sida · {fmtDate(g.gameCreation)}
        </span>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Guld-diff mot {champ(g.opp?.champion)}</h3>
          <GoldDiffChart curve={g.goldDiffCurve} />
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th></th><th className="r">Du</th><th className="r">{champ(g.opp?.champion)}</th></tr></thead>
              <tbody>
                {METRICS.map((m) => {
                  const a = m.get(g.me);
                  const b = g.opp ? m.get(g.opp) : null;
                  const cls = a !== null && b !== null && a !== b ? ((a > b) === m.higherIsBetter ? 'good' : 'bad') : '';
                  return (
                    <tr key={m.label}>
                      <td>{m.label}</td>
                      <td className={`r num ${cls}`}>{m.format(a)}</td>
                      <td className="r num muted">{m.format(b)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Dödsfall ({g.deathList.length})</h3>
            <DeathMap deaths={g.deathList.map((d) => ({ ...d, side: g.side }))} />
            {g.deathList.length > 0 && (
              <table style={{ marginTop: 12 }}>
                <tbody>
                  {g.deathList.map((d, i) => (
                    <tr key={i}>
                      <td className="num">{fmtClock(d.minute)}</td>
                      <td>{ZONE_LABEL[d.zone]}</td>
                      <td className="muted small">{d.killers.map(champ).join(', ') || 'torn/minions'}</td>
                      <td className="small">
                        {d.isolated && <span className="badge" style={{ color: 'var(--bad)' }}>ensam</span>}{' '}
                        {d.objectiveLost && <span className="badge" style={{ color: 'var(--accent)' }}>−{d.objectiveLost}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small" style={{ margin: '10px 0 0' }}>
              ”Ensam” bygger på positioner som Riot sparar en gång per minut, så se det som en ledtråd att kolla i replayen.
            </p>
          </div>
          <JournalForm entry={entry} previousFocus={previous?.focus} />
        </div>
      </div>
    </div>
  );
}

function JournalForm({ entry, previousFocus }: { entry: JournalEntry; previousFocus?: string }) {
  const update = (patch: Partial<JournalEntry>) => saveJournal({ ...entry, ...patch });
  const toggle = (tag: string) =>
    update({ tags: entry.tags.includes(tag) ? entry.tags.filter((t) => t !== tag) : [...entry.tags, tag] });
  return (
    <div className="card stack">
      <div>
        <h3>Din review</h3>
        <p className="muted small" style={{ margin: '2px 0 0' }}>Sparas automatiskt. Taggar som återkommer blir svagheter i översikten.</p>
      </div>
      {previousFocus && (
        <div className="notice small">Fokus inför den här matchen: <strong>”{previousFocus}”</strong>. Lyckades du?</div>
      )}
      {TAG_GROUPS.map((group) => (
        <div key={group.group}>
          <div className="small muted">{group.group}</div>
          <div className="chips" style={{ marginTop: 4 }}>
            {group.tags.map((t) => (
              <button key={t} className="chip" aria-pressed={entry.tags.includes(t)} onClick={() => toggle(t)}>{t}</button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <div className="small muted">Hur bra spelade du, oavsett resultat?</div>
        <div className="row" style={{ marginTop: 4, gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className="chip" aria-pressed={entry.rating === n} onClick={() => update({ rating: entry.rating === n ? null : n })}>{n}</button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Anteckningar</span>
        <textarea rows={4} value={entry.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Vad avgjorde matchen? Vilka tidpunkter ska du kolla i replayen?" />
      </label>
      <label className="field">
        <span>Fokus till nästa match</span>
        <input type="text" value={entry.focus} onChange={(e) => update({ focus: e.target.value })} placeholder="T.ex. räkna fiender på kartan innan jag går in i sidlane" />
      </label>
    </div>
  );
}
