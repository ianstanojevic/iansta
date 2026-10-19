"""Historical and upcoming odds.

Spine: betexplorer season result pages (one request per season) give every
regular-season game with its Livesport event id, final score, OT/SO flag and
the cross-bookmaker *average* 1X2 odds.

Detail: the Livesport odds service behind flashscore returns, per bookmaker and
market, the opening and the last pre-match ("closing") price. It filters
bookmakers by a geo parameter; with geoIpCode=SE it returns the Swedish
licensed books, including Unibet SE, which is exactly the book we bet at.

Markets kept (bettingType / bettingScope):
  HOME_DRAW_AWAY / FULL_TIME             1X2, 60 minutes
  HOME_AWAY      / FULL_TIME_OVER_TIME   moneyline incl. OT and shootout
  OVER_UNDER     / FULL_TIME             totals, 60 minutes
  OVER_UNDER     / FULL_TIME_OVER_TIME   totals incl. OT
  ASIAN_HANDICAP / FULL_TIME             puck line etc., 60 minutes
  ASIAN_HANDICAP / FULL_TIME_OVER_TIME   puck line incl. OT
  DRAW_NO_BET    / FULL_TIME
  DOUBLE_CHANCE  / FULL_TIME

Home/away identity of each odds item is resolved with the event participant
ids from the flashscore match page, never by position.
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import pandas as pd

from . import http
from .config import CURRENT_SEASON, PROCESSED, RAW, SEASONS, team_key

BE = "https://www.betexplorer.com"
FS_ODDS = "https://global.ds.lsapp.eu/odds/pq_graphql"
FS_HEAD = {"Origin": "https://www.flashscore.com", "Referer": "https://www.flashscore.com/"}
DIR_BE = RAW / "betexplorer"
DIR_FS = RAW / "flashscore"
GEO = "SE"

KEEP = {
    ("HOME_DRAW_AWAY", "FULL_TIME"), ("HOME_AWAY", "FULL_TIME_OVER_TIME"),
    ("OVER_UNDER", "FULL_TIME"), ("OVER_UNDER", "FULL_TIME_OVER_TIME"),
    ("ASIAN_HANDICAP", "FULL_TIME"), ("ASIAN_HANDICAP", "FULL_TIME_OVER_TIME"),
    ("DRAW_NO_BET", "FULL_TIME"), ("DOUBLE_CHANCE", "FULL_TIME"),
}


# ------------------------------------------------------------- betexplorer spine

def _season_year(season: str, ddmm: str) -> int:
    start = int(season[:4])
    return start if int(ddmm.split(".")[1]) >= 7 else start + 1


def be_results(season: str, refresh: bool | None = None) -> pd.DataFrame:
    if refresh is None:
        refresh = season == CURRENT_SEASON
    slug = SEASONS[season]["betexplorer"]
    url = f"{BE}/hockey/sweden/{slug}/results/"
    path = DIR_BE / f"results_{season}.html.gz"
    t = http.cached_text(path, url, refresh=refresh)
    stage = re.findall(r'href="(\?stage=[^"]+)"[^>]*>Main<', t)
    if stage:
        t = http.cached_text(DIR_BE / f"results_{season}_main.html.gz", url + stage[0], refresh=refresh)
    rows = re.findall(r'<tr><td class="h-text-left"><a data-test.*?</tr>', t, re.S)
    out = []
    for r in rows:
        m = re.search(r'href="(/hockey/sweden/[^"]+/([A-Za-z0-9]{8})/)" class="in-match"><span>(.*?)</span> - <span>(.*?)</span>', r)
        href, eid, h, a = m.groups()
        h, a = re.sub("<[^>]+>", "", h), re.sub("<[^>]+>", "", a)
        sc = re.search(r'">(\d+):(\d+)(?: <span title="([^"]+)">([^<]+)</span>)?</a></td>', r)
        odds = re.findall(r'data-odd="([\d.]+)"', r)
        d = re.search(r'h-text-no-wrap">([^<]*)<', r).group(1).strip()
        if re.fullmatch(r"\d\d\.\d\d\.\d{4}", d):
            dt = f"{d[6:10]}-{d[3:5]}-{d[0:2]}"
        elif re.fullmatch(r"\d\d\.\d\d\.", d):
            dt = f"{_season_year(season, d[:5])}-{d[3:5]}-{d[0:2]}"
        elif d.lower() in ("today", "yesterday"):  # live page; matching allows +-1 day anyway
            dt = (pd.Timestamp.today().normalize() - pd.Timedelta(days=int(d.lower() == "yesterday"))).strftime("%Y-%m-%d")
        else:
            dt = None
        row = dict(season=season, fs_id=eid, be_href=href, date=dt, home=team_key(h), away=team_key(a))
        if sc:
            row.update(be_home=int(sc.group(1)), be_away=int(sc.group(2)), be_flag=sc.group(4) or "")
        if len(odds) == 3:
            row.update(avg_home=float(odds[0]), avg_draw=float(odds[1]), avg_away=float(odds[2]))
        out.append(row)
    return pd.DataFrame(out)


def be_fixtures() -> pd.DataFrame:
    """Upcoming games of the current season (ids needed for pre-game odds)."""
    url = f"{BE}/hockey/sweden/shl/fixtures/"
    t = http.cached_text(DIR_BE / "fixtures_current.html.gz", url, refresh=True)
    out = []
    for m in re.finditer(r'href="(/hockey/sweden/shl/[^"]+/([A-Za-z0-9]{8})/)"[^>]*>\s*<span>(.*?)</span> - <span>(.*?)</span>', t, re.S):
        href, eid, h, a = m.groups()
        out.append(dict(season=CURRENT_SEASON, fs_id=eid, home=team_key(re.sub("<[^>]+>", "", h)),
                        away=team_key(re.sub("<[^>]+>", "", a))))
    return pd.DataFrame(out).drop_duplicates("fs_id")


# ------------------------------------------------------------- flashscore detail

def fs_participants(season: str, eid: str) -> dict:
    """{'home': eventParticipantId, 'away': ...} for an event.

    Primary source is the small missing-players query, which labels each event
    participant HOME/AWAY (and would carry injury lists if Livesport had them
    for SHL; it does not, so far). Fallback: the participantsData block of the
    full match page.
    """
    path = DIR_FS / "participants" / season / f"{eid}.json.gz"
    if path.exists():
        return http.read_json_gz(path)
    try:
        d = http.get("https://2.ds.lsapp.eu/pq_graphql", params=dict(_hash="dmp", eventId=eid, projectId=2),
                     headers=FS_HEAD).json()["data"]["findEventById"]
        side = {p["type"]["side"]: p for p in d["eventParticipants"]}
        switched = d["tournamentStage"]["tournament"]["tournamentTemplate"]["switchedParticipants"]
        if not switched and {"HOME", "AWAY"} <= set(side):
            out = dict(home=side["HOME"]["id"], away=side["AWAY"]["id"], source="dmp",
                       missing_home=side["HOME"]["lineup"], missing_away=side["AWAY"]["lineup"])
            http.write_json_gz(path, out)
            return out
    except Exception:
        pass
    r = http.session().get(f"https://www.flashscore.com/match/{eid}/", stream=True, timeout=45)
    buf = b""
    for chunk in r.iter_content(65536):
        buf += chunk
        i = buf.find(b'"participantsData"')
        if i >= 0 and len(buf) > i + 6000:
            break
    r.close()
    s = buf.decode("utf-8", "replace")
    i = s.find('"participantsData"')
    seg = s[i:i + 6000]
    home = re.search(r'"home":\[\{"id":"(\w+)","eventParticipantId":"(\w+)","sport_id":\d+,"name":"([^"]+)"', seg)
    away = re.search(r'"away":\[\{"id":"(\w+)","eventParticipantId":"(\w+)","sport_id":\d+,"name":"([^"]+)"', seg)
    if not (home and away):
        raise RuntimeError(f"participants not found for {eid}")
    out = dict(home=home.group(2), away=away.group(2), home_name=home.group(3), away_name=away.group(3),
               home_team_id=home.group(1), away_team_id=away.group(1))
    http.write_json_gz(path, out)
    return out


def fs_odds_raw(season: str, eid: str, refresh=False) -> dict:
    """Trimmed raw odds payload (kept markets only) for one event."""
    path = DIR_FS / "odds" / season / f"{eid}.json.gz"
    if path.exists() and not refresh:
        return http.read_json_gz(path)
    r = http.get(FS_ODDS, params=dict(_hash="oce", eventId=eid, projectId=2, geoIpCode=GEO,
                                      geoIpSubdivisionCode=GEO), headers=FS_HEAD)
    d = (r.json().get("data") or {}).get("findOddsByEventId") or {}
    books = {b["bookmaker"]["id"]: b["bookmaker"]["name"] for b in (d.get("settings") or {}).get("bookmakers", [])}
    odds = [dict(b=o["bookmakerId"], t=o["bettingType"], s=o["bettingScope"],
                 o=[dict(p=i["eventParticipantId"], v=i["value"], op=i["opening"], a=i["active"],
                         h=(i["handicap"] or {}).get("value"), sel=i["selection"]) for i in o["odds"]])
            for o in d.get("odds", []) if (o["bettingType"], o["bettingScope"]) in KEEP and o["odds"]]
    out = dict(eventId=eid, geo=GEO, fetched=date.today().isoformat(), books=books, odds=odds)
    http.write_json_gz(path, out)
    return out


def fs_stats_raw(season: str, eid: str) -> str:
    path = DIR_FS / "stats" / season / f"{eid}.txt.gz"
    return http.cached_text(path, f"https://www.flashscore.com/x/feed/df_st_1_{eid}",
                            headers={"x-fsign": "SW9D1eZo", **FS_HEAD})


def parse_fs_stats(txt: str) -> dict:
    """Whole-game section of the flashscore stats feed -> flat dict."""
    sec = txt.split("SE÷")[1] if "SE÷" in txt else ""
    out = {}
    for name, h, a in re.findall(r"SG÷([^¬]+)¬SH÷([^¬]*)¬SI÷([^¬]*)", sec):
        key = re.sub(r"[^a-z]+", "_", name.lower()).strip("_")
        for side, v in (("home", h), ("away", a)):
            m = re.search(r"\((\d+)/(\d+)\)", v)
            if m:  # "50% (1/2)" -> made/attempts
                out[f"{side}_{key}_n"], out[f"{side}_{key}_d"] = int(m.group(1)), int(m.group(2))
            else:
                try:
                    out[f"{side}_{key}"] = float(v)
                except ValueError:
                    pass
    return out


def odds_long(raw: dict, parts: dict) -> list[dict]:
    """Flatten one event's odds into rows: book, market, side, line, open, close."""
    side_of = {parts["home"]: "home", parts["away"]: "away", None: "draw"}
    rows = []
    for o in raw["odds"]:
        bt, sc = o["t"], o["s"]
        for i in o["o"]:
            if bt == "OVER_UNDER":
                side = (i["sel"] or "").lower()
            elif bt == "DOUBLE_CHANCE":
                side = {parts["home"]: "1X", parts["away"]: "X2", None: "12"}.get(i["p"], "?")
            else:
                side = side_of.get(i["p"], "?")
            # freshly fetched payloads have int keys, JSON round-trips turn them into str
            books = raw["books"]
            book = books.get(o["b"]) or books.get(str(o["b"])) or str(o["b"])
            rows.append(dict(book=book, market=bt, scope=sc, side=side,
                             line=float(i["h"]) if i["h"] is not None else None,
                             close=float(i["v"]) if i["v"] else None,
                             open=float(i["op"]) if i["op"] else None, active=i["a"]))
    return rows


