"""Per-source loaders. Each turns a downloaded source into :class:`~..schema.Doc` records.

A loader is a function ``(root: Path, options: dict) -> Iterator[Doc]``. Loaders
only parse and label; cleaning, deduplication and splitting happen later and
are the same for every source.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

from aidetect_train.data.loaders import apt_eval, beemo, detectrl, ellipse, ghostbuster, hub, m4
from aidetect_train.data.schema import Doc

Loader = Callable[[Path, dict[str, Any]], Iterator[Doc]]

LOADERS: dict[str, Loader] = {
    "ghostbuster": ghostbuster.load,
    "ghostbuster_other": ghostbuster.load_other,
    "ellipse": ellipse.load,
    "beemo": beemo.load,
    "apt_eval": apt_eval.load,
    "detectrl": detectrl.load,
    "m4": m4.load,
    "raid": hub.load_raid,
    "hc3": hub.load_hc3,
    "mage": hub.load_mage,
}


def get_loader(name: str) -> Loader:
    """Look up a loader by the name used in ``sources.yaml``."""
    try:
        return LOADERS[name]
    except KeyError:
        raise KeyError(f"unknown loader {name!r}; known: {sorted(LOADERS)}") from None
