"""Download sources at a pinned revision into a local cache.

Git sources are fetched at an exact commit, Hugging Face datasets at an exact
revision, and plain URLs are verified against a SHA-256 digest. A cache entry
is reused only if it matches the pinned revision, so a build cannot silently
pick up changed upstream data.
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import urllib.request
from pathlib import Path

from huggingface_hub import HfApi, snapshot_download

from aidetect_train.data.sources import SourceSpec


class FetchError(RuntimeError):
    """A source could not be fetched or did not match its pinned revision."""


def _git(args: list[str], cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, check=False, capture_output=True, text=True, timeout=3600
    )
    if result.returncode != 0:
        raise FetchError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def _git_head(path: Path) -> str | None:
    if not (path / ".git").exists():
        return None
    try:
        return _git(["rev-parse", "HEAD"], path)
    except FetchError:
        return None


def fetch_git(spec: SourceSpec, dest: Path) -> Path:
    """Shallow-fetch exactly ``spec.revision`` (a commit SHA) into ``dest``."""
    if _git_head(dest) == spec.revision:
        return dest
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    _git(["init", "-q"], dest)
    _git(["remote", "add", "origin", spec.location], dest)
    _git(["fetch", "-q", "--depth", "1", "origin", spec.revision], dest)
    _git(["checkout", "-q", "FETCH_HEAD"], dest)
    if _git_head(dest) != spec.revision:
        raise FetchError(f"{spec.id}: checked out commit does not match {spec.revision}")
    return dest


UNPINNED = "unpinned"
"""Revision placeholder: download once, then fail with the value to pin."""


def fetch_hf(spec: SourceSpec, dest: Path) -> Path:
    """Download a Hugging Face dataset snapshot at commit ``spec.revision``.

    With ``revision: unpinned`` the current ``main`` is downloaded and the
    build stops, printing the commit to pin in ``sources.yaml``.
    """
    marker = dest / ".aidetect-revision"
    if marker.is_file() and marker.read_text().strip() == spec.revision:
        return dest
    revision = spec.revision
    if revision == UNPINNED:
        revision = str(HfApi().dataset_info(spec.location).sha)
    snapshot_download(
        repo_id=spec.location,
        repo_type="dataset",
        revision=revision,
        local_dir=dest,
        allow_patterns=spec.loader_options.get("allow_patterns"),
    )
    marker.write_text(str(revision))
    if spec.revision == UNPINNED:
        raise FetchError(f"{spec.id}: downloaded; pin it with  revision: {revision}")
    return dest


def sha256_file(path: Path) -> str:
    """Hex SHA-256 digest of a file, streamed."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_url(spec: SourceSpec, dest: Path) -> Path:
    """Download a single file and check it against ``spec.revision`` (its SHA-256).

    With ``revision: unpinned`` the file is downloaded and the build stops,
    printing the digest to pin.
    """
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / spec.location.rstrip("/").split("/")[-1]
    if target.is_file() and spec.revision != UNPINNED and sha256_file(target) == spec.revision:
        return dest
    partial = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(spec.location, timeout=60) as response, partial.open("wb") as out:
        shutil.copyfileobj(response, out, length=1 << 20)
    digest = sha256_file(partial)
    if spec.revision == UNPINNED:
        partial.replace(target)
        raise FetchError(f"{spec.id}: downloaded; pin it with  revision: {digest}")
    if digest != spec.revision:
        partial.unlink()
        raise FetchError(f"{spec.id}: downloaded file does not match the pinned SHA-256")
    partial.replace(target)
    return dest


def fetch_source(spec: SourceSpec, raw_dir: Path, *, offline: bool = False) -> Path:
    """Make ``spec`` available locally and return its root directory.

    Args:
        spec: Source declaration.
        raw_dir: Cache directory for raw downloads.
        offline: If true, never download; fail unless a matching copy is cached.
    """
    dest = raw_dir / spec.cache_key
    if offline:
        if spec.kind == "git" and _git_head(dest) == spec.revision:
            return dest
        if spec.kind != "git" and dest.exists():
            return dest
        raise FetchError(f"{spec.id}: not in the cache at {dest} and offline mode is on")
    if spec.kind == "git":
        return fetch_git(spec, dest)
    if spec.kind == "hf":
        return fetch_hf(spec, dest)
    return fetch_url(spec, dest)
