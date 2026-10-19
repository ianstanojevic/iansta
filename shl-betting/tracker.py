"""Bet tracker CLI.

    python tracker.py report
    python tracker.py add --date 2026-10-21 --opp LHF --home --market totot --selection "Under 4.5 (inkl. förl.)" --odds 2.85 --stake 3 [--prob 0.37]
    python tracker.py settle 3 win [--closing 2.80]
    python tracker.py list
"""
from __future__ import annotations

import argparse

import pandas as pd

from shlbet import tracker as T
from shlbet.config import team_key


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add", help="logga ett nytt spel (öppet)")
    a.add_argument("--date", required=True)
    a.add_argument("--opp", required=True)
    g = a.add_mutually_exclusive_group(required=True)
    g.add_argument("--home", action="store_true")
    g.add_argument("--away", action="store_true")
    a.add_argument("--market", required=True, help="x | ml | hcp | tot | totot")
    a.add_argument("--selection", required=True)
    a.add_argument("--odds", type=float, required=True)
    a.add_argument("--stake", type=float, required=True)
    a.add_argument("--prob", type=float)
    a.add_argument("--note", default="")
    s = sub.add_parser("settle", help="avgör ett spel")
    s.add_argument("id", type=int)
    s.add_argument("result", choices=["win", "loss", "push", "void"])
    s.add_argument("--closing", type=float, help="Unibets odds strax före nedsläpp (för CLV)")
    sub.add_parser("report")
    sub.add_parser("list")
    args = ap.parse_args(argv)

    df = T.load()
    if args.cmd == "add":
        nid = int(df.id.max()) + 1 if len(df) else 1
        row = dict(id=nid, date=args.date, opponent=team_key(args.opp), home_away="home" if args.home else "away",
                   market=args.market, selection=args.selection, odds_taken=args.odds, closing_odds=None,
                   model_prob=args.prob, stake=args.stake, result="open", profit=None, bankroll=None, note=args.note)
        df = T.recompute(pd.concat([df, pd.DataFrame([row])], ignore_index=True))
        T.save(df)
        print(f"Loggat spel #{nid}.")
    elif args.cmd == "settle":
        m = df.id == args.id
        if not m.any():
            raise SystemExit(f"Inget spel med id {args.id}")
        df.loc[m, "result"] = args.result
        if args.closing:
            df.loc[m, "closing_odds"] = args.closing
        T.save(T.recompute(df))
        print(f"Spel #{args.id}: {args.result}.")
    elif args.cmd == "list":
        print(df.to_string(index=False))
    print(T.report())


if __name__ == "__main__":
    main()
