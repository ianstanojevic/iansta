import { useMemo, useState } from 'react';
import type { GameAnalysis } from '../domain/analyzeGame';
import { findInsights, MIN_GAMES, type Insight } from '../domain/insights';
import { mean, meanDiff } from '../domain/stats';
import { useStore } from '../state/store';
import { ChampIcon } from './ChampIcon';
import { TrendChart } from './Charts';
import { Comparison } from './Comparison';
import { DeathMap, type MapDeath } from './DeathMap';
import { champ, fmtAgo, fmtDay, fmtNum, fmtPct, fmtSigned } from './format';

const RANGES = [10, 20, 50, 0] as const;

export function severityLevel(s: number): { label: string; cls: string } {
  if (s >= 0.66) return { label: 'Hög prioritet', cls: 'high' };
  if (s >= 0.33) return { label: 'Medel', cls: 'medium' };
  return { label: 'Låg', cls: 'low' };
}

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
  const reviewed = allGames.filter((g) => journalRecord[g.matchId]?.updatedAt).length;
  const unreviewed = allGames.filter((g) => !journalRecord[g.matchId]?.updatedAt).slice(-4).reverse();
  const latest = allGames[allGames.length - 1];

  const lateDeaths: MapDeath[] = games.flatMap((g) =>
    g.deathList.filter((d) => d.phase !== 'lane').map((d) => ({ ...d, side: g.side, matchId: g.matchId })),
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Översikt</h1>
          <p className="sub">
            {allGames.length} ranked-matcher som ADC{latest && <> · senaste {fmtAgo(latest.gameCreation + latest.durationMin * 60_000)}</>}
          </p>
        </div>
        <div className="row">
          <div className="segmented" role="group" aria-label="Urval">
            {RANGES.map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r ? `Senaste ${r}` : 'Alla'}</button>
            ))}
          </div>
          <select value={champFilter} onChange={(e) => setChampFilter(e.target.value)} style={{ width: 'auto', minWidth: 170 }} aria-label="Filtrera på champion">
            <option value="">Alla champions</option>
            {champions.map(([c, n]) => (
              <option key={c} value={c}>{champ(c)} ({n})</option>
            ))}
          </select>
        </div>
      </div>

      <Tiles games={games} />

      {games.length < MIN_GAMES ? (
        <div className="notice" style={{ marginTop: 20 }}>
          Minst {MIN_GAMES} matcher behövs för att hitta mönster. Nu finns {games.length} i urvalet.
        </div>
      ) : (
        <>
          {weaknesses[0] ? (
            <div className="focus-card" style={{ marginTop: 20 }}>
              <div className="eyebrow">
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="8" r="3" fill="currentColor" /></svg>
                Största förbättringsområdet · {weaknesses[0].category}
              </div>
              <h2>{weaknesses[0].title}</h2>
              <p className="detail">{weaknesses[0].detail}</p>
              {weaknesses[0].tip && (
                <div className="tip" style={{ marginTop: 16, maxWidth: 820 }}>
                  <span className="tip-label">Öva på</span>
                  {weaknesses[0].tip}
                </div>
              )}
              <Examples ids={weaknesses[0].examples} byId={byId} onOpen={onOpen} label="Granska" />
            </div>
          ) : (
            <div className="notice success" style={{ marginTop: 20 }}>Inga tydliga svagheter i det här urvalet jämfört med dina lane-motståndare.</div>
          )}

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="card-head"><h3>Ditt fokus just nu</h3><span className="hint">från din senaste review</span></div>
              {lastFocus ? <p style={{ fontSize: '1.02rem' }}>”{lastFocus}”</p> : <p className="muted small">Skriv ett fokus till nästa match när du granskar en match.</p>}
            </div>
            <div className="card">
              <div className="card-head">
                <h3>Reviews</h3>
                <span className="hint num">{reviewed} av {allGames.length} granskade</span>
              </div>
              {unreviewed.length ? (
                <Examples ids={unreviewed.map((g) => g.matchId)} byId={byId} onOpen={onOpen} />
              ) : (
                <p className="muted small">Alla matcher är granskade.</p>
              )}
            </div>
          </div>

          {weaknesses.length > 1 && (
            <>
              <div className="section-title">
                <h2>Fler svagheter</h2>
                <span className="count">{weaknesses.length - 1}</span>
                <span className="hint">rangordnade efter avstånd till din lane-motståndare</span>
              </div>
              <div className="grid-3">
                {weaknesses.slice(1).map((i) => <InsightCard key={i.id} insight={i} byId={byId} onOpen={onOpen} />)}
              </div>
            </>
          )}

          {strengths.length > 0 && (
            <>
              <div className="section-title"><h2>Styrkor</h2><span className="count">{strengths.length}</span></div>
              <div className="strength-list">
                {strengths.map((i) => (
                  <div key={i.id} className="strength">
                    <span className="check">✓</span>
                    <div>
                      <div className="row" style={{ gap: 8 }}><h3>{i.title}</h3></div>
                      <p className="small text-2" style={{ marginTop: 2 }}>{i.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="section-title">
            <h2>Statistik</h2>
            <span className="hint">{games.length} matcher</span>
          </div>
          <div className="split">
            <Comparison games={games} />
            <div className="stack">
              <div className="card">
                <div className="card-head"><h3>Var du dör efter lanefasen</h3><span className="hint num">{lateDeaths.length} dödsfall</span></div>
                <DeathMap deaths={lateDeaths} normalize onSelect={onOpen} />
              </div>
              <div className="card stack" style={{ gap: 24 }}>
                <TrendChart
                  label="CS-diff vid 10 min"
                  values={games.map((g) => (g.opp?.cs10 != null && g.me.cs10 != null ? g.me.cs10 - g.opp.cs10 : null))}
                  format={(v) => fmtSigned(v, 1)}
                />
                <TrendChart label="Guld-diff vid 15 min" values={games.map((g) => g.goldDiffCurve[15] ?? null)} format={(v) => fmtSigned(v)} />
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
  const dmg = mean(games.map((g) => g.me.damageShare));
  const dmgOpp = mean(withOpp.map((g) => g.opp!.damageShare));
  const cs10 = mean(games.map((g) => g.me.cs10));
  const early = mean(games.map((g) => g.me.deathsPre15));
  const earlyOpp = mean(withOpp.map((g) => g.opp!.deathsPre15));
  return (
    <div className="tiles">
      <Tile label="Vinst" value={fmtPct(games.length ? wins / games.length : null)} sub={`${wins}V ${games.length - wins}F`} tone={games.length ? wins / games.length - 0.5 : null} />
      <Tile label="KDA" value={d ? fmtNum((k + a) / d, 2) : '–'} sub={`${fmtNum(k, 1)} / ${fmtNum(d, 1)} / ${fmtNum(a, 1)}`} />
      <Tile label="CS-diff @10" value={fmtSigned(csd, 1)} tone={csd} sub={`${fmtNum(cs10, 1)} CS i snitt`} />
      <Tile label="Guld-diff @15" value={fmtSigned(gd)} tone={gd} sub="snitt mot fiendens ADC" />
      <Tile label="Dödsfall före 15" value={fmtNum(early, 2)} tone={early !== null && earlyOpp !== null ? earlyOpp - early : null} sub={earlyOpp !== null ? `motst. ${fmtNum(earlyOpp, 2)}` : undefined} />
      <Tile label="Damage-andel" value={fmtPct(dmg, 1)} sub={dmgOpp !== null ? `motst. ${fmtPct(dmgOpp, 1)}` : undefined} />
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
  const level = severityLevel(insight.severity);
  return (
    <div className="card insight">
      <div className="head">
        <span className="xs muted" style={{ fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{insight.category}</span>
        <span className={`badge ${level.cls}`}><span className="dot" />{level.label}</span>
      </div>
      <h3 style={{ fontSize: '1.02rem' }}>{insight.title}</h3>
      <p className="detail">{insight.detail}</p>
      {insight.tip && <div className="tip"><span className="tip-label">Öva på</span>{insight.tip}</div>}
      <Examples ids={insight.examples} byId={byId} onOpen={onOpen} />
    </div>
  );
}

export function Examples({ ids, byId, onOpen, label }: { ids: string[]; byId: Map<string, GameAnalysis>; onOpen: (id: string) => void; label?: string }) {
  const games = ids.map((id) => byId.get(id)).filter((g): g is GameAnalysis => !!g);
  if (!games.length) return null;
  return (
    <div className="row" style={{ gap: 8, marginTop: 4 }}>
      {label && <span className="xs muted" style={{ fontWeight: 600 }}>{label}:</span>}
      <div className="chips">
        {games.map((g) => (
          <button key={g.matchId} className="chip game-chip" onClick={() => onOpen(g.matchId)} title={`${champ(g.me.champion)} mot ${champ(g.opp?.champion)}`}>
            <ChampIcon name={g.me.champion} size={20} round />
            <span className={`res ${g.win ? 'good' : 'bad'}`}>{g.win ? 'V' : 'F'}</span>
            <span>vs {champ(g.opp?.champion)}</span>
            <span className="muted">{fmtDay(g.gameCreation)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