def scrape(seasons=None, workers=4, include_upcoming=True):
    seasons = seasons or list(SEASONS)
    spine = pd.concat([be_results(s) for s in seasons], ignore_index=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    spine.to_csv(PROCESSED / "betexplorer_games.csv", index=False)

    def work(row):
        s, eid = row
        res = {"fs_id": eid}
        try:
            parts = fs_participants(s, eid)
            raw = fs_odds_raw(s, eid)
            res["odds"] = [dict(fs_id=eid, **x) for x in odds_long(raw, parts)]
        except Exception as e:
            print(f"  ! odds {eid}: {e}")
            res["odds"] = []
        try:
            res.update(parse_fs_stats(fs_stats_raw(s, eid)))
        except Exception as e:
            print(f"  ! stats {eid}: {e}")
        return res

    todo = [(r.season, r.fs_id) for r in spine.itertuples() if pd.notna(getattr(r, "be_home", None))]
    with ThreadPoolExecutor(workers) as ex:
        results = list(ex.map(work, todo))
    odds = pd.DataFrame([x for r in results for x in r.pop("odds")])
    stats = pd.DataFrame(results)
    odds.to_csv(PROCESSED / "odds_long.csv.gz", index=False)
    stats.to_csv(PROCESSED / "flashscore_stats.csv", index=False)
    return spine, odds, stats


def upcoming_odds(eid: str) -> pd.DataFrame:
    """Current pre-game odds for a not-yet-played game (always refetched)."""
    parts = fs_participants(CURRENT_SEASON, eid)
    raw = fs_odds_raw(CURRENT_SEASON + "_upcoming", eid, refresh=True)
    return pd.DataFrame(odds_long(raw, parts))


if __name__ == "__main__":
    import sys
    sp, od, st = scrape(sys.argv[1:] or None)
    print(sp.groupby("season").size())
    print(od.groupby(["market", "scope"]).fs_id.nunique())
