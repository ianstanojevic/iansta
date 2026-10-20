"""ELLIPSE corpus: about 6,500 essays by English-language learners in US schools (grades 8-12).

Essays were anonymised by replacing names with placeholders such as
``Generic_Name``. No AI text contains those, so they would teach a model a
useless shortcut; they are flagged here and replaced during cleaning.

The public test archive is password-protected by its authors (it is a
held-out set), so only the train file (about 3,900 essays) is used.
"""

from __future__ import annotations

import logging
import re
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pandas as pd

from aidetect_train.data.schema import Doc

log = logging.getLogger(__name__)
PLACEHOLDER = re.compile(r"\b(?:Generic_[A-Za-z]+|[A-Z]+_NAME|PROEPR_NAME)")


def _read_frames(root: Path) -> Iterator[tuple[str, pd.DataFrame]]:
    train = root / "ELLIPSE_Final_github_train.csv"
    yield "train", pd.read_csv(train, dtype={"text_id_kaggle": str})
    test_zip = root / "ELLIPSE_Final_github_test.zip"
    if not test_zip.is_file():
        return
    with zipfile.ZipFile(test_zip) as archive:
        name = next(n for n in archive.namelist() if n.endswith(".csv"))
        if archive.getinfo(name).flag_bits & 0x1:
            log.info("ELLIPSE test archive is password-protected; using the train file only")
            return
        with archive.open(name) as handle:
            yield "test", pd.read_csv(handle, dtype={"text_id_kaggle": str})


def load(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load ELLIPSE train and test essays as non-native human writing."""
    del options
    for split, frame in _read_frames(root):
        for row in frame.itertuples(index=False):
            text = str(row.full_text)
            artefacts = ("anonymisation_placeholders",) if PLACEHOLDER.search(text) else ()
            yield Doc(
                text=text,
                label="human",
                doc_id=str(row.text_id_kaggle),
                group_id=f"ellipse/{row.text_id_kaggle}",
                domain="student_essay_k12",
                writer_l1="non_native",
                artefacts=artefacts,
                source_split=split,
            )
