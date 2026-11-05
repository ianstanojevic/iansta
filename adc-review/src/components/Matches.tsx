import { useStore } from '../state/store';
import { champ, fmtDate, fmtPct, fmtSigned, tone } from './format';

export function Matches({ onOpen }: { onOpen: (matchId: string) => void }) {
  const games = useStore((s) => s.games);
  const journal = useStore((s) => s.journal);
  const rows = [...games].reverse();
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Datum</th>
              <th>Champion</th>
              <th>Motst. / supports</th>
              <th className="r">KDA</th>
              <th className="r">CS-d @10</th>
              <th className="r">Guld-d @15</th>
              <th className="r">Dmg %</th>
              <th className="r" title="Dödsfall efter lanefasen utan allierad i närheten">Ensam död</th>
              <th>Review</th>
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
                  <td><span className={`result ${g.win ? 'w' : 'l'}`}>{g.win ? 'V' : 'F'}</span></td>
                  <td className="num muted">{fmtDate(g.gameCreation)}</td>
                  <td><strong>{champ(g.me.champion)}</strong></td>
                  <td className="muted">{champ(g.opp?.champion)} <span className="small">· {champ(g.support)} vs {champ(g.enemySupport)}</span></td>
                  <td className="r num">{g.me.kills}/{g.me.deaths}/{g.me.assists}</td>
                  <td className={`r num ${tone(csd)}`}>{fmtSigned(csd)}</td>
                  <td className={`r num ${tone(gd)}`}>{fmtSigned(gd)}</td>
                  <td className="r num">{fmtPct(g.me.damageShare)}</td>
                  <td className={`r num ${iso ? 'bad' : 'muted'}`}>{iso || '–'}</td>
                  <td>{entry?.updatedAt ? <span className="badge" style={{ color: 'var(--good)' }}>✓ {entry.tags.length} taggar</span> : <span className="muted small">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
