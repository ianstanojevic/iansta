# SHL betting model — Färjestad BK, 2026/27

A walk-forward-validated betting model for SHL games, aimed at long-run bankroll
growth when betting on Färjestad BK games at Unibet.

> Status: **Phases 1–3 complete** (see `reports/phase3_verdict.md`). The betting tools
> (`predict.py`, `tracker.csv`) come in phases 2–4.

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
