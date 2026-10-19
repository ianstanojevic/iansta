"""Fetch whatever is new, rebuild the processed dataset and refit the models.

Re-runnable: completed games are cached in data/raw and never refetched; only
the current season's schedule/result pages are refreshed. Run before each bet.

    python update_data.py
"""
from __future__ import annotations

import argparse

from shlbet import backtest, build_dataset, scrape_chl, scrape_odds, scrape_shlapi, scrape_swehockey, validate
from shlbet.config import CURRENT_SEASON, SEASONS


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    # Scrapers write processed per-source files from *all* seasons they are
    # given, so always pass every season; cached seasons cost no requests.
    seasons = list(SEASONS)
    print("swehockey ...")
    scrape_swehockey.scrape(seasons)
    print("betexplorer + flashscore odds/stats ...")
    scrape_odds.scrape(seasons)
    print("shl.se API ...")
    scrape_shlapi.scrape()
    print("CHL dates ...")
    scrape_chl.scrape(seasons)
    print("building dataset ...")
    g = build_dataset.build()
    print(validate.report().split("## 3.")[0][-600:])
    print("refitting models (walk-forward predictions incl. upcoming games) ...")
    backtest.make_predictions()
    cur = g[(g.season == CURRENT_SEASON) & g.played]
    print(f"{CURRENT_SEASON}: {len(cur)} games played, last {cur.date.max()}")


if __name__ == "__main__":
    main()
