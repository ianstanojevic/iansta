# aidetect: plan and architecture

Status: **draft for approval**. Nothing past this document has been built yet.
The research behind every choice here is in [`RESEARCH.md`](RESEARCH.md).

## 0. What we are building, and what we are honestly promising

A desktop app (Windows and macOS) plus a CLI that estimates how likely a text
is to be AI-generated. It runs fully offline on a laptop CPU, and it is built
to fail safe: when it is unsure, or when the text is the kind detectors get
wrong, it says so, and it never presents a verdict as certain.

Realistic expectations, stated up front so they shape the design:

- **In-distribution** (text like the training data) a good ensemble should
  reach AUROC above 0.98.
- **Out-of-distribution** (new domains, the newest models, edited AI text,
  polished human text) every published detector, including commercial ones,
  degrades substantially. The app's accuracy page will report the **OOD
  numbers**, not the flattering ones.
- The operating point is chosen for **a low false-positive rate on human
  text** (target ≤ 1 % overall, measured separately for non-native writers).
  That makes it miss a meaningful share of AI text, especially edited AI text,
  and the app says so.

## 1. System overview

```
                    ┌──────────────────────── offline app (CPU) ────────────────────────┐
 .txt/.docx/.pdf ─▶ │ ingest ─▶ normalise ─▶ reliability checks ─▶ segment (sentences,  │
 or pasted text     │                        (length, quotes,      paragraphs, 512-tok   │
                    │                         code, lists, lang)   windows)              │
                    │                                                    │               │
                    │        ┌───────────────────────────┬───────────────┴──────┐        │
                    │        ▼                           ▼                      ▼        │
                    │  LM pair (observer+performer)  stylometry          classifier      │
                    │  ONNX int8, 2 forward passes   (pure Python)       (DeBERTa/       │
                    │  → per-token logp, rank,       → ~40 features      ModernBERT,     │
                    │    entropy, cross-entropy                          ONNX int8)      │
                    │  → Binoculars, Fast-DetectGPT,                     → logit/window  │
                    │    PPL, LRR, DivEye/burstiness                                     │
                    │        └──────────────┬────────────┴──────────────────────┘        │
                    │                       ▼                                            │
                    │      meta-classifier (logistic regression or small GBM)            │
                    │                       ▼                                            │
                    │      Venn–Abers calibration (per length band) → p, [lo, hi]        │
                    │                       ▼                                            │
                    │      verdict band + heatmap + plain-language explanation           │
                    └────────────────────────────────────────────────────────────────────┘
```

The key efficiency trick: **one pass of each of the two small LMs yields every
zero-shot signal**: perplexity, log-rank, entropy, Binoculars
(observer/performer cross-perplexity), Fast-DetectGPT's analytic curvature
(performer as sampling model, observer as scoring model, plus the single-model
variant), DivEye's surprisal-diversity statistics, and per-sentence
burstiness. The per-token arrays are also what drive the heatmap, so the
heatmap costs no extra LM passes.

## 2. Repository layout

The project is self-contained in `aidetect/`, so it does not touch the existing
phase-diagram site. It can move to its own repository unchanged (see the open
questions).

