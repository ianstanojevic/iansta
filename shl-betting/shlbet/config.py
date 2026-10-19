"""Static configuration: seasons, source IDs, team identities and locations."""
from __future__ import annotations

import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

CURRENT_SEASON = "2026-27"

# season -> source identifiers for the SHL regular season.
#   swehockey: event id on stats.swehockey.se
#   betexplorer: URL slug (the current season lives under the bare "shl" slug)
#   shlapi: season uuid on www.shl.se/api (gameday data only exists from 2023-24)
SEASONS: dict[str, dict] = {
    "2018-19": {"swehockey": 9171, "betexplorer": "shl-2018-2019", "shlapi": "qUv-YXiuQN45"},
    "2019-20": {"swehockey": 10371, "betexplorer": "shl-2019-2020", "shlapi": "qWX-334j11U5o1"},
    "2020-21": {"swehockey": 11450, "betexplorer": "shl-2020-2021", "shlapi": "qY7-AdVh5z1XJ"},
    "2021-22": {"swehockey": 12318, "betexplorer": "shl-2021-2022", "shlapi": "qZl-8qa6OaFXf"},
    "2022-23": {"swehockey": 13469, "betexplorer": "shl-2022-2023", "shlapi": "qbN-XMFfjGVt"},
    "2023-24": {"swehockey": 14677, "betexplorer": "shl-2023-2024", "shlapi": "qcz-3NvSZ2Cmh"},
    "2024-25": {"swehockey": 15977, "betexplorer": "shl-2024-2025", "shlapi": "qeb-73bZkIm9A"},
    "2025-26": {"swehockey": 18263, "betexplorer": "shl-2025-2026", "shlapi": "xs4m9qupsi"},
    "2026-27": {"swehockey": 20961, "betexplorer": "shl", "shlapi": "ndcf81nlb3"},
}
SHLAPI_SERIES = "qQ9-bb0bzEWUk"
SHLAPI_REGULAR = "qQ9-af37Ti40B"

# Canonical team key -> names used by each source, plus home-city coordinates
# (arena location, used for travel distance).
TEAMS: dict[str, dict] = {
    "FBK": {"name": "Färjestad BK", "be": "Farjestad", "city": "Karlstad", "lat": 59.3793, "lon": 13.5036},
    "FHC": {"name": "Frölunda HC", "be": "Frolunda", "city": "Göteborg", "lat": 57.7001, "lon": 11.9875},
    "DIF": {"name": "Djurgårdens IF", "be": "Djurgarden", "city": "Stockholm", "lat": 59.2936, "lon": 18.0835},
    "BIF": {"name": "Brynäs IF", "be": "Brynas", "city": "Gävle", "lat": 60.6638, "lon": 17.1528},
    "HV71": {"name": "HV 71", "be": "HV 71", "city": "Jönköping", "lat": 57.7745, "lon": 14.2066},
    "IFB": {"name": "IF Björklöven", "be": "Bjorkloven", "city": "Umeå", "lat": 63.8178, "lon": 20.2954},
    "MIF": {"name": "IF Malmö Redhawks", "be": "Malmo", "city": "Malmö", "lat": 55.5664, "lon": 12.9781},
    "LHC": {"name": "Linköping HC", "be": "Linkoping", "city": "Linköping", "lat": 58.4157, "lon": 15.6060},
    "LHF": {"name": "Luleå HF", "be": "Lulea", "city": "Luleå", "lat": 65.5794, "lon": 22.1414},
    "RBK": {"name": "Rögle BK", "be": "Rogle", "city": "Ängelholm", "lat": 56.2461, "lon": 12.8650},
    "SAIK": {"name": "Skellefteå AIK", "be": "Skelleftea", "city": "Skellefteå", "lat": 64.7477, "lon": 20.9602},
    "TIK": {"name": "Timrå IK", "be": "Timra", "city": "Timrå", "lat": 62.4870, "lon": 17.3250},
    "VLH": {"name": "Växjö Lakers HC", "be": "Vaxjo", "city": "Växjö", "lat": 56.8670, "lon": 14.8270},
    "ÖHK": {"name": "Örebro HK", "be": "Orebro", "city": "Örebro", "lat": 59.2617, "lon": 15.2353},
    "LIF": {"name": "Leksands IF", "be": "Leksand", "city": "Leksand", "lat": 60.7291, "lon": 14.9937},
    "IKO": {"name": "IK Oskarshamn", "be": "Oskarshamn", "city": "Oskarshamn", "lat": 57.2645, "lon": 16.4484},
    "MODO": {"name": "MoDo Hockey", "be": "MODO", "city": "Örnsköldsvik", "lat": 63.2909, "lon": 18.7152},
    "AIK": {"name": "AIK", "be": "AIK", "city": "Stockholm", "lat": 59.3725, "lon": 17.9935},
    "MIK": {"name": "Mora IK", "be": "Mora", "city": "Mora", "lat": 61.0070, "lon": 14.5430},
}

# Alternative spellings seen in the sources -> canonical key.
ALIASES: dict[str, str] = {}
for _k, _v in TEAMS.items():
    for _n in (_k, _v["name"], _v["be"]):
        ALIASES[_n.lower()] = _k
ALIASES.update({
    "hv71": "HV71", "hv 71": "HV71",
    "malmö redhawks": "MIF", "malmo redhawks": "MIF", "malmö": "MIF", "malmo": "MIF",
    "växjö lakers": "VLH", "vaxjo lakers": "VLH", "växjö": "VLH",
    "modo": "MODO", "modo hockey": "MODO",
    "färjestad": "FBK", "frölunda": "FHC", "djurgården": "DIF", "brynäs": "BIF",
    "linköping": "LHC", "luleå": "LHF", "rögle": "RBK", "skellefteå": "SAIK",
    "timrå": "TIK", "örebro": "ÖHK", "leksand": "LIF", "oskarshamn": "IKO",
    "björklöven": "IFB", "mora": "MIK", "fhc": "FHC", "ohk": "ÖHK",
})


def _fold(s: str) -> str:
    """Lowercase and strip diacritics: 'IF Björklöven' -> 'if bjorkloven'."""
    s = unicodedata.normalize("NFKD", s.strip().lower())
    return "".join(c for c in s if not unicodedata.combining(c))


for _a, _k in list(ALIASES.items()):
    ALIASES.setdefault(_fold(_a), _k)
    for _p in ("if ", "ik "):
        if _fold(_a).startswith(_p):
            ALIASES.setdefault(_fold(_a)[len(_p):], _k)
        else:
            ALIASES.setdefault(_p + _fold(_a), _k)


def team_key(name: str) -> str:
    """Map any source's team name to the canonical key; raise if unknown."""
    n = name.strip().lower()
    k = ALIASES.get(n) or ALIASES.get(_fold(n))
    if k is None:
        n = _fold(n)
    if k is None:
        # cells sometimes carry trailing notes ("Färjestad BK Matchstart ca 20.30")
        pref = [a for a in ALIASES if n.startswith(a + " ")]
        if pref:
            k = ALIASES[max(pref, key=len)]
    if k is None:
        raise KeyError(f"Unknown team name: {name!r}")
    return k
