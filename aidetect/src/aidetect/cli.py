"""``aidetect``: analyse a file or standard input from the command line.

Examples::

    aidetect essay.docx
    aidetect report.pdf --json
    pbpaste | aidetect -
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from aidetect import __version__
from aidetect.ingest import UnsupportedFileError, read_file
from aidetect.texts import LIMITATIONS

EXIT_OK, EXIT_UNREADABLE, EXIT_NO_VERDICT = 0, 2, 3


def _colour(text: str, code: str, enabled: bool) -> str:
    return f"\033[{code}m{text}\033[0m" if enabled else text


def main(argv: list[str] | None = None) -> int:
    """Entry point. Exit codes: 0 analysed, 2 unreadable input, 3 too unreliable for a verdict."""
    parser = argparse.ArgumentParser(
        prog="aidetect", description="Estimate whether a text is AI-generated."
    )
    parser.add_argument("path", help="a .txt, .docx or .pdf file, or - for standard input")
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")
    parser.add_argument("--heatmap", action="store_true", help="list the most AI-like sentences")
    parser.add_argument("--no-color", action="store_true", help="disable coloured output")
    parser.add_argument("--limitations", action="store_true", help="print the limitations and exit")
    parser.add_argument("--version", action="version", version=f"aidetect {__version__}")
    args = parser.parse_args(argv)
    if args.limitations:
        print(LIMITATIONS)
        return EXIT_OK

    try:
        text = sys.stdin.read() if args.path == "-" else read_file(Path(args.path))
    except (OSError, UnsupportedFileError) as error:
        print(f"aidetect: {error}", file=sys.stderr)
        return EXIT_UNREADABLE

    from aidetect.detector import Detector, describe_score

    result = Detector().analyse(text)
    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
        return EXIT_OK if result.probability is not None else EXIT_NO_VERDICT

    colour = sys.stdout.isatty() and not args.no_color
    code = {"likely_ai": "1;31", "likely_human": "1;32"}.get(result.band, "1")
    print(_colour(result.band_label, code, colour))
    if result.probability is not None:
        print(f"{describe_score(result)}, {result.n_words} words")
    for warning in result.warnings:
        print(_colour("! ", "33", colour) + warning.message)
    if result.reasons_ai:
        print("\nPointing towards AI:")
        print("\n".join(f"  - {r}" for r in result.reasons_ai))
    if result.reasons_human:
        print("\nPointing towards human:")
        print("\n".join(f"  - {r}" for r in result.reasons_human))
    if args.heatmap and result.sentences:
        top = sorted(result.sentences, key=lambda s: -s.heat)[:5]
        print("\nMost AI-like sentences relative to the rest of the text:")
        for s in sorted(top, key=lambda s: s.span.start):
            print(f"  > {s.span.text(result.text)[:160]}")
    print("\nThis is an estimate, not proof. Run with --limitations to read why.")
    return EXIT_OK
