"""www.shl.se public API: schedule, play-by-play with shot coordinates, team stats.

Gameday data (play-by-play, team stats) only exists from 2023-24 onwards.
Shot coordinates feed an in-house expected-goals model; blocked shots and
hits come from team stats.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from . import http
from .config import CURRENT_SEASON, PROCESSED, RAW, SEASONS, SHLAPI_REGULAR, SHLAPI_SERIES, team_key

API = "https://www.shl.se/api"
DIR = RAW / "shlapi"
FIRST_GAMEDAY_SEASON = "2023-24"

# fields of a play-by-play event we keep (the feed repeats team/arena info per event)
PBP_KEEP = ("eventId", "type", "period", "time", "eventTeam", "player", "locationX", "locationY",
            "goalSection", "isPenaltyShot", "isEmptyNetGoal", "goalStatus", "homeGoals", "awayGoals",
            "isEntering", "variant", "pop", "nep")


def schedule(season: str) -> pd.DataFrame:
    path = DIR / f"schedule_{season}.json.gz"
    if path.exists() and season != CURRENT_SEASON:
        d = http.read_json_gz(path)
    else:
        d = http.get(f"{API}/sports-v2/game-schedule", params=dict(
            seasonUuid=SEASONS[season]["shlapi"], seriesUuid=SHLAPI_SERIES, gameTypeUuid=SHLAPI_REGULAR,
            gamePlace="all", played="all")).json()
        http.write_json_gz(path, d)
    rows = []
    for g in d["gameInfo"]:
        h, a = g["homeTeamInfo"], g["awayTeamInfo"]
        rows.append(dict(season=season, shl_uuid=g["uuid"], start=g["startDateTime"], state=g["state"],
                         home=team_key(h["names"]["long"]), away=team_key(a["names"]["long"]),
                         home_score=h.get("score"), away_score=a.get("score"),
                         overtime=g.get("overtime"), shootout=g.get("shootout"),
                         venue=(g.get("venueInfo") or {}).get("name")))
    return pd.DataFrame(rows)


def pbp(season: str, uuid: str) -> list:
    path = DIR / "pbp" / season / f"{uuid}.json.gz"
    if path.exists():
        return http.read_json_gz(path)
    r = http.get(f"{API}/gameday/play-by-play/{uuid}")
    d = r.json() if r.text.strip() else []
    slim = [{k: e[k] for k in PBP_KEEP if k in e} for e in (d or [])]
    http.write_json_gz(path, slim)
    return slim


def team_stats(season: str, uuid: str) -> dict:
    path = DIR / "teamstats" / season / f"{uuid}.json.gz"
    if path.exists():
        return http.read_json_gz(path)
    r = http.get(f"{API}/gameday/team-stats/{uuid}")
    d = r.json() if r.text.strip() else {}
    http.write_json_gz(path, d)
    return d


def flat_team_stats(d: dict) -> dict:
    out = {}
    for side in ("home", "away"):
        for blk in (d.get(side) or {}).get("statistics", []):
            if blk.get("period") == 0:
                for kv in blk["parsedTotalStatistics"]:
                    out[f"{side}_{kv['key']}"] = kv["value"]
    return out


def shots_table(season: str, uuid: str, events: list) -> list[dict]:
    rows = []
    for e in events:
        if e.get("type") not in ("shot", "goal"):
            continue
        rows.append(dict(season=season, shl_uuid=uuid, event_id=e.get("eventId"), type=e["type"],
                         period=e.get("period"), time=e.get("time"),
                         team_place=(e.get("eventTeam") or {}).get("place"),
                         x=e.get("locationX"), y=e.get("locationY"), section=e.get("goalSection"),
                         penalty_shot=e.get("isPenaltyShot"), empty_net=e.get("isEmptyNetGoal"),
                         strength=e.get("goalStatus"), shooter=(e.get("player") or {}).get("playerId")))
    return rows


def scrape(seasons=None, workers=4):
    seasons = seasons or [s for s in SEASONS if s >= FIRST_GAMEDAY_SEASON]
    sched = pd.concat([schedule(s) for s in seasons], ignore_index=True)
    done = sched[sched.state == "post-game"]

    def work(r):
        try:
            ev = pbp(r.season, r.shl_uuid)
            ts = flat_team_stats(team_stats(r.season, r.shl_uuid))
            return dict(shl_uuid=r.shl_uuid, **ts), shots_table(r.season, r.shl_uuid, ev)
        except Exception as e:
            print(f"  ! {r.shl_uuid}: {e}")
            return dict(shl_uuid=r.shl_uuid), []

    with ThreadPoolExecutor(workers) as ex:
        res = list(ex.map(work, done.itertuples()))
    ts = pd.DataFrame([a for a, _ in res])
    shots = pd.DataFrame([x for _, b in res for x in b])
    PROCESSED.mkdir(parents=True, exist_ok=True)
    sched.merge(ts, on="shl_uuid", how="left").to_csv(PROCESSED / "shlapi_games.csv", index=False)
    shots.to_csv(PROCESSED / "shlapi_shots.csv.gz", index=False)
    return sched, shots


if __name__ == "__main__":
    import sys
    s, sh = scrape(sys.argv[1:] or None)
    print(s.groupby(["season", "state"]).size())
    print(sh.groupby(["season", "type"]).size())
