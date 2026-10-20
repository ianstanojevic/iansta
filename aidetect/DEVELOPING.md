# Developing aidetect

Everything runs on a CPU. Design and rationale: [docs/PLAN.md](docs/PLAN.md)
and [docs/RESEARCH.md](docs/RESEARCH.md).

## Layout

```
src/aidetect/          shipped with the app (no training dependencies)
  core/text.py         normalisation and segmentation, shared with training
  stylometry.py        ~30 writing-style features
  reliability.py       warnings (short, quotes, code, lists, language, ...)
  calibration.py       inductive Venn-Abers (probability with a range)
  detector.py          scoring, verdict bands, heatmap, explanations
  ingest.py            .txt / .docx / .pdf reading
  cli.py, app/         command line and PySide6 desktop app
  models/              the trained bundle (aidetect-model.joblib, ~2.5 MB)
src/aidetect_train/    dataset pipeline, training, evaluation
training/configs/      source registry and build configs
packaging/             icon, PyInstaller entry point, Inno Setup script
reports/               generated evaluation report and charts
```

## Set up

```bash
cd aidetect
uv venv -p 3.12 .venv && . .venv/bin/activate
uv pip install -e ".[app,train,dev]"
pytest -q            # ~95 tests; the app test needs libEGL on Linux
ruff check . && ruff format --check . && mypy
```

## Data → model → report

```bash
aidetect-data build training/configs/data_laptop.yaml      # quick smoke build
aidetect-data build training/configs/data_available.yaml   # full build, ~15 min
python -m aidetect_train.model data/processed/available    # ~3 min, writes src/aidetect/models/
python -m aidetect_train.evaluate data/processed/available # ~5 min, writes reports/
```

The build fetches each source at a pinned commit, audits its licence, cleans,
deduplicates across sources, splits by group, and fails on any train/test
leakage. Sources without a licence are evaluation-only. If `huggingface.co`
is reachable, add `raid`, `hc3` and `mage` (see `data_full.yaml`); their
`revision: unpinned` makes the first fetch print the commit to pin.

Model: word + character n-gram TF-IDF logistic regression (trained on
`train_clf`), combined with style features by a second logistic regression
(`train_meta`), calibrated with Venn-Abers and thresholded for at most 1%
false positives on `calib` human text. Each run's data manifest
(`data/processed/<build>/manifest.json`) and the model bundle's metadata record
what it was trained on.

## Run the app and CLI from source

```bash
aidetect-app
aidetect path/to/file.docx --heatmap
```

## Releases and installers

`.github/workflows/aidetect-release.yml` builds the Windows installer
(PyInstaller + Inno Setup) and macOS disk images (Apple Silicon and Intel),
starts each frozen app with `--self-test`, and publishes them when a tag is
pushed:

```bash
# bump version in pyproject.toml first
git tag aidetect-v0.1.0 && git push origin aidetect-v0.1.0
```

It can also be run by hand from the Actions tab (artefacts only, no release).
Installers are unsigned; README explains the one-time "Open Anyway" steps. To
sign later, add an Apple Developer ID / Windows certificate as repository
secrets and a signing step after "Freeze the app".

## Updating the model

Retrain, re-evaluate, commit `src/aidetect/models/aidetect-model.joblib` and
`reports/`, bump the version, tag. The app's About page reads its accuracy
numbers from the bundle, so they always match the shipped model.
