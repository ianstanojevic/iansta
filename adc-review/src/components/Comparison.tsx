import type { GameAnalysis } from '../domain/analyzeGame';
import { averageRow, METRICS } from './metrics';

export function Comparison({ games, title = 'Du vs din lane-motståndare' }: { games: GameAnalysis[]; title?: string }) {
  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>{title}</h3>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        Motståndaren är fiendens ADC i samma match, alltså en spelare på din nivå. Det gör jämförelsen rättvis.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th></th><th className="r">Du</th><th className="r">Motst.</th><th className="r">Diff</th></tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const row = averageRow(games, m);
              if (!row) return null;
              const good = row.diff === 0 ? '' : (row.diff > 0) === m.higherIsBetter ? 'good' : 'bad';
              return (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td className="r num">{m.format(row.me)}</td>
                  <td className="r num muted">{m.format(row.opp)}</td>
                  <td className={`r num ${good}`}>{m.diff(row.diff)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
