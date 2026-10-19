"""stats.swehockey.se: schedule/results, period scores and per-game event reports.

Per game we keep: date/time, teams, final score, period scores (OT and shootout
appear as 4th/5th "period"), attendance, and from the game report: shots and
saves per period, PIM, PP %, starting goalkeepers and every goalkeeper change,
and the goal list with strength (EQ/PP1/PP2/SH/EN/PS).
"""
from __future__ import annotations

import html as htmllib
import re
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
from bs4 import BeautifulSoup

from . import http
from .config import CURRENT_SEASON, PROCESSED, RAW, SEASONS, team_key

BASE = "https://stats.swehockey.se"
DIR = RAW / "swehockey"


def schedule_path(season: str):
    return DIR / f"schedule_{season}.html.gz"


def fetch_schedule(season: str, refresh: bool | None = None) -> str:
    if refresh is None:
        refresh = season == CURRENT_SEASON
    eid = SEASONS[season]["swehockey"]
    return http.cached_text(schedule_path(season), f"{BASE}/ScheduleAndResults/Schedule/{eid}", refresh=refresh)


def parse_schedule(text: str, season: str) -> pd.DataFrame:
    soup = BeautifulSoup(text, "lxml")
    out, cur_date = [], None
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 5:
            continue
        cells = [td.get_text(" ", strip=True).replace("\xa0", " ") for td in tds]
        joined = " | ".join(cells)
        m = re.search(r"(\d{4}-\d{2}-\d{2})", joined)
        if m:
            cur_date = m.group(1)
        game_cell = next((c for c in cells if re.search(r"\S\s+-\s+\S", c) and not re.match(r"^\d+\s*-\s*\d+$", c)), None)
        if game_cell is None or cur_date is None:
            continue
        times = re.findall(r"\b(\d{2}:\d{2})\b", joined)
        link = tr.find("a", href=re.compile(r"Game/Events/\d+"))
        gid = int(re.search(r"Game/Events/(\d+)", link["href"]).group(1)) if link else None
        home, away = [x.strip() for x in re.split(r"\s+-\s+", game_cell.split(" Final")[0], maxsplit=1)]
        res = next((c for c in cells if re.fullmatch(r"\d+\s*-\s*\d+", c)), None)
        per = next((c for c in cells if c.startswith("(") and c.endswith(")")), None)
        row = dict(season=season, sh_game_id=gid, date=cur_date, time=times[0] if times else None,
                   home=team_key(home), away=team_key(away), venue=cells[-1].strip())
        if res:
            hg, ag = map(int, re.findall(r"\d+", res))
            row.update(home_final=hg, away_final=ag)
        if per:
            ps = [tuple(map(int, p.split("-"))) for p in re.findall(r"\d+-\d+", per)]
            for i, (h, a) in enumerate(ps[:5], 1):
                row[f"p{i}_home"], row[f"p{i}_away"] = h, a
            row["n_periods"] = len(ps)
        spect = [c for c in cells if re.fullmatch(r"\d{3,6}", c)]
        row["attendance"] = int(spect[0]) if spect else None
        out.append(row)
    df = pd.DataFrame(out)
    return df


# ---------------------------------------------------------------- game reports

def event_path(season: str, gid: int):
    return DIR / "events" / season / f"{gid}.html.gz"


def fetch_event(season: str, gid: int) -> str:
    return http.cached_text(event_path(season, gid), f"{BASE}/Game/Events/{gid}")


def _text(html: str) -> str:
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmllib.unescape(s).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s)