```
aidetect/
  pyproject.toml            # uv-managed; extras: [app], [train], [dev]
  src/aidetect/
    core/                   # types, config (pydantic), text normalisation, segmentation
    ingest/                 # txt / docx (python-docx) / pdf (pypdf) readers
    reliability/            # length, quoting, code, list, language checks → warnings
    zeroshot/               # ONNX LM runner, token statistics, Binoculars, Fast-DetectGPT, DivEye
    stylometry/             # sentence/vocab/punctuation/function-word/repetition/transition features
    classifier/             # ONNX classifier runner, windowing
    ensemble/               # meta-classifier (numpy-only at runtime), Venn–Abers, thresholds
    explain/                # feature attributions → plain-language sentences
    report/                 # result object → JSON / text / HTML (shared by CLI and GUI)
    models/                 # model manifest, download + SHA-256 verification, cache dir
    cli.py                  # `aidetect file.docx`
    app/                    # PySide6 GUI
  src/aidetect_train/       # training-side package, never shipped in the app
    data/                   # registry, fetch, licence audit, loaders, clean, dedup, split,
                            #   leakage checks, manifests, reports; CLI `aidetect-data`
    generate/               # synthetic mirrors + edits (vLLM on GPU)
    features/               # batch zero-shot + stylometry extraction (GPU or CPU)
    classifier/             # fine-tune, hard-negative mining, distil/export/quantise to ONNX
    ensemble/               # meta-classifier + calibration + threshold selection
    evaluate/               # all metrics, slices, OOD, charts → reports/
  training/
    configs/                # sources.yaml (registry) and build/training configs:
                            #   *_laptop.yaml (tiny, CPU) and *_full.yaml (GPU)
  tests/                    # unit + integration (tiny random-weight ONNX fixtures)
  packaging/                # PyInstaller spec, Inno Setup script, dmg script, icons, entitlements
  reports/                  # generated evaluation report (markdown + PNG charts)
  docs/                     # PLAN.md, RESEARCH.md, DATA_SOURCES.md, MODEL_CARD.md
  README.md                 # for users
  DEVELOPING.md             # for training and building
```

Runtime dependencies are kept deliberately small and contain **no PyTorch**:
`onnxruntime`, `tokenizers`, `numpy`, `python-docx`, `pypdf`, `py3langid`,
`PySide6`, `platformdirs`. The meta-classifier and calibrator are stored as
JSON and evaluated in NumPy, so scikit-learn is training-only.

## 3. Milestone 1: data pipeline

**Sources** are listed in RESEARCH.md §5. Every source is declared in
`training/data/sources.yaml` with its URL, revision (pinned commit or dataset
revision), expected licence, and allowed uses (`train` / `eval_only` /
`excluded`).

**Pipeline stages**, each producing Parquet plus a manifest (row counts and
SHA-256 hashes):

1. **Download** at a pinned revision. A **licence audit** step reads the
   licence from each dataset card or repo and *fails the build* if it is
   missing or differs from `sources.yaml`. This is how the "unverified" rows in
   RESEARCH.md get resolved: by checking, not by trusting.
2. **Normalise** to one schema: `text, label (human|ai), source_dataset,
   domain, generator, generator_family, decoding, attack/edit_type,
   is_edited, writer_l1 (native|non_native|unknown), prompt_group_id,
   n_words, language, licence`.
3. **Clean**: Unicode NFC, strip markup artefacts, drop under 30 words or empty,
   and drop known artefacts that give away the label ("As an AI language model",
   dataset-specific prefixes). These are shortcuts that inflate scores and
   generalise to nothing.
4. **Deduplicate**: exact (normalised-text hash), then near-duplicate (MinHash
   LSH, 5-gram shingles, Jaccard ≥ 0.8) **across all sources at once**, so the
   same Reddit post in RAID and HC3 cannot land in both train and test.
5. **Split by group, not by row**: a human document and its AI counterparts
   share a `prompt_group_id` and always go to the same split. Splits:
   `train_clf` 60 % · `train_meta` 15 % · `calib` 10 % · `test` 15 %, stratified
   by label × domain × generator family. Whole datasets reserved for OOD
   (Beemo, APT-Eval, and one of DetectRL/MIRAGE, plus the 2026 freshness sets)
   **never** enter any training split.
6. **Leakage check** (a test that fails the pipeline): zero exact or near
   duplicates across splits and between any split and the OOD sets; no
   `prompt_group_id` in more than one split; no generator family whose only
   examples sit in test (unless it is a deliberate leave-one-out experiment).
7. **Balance**: cap per (source, generator) so no single dataset dominates;
   target roughly 50/50 human/AI by domain.
8. **Data card**: `docs/DATA_SOURCES.md` is generated from the manifests:
   every source, licence, row counts per split, and attribution text.

**Gap-filling generation** (GPU, *asks you first*):

- **Synthetic mirrors.** For a sample of pre-2022 human documents, generate a
  counterpart with matched topic, genre and length using about 12 current
  open-weight instruct models (for example the Qwen3, Llama, Gemma, Mistral,
  Phi, OLMo, gpt-oss and DeepSeek-distill families), with varied prompts,
  personas, temperatures and top-p values, served by vLLM.
