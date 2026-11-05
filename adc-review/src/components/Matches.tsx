import { useState } from 'react';
import { useStore } from '../state/store';
import { ChampIcon } from './ChampIcon';
import { champ, fmtClock, fmtDate, fmtPct, fmtSigned, tone } from './format';

type Filter = 'all' | 'unreviewed' | 'losses';

export function Matches({ onOpen }: { onOpen: (matchId: string) => void }) {
  const games = useStore((s) => s.games);
  const journal = useStore((s) => s.journal);
  const [filter, setFilter] = useState<Filter>('all');
  const rows = [...games]
    .reverse()
    .filter((g) => (filter === 'unreviewed' ? !journal[g.matchId]?.updatedAt : filter === 'losses' ? !g.win : true));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Matcher</h1>
          <p className="sub">Klicka på en match för guldkurva, dödskarta och review.</p>
        </div>
        <div className="segmented" role="group" aria-label="Filter">
          {([['all', 'Alla'], ['unreviewed', 'Ej granskade'], ['losses', 'Förluster']] as const).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="card" style={{ padding: '4px 8px' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="result-strip"></th>
                <th>Match</th>
                <th>Bot lane</th>
                <th className="r">KDA</th>
                <th className="r">CS-diff @10</th>
                <th className="r">Guld-diff @15</th>
                <th className="r">Damage</th>
                <th className="r" title="Dödsfall efter lanefasen utan allierad i närheten">Ensamma dödsfall</th>
                <th className="c">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const csd = g.opp?.cs10 != null && g.me.cs10 != null ? g.me.cs10 - g.opp.cs10 : null;
                const gd = g.goldDiffCurve[15] ?? null;
                const iso = g.deathList.filter((d) => d.isolated && d.phase !== 'lane').length;
                const entry = journal[g.matchId];
                return (
                  <tr key={g.matchId} className="clickable" onClick={() => onOpen(g.matchId)}>
                    <td className="result-strip"><span className={g.win ? 'res-w' : 'res-l'} /></td>
                    <td>
                      <span className="champ">
                        <ChampIcon name={g.me.champion} size={38} />
                        <span>
                          <span style={{ fontWeight: 600 }}>{champ(g.me.champion)}</span>{' '}
                          <span className={`xs ${g.win ? 'good' : 'bad'}`} style={{ fontWeight: 700 }}>{g.win ? 'Vinst' : 'Förlust'}</span>
                          <span className="muted xs" style={{ display: 'block' }}>{fmtDate(g.gameCreation)} · {fmtClock(g.durationMin)}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <ChampIcon name={g.support} size={22} round />
                        <span className="muted xs" style={{ margin: '0 4px' }}>vs</span>
                        <ChampIcon name={g.opp?.champion} size={22} round />
                        <ChampIcon name={g.enemySupport} size={22} round />
                      </span>
                    </td>
                    <td className="r num nowrap kda">
                      <b>{g.me.kills}</b> / <b className="d">{g.me.deaths}</b> / <b>{g.me.assists}</b>
                    </td>
                    <td className={`r num ${tone(csd)}`}>{fmtSigned(csd)}</td>
                    <td className={`r num ${tone(gd)}`}>{fmtSigned(gd)}</td>
                    <td className="r num">{fmtPct(g.me.damageShare)}</td>
                    <td className={`r num ${iso ? 'bad' : 'muted'}`}>{iso || '–'}</td>
                    <td className="c">
                      {entry?.updatedAt ? (
                        <span className="badge good">✓ {entry.tags.length ? `${entry.tags.length} taggar` : 'klar'}</span>
                      ) : (
                        <span className="muted xs">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="muted small" style={{ padding: 20, textAlign: 'center' }}>Inga matcher matchar filtret.</p>}
        </div>
      </div>
    </div>
  );
}
