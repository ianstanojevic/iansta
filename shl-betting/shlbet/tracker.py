"""Bet log (tracker.csv): log bets, settle them, report bankroll, ROI and CLV."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import ROOT

PATH = ROOT / "tracker.csv"
COLS = ["id", "date", "opponent", "home_away", "market", "selection", "odds_taken", "closing_odds",
        "model_prob", "stake", "result", "profit", "bankroll", "note"]
START_BANKROLL = 100.0


def load(path: Path = PATH) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame(columns=COLS)
    return pd.read_csv(path)


def save(df: pd.DataFrame, path: Path = PATH) -> None:
    df[COLS].to_csv(path, index=False)


def recompute(df: pd.DataFrame) -> pd.DataFrame:
    """Profit and running bankroll from results, in id order."""
    df = df.sort_values("id").reset_index(drop=True)
    bank = START_BANKROLL
    profits, banks = [], []
    for r in df.itertuples():
        res = str(r.result)
        p = {"win": r.stake * (r.odds_taken - 1), "loss": -r.stake, "push": 0.0, "void": 0.0}.get(res)
        if p is not None:
            bank += p
        profits.append(p)
        banks.append(bank if p is not None else None)
    df["profit"], df["bankroll"] = profits, banks
    return df


def current_bankroll(path: Path = PATH) -> float:
    df = load(path)
    settled = df[df.result.isin(["win", "loss", "push", "void"])] if len(df) else df
    bank = START_BANKROLL + (settled.profit.sum() if len(settled) else 0.0)
    open_stakes = df[df.result == "open"].stake.sum() if len(df) else 0.0
    return float(bank - open_stakes)


def report(path: Path = PATH) -> str:
    df = load(path)
    s = df[df.result.isin(["win", "loss", "push", "void"])]
    lines = [f"Bankrulle: {START_BANKROLL + s.profit.sum():.2f} kr (start {START_BANKROLL:.0f} kr)",
             f"Avgjorda spel: {len(s)}  (vinst {int((s.result == 'win').sum())}, förlust {int((s.result == 'loss').sum())})",
             f"Öppna spel: {int((df.result == 'open').sum())}"]
    if len(s):
        lines.append(f"Omsatt: {s.stake.sum():.2f} kr, resultat {s.profit.sum():+.2f} kr, ROI {s.profit.sum() / s.stake.sum():+.1%}")
    c = s[s.closing_odds.notna() & ~s.note.fillna("").str.contains("live")]
    if len(c):
        clv = c.odds_taken / c.closing_odds - 1
        lines.append(f"CLV (pre-game spel med stängningsodds, n={len(c)}): medel {clv.mean():+.1%}, "
                     f"slog stängningen i {(clv > 0).mean():.0%} av spelen")
    else:
        lines.append("CLV: inga pre-game spel med stängningsodds än (livespel räknas inte).")
    return "\n".join(lines)