- **Edited AI.** Programmatic sentence deletion, reordering and synonym swaps,
  LLM paraphrase passes, "make it sound human" prompts, and partial human→AI
  splices (also used as heatmap training and evaluation data).
- **Optional API models** (GPT, Claude, Gemini) for frontier coverage. These
  cost money per token and need your API keys (see the open questions).

**Labelling policy for grey areas** (this matters for honesty):

- AI text that a human has edited is still **AI** for training, and reported as
  its own slice.
- Human text that an AI has *lightly polished* (APT-Eval) is **not** forced into
  either label. It is evaluation-only and reported separately as "AI-assisted",
  with the app explaining that such text often scores in the middle.

**Exit criteria**: the laptop config builds a tiny (~5K-document) dataset end
to end on CPU; the full config's download, clean, dedup, split and audit runs
on CPU (no GPU needed); leakage tests pass; DATA_SOURCES.md is generated.

## 4. Milestone 2: features and zero-shot detectors

- **LM runner**: Hugging Face model → ONNX export (with Optimum) → int8 dynamic
  quantisation; it returns per-token log-probabilities, ranks, entropy and,
  for the pair, cross-entropy. The full-vocabulary softmax is computed in
  float32, with chunking to bound memory.
- **Scores**: perplexity, mean log-rank, LRR, entropy mean/std, Binoculars,
  Fast-DetectGPT (pair and single-model), and DivEye's nine surprisal-diversity
  statistics. Burstiness is the standard deviation and coefficient of
  variation of per-sentence perplexity, plus sentence-length CV.
