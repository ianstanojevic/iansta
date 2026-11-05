import type { GameAnalysis } from '../domain/analyzeGame';
import { averageRow, METRICS } from './metrics';

/** Average you vs lane opponent, grouped, with a bar showing who is ahead. */
export function Comparison({ games, title = 'Du mot din lane-motståndare', hint = 'snitt per match', oppLabel = 'Motst.' }: { games: GameAnalysis[]; title?: string; hint?: string; oppLabel?: string }) {
  let group = '';
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <span className="hint">{hint}</span>
      </div>
      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr><th></th><th className="r">Du</th><th className="r">{oppLabel}</th><th className="r">Diff</th><th style={{ width: 70 }}></th></tr>
          </thead>
          <tbody>
            {METRICS.flatMap((m) => {
              const row = averageRow(games, m);
              if (!row) return [];
              const ahead = row.diff === 0 ? null : (row.diff > 0) === m.higherIsBetter;
              const rel = Math.min(1, Math.abs(row.diff) / (Math.abs(row.opp) || 1) / 0.25);
              const out = [];
              if (m.group !== group) {
                group = m.group;
                out.push(<tr key={`g-${group}`} className="group"><td colSpan={5}>{group}</td></tr>);
              }
              out.push(
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td className="r num" style={{ fontWeight: 600 }}>{m.format(row.me)}</td>
                  <td className="r num muted">{m.format(row.opp)}</td>
                  <td className={`r num ${ahead === null ? '' : ahead ? 'good' : 'bad'}`}>{m.diff(row.diff)}</td>
                  <td>
                    <span className="diffbar" style={{ width: `${Math.max(4, rel * 60)}px`, background: ahead === null ? 'var(--surface-3)' : ahead ? 'var(--good)' : 'var(--bad)', opacity: 0.75 }} />
                  </td>
                </tr>,
              );
              return out;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