def parse_event(html: str) -> dict:
    """Extract team-level stats and goalie usage from a game report page."""
    t = _text(html)
    r: dict = {}
    # The header lists, in order: home shots, (home periods), home saves... and
    # mirrors for the away team. Shots are listed first for home, then away.
    shots = re.findall(r"Shots (\d+) \(([\d:]+)\)", t)
    saves = re.findall(r"Saves (\d+) \(([\d:]+)\)", t)
    pim = re.findall(r"PIM (\d+) \(([\d:]+)\)", t)
    pp = re.findall(r"PP\s+([\d,]+)%\s+\((\d+:\d+)\)", t)
    if len(shots) >= 2:
        r["home_shots"], r["away_shots"] = int(shots[0][0]), int(shots[1][0])
        for side, (_, per) in zip(("home", "away"), shots[:2]):
            for i, v in enumerate(per.split(":")[:3], 1):
                r[f"{side}_shots_p{i}"] = int(v)
    if len(saves) >= 2:
        r["home_saves"], r["away_saves"] = int(saves[0][0]), int(saves[1][0])
    if len(pim) >= 2:
        r["home_pim"], r["away_pim"] = int(pim[0][0]), int(pim[1][0])
    if len(pp) >= 2:
        for side, (pct, tm) in zip(("home", "away"), pp[:2]):
            mm, ss = map(int, tm.split(":"))
            r[f"{side}_pp_time"] = mm * 60 + ss
    # Team abbreviations from the page title "FBK - ÖHK"
    m = re.match(r"\s*﻿?\s*(\S+) - (\S+)", t)
    abbr = (m.group(1), m.group(2)) if m else (None, None)
    r["home_abbr"], r["away_abbr"] = abbr
    # Goalkeeper summary: "FBK 33. Larmi, Emil 100,00% (26/26)"
    gk_sum = re.findall(r"(\S+) (\d+)\. ([^,]+), ([^%]+?) ([\d,]+)% \((\d+)/(\d+)\)", t.split("Goalkeeper Summary", 1)[-1].split(" period ")[0]) if "Goalkeeper Summary" in t else []
    r["goalies"] = [dict(team=g[0], number=int(g[1]), name=f"{g[3].strip()} {g[2].strip()}", saves=int(g[5]), shots=int(g[6])) for g in gk_sum]
    # Goalkeeper in/out events: "00:00 GK In FBK 33. Larmi, Emil"
    gk_ev = re.findall(r"(\d+:\d+) GK (In|Out) (\S+) (\d+)\. ([^,]+), (\S+)", t)
    r["gk_events"] = [dict(time=e[0], kind=e[1], team=e[2], number=int(e[3]), name=f"{e[5]} {e[4]}") for e in gk_ev]
    starters = {}
    for e in sorted(r["gk_events"], key=lambda e: _sec(e["time"])):
        if e["kind"] == "In" and e["time"] == "00:00" and e["team"] not in starters:
            starters[e["team"]] = e["name"]
    r["home_goalie"] = starters.get(abbr[0])
    r["away_goalie"] = starters.get(abbr[1])
    # Goals with strength: "41:15 7-0 (EQ) FBK 15. Berglund, Jack"
    goals = re.findall(r"(\d+:\d+) (\d+)-(\d+) \((\w+)\) (\S+) \d+\.", t)
    r["goals"] = [dict(time=g[0], score=f"{g[1]}-{g[2]}", strength=g[3], team=g[4]) for g in goals]
    for side, ab in zip(("home", "away"), abbr):
        mine = [g for g in r["goals"] if g["team"] == ab]
        r[f"{side}_ppg"] = sum(g["strength"].startswith("PP") for g in mine)
        r[f"{side}_shg"] = sum(g["strength"].startswith("SH") for g in mine)
        r[f"{side}_eng"] = sum("EN" in g["strength"] for g in mine)
    # Power-play opportunities: count opponent minor penalties isn't reliable;
    # use the "PP" percentage x goals instead where possible.
    pct = re.findall(r"PP\s+([\d,]+)%", t)
    for side, p in zip(("home", "away"), pct[:2]):
        r[f"{side}_pp_pct"] = float(p.replace(",", "."))
    return r


LINEUP_SEASONS = ("2025-26", "2026-27")


def fetch_lineup(season: str, gid: int) -> str:
    return http.cached_text(DIR / "lineups" / season / f"{gid}.html.gz", f"{BASE}/Game/LineUps/{gid}")


