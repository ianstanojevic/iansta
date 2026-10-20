"""Build configuration, loaded from YAML (see ``training/configs/data_*.yaml``)."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field


class DedupConfig(BaseModel):
    """Near-duplicate detection settings."""

    model_config = ConfigDict(extra="forbid")

    threshold: float = 0.8
    num_perm: int = 128
    shingle: int = 5


class DataBuildConfig(BaseModel):
    """Everything that determines a dataset build.

    Relative paths resolve against the project root (the directory holding
    ``pyproject.toml``).
    """

    model_config = ConfigDict(extra="forbid")

    name: str
    sources: list[str]
    sources_file: Path = Path("training/configs/sources.yaml")
    raw_dir: Path = Path("data/raw")
    out_dir: Path = Path("data/processed")
    datacard_path: Path | None = None
    seed: int = 1234
    min_words: int = 30
    max_words: int = 5000
    languages: list[str] = Field(default_factory=lambda: ["en"])
    max_docs_per_source: int | None = Field(
        default=None, description="subsample each source (whole groups) for quick builds"
    )
    max_per_cell: int | None = Field(
        default=None,
        description="cap training documents per (source, label, generator family, domain)",
    )
    split_fractions: dict[str, float] = Field(
        default_factory=lambda: {"train_clf": 0.60, "train_meta": 0.15, "calib": 0.10, "test": 0.15}
    )
    dedup: DedupConfig = Field(default_factory=DedupConfig)
    offline: bool = False

    def resolve(self, root: Path) -> DataBuildConfig:
        """Return a copy with every relative path made absolute under ``root``."""

        def fix(path: Path) -> Path:
            return path if path.is_absolute() else (root / path)

        return self.model_copy(
            update={
                "sources_file": fix(self.sources_file),
                "raw_dir": fix(self.raw_dir),
                "out_dir": fix(self.out_dir),
                "datacard_path": fix(self.datacard_path) if self.datacard_path else None,
            }
        )


def project_root(start: Path) -> Path:
    """Nearest ancestor of ``start`` containing ``pyproject.toml``."""
    for candidate in [start, *start.parents]:
        if (candidate / "pyproject.toml").is_file():
            return candidate
    raise FileNotFoundError(f"no pyproject.toml above {start}")


def load_config(path: Path) -> DataBuildConfig:
    """Read a build config and resolve its paths against the project root."""
    config = DataBuildConfig.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
    return config.resolve(project_root(path.resolve().parent))
