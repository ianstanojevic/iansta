import { useEffect, useRef, useState } from 'react';
import { EMPTY_ENTRY, TAG_GROUPS, type JournalEntry } from '../domain/journal';
import { ZONE_LABEL } from '../domain/map';
import { saveJournal, useStore } from '../state/store';
import { ChampIcon } from './ChampIcon';
import { GoldDiffChart } from './Charts';
import { Comparison } from './Comparison';
import { DeathMap, PHASE_COLOR } from './DeathMap';
import { champ, fmtClock, fmtDate, fmtSigned } from './format';

export function MatchDetail({ matchId, onBack, onOpen }: { matchId: string; onBack: () => void; onOpen: (id: string) => void }) {
  const games = useStore((s) => s.games);
  const journal = useStore((s) => s.journal);
  const [hover, setHover] = useState<number | null>(null);
  const index = games.findIndex((g) => g.matchId === matchId);
  const g = games[index];
  if (!g) return <p className="muted" style={{ marginTop: 32 }}>Matchen finns inte längre. <button className="btn link" onClick={onBack}>Tillbaka</button></p>;
  const entry = journal[matchId] ?? EMPTY_ENTRY(matchId);
  const previous = games.slice(0, index).reverse().map((x) => journal[x.matchId]).find((e) => e?.focus?.trim());
  const prevGame = games[index - 1];
  const nextGame = games[index + 1];
  const gd15 = g.goldDiffCurve[15];
  const csd10 = g.opp?.cs10 != null && g.me.cs10 != null ? g.me.cs10 - g.opp.cs10 : null;

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 24 }}>
        <button className="btn ghost sm" onClick={onBack}>← Alla matcher</button>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" disabled={!prevGame} onClick={() => prevGame && onOpen(prevGame.matchId)}>← Äldre</button>
          <button className="btn sm" disabled={!nextGame} onClick={() => nextGame && onOpen(nextGame.matchId)}>Nyare →</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: '22px 24px' }}>
        <div className="match-hero">
          <div className="versus">
            <div className="row" style={{ gap: 6 }}>
              <ChampIcon name={g.me.champion} size={60} />
              <ChampIcon name={g.support} size={34} round />
            </div>
            <span className="vs">VS</span>
            <div className="row" style={{ gap: 6 }}>
              <ChampIcon name={g.opp?.champion} size={60} />
              <ChampIcon name={g.enemySupport} size={34} round />
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className={`result-pill ${g.win ? 'w' : 'l'}`}>{g.win ? 'Vinst' : 'Förlust'}</span>
              <h1 style={{ fontSize: '1.5rem' }}>{champ(g.me.champion)} <span className="muted" style={{ fontWeight: 500 }}>mot</span> {champ(g.opp?.champion)}</h1>
            </div>
            <div className="meta-line" style={{ marginTop: 6 }}>
              <span>med {champ(g.support)} mot {champ(g.enemySupport)}</span>
              <span>{fmtClock(g.durationMin)}</span>
              <span>{g.side === 'blue' ? 'Blå sida' : 'Röd sida'}</span>
              <span>{fmtDate(g.gameCreation)}</span>
            </div>
          </div>
          <div className="row" style={{ marginLeft: 'auto', gap: 22 }}>
            <Stat label="KDA" value={`${g.me.kills}/${g.me.deaths}/${g.me.assists}`} />
            <Stat label="CS-diff @10" value={fmtSigned(csd10)} tone={csd10} />
            <Stat label="Guld-diff @15" value={fmtSigned(gd15 ?? null)} tone={gd15} />
          </div>
        </div>
      </div>

      <div className="split" style={{ marginTop: 16 }}>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Guld-diff mot {champ(g.opp?.champion)}</h3><span className="hint">per minut</span></div>
            <GoldDiffChart curve={g.goldDiffCurve} deaths={g.deathList.map((d) => d.minute)} />
          </div>
          {g.opp && <Comparison games={[g]} title="Statistik" hint="den här matchen" oppLabel={champ(g.opp.champion)} />}
        </div>

        <div className="stack">
          <JournalForm key={matchId} entry={entry} previousFocus={previous?.focus} />
          <div className="card">
            <div className="card-head"><h3>Dödsfall</h3><span className="hint num">{g.deathList.length} st</span></div>
            <DeathMap deaths={g.deathList.map((d) => ({ ...d, side: g.side }))} highlight={hover} />
            {g.deathList.length > 0 && (
              <table style={{ marginTop: 14 }}>
                <tbody>
                  {g.deathList.map((d, i) => (
                    <tr key={i} className="death-row" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                      <td className="num" style={{ width: 56 }}>
                        <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                          <i style={{ width: 8, height: 8, borderRadius: '50%', background: PHASE_COLOR[d.phase], flex: 'none' }} />
                          {fmtClock(d.minute)}
                        </span>
                      </td>
                      <td>{ZONE_LABEL[d.zone]}</td>
                      <td>
                        <span className="row" style={{ gap: 3, flexWrap: 'nowrap' }}>
                          {d.killers.length ? d.killers.map((k) => <ChampIcon key={k} name={k} size={20} round />) : <span className="muted xs">torn/minions</span>}
                        </span>
                      </td>
                      <td className="r">
                        <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          {d.isolated && <span className="badge high">ensam</span>}
                          {d.objectiveLost && <span className="badge medium">−{d.objectiveLost}</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted xs" style={{ marginTop: 12 }}>
              ”Ensam” bygger på positioner som Riot sparar en gång per minut. Se det som en ledtråd att kolla i replayen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <div>
      <div className="xs muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className={`num ${tone ? (tone > 0 ? 'good' : 'bad') : ''}`} style={{ fontSize: '1.25rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function JournalForm({ entry, previousFocus }: { entry: JournalEntry; previousFocus?: string }) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const update = (patch: Partial<JournalEntry>) => {
    saveJournal({ ...entry, ...patch });
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1500);
  };
  const toggle = (tag: string) =>
    update({ tags: entry.tags.includes(tag) ? entry.tags.filter((t) => t !== tag) : [...entry.tags, tag] });
  return (
    <div className="card stack" style={{ borderColor: entry.updatedAt ? 'var(--border)' : 'rgba(227,174,79,0.35)' }}>
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h3>Din review</h3>
        <span className="saved">{saved ? '✓ Sparat' : ''}</span>
      </div>
      {previousFocus && (
        <div className="notice small">Ditt fokus inför matchen var <strong style={{ color: 'var(--text)' }}>”{previousFocus}”</strong>. Lyckades du?</div>
      )}
      {TAG_GROUPS.map((group) => (
        <div key={group.group}>
          <div className="xs muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{group.group}</div>
          <div className="chips">
            {group.tags.map((t) => (
              <button key={t} className="chip" aria-pressed={entry.tags.includes(t)} onClick={() => toggle(t)}>{t}</button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <div className="xs muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Din insats, oavsett resultat</div>
        <div className="rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-pressed={entry.rating === n} onClick={() => update({ rating: entry.rating === n ? null : n })}>{n}</button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Anteckningar</span>
        <textarea rows={3} value={entry.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Vad avgjorde matchen? Vilka tidpunkter ska du kolla i replayen?" />
      </label>
      <label className="field">
        <span>Fokus till nästa match</span>
        <input type="text" value={entry.focus} onChange={(e) => update({ focus: e.target.value })} placeholder="T.ex. räkna fiender på kartan innan jag går in i sidlane" />
      </label>
    </div>
  );
}
