import { useMemo, useState } from 'react';
import type { GameAnalysis } from '../domain/analyzeGame';
import { findInsights, MIN_GAMES, type Insight } from '../domain/insights';
import { mean, meanDiff } from '../domain/stats';
import { useStore } from '../state/store';
import { TrendChart } from './Charts';
import { Comparison } from './Comparison';
import { DeathMap, type MapDeath } from './DeathMap';
import { champ, fmtDate, fmtPct, fmtSigned } from './format';

const RANGES = [10, 20, 50, 0] as const;

export function Overview({ onOpen }: { onOpen: (matchId: string) => void }) {
  const allGames = useStore((s) => s.games);
  const journalRecord = useStore((s) => s.journal);
  const [range, setRange] = useState<(typeof RANGES)[number]>(0);
  const [champFilter, setChampFilter] = useState('');

  const champions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of allGames) counts.set(g.me.champion, (counts.get(g.me.champion) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [allGames]);

  const games = useMemo(() => {
    const filtered = champFilter ? allGames.filter((g) => g.me.champion === champFilter) : allGames;
    return range ? filtered.slice(-range) : filtered;
  }, [allGames, range, champFilter]);

  const journal = useMemo(() => new Map(Object.entries(journalRecord)), [journalRecord]);
  const insights = useMemo(() => findInsights(games, journal), [games, journal]);
  const weaknesses = insights.filter((i) => i.kind === 'weakness');
  const strengths = insights.filter((i) => i.kind === 'strength');
  const byId = useMemo(() => new Map(allGames.map((g) => [g.matchId, g])), [allGames]);

  const lastFocus = [...allGames].reverse().map((g) => journalRecord[g.matchId]?.focus).find((f) => f?.trim());
  const unreviewed = allGames.filter((g) => !journalRecord[g.matchId]?.updatedAt).slice(-5).reverse();

  const lateDeaths: MapDeath[] = games.flatMap((g) =>
    g.deathList.filter((d) => d.phase !== 'lane').map((d) => ({ ...d, side: g.side, matchId: g.matchId })),
  );

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          {RANGES.map((r) => (
            <button key={r} className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r ? `Senaste ${r}` : `Alla (${allGames.length})`}
            </button>
          ))}
        </div>
        <select value={champFilter} onChange={(e) => setChampFilter(e.target.value)} style={{ width: 'auto' }} aria-label="Filtrera på champion">
          <option value="">Alla champions</option>
          {champions.map(([c, n]) => (
            <option key={c} value={c}>{champ(c)} ({n})</option>
          ))}
        </select>
      </div>

      <Tiles games={games} />

      {games.length < MIN_GAMES ? (
        <div className="notice" style={{ marginTop: 20 }}>
          Minst {MIN_GAMES} matcher behövs för att hitta mönster. Nu finns {games.length} i urvalet.
        </div>
      ) : (
        <>
          {weaknesses[0] && (
            <div className="focus-card" style={{ marginTop: 24 }}>
              <div className="eyebrow">Största förbättringsområdet just nu</div>
              <h2>{weaknesses[0].title}</h2>
              <p style={{ margin: 0 }}>{weaknesses[0].detail}</p>
              {weaknesses[0].tip && <div className="tip"><b>Öva på:</b> {weaknesses[0].tip}</div>}
              <Examples ids={weaknesses[0].examples} byId={byId} onOpen={onOpen} />
            </div>
          )}

          {(lastFocus || unreviewed.length > 0) && (
            <div className="grid-2" style={{ marginTop: 16 }}>
              {lastFocus && (
                <div className="card">
                  <h3>Ditt senaste fokus</h3>
                  <p style={{ margin: '6px 0 0' }}>”{lastFocus}”</p>
                </div>
              )}
              {unreviewed.length > 0 && (
                <div className="card">
                  <h3>Ej granskade</h3>
                  <p className="muted small" style={{ margin: '4px 0 0' }}>
                    Taggar från dina reviews hamnar också bland svagheterna.
                  </p>
                  <Examples ids={unreviewed.map((g) => g.matchId)} byId={byId} onOpen={onOpen} />
                </div>
              )}
            </div>
          )}

          <div className="section-title">
            <h2>Svagheter</h2>
            <span className="muted">rangordnade efter hur långt ifrån din lane-motståndare du ligger</span>
          </div>
          {weaknesses.length > 1 ? (
            <div className="grid-2">
              {weaknesses.slice(1).map((i) => <InsightCard key={i.id} insight={i} byId={byId} onOpen={onOpen} />)}
            </div>
          ) : weaknesses.length === 0 ? (
            <p className="muted">Inga tydliga svagheter i urvalet. Prova ett större urval eller filtrera per champion.</p>
          ) : null}

          {strengths.length > 0 && (
            <>
              <div className="section-title"><h2>Styrkor</h2></div>
              <div className="grid-2">
                {strengths.map((i) => <InsightCard key={i.id} insight={i} byId={byId} onOpen={onOpen} />)}
              </div>
            </>
          )}

          <div className="section-title">
            <h2>Siffrorna</h2>
            <span className="muted">snitt över {games.length} matcher</span>
          </div>
          <div className="grid-2">
            <Comparison games={games} />
            <div className="stack">
              <div className="card">
                <h3 style={{ marginBottom: 10 }}>Var du dör efter lanefasen</h3>
                <DeathMap deaths={lateDeaths} normalize onSelect={onOpen} />
              </div>
              <div className="card stack">
                <TrendChart
                  label="CS-diff @10"
                  values={games.map((g) => (g.opp?.cs10 != null && g.me.cs10 != null ? g.me.cs10 - g.opp.cs10 : null))}
                  format={(v) => fmtSigned(v, 1)}
                />
                <TrendChart label="Guld-diff @15" values={games.map((g) => g.goldDiffCurve[15] ?? null)} format={(v) => fmtSigned(v)} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Tiles({ games }: { games: GameAnalysis[] }) {
  const wins = games.filter((g) => g.win).length;
  const withOpp = games.filter((g) => g.opp);
  const csd = meanDiff(withOpp, (g) => g.me.cs10, (g) => g.opp!.cs10);
  const gd = mean(games.map((g) => g.goldDiffCurve[15] ?? null));
  const k = mean(games.map((g) => g.me.kills)) ?? 0;
  const d = mean(games.map((g) => g.me.deaths)) ?? 0;
  const a = mean(games.map((g) => g.me.assists)) ?? 0;
  return (
    <div className="tiles" style={{ marginTop: 16 }}>
      <Tile label="Matcher" value={String(games.length)} sub={games.length ? `${wins}V ${games.length - wins}F` : ''} />
      <Tile label="Vinst" value={fmtPct(games.length ? wins / games.length : null)} />
      <Tile label="KDA" value={d ? ((k + a) / d).toFixed(2) : '–'} sub={`${k.toFixed(1)} / ${d.toFixed(1)} / ${a.toFixed(1)}`} />
      <Tile label="CS-diff @10" value={fmtSigned(csd, 1)} tone={csd} />
      <Tile label="Guld-diff @15" value={fmtSigned(gd)} tone={gd} />
      <Tile label="Damage-andel" value={fmtPct(mean(games.map((g) => g.me.damageShare)), 1)} />
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number | null }) {
  const cls = tone ? (tone > 0 ? 'good' : 'bad') : '';
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className={`value num ${cls}`}>{value}</div>
      {sub && <div className="sub num">{sub}</div>}
    </div>
  );
}

function InsightCard({ insight, byId, onOpen }: { insight: Insight; byId: Map<string, GameAnalysis>; onOpen: (id: string) => void }) {
  const weak = insight.kind === 'weakness';
  return (
    <div className={`card insight ${weak ? '' : 'strength'}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="badge">{insight.category}</span>
        {weak && (
          <div className="meter" title={`Allvarlighet ${Math.round(insight.severity * 100)} %`}>
            <div style={{ width: `${Math.max(8, insight.severity * 100)}%` }} />
          </div>
        )}
      </div>
      <h3 style={{ marginTop: 8 }}>{insight.title}</h3>
      <p className="small">{insight.detail}</p>
      {insight.tip && <div className="tip"><b>Öva på:</b> {insight.tip}</div>}
      <Examples ids={insight.examples} byId={byId} onOpen={onOpen} />
    </div>
  );
}

function Examples({ ids, byId, onOpen }: { ids: string[]; byId: Map<string, GameAnalysis>; onOpen: (id: string) => void }) {
  const games = ids.map((id) => byId.get(id)).filter((g): g is GameAnalysis => !!g);
  if (!games.length) return null;
  return (
    <div className="chips">
      {games.map((g) => (
        <button key={g.matchId} className="chip" onClick={() => onOpen(g.matchId)} title="Öppna matchen">
          <span className={g.win ? 'good' : 'bad'}>{g.win ? 'V' : 'F'}</span> {champ(g.me.champion)} vs {champ(g.opp?.champion)} · {fmtDate(g.gameCreation)}
        </button>
      ))}
    </div>
  );
}