def parse_lineup(html: str) -> list[dict]:
    """Dressed players per team: (team, unit, number, name). Units: Goalies,
    1st..4th Line, Extra Players."""
    t = _text(html)
    m = re.search(r"\b(\S+) - (\S+) \(Line Up\) (.+?) - (.+?) \d{4}-\d{2}-\d{2}", t)
    if not m:
        return []
    names = (m.group(3).strip(), m.group(4).strip())
    out = []
    body = t.split("Linesmen", 1)[-1]
    # split into the two team blocks by their full names followed by "(colour)"
    parts = re.split(r"(" + "|".join(re.escape(n) for n in names) + r") \([A-Za-z]*\)", body)
    for i in range(1, len(parts) - 1, 2):
        team = team_key(parts[i])
        block = parts[i + 1]
        for unit, chunk in re.findall(r"(Goalies|1st Line|2nd Line|3rd Line|4th Line|Extra Players) (.*?)(?= Goalies | \dst Line| \dnd Line| \drd Line| \dth Line| Extra Players | Head Coach|$)", block):
            for num, last, first in re.findall(r"(\d+)\. ([^,]+), ([^\d(]+?)(?= \d+\.| \(|$)", chunk):
                out.append(dict(team=team, unit=unit, number=int(num), name=f"{first.strip()} {last.strip()}"))
    return out


def scrape_lineups(games: pd.DataFrame, workers=4) -> pd.DataFrame:
    sub = games[games.season.isin(LINEUP_SEASONS) & games.home_final.notna() & games.sh_game_id.notna()]

    def work(r):
        try:
            return [dict(sh_game_id=int(r.sh_game_id), **p) for p in parse_lineup(fetch_lineup(r.season, int(r.sh_game_id)))]
        except Exception as e:
            print(f"  ! lineup {r.sh_game_id}: {e}")
            return []

    with ThreadPoolExecutor(workers) as ex:
        rows = [x for lst in ex.map(work, sub.itertuples()) for x in lst]
    df = pd.DataFrame(rows)
    df.to_csv(PROCESSED / "swehockey_lineups.csv", index=False)
    return df


def _sec(t: str) -> int:
    m, s = map(int, t.split(":"))
    return m * 60 + s


def scrape(seasons=None, workers=4) -> pd.DataFrame:
    seasons = seasons or list(SEASONS)
    frames = []
    for s in seasons:
        sched = parse_schedule(fetch_schedule(s), s)
        frames.append(sched)
    games = pd.concat(frames, ignore_index=True)
    played = games[games.home_final.notna() & games.sh_game_id.notna()]
    todo = [(r.season, int(r.sh_game_id)) for r in played.itertuples()]

    def work(a):
        s, gid = a
        try:
            return gid, parse_event(fetch_event(s, gid))
        except Exception as e:  # keep going; gaps are reported in validation
            print(f"  ! event {gid}: {e}")
            return gid, None

    with ThreadPoolExecutor(workers) as ex:
        res = dict(ex.map(work, todo))
    scalar = {gid: {k: v for k, v in d.items() if not isinstance(v, list)} for gid, d in res.items() if d}
    ev = pd.DataFrame.from_dict(scalar, orient="index")
    ev.index.name = "sh_game_id"
    games = games.merge(ev, left_on="sh_game_id", right_index=True, how="left")
    PROCESSED.mkdir(parents=True, exist_ok=True)
    games.to_csv(PROCESSED / "swehockey_games.csv", index=False)
    # goalie appearances (one row per goalie per game) for save% features
    rows = []
    for gid, d in res.items():
        if not d:
            continue
        for g in d["goalies"]:
            rows.append(dict(sh_game_id=gid, **g, started=g["name"] in (d.get("home_goalie"), d.get("away_goalie"))))
    pd.DataFrame(rows).to_csv(PROCESSED / "swehockey_goalies.csv", index=False)
    scrape_lineups(games, workers)
    return games


if __name__ == "__main__":
    import sys
    df = scrape(sys.argv[1:] or None)
    print(df.groupby("season").size())
