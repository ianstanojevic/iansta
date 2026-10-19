"""Champions Hockey League dates for SHL teams (betexplorer), used only for rest days.

SHL teams in the CHL play extra midweek games in Sept-Dec (and knockout games
later). Ignoring them overstates rest, so the rest/back-to-back features count
every competitive game a team played, not just SHL ones.
"""
from __future__ import annotations

import re

import pandas as pd

from . import http
from .config import ALIASES, PROCESSED, RAW, SEASONS, CURRENT_SEASON, _fold

BE = "https://www.betexplorer.com/hockey/europe"


def _slug(season: str) -> str:
    return "champions-league" if season == CURRENT_SEASON else f"champions-league-{season[:4]}-{int(season[:4]) + 1}"


def _key(name: str):
    return ALIASES.get(name.lower()) or ALIASES.get(_fold(name))


def season_games(season: str) -> pd.DataFrame:
    url = f"{BE}/{_slug(season)}/results/"
    refresh = season == CURRENT_SEASON
    t = http.cached_text(RAW / "betexplorer" / f"chl_{season}.html.gz", url, refresh=refresh)
    pages = [t]
    for st in sorted(set(re.findall(r'href="(\?stage=[^"]+)"', t))):
        pages.append(http.cached_text(RAW / "betexplorer" / f"chl_{season}_{st[7:]}.html.gz", url + st, refresh=refresh))
    rows = []
    for p in pages:
        for r in re.findall(r'<tr><td class="h-text-left"><a data-test.*?</tr>', p, re.S):
            m = re.search(r'/([A-Za-z0-9]{8})/" class="in-match"><span>(.*?)</span> - <span>(.*?)</span>', r)
            d = re.search(r'h-text-no-wrap">(\d\d)\.(\d\d)\.(\d{4})?<', r)
            if not (m and d):
                continue
            if not re.search(r'">\d+:\d+', r):  # cancelled / postponed / awarded: not played
                continue
            h, a = (re.sub("<[^>]+>", "", x) for x in m.groups()[1:])
            year = d.group(3) or (season[:4] if int(d.group(2)) >= 7 else str(int(season[:4]) + 1))
            dt = f"{year}-{d.group(2)}-{d.group(1)}"
            for team in (_key(h), _key(a)):
                if team:
                    rows.append(dict(season=season, date=dt, team=team, competition="CHL", fs_id=m.group(1)))
    return pd.DataFrame(rows).drop_duplicates()


def scrape(seasons=None) -> pd.DataFrame:
    df = pd.concat([season_games(s) for s in (seasons or SEASONS)], ignore_index=True)
    df.to_csv(PROCESSED / "chl_games.csv", index=False)
    return df


if __name__ == "__main__":
    d = scrape()
    print(d.groupby(["season", "team"]).size().unstack(fill_value=0))
