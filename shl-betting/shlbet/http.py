"""Polite HTTP with retries plus a gzip file cache under data/raw.

Every scraper writes the raw response it received to disk before parsing, so
the processed dataset can always be rebuilt offline and re-runs only fetch what
is missing (or what is explicitly marked as volatile, like the current
season's schedule).
"""
from __future__ import annotations

import gzip
import json
import random
import threading
import time
from pathlib import Path

import requests

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0 Safari/537.36")

_local = threading.local()


def session() -> requests.Session:
    s = getattr(_local, "s", None)
    if s is None:
        s = requests.Session()
        s.headers["User-Agent"] = UA
        _local.s = s
    return s


def get(url: str, *, params=None, headers=None, timeout=45, tries=5, min_delay=0.25) -> requests.Response:
    """GET with exponential backoff on network errors, 429 and 5xx."""
    last = None
    for i in range(tries):
        try:
            r = session().get(url, params=params, headers=headers, timeout=timeout)
            if "charset" not in r.headers.get("content-type", "").lower():
                r.encoding = "utf-8"  # swehockey omits it; requests would assume latin-1
            if r.status_code == 200:
                time.sleep(min_delay + random.random() * min_delay)
                return r
            if r.status_code in (429, 500, 502, 503, 504):
                last = RuntimeError(f"HTTP {r.status_code} for {r.url}")
            else:
                r.raise_for_status()
                return r
        except requests.RequestException as e:  # network trouble: retry
            last = e
        time.sleep(2 ** i + random.random())
    raise RuntimeError(f"GET failed after {tries} tries: {url}") from last


def write_gz(path: Path, data: str | bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, str):
        data = data.encode("utf-8")
    tmp = path.with_suffix(path.suffix + ".tmp")
    with gzip.open(tmp, "wb", compresslevel=9) as f:
        f.write(data)
    tmp.replace(path)


def read_gz(path: Path) -> str:
    with gzip.open(path, "rb") as f:
        return fix_mojibake(f.read().decode("utf-8"))


def fix_mojibake(text: str) -> str:
    """Undo UTF-8 bytes that were decoded as latin-1 (exactly reversible)."""
    if text.startswith("ï»¿") or "Ã" in text[:5000]:
        try:
            return text.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return text
    return text


def write_json_gz(path: Path, obj) -> None:
    write_gz(path, json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


def read_json_gz(path: Path):
    return json.loads(read_gz(path))


def cached_text(path: Path, url: str, *, refresh=False, **kw) -> str:
    if path.exists() and not refresh:
        return read_gz(path)
    text = get(url, **kw).text
    write_gz(path, text)
    return text
