"""End-to-end dataset build.

fetch → audit licence → load → clean → deduplicate → balance → split →
check for leakage → write splits, manifest and reports.
"""

from __future__ import annotations

import hashlib
import json
import logging
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from aidetect_train.data.clean import CleanStats, clean_frame
from aidetect_train.data.config import DataBuildConfig
from aidetect_train.data.dedup import DedupReport, deduplicate
from aidetect_train.data.fetch import fetch_source, sha256_file
from aidetect_train.data.leakage import LeakageReport, check_leakage
from aidetect_train.data.licence import AuditResult, audit_source
from aidetect_train.data.loaders import get_loader
from aidetect_train.data.schema import SPLITS, docs_to_frame, validate_frame
from aidetect_train.data.sources import SourceSpec, load_sources
from aidetect_train.data.split import assign_splits

log = logging.getLogger(__name__)


class BuildError(RuntimeError):
    """The build was stopped by a failed licence audit or leakage check."""


@dataclass
class SourceResult:
    """Per-source bookkeeping for the manifest."""

    spec: SourceSpec
    audit: AuditResult
    loaded: int = 0
    after_subsample: int = 0
    clean: CleanStats = field(default_factory=CleanStats)


def _stable_rank(salt: str, seed: int, keys: pd.Series) -> pd.Series:
    """Deterministic pseudo-random sort key.

    Each use gets its own ``salt`` so subsampling, capping and splitting are
    statistically independent.
    """
    return keys.map(
        lambda k: hashlib.blake2b(f"{salt}:{seed}:{k}".encode(), digest_size=8).hexdigest()
    )


def subsample_groups(frame: pd.DataFrame, max_docs: int, seed: int) -> pd.DataFrame:
    """Keep whole groups, in a seed-determined order, until ``max_docs`` is reached."""
    if len(frame) <= max_docs:
        return frame
    order = (
        frame.assign(_rank=_stable_rank("subsample", seed, frame["group_id"]))
        .groupby(["_rank", "group_id"], sort=True)
        .size()
        .reset_index(name="n")
    )
    keep_groups = order.loc[order["n"].cumsum() <= max_docs, "group_id"]
    return frame[frame["group_id"].isin(set(keep_groups))]


def cap_cells(frame: pd.DataFrame, cap: int, seed: int) -> pd.DataFrame:
    """Cap training documents per (source, label, generator family, domain) cell."""
    cells = ["source", "label", "generator_family", "domain"]
    training = frame[frame["use"] == "train"]
    keys = training["source"] + "|" + training["doc_id"]
    ranked = training.assign(_rank=_stable_rank("cap", seed, keys))
    kept = ranked.sort_values("_rank").groupby(cells, sort=False).head(cap).drop(columns="_rank")
    return pd.concat([kept, frame[frame["use"] != "train"]]).sort_index()


def load_source(spec: SourceSpec, config: DataBuildConfig) -> tuple[pd.DataFrame, SourceResult]:
    """Fetch, audit and load one source into the common schema."""
    root = fetch_source(spec, config.raw_dir, offline=config.offline)
    audit = audit_source(spec, root)
    result = SourceResult(spec=spec, audit=audit)
    if not audit.ok:
        raise BuildError(f"licence audit failed for {spec.id}: {audit.message}")
    docs = get_loader(spec.loader)(root, spec.loader_options)
    frame = docs_to_frame(
        docs, source=spec.id, licence=spec.licence, use=spec.use, ood_set=spec.ood_set
    )
    frame["doc_id"] = frame["doc_id"].astype(str)
    frame["holdout_fraction"] = spec.holdout_fraction
    result.loaded = len(frame)
    if config.max_docs_per_source:
        frame = subsample_groups(frame, config.max_docs_per_source, config.seed)
    result.after_subsample = len(frame)
    frame = clean_frame(
        frame,
        min_words=config.min_words,
        max_words=config.max_words,
        languages=tuple(config.languages),
        stats=result.clean,
    )
    return frame, result


def _git_commit(root: Path) -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


@dataclass
class BuildResult:
    """What a build produced."""

    out_dir: Path
    frame: pd.DataFrame
    sources: list[SourceResult]
    dedup: DedupReport
    leakage: LeakageReport
    manifest: dict[str, object]


def build(config: DataBuildConfig) -> BuildResult:
    """Run the whole pipeline for ``config`` and write its outputs.

    Raises:
        BuildError: On a failed licence audit or leakage check. Nothing is
            written in that case except the build report explaining why.
    """
    registry = load_sources(config.sources_file)
    unknown = [s for s in config.sources if s not in registry]
    if unknown:
        raise BuildError(f"sources not in {config.sources_file.name}: {unknown}")

    frames, results = [], []
    for source_id in config.sources:
        log.info("loading %s", source_id)
        frame, result = load_source(registry[source_id], config)
        frames.append(frame)
        results.append(result)
    combined = pd.concat(frames, ignore_index=True)
    validate_frame(combined)
    combined["holdout_fraction"] = combined["holdout_fraction"].astype(float)

    log.info("deduplicating %d documents", len(combined))
    deduped, dedup_report = deduplicate(
        combined,
        threshold=config.dedup.threshold,
        num_perm=config.dedup.num_perm,
        shingle=config.dedup.shingle,
    )
    if config.max_per_cell:
        deduped = cap_cells(deduped, config.max_per_cell, config.seed)
    deduped = deduped.assign(split=assign_splits(deduped, config.split_fractions, config.seed))
    # "mixed" documents are evaluation material by definition.
    deduped = deduped[(deduped["label"] != "mixed") | (deduped["split"] == "ood")]
    deduped = deduped.reset_index(drop=True)

    log.info("checking for leakage")
    leakage = check_leakage(
        deduped,
        threshold=config.dedup.threshold,
        num_perm=config.dedup.num_perm,
        shingle=config.dedup.shingle,
    )
    out_dir = config.out_dir / config.name
    out_dir.mkdir(parents=True, exist_ok=True)
    if not leakage.ok:
        (out_dir / "LEAKAGE_FAILURE.txt").write_text(leakage.summary() + "\n")
        raise BuildError(leakage.summary())

    split_info: dict[str, object] = {}
    for split in SPLITS:
        part = deduped[deduped["split"] == split].drop(columns=["split", "holdout_fraction"])
        path = out_dir / f"{split}.parquet"
        part.to_parquet(path, index=False)
        split_info[split] = {
            "file": path.name,
            "sha256": sha256_file(path),
            "rows": len(part),
            "by_label": part["label"].value_counts().to_dict(),
        }
    manifest: dict[str, object] = {
        "name": config.name,
        "created_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "code_commit": _git_commit(config.sources_file.parent),
        "config": json.loads(config.model_dump_json()),
        "sources": {
            r.spec.id: {
                "location": r.spec.location,
                "revision": r.spec.revision,
                "licence": r.spec.licence,
                "noncommercial": r.spec.noncommercial,
                "use": r.spec.use,
                "audit": r.audit.message,
                "loaded": r.loaded,
                "after_subsample": r.after_subsample,
                "dropped_in_cleaning": r.clean.dropped,
            }
            for r in results
        },
        "dedup": asdict(dedup_report),
        "leakage": leakage.summary(),
        "splits": split_info,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str) + "\n")
    return BuildResult(out_dir, deduped, results, dedup_report, leakage, manifest)
