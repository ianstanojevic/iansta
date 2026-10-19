# SHL betting model — Färjestad BK, 2026/27

A walk-forward-validated betting model for SHL games, aimed at long-run bankroll
growth when betting on Färjestad BK games at Unibet.

> Status: all four phases are complete. The honest verdict is in
> `reports/phase3_verdict.md`: there is a probable small edge in totals
> (mostly unders) that is **not statistically proven**, and no demonstrated
> edge in 1X2, moneyline or ±1.5.

## Day-to-day use

```bash
. .venv/bin/activate
python update_data.py          # before each bet: new results, rebuild, refit (~4 min)

# copy Unibet's PRE-GAME odds for the markets on offer:
python predict.py --opp Timrå --away \
    --x 3.30 4.20 1.95 --ml 2.40 1.58 \
    --hcp FBK -1.5 3.10 --hcp TIK 1.5 1.36 \
    --tot 5.5 1.85 1.95 --totot 4.5 1.38 2.90

python tracker.py add --date 2026-10-22 --opp TIK --away --market tot \
    --selection "Under 5.5 (ord. tid)" --odds 1.95 --stake 4 --prob 0.579
python tracker.py settle 3 win --closing 1.90   # closing = Unibet's odds just before puck drop
python tracker.py report                        # bankroll, ROI, CLV
```

Market arguments, all in Unibet's home/away order:

| Argument | Unibet market |
|---|---|
| `--x H X A` | 1X2, regulation time |
| `--ml H A` | match winner incl. OT and shootout |
| `--hcp TEAM LINE ODDS` | handicap, regulation time (repeat for both sides) |
| `--tot LINE OVER UNDER` | total goals, regulation time |
| `--totot LINE OVER UNDER` | total goals incl. OT and shootout |

`predict.py` shows, for each market you enter: the model probability, that
probability pooled with Unibet's margin-free price, the fair odds and the EV.
It suggests a stake only in markets that passed the Phase 3 rule (totals),
when EV > 2%, at ¼ Kelly capped at 5% of bankroll and rounded down to whole
kronor. Every other market is shown but marked *ej bevisat övertag*
("no proven edge").

**Bet before puck drop only.** The model is a pre-game model and cannot
evaluate live bets. The two bets already in `tracker.csv` were placed live,
so they are excluded from CLV.

## How the model works

- `shlbet/models.py` holds the Elo, Dixon-Coles and pricing code. Every
  market is priced from a single 60-minute scoreline matrix. P(home wins OT)
  is the shrunk historical rate, about 0.54.
- `shlbet/features.py` builds pre-game form (exponentially weighted with a
  10-game half-life), the starter's shrunk save % over the past 365 days, a
  backup-goalie flag, rest, back-to-backs and travel.
- `shlbet/backtest.py` makes the walk-forward predictions and holds the tuned
  hyperparameters.
- `shlbet/evaluate.py` runs the Phase 3 evaluation:
  `python -m shlbet.evaluate` writes `reports/phase3_evaluation.md`.

## Known weaknesses

- **The edge is small and unproven.** The test-season ROI CI is about −5% to
  +20%. The edge rests on a market bias (overs overpriced) that can disappear
  at any time. Watch CLV and results in the tracker. If unders stop beating
  Unibet's closing line over 50+ bets, stop.
- **The model overrates its own EV.** By the closing line the chosen bets are
  −1% to −4% EV. Hence ¼ Kelly rather than the growth-optimal ½ Kelly.
- **Goalies are projected, not confirmed.** `predict.py` assumes the team's
  most frequent recent starter. If someone else starts, the totals estimate is
  slightly off.
- **No injuries, lineups or xG in the model.** No injury feed exists for the
  SHL, and shot coordinates (for xG) only go back to 2023/24.
- **Färjestad's sample is tiny** (about 25 totals bets a season), so the
  Färjestad-only results say nothing. The all-SHL backtest is the evidence.
- **Regular season only.** Playoff hockey (no shootout, different OT) is not
  modelled.
- **Stakes are small.** With 117 kr and ¼ Kelly, typical stakes are 1–6 kr,
  and many edges round down to 0 kr.

## Setup

```bash
cd shl-betting
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python update_data.py      # fetch new games, rebuild data/processed, validate
```

`data/raw` is committed and append-only. A completed game is fetched once and
cached as gzip, and only the current season's schedule and result pages are
refreshed. The files in `data/processed` are rebuilt from `data/raw` by
`update_data.py` (about 3 minutes, offline except for those refreshes), so they
are not committed. Only `validation_report.md` is.

## Data sources

| Source | What | Seasons |
|---|---|---|
| stats.swehockey.se (official federation stats) | schedule, final score, period scores (OT and SO as 4th/5th period), shots on goal per period, saves, PIM, PP time and %, goals with strength (EQ/PP/SH/EN), **starting goalie** and every goalie change, attendance; dressed lineups by line | 2018/19 → now (lineups 2025/26 → now) |
| www.shl.se public API | play-by-play with **shot coordinates** (on target, missed, blocked; used for a home-built xG model), hits, blocked shots | 2023/24 → now (the API has no older data) |
| flashscore feed | shots off target, faceoffs, PP/PK made/attempts | 2018/19 → now |
| Livesport odds service (behind flashscore), geo = SE | **opening and closing odds per Swedish bookmaker, including Unibet SE**: 1X2 (60 min), moneyline incl. OT/SO, Asian handicap / puck line (60 min and incl. OT), totals (60 min and incl. OT, every line), DNB, double chance | 2018/19 → now |
| betexplorer | game list with Livesport event ids, final score, OT/SO flag, average 1X2 odds across all bookmakers; CHL dates for Swedish teams (for rest days) | 2018/19 → now |

Scrapers live in `shlbet/scrape_*.py`. `shlbet/build_dataset.py` merges the
sources and `shlbet/validate.py` writes `data/processed/validation_report.md`.

### Processed files

- `games.csv`: one row per regular-season game. Outcome columns are results
  and in-game stats. Pre-game columns are rest days (CHL games included),
  travel km since the previous game, the distance of this away trip, and the
  betexplorer average odds.
- `odds_long.csv.gz`: every price as (game, book, market, scope, side, line,
  open, close, active).
- `odds_wide.csv`: per game, Unibet open/close for 1X2, ML, ±1.5 and the main
  total; the best Swedish price; and the Swedish-book consensus fair
  probability (margin removed proportionally, averaged across books).
- `swehockey_goalies.csv`, `swehockey_lineups.csv`, `shlapi_shots.csv.gz`,
  `chl_games.csv`.

## Known data limitations

- **Unibet odds only from 2022/23.** Earlier seasons have bet365 and Coolbet
  (MrGreen in 2019/20). bet365 covers every season and is as sharp as Unibet
  where both exist, so it serves as the long-history price source.
- **Unibet moneyline (incl. OT) is missing from 2025/26 onward** in the
  Livesport feed, although Unibet's other markets are there. Moneyline can
  still be backtested at Unibet for 2022/23–2024/25 and at bet365/consensus for
  all seasons.
- **No public xG.** It has to be built from shot coordinates, which exist only
  for 2023/24 onward.
- **No injury feed for the SHL.** Livesport's missing-players list is empty for
  SHL games. Lineups show who dressed, after the fact.
- **No Pinnacle or exchange prices.** The market benchmark is the Swedish-book
  consensus plus bet365.
- Regular season only. Playoffs, CHL and qualification games are excluded from
  modelling; CHL games count only toward rest days.