- **Stylometry** (about 40 features): sentence-length mean/std/skew; word-length
  distribution; type-token ratio, MATTR and Yule's K (length-robust vocabulary
  richness); hapax ratio; punctuation rates (comma, semicolon, colon, em dash,
  parentheses, "!", "?"); frequencies of about 100 function words; repeated
  n-gram rate; density of transition phrases ("moreover", "furthermore", "in
  conclusion", "it is important to note", …, from a curated list); paragraph
  length CV; contraction rate; first/second-person pronoun rate.
- **Model-pair selection experiment**: candidates are Qwen2.5-0.5B (+Instruct),
  Qwen3-0.6B (+instruct), SmolLM2-360M (+Instruct), Llama-3.2-1B (+Instruct)
  and Falcon3-1B (+Instruct), all with licences permitting redistribution
  (checked by the audit). They are compared on TPR at 1 % FPR on `train_meta`,
  per slice, against size and measured CPU latency. The best is picked
  under a budget of **≤ 1.2 GB download and ≤ 10 s per 500 words on a 4-core
  laptop CPU**.
- **Parity tests**: the ONNX int8 runtime features must match PyTorch fp32
  features to tolerance (Spearman ρ ≥ 0.99 per feature on 200 documents).

**Exit criteria**: features computed for the laptop dataset on CPU here; a
standalone zero-shot baseline report (AUROC, TPR at 1 % FPR per method);
latency measured on CPU.

## 5. Milestone 3: classifier training

- **Backbones compared**: DeBERTa-v3-base, ModernBERT-base and RoBERTa-base on
  the full set (GPU); DeBERTa-v3-small/xsmall as on-device candidates.
- **Recipe**: binary cross-entropy, 512-token windows with random crops for
  long documents, mixed precision, early stopping on `train_meta` TPR at 1 %
  FPR (not accuracy), label smoothing 0.05, and domain-balanced sampling. Two
  to three seeds for the final model, so variance is reported.
- **Hard-negative mining loop** (Pangram style): score a large pre-2022 human
  pool (Wikipedia, Gutenberg, arXiv, reviews, Reddit, ELLIPSE/PERSUADE), add the
  top false positives to training, retrain, and repeat 2–3 rounds. Mined
  documents are de-duplicated against every evaluation set first.
- **On-device model**: distil the best base model into a small student
  (logit-matching on the training set plus unlabelled pre-2022 text), export
  to ONNX, int8-quantise, and verify AUROC within 0.005 of the fp32 student.
- **Experiment tracking**: MLflow with a local file store (Apache-2, no
  account). Each run logs the resolved config, git SHA, data manifest hash,
  metrics, and model artefacts with SHA-256. `training/configs/*.yaml` plus
  the manifest hash reproduce any run. Seeds are fixed, and determinism flags
  are set where PyTorch allows.
- **GPU setup**: `DEVELOPING.md` gives copy-paste setup for a single A100/H100
  VM (CUDA image, `uv sync --extra train`, vLLM, resumable checkpoints written
  to a bucket), plus the `laptop.yaml` path (tiny model, about 2K documents, a
  few minutes on CPU) that exercises the identical code.

**Exit criteria**: the laptop config trains end to end on CPU here; the GPU
config is dry-run validated (one step on CPU with the same code path).

## 6. Milestone 4: ensemble and calibration

- **Stacking without leakage**: the classifier is trained on `train_clf` only.
  The meta-classifier is trained on `train_meta` using classifier outputs it
  never saw in training.
- **Meta-classifier**: L2 logistic regression on standardised features, with
  length-band interactions, compared against a small LightGBM. The default is
  logistic regression unless LightGBM wins clearly OOD, because its
  contributions are directly explainable and it extrapolates less wildly.
- **Calibration**: inductive Venn–Abers on `calib`, which outputs a probability
  and a range `[lo, hi]`, fitted per length band (150–300, 300–600, 600+
  words). Isotonic and Platt scaling are reported for comparison, with
  reliability diagrams and ECE.
- **Threshold**: chosen on `calib` human text so FPR is ≤ 1 % overall. It is
  then checked on the non-native slice; if that slice's FPR exceeds 2 %, the
  threshold is raised until it doesn't, and the cost in recall is reported.
- **Never claiming certainty**: displayed probabilities are clamped to
  3 %–97 %, always shown with the range, and mapped to four bands:
  *Likely human-written* · *Inconclusive* · *Some AI-like signals* ·
  *Likely AI-generated*. "Likely AI-generated" requires the *lower* end of the
  range to clear the threshold. Warnings (§8) can cap the band at
  *Inconclusive*.
- **Heatmap**: per-sentence scores from the token arrays (zero-shot), blended
  with per-window classifier scores and smoothed over neighbours. It is
  presented as *relative* ("these parts look more AI-like than the rest") with
  a note that sentence-level evidence is much weaker than whole-document
  evidence. It is evaluated on the spliced human→AI documents (boundary
  accuracy, sentence AUROC).
- **Explanations**: the top logistic-regression contributions, mapped to
  pre-written plain-language sentences. For example: "The wording is very
  predictable to a language model (common in AI text, but also in formal or
  non-native writing)", or "Sentence lengths vary a lot, which is more typical
  of human writing". Each signal's sentence always carries its caveat.

## 7. Milestone 5: evaluation report

`training/evaluate.py` generates `reports/EVALUATION.md` with charts.

- **Metrics**: ROC-AUC, accuracy, precision, recall, F1, **FPR on human text at
  the chosen threshold** (headline), TPR at 1 % and 0.1 % FPR, ECE / Brier,
  and 95 % bootstrap confidence intervals on everything.
- **Slices**: length band; domain; source model and model family; edited vs
  unedited AI (and edit type); native vs non-native human; each RAID attack;
  "AI-assisted" polished human (APT-Eval) reported on its own.
- **Out-of-distribution**: held-out whole datasets (Beemo, APT-Eval,
  DetectRL or MIRAGE, the 2026 freshness sets), leave-one-domain-out and
  leave-one-generator-family-out runs, and the TOEFL essays from Liang et al.
- **Baselines** for context: each zero-shot method alone, the classifier
  alone, the ensemble.
- **Charts**: ROC and DET curves, reliability diagrams, FPR-by-slice bars,
  score distributions, and length curves.
- The app's **About / accuracy** page is generated from the same JSON, so the
  numbers cannot drift from the report.

## 8. Milestone 6: app

**Framework: PySide6 (Qt 6).** Compared with Tauri or Electron plus a Python
backend:

| | PySide6 | Tauri + Python sidecar | Electron + Python sidecar |
|---|---|---|---|
| Languages / toolchains | Python only | Rust + JS + Python | JS + Python |
| Processes / IPC | One process | Two processes, local IPC, sidecar lifecycle | Two processes, plus Chromium |
| Packaging | One PyInstaller step | PyInstaller sidecar *and* a Tauri bundle per OS | PyInstaller sidecar *and* electron-builder |
| Extra size | About 60–90 MB of Qt | About 10 MB of shell (but still a PyInstaller Python) | About 150 MB of Chromium |
| UI polish | Good with a custom QSS theme; heatmap via rich-text view | Excellent (web UI) | Excellent |
| Failure surface for non-technical users | Lowest | Sidecar start-up, port and AV issues | Same as Tauri, plus size |

The models dominate the download (about 1 GB) whichever framework is used, so
Tauri's small shell saves little, while its sidecar architecture adds a
second toolchain and new ways to fail. PySide6 is LGPL-3; it is used as
dynamically linked libraries, with its licence and notice included, which is
the standard compliant arrangement.

**Screens**:

- **Main**: a paste box with a drop zone (txt, docx, pdf) and an *Analyse*
  button. The result panel shows a gauge with the probability and range, the
  band label, warnings at the top in amber, a heatmap view of the text, and an
  explanation list.
- **About / accuracy**: version, the key evaluation numbers including FPR and
  OOD results, data sources, and the LIMITATIONS text.
- **First launch**: model download with a progress bar, resume, SHA-256
  verification, and a clear offline-install option (a "models zip" the user
  can place manually).
- **Settings**: check for updates (on by default, can be turned off), and the
  model folder location.

**Privacy**: analysed text never leaves the process; there is no telemetry.
The only network calls are (a) the model download and (b) the update check,
which is a GET of the GitHub Releases "latest" JSON that sends no user data.
An automated test runs an analysis with sockets monkey-patched to fail, to
prove the analysis path never touches the network.

**Reliability warnings** are deterministic and unit-tested:

- Under 150 words: "too short to judge reliably"; the band is capped at
  *Inconclusive*.
- More than 30 % of the text in quotation marks or block quotes.
- Code detected (symbol density, keywords, indentation).
- Mostly lists or bullets.
- Non-English (py3langid confidence), or mixed languages.
- Formulaic genres: always shows the general note that templates, legal and
  technical boilerplate can look AI-like.

**CLI**: `aidetect file.docx [--json] [--heatmap] [--no-color]`, sharing the
same `report/` code. It prints the band, the probability and range, warnings,
and the top explanations. Exit codes are documented.

## 9. Milestone 7: packaging, CI, docs

- **Version**: a single source in `pyproject.toml`, exposed at runtime, with
  tags `aidetect-vX.Y.Z`.
- **Windows**: PyInstaller one-folder build → **Inno Setup** `.exe` installer
  (Start-menu entry, uninstaller, per-user install with no admin needed). An
  `.msi` via WiX can be added if you specifically need MSI; the `.exe` is
  friendlier for friends.
- **macOS**: PyInstaller `.app` → `.dmg` (drag-to-Applications layout).
  Separate arm64 and x86-64 builds (smaller and more reliable than a universal2
  build with ONNX Runtime). Hardened runtime, entitlements file, and signing
  plus notarisation steps that run only when signing secrets exist.
- **Models**: downloaded on first launch from GitHub Releases assets (each file
  under the 2 GB limit) or a Hugging Face model repo, recorded in a manifest
  with SHA-256 hashes. The app also ships a "models zip" route for offline
  installs.
- **Icon**: a simple vector magnifier-over-text mark, exported to `.ico` and
  `.icns`.
- **CI** (`.github/workflows/aidetect-ci.yml`, path-filtered to `aidetect/**`
  so the existing site's CI is unaffected):
  - `lint`: `ruff check`, `ruff format --check`, `mypy --strict` on `src/`.
  - `test`: pytest on Ubuntu, Windows and macOS, using tiny random-weight ONNX
    fixture models so CI downloads nothing large; coverage report.
  - `build` (on tags and manual dispatch): windows-latest → Inno Setup `.exe`;
    macos-15 → arm64 `.dmg`; macos-15-intel → x86-64 `.dmg`. Each built app is
    smoke-tested (launch with `--self-test`, which runs the bundled fixture
    pipeline headless) and uploaded as an artefact or release asset.
- **Docs**: README (install for each OS, including the Gatekeeper and
  SmartScreen steps if the build is unsigned; usage with screenshots;
  LIMITATIONS), DEVELOPING.md (data, training, cloud GPU, building, releasing),
  MODEL_CARD.md and DATA_SOURCES.md.
- **LIMITATIONS** (in the README and the app, verbatim): detection is
  probabilistic; it should never be the sole basis for accusing anyone; there
  are known higher error rates for non-native writers, short texts, polished
  or edited text, and newer models than the training data; and a "likely
  human" result does not prove human authorship.

## 10. Testing strategy

- **Unit**: segmentation, every stylometric feature (hand-computed fixtures),
  Binoculars and Fast-DetectGPT math against reference implementations on toy
  logits, Venn–Abers against the `venn-abers` package, threshold selection,
  clamping and banding (property tests that 0 % and 100 % are never displayed),
  warnings, and ingestion of tricky docx/pdf fixtures.
- **Integration**: the full pipeline on fixture models; CLI golden output; the
  GUI driven headless with `pytest-qt` (offscreen platform), including
  screenshots for the README; the no-network test; and the model download
  against a local HTTP server (resume, wrong hash, interruption).
- **Data**: leakage tests, schema tests, and the licence audit.
- **Regression**: a pinned 300-document "golden" evaluation set whose metrics
  must not drop by more than tolerance between model versions.

## 11. Compute and budget (revised 2026-10-20)

There is **no GPU**. The budget is about **$50 of Claude cloud-session
credit**, which pays for the assistant's work; the session container is
CPU-only (4 cores, 15 GB RAM). Milestone 1 used about $13. The design is
re-scoped to what a CPU can train:

- **Classifier**: a linear model on word and character n-gram TF-IDF features
  replaces the fine-tuned DeBERTa. It trains in minutes, is a few MB, and is
  fast in the app. It generalises worse to unseen domains than a fine-tuned
  transformer, which the evaluation will show.
- **Zero-shot signals**: one tiny base/instruct pair (SmolLM2-135M, Apache-2.0)
  on CPU, documents truncated to 256 tokens, on a subsample of about 15K
  training documents. This needs `huggingface.co` network access; without it
  the app ships stylometry + n-gram classifier only.
- **Dropped**: synthetic text from current open models (needs a GPU). Coverage
  of the newest models comes only from public datasets, and the app says so.
- **Unchanged**: stylometry, meta-classifier, Venn-Abers calibration and
  thresholds, the evaluation report, the app, the CLI and packaging. Installers
  build on GitHub Actions, which costs no credit.

Rough allocation: M2+M3 (features and classifiers) $12, M4 (ensemble and
calibration) $5, M5 (evaluation report) $5, M6 (app and CLI) $12, M7
(packaging, CI, docs) $10, which is about $44 with roughly $6 margin.

Cost discipline: start each milestone in a **fresh session** (a long session
resends its whole history with every step, which is what makes it expensive),
iterate on the laptop-scale build, and avoid repeated full rebuilds.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Small LM pairs are much weaker than the papers' 7B models | Choose the pair empirically; the classifier and stylometry carry more weight; report honestly. |
| The classifier is over-confident on unseen domains (arXiv 2607.03680) | Venn–Abers ranges widen on unfamiliar inputs; logistic-regression stacking caps any one signal; OOD evaluation is the headline. |
| False positives on non-native writers | Hard negatives from ELLIPSE/PERSUADE; per-slice FPR constraint on the threshold; in-app caveat. |
| The newest models are not in the training data | Fresh mirror generation; a dated "trained on models up to …" line in the app; easy model updates through the release manifest. |
| Licence surprises | Automated licence audit; eval-only flags; DATA_SOURCES.md generated from manifests. |
| Unsigned installers scare non-technical friends | Optional signing in CI; step-by-step screenshots in the README. |
| Size and latency on old laptops | Budgets enforced in M2; a "fast mode" (classifier + stylometry only) if needed. |

## 13. What I can and cannot run from this environment

- The container has **no GPU**, 4 CPU cores and 15 GB RAM. All laptop-scale
  configs, tests, the app (headless) and a Linux build can run here.
- The network policy currently **blocks huggingface.co** (and arXiv), which
  hosts every dataset and model above. Until `huggingface.co` (and
  `cdn-lfs.huggingface.co` / `*.hf.co`) is allowed, I can write and unit-test
  code against fixtures but cannot download real data or models, or produce
  real numbers. I will not substitute mocked results for real ones.
- Windows and macOS installers are built and smoke-tested on GitHub Actions
  runners; I cannot click through them on a real Mac or PC.
- GPU runs happen on your cloud account: either you run the scripts I write,
  or, if you give this environment access to your provider, I launch them
  after asking each time.

## 14. Decisions (agreed 2026-10-20)

1. Plan approved.
2. The project stays in `aidetect/` in this repository.
3. No GPU: the "credits" are Claude cloud-session credit (about $50 left after
   Milestone 1). Everything runs on CPU; see §11.
4. No paid frontier-model APIs. All synthetic training text comes from
   open-weight models run on the GPU.
5. Non-commercial data (ELLIPSE, PERSUADE) is used in training; the model is
   therefore non-commercial, which the data card and About page state.
6. Installers are unsigned. The README and the app's download page walk
   through the macOS "Open Anyway" and Windows SmartScreen steps with
   screenshots.
7. Models are hosted as GitHub Releases assets of this repository and
   downloaded on first launch.

## 15. Findings during Milestone 1 that changed the plan

- **Hugging Face is blocked from the build environment**, but public GitHub
  repositories can be cloned. Ghostbuster, ELLIPSE, Beemo, APT-Eval, DetectRL
  and M4 were all available that way; RAID, HC3 and MAGE wait for network
  access (or are fetched on the GPU machine, which has internet).
- **The Ghostbuster repository bundles extra evaluation corpora**: the 91
  TOEFL essays from Liang et al., ETS non-native essays, PELIC, Lang-8, BAWE,
  and "humanizer" output. They keep their original licences, so they are
  evaluation-only, and they give the non-native false-positive measurement
  four independent test sets instead of one.
- **ELLIPSE essays contain anonymisation placeholders** (`Generic_Name`,
  `STUDENT_NAME`, … in 14 % of essays). Left in, they would teach the model
  "placeholder ⇒ human". They are replaced with ordinary names during
  cleaning. ELLIPSE's test archive is password-protected, so only its train
  file (3,911 essays) is used.
- **DetectRL's own leaderboard** supports the design: fine-tuned RoBERTa reaches
  AUROC 99.9 in-domain but drops to about 75–83 F1 on unseen domains, generators
  and attacks, while Binoculars sits around 84 AUROC everywhere. That is the
  case for combining both, with out-of-distribution numbers as the headline.
- **Deduplication now works on whole groups**: a training text that matches
  an evaluation text removes its whole group (including AI rewrites of it),
  and near-duplicate groups are merged so they always share a split.

## 16. Resuming in a new session

The container is rebuilt for every session, and `data/` is not committed, so
a new session starts by recreating the environment and the dataset:

```bash
cd aidetect
uv venv -p 3.12 .venv && . .venv/bin/activate && uv pip install -e ".[train,dev]"
pytest -q                                              # 75 tests, about 5 s
aidetect-data build training/configs/data_laptop.yaml  # quick, clones the git sources
aidetect-data build training/configs/data_available.yaml  # full, about 15 min
```

If `huggingface.co` is allowed, add `raid`, `hc3` and `mage` to a build
(see `data_full.yaml`); their revisions are `unpinned`, so the first fetch
prints the commit to pin in `sources.yaml`.

**Next: Milestone 2+3** (one session): `src/aidetect/stylometry/` (runtime,
NumPy only), the n-gram TF-IDF classifier (training in
`src/aidetect_train/classifier/`, exported as plain arrays the app can score
without scikit-learn), and, if the network allows, the SmolLM2-135M zero-shot
features. Report baseline metrics, including FPR on the non-native sets.
