"""``aidetect-data``: build and audit training datasets.

Examples::

    aidetect-data build training/configs/data_laptop.yaml
    aidetect-data audit training/configs/data_full.yaml
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from aidetect_train.data.config import load_config
from aidetect_train.data.fetch import FetchError, fetch_source
from aidetect_train.data.licence import audit_source
from aidetect_train.data.pipeline import BuildError, build
from aidetect_train.data.report import build_report, data_card
from aidetect_train.data.sources import load_sources


def _cmd_build(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    if args.offline:
        config = config.model_copy(update={"offline": True})
    try:
        result = build(config)
    except (BuildError, FetchError) as error:
        print(f"build failed: {error}", file=sys.stderr)
        return 1
    report = build_report(result)
    (result.out_dir / "BUILD_REPORT.md").write_text(report + "\n", encoding="utf-8")
    if config.datacard_path:
        config.datacard_path.write_text(data_card(result) + "\n", encoding="utf-8")
    print(f"wrote {result.out_dir}")
    print(result.leakage.summary())
    for split, info in result.manifest["splits"].items():  # type: ignore[attr-defined]
        print(f"  {split:<10} {info['rows']:>8} rows  {info['by_label']}")
    return 0


def _cmd_audit(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    registry = load_sources(config.sources_file)
    failures = 0
    for source_id in config.sources:
        spec = registry[source_id]
        try:
            root = fetch_source(spec, config.raw_dir, offline=args.offline)
        except FetchError as error:
            print(f"FETCH  {source_id}: {error}")
            failures += 1
            continue
        result = audit_source(spec, root)
        print(f"{'OK  ' if result.ok else 'FAIL'}   {source_id}: {result.message}")
        failures += not result.ok
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    """Entry point for the ``aidetect-data`` command."""
    parser = argparse.ArgumentParser(prog="aidetect-data", description=__doc__.splitlines()[0])
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)
    for name, func, help_text in (
        ("build", _cmd_build, "fetch, audit, clean, dedup, split and write a dataset"),
        ("audit", _cmd_audit, "fetch sources and check their licences only"),
    ):
        cmd = sub.add_parser(name, help=help_text)
        cmd.add_argument("config", type=Path)
        cmd.add_argument("--offline", action="store_true", help="use cached downloads only")
        cmd.set_defaults(func=func)
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING, format="%(levelname)s %(message)s"
    )
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
