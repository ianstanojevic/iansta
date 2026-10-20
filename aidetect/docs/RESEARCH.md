# Research notes: AI-generated text detection (October 2026)

This file records what the plan in [`PLAN.md`](PLAN.md) is based on: the
detection methods worth implementing, the public datasets worth training and
evaluating on, and what each one's licence actually says. Where something could
not be verified it is marked **unverified**, and the data pipeline is designed
to re-check it automatically at download time rather than trusting this file.

How it was checked: licences were read from the source repositories' own
`LICENSE`/`README` files (fetched from GitHub on 2026-10-20). Hugging Face and
arXiv were not reachable from the build environment, so dataset-card licences
and paper numbers come from search results and are flagged as such.

---

## 1. Zero-shot statistical detectors

All of these score a text using a language model's token probabilities, with no
training on human-vs-AI examples. They are the backbone signal because they
generalise to new generators better than trained classifiers do, but they are
weaker on short text and on heavily edited text.

| Method | Idea | Models needed | Notes |
|---|---|---|---|
| Perplexity / log-likelihood | AI text is more predictable under an LM | 1 | Simple, strong in-domain, but the main cause of bias against non-native writers (their text is *also* low-perplexity). |
| Log-rank, LRR (log-likelihood / log-rank ratio) | Rank of each token among the model's predictions | 1 | Cheap by-product of the same forward pass. |
| Entropy | How spread out the model's prediction is at each position | 1 | Same forward pass. |
| DetectGPT (Mitchell et al., 2023) | AI text sits near a local maximum of log-probability: perturb the text with T5 and measure the drop | 1 + a mask-filling model, ~100 perturbations | Too slow for a laptop app (hundreds of forward passes per document). Superseded. Code: MIT. |
| **Fast-DetectGPT** (Bao et al., ICLR 2024) | Replaces perturbation with *conditional probability curvature*, computed analytically from one forward pass: `(log p(x) − E_q[log p]) / sqrt(Var_q[log p])`, with the expectation taken token-wise under a sampling model `q` | 1 (sampling = scoring) or 2 | ~340× faster than DetectGPT for similar or better accuracy. Code: MIT. |
| **Binoculars** (Hans et al., ICML 2024) | Ratio of perplexity under an *observer* model to the *cross-perplexity* between observer and *performer* (base vs instruct of the same family). Normalises away "this prompt makes any text predictable" | 2 (same tokenizer) | Paper: >90 % TPR at 0.01 % FPR with Falcon-7B/Falcon-7B-instruct. Code: BSD-3. |
| DivEye (Basani & Chen, TMLR 2026) | Nine statistics of the *surprisal sequence* (variance, skew, spectral and temporal-diversity features) fed to a small gradient-boosted classifier | 1 | Reports up to 33 % gains over zero-shot baselines and up to 18.7 % gains as an auxiliary signal. Its features are essentially "burstiness done properly", and they come free from the same forward pass. |
| Luminol-AIDetect (arXiv 2604.25860, 2026) | Perplexity under text shuffling, with a smaller proxy model | 1 | Very recent, self-reported near-zero FPR. Worth trying as a candidate feature, not something to depend on. |
| Glimpse (Bao et al.) | Extends white-box methods to proprietary-model probability estimates | API | Needs a remote API, so excluded (violates "never send text anywhere"). |

**Head-to-head evidence.** Every paper that compares them under its own
protocol puts Binoculars ahead of Fast-DetectGPT, but the margin varies a lot:

- A practical examination of AI-text detectors (Findings of NAACL 2025): AUROC
  0.8485 vs 0.8405, TPR at 1 % FPR 0.58 vs 0.49.
- DivScore (EMNLP 2025): Binoculars ahead in every domain on GPT-4o, o3-mini
  and DeepSeek-R1 text, and far ahead on some (0.77 vs 0.46 AUROC).
- Alignment Imprint (arXiv 2604.16923, 2026): under strict low-FPR operation,
  average TPR 66.7 % (Binoculars) vs 51.8 % (Fast-DetectGPT).

**The catch for a laptop app: these are 7B-model numbers.** Evidence for small
model pairs is thin and informal:

- A Qwen2.5-0.5B / Qwen2.5-0.5B-Instruct pair, suggested by the Binoculars lead
  author, is reported (GitHub write-up, not peer reviewed) at 0.949 AUROC and
  57.9 % TPR at 1 % FPR, with raw perplexity scoring *higher* on that dataset.
- A Llama-3.2-1B base/instruct pair, in a blog post, separated humans and AI
  only around 62–68 % at its chosen threshold.

**Conclusion for the design.** Binoculars and Fast-DetectGPT can both be
computed from the same two forward passes (observer and performer logits over
one shared tokenizer), as can perplexity, log-rank, entropy and DivEye's
surprisal statistics. So the app runs **one small base/instruct pair once** and
derives every zero-shot signal from it, and the meta-classifier learns how much
to trust each. Which pair to use (Qwen2.5-0.5B, Qwen3-0.6B, SmolLM2-360M,
Llama-3.2-1B, Falcon3-1B) is decided empirically in Milestone 2 on TPR at 1 %
FPR versus size and CPU latency, not assumed.

## 2. Trained classifiers

- **A fine-tuned RoBERTa/DeBERTa is a strong baseline.** *Rethinking
  AI-Generated Text Detection* (arXiv 2607.03680, 2026) shows a plainly
  fine-tuned RoBERTa matching or beating specialised detectors in-distribution
  on several benchmarks. It also finds that the same classifier **degrades
  sharply under domain or generator shift**, that adding more source data does
  not close the gap, and that it can assign *high-confidence AI labels to human
  text from unseen domains*. That finding is the single most important design
  input here: the classifier must not dominate the ensemble on unfamiliar
  text, and the evaluation must be out-of-distribution.
- **Pangram technical report** (arXiv 2402.14873): the commercial state of the
  art gets near-zero FPR from two data techniques rather than architecture:
  1. *Synthetic mirrors*: for each human document, generate an AI document on
     the same topic and in the same genre and length, so the model learns "AI
     style" rather than "AI topics".
  2. *Hard-negative mining*: run the model over a large corpus of known-human
     text, add the human documents it wrongly flags back into training, and
     repeat.
  Both are adopted in the plan.
- **Kaggle "LLM – Detect AI Generated Text" (2023–24)**: top solutions won by
  generating training data from *many* model families with varied decoding,
  which is evidence that generator diversity in training data matters more than
  model choice.
- **Candidate backbones**: DeBERTa-v3 (MIT; strongest encoder for
  classification, but its ONNX export and int8 quantisation need care),
  ModernBERT (Apache-2.0; long context, faster), RoBERTa (MIT). For laptop
  inference, either DeBERTa-v3-small/xsmall or a distillation of a base model
  into one of those.

## 3. Calibration and confidence ranges

- Isotonic regression and Platt scaling both give a calibrated point
  probability. **Inductive Venn–Abers predictors (IVAP)** fit two isotonic
  regressions and output an interval `[p0, p1]` with validity guarantees. That
  interval is exactly the "probability with a confidence range" the product
  asks for, and its width grows on unfamiliar inputs. The core algorithm is
  about 60 lines of NumPy, so it is implemented in-house and checked against
  the `venn-abers` PyPI package in tests rather than shipped as a dependency.
- *Reliably Bounding False Positives* (ACL 2025, multiscaled conformal
  prediction) shows conformal thresholds can bound FPR for zero-shot
  detectors. The same idea is used to pick the decision threshold so that FPR
  on held-out human text is at most a target (proposed: 1 % overall, checked
  per slice).

## 4. Known failure modes (what the warnings and the evaluation must cover)

- **Non-native English writers.** Liang et al. (*Patterns*, 2023): seven
  detectors flagged 61 % of TOEFL essays as AI on average, and one flagged
  97.8 %, while scoring US 8th-grade essays near perfectly. The cause is low
  perplexity. Later work replicates the effect across other platforms and
  populations. Mitigations: non-native human text in training as hard
  negatives, a separate FPR measurement on non-native writing, and an in-app
  explanation that this group is at elevated risk.
- **AI-polished human text.** APT-Eval (Saha & Feizi, Findings of ACL 2025,
  about 15K samples, five LLMs): detectors frequently flag *minimally* polished
  human text as AI and cannot tell degrees of AI involvement apart.
- **Edited or paraphrased AI text.** RAID (11 attacks including paraphrase,
  synonym swap, homoglyphs), Beemo (expert-edited LLM outputs), MIRAGE
  polish/rewrite (zero-shot detectors drop to roughly 0.55–0.57 AUROC).
- **Newest frontier models.** A 2026 control set (TextSight) reports detectors
  catching about 92 % of one 2026 model's text at roughly 1 % FPR but none of
  another's. Any public training set lags the newest models; this is stated
  plainly in the app.
- **Short text.** Every method degrades below about 100–200 tokens.

## 5. Datasets

"Licence status" reflects what was verified from the source repository, not
from a third party.

| Dataset | Contents | Generators | Licence status | Proposed use |
|---|---|---|---|---|
| **RAID** (`liamdugan/raid`, ACL 2024) | Over 6M generations; 8 domains (abstracts, books, news, poetry, recipes, Reddit, reviews, Wikipedia) + extra (code, Czech, German); 4 decoding strategies; 11 adversarial attacks | GPT-2, GPT-3, GPT-4, ChatGPT, Mistral-7B (±chat), MPT-30B (±chat), Llama-2-70B-chat, Cohere (±chat) | **MIT** (repo LICENSE, verified). Test-split labels are hidden for the leaderboard, so only the train split is usable. | Train + attack-slice evaluation |
| **MAGE** (`yafuly/MAGE`) | 10 domains, about 447K texts, includes an OOD test set | 27 LLMs (OPT, GPT-J, LLaMA, GPT-3.5, …) | **Inconsistent**: repo LICENSE is Apache-2.0, README badge says CC BY 4.0. Both are permissive; attribute under both. | Train + leave-one-domain-out evaluation |
| **HC3** (`Hello-SimpleAI`) | Q&A pairs (ELI5, WikiQA, finance, medicine, Wikipedia CS) | ChatGPT (early 2023) | **CC-BY-SA**, or stricter where a source is stricter (README, verified); the WikiQA subset has a custom licence | Train (minus WikiQA) |
| **Ghostbuster data** (`vivek3141/ghostbuster-data`) | Student essays, news, creative writing | ChatGPT, Claude | **CC BY 3.0** (verified) | Train |
| **Beemo** (`Toloka/beemo`) | 6.5K texts: human-written, generated by 10 instruction-tuned LLMs, then **expert-edited**; plus 13.1K LLM-edited | Zephyr, Tulu-2, Gemma, Llama-2, Llama-3.1-70B, Mistral, Mixtral, GPT-4o | **MIT** (verified); generator outputs also carry their model licences | **OOD evaluation only** (edited AI) |
| **APT-Eval** (`smksaha/apt-eval`) | About 15K human texts polished by 5 LLMs at graded levels | GPT-4o, Llama, … | **Unverified** (no LICENSE file in repo) | **OOD evaluation only** (polished human) |
| **M4GT-Bench** (`mbzuai-nlp`) | Multilingual, multi-domain, multi-generator; also has mixed human→AI boundary data | Many | **Unverified** (no LICENSE file; check HF card) | Train if permissive; boundary data useful for the heatmap |
| **DetectRL** (`NLP2CT`, NeurIPS 2024) | Real-world misuse domains, prompt variations, injected writing errors, attacks | GPT-3.5, PaLM-2, Claude, Llama-2 | **Unverified** (no LICENSE file) | OOD evaluation candidate |
| **MIRAGE** (DetectAnyLLM, 2025) | 93.8K samples, 5 domains, generated, *polished* and *rewritten* text | 17 LLMs incl. 13 commercial | **Unverified data licence**; the accompanying code is **non-commercial** (Pi-Lab licence) | OOD evaluation candidate (most modern generators of the large sets) |
| **ELLIPSE** (`scrosseye/ELLIPSE-Corpus`) | About 6.5K essays by English-language learners, US state testing | Human only | **CC BY-NC-SA 4.0** (verified) | Non-native human: train as hard negatives + evaluation slice |
| **PERSUADE 2.0** | 25K+ argumentative essays, grades 6–12, with an ELL flag | Human only | 1.0 is **CC BY-NC-SA 4.0** (verified); 2.0 to be confirmed | Human student writing + native/non-native slices |
| Liang et al. TOEFL essays | 91 TOEFL essays | Human only | Unverified | Evaluation only (tiny, but it is the canonical bias test) |
| TextSight 2026 control set; WasItAIGenerated 2026-09 | 700 and 2,572 texts; includes 2026-era models and "humanizer" output | 2026 models | Unverified; built by detection vendors, so treat with care | Small OOD "freshness" check |
| Pre-November-2022 human corpora (Wikipedia, arXiv abstracts, Reddit and reviews via RAID/HC3, Project Gutenberg) | Text guaranteed not to be LLM-written | Human only | Wikipedia CC BY-SA; Gutenberg public domain; arXiv per-paper | Human pool for synthetic mirrors and hard-negative mining |

**Gaps the public data does not cover**, so the plan has to fill them:

1. **Current generators.** Most of the large sets stop at GPT-4 / Llama-2 / early
   Claude. Plan: generate a fresh "mirror" set with a dozen current open-weight
   instruct models on the rented GPU, optionally plus API models (see the open
   questions in PLAN.md).
2. **Light human editing of AI text at scale.** Beemo is small, so it is kept
   for evaluation; the training set gets programmatic edits (sentence
   deletion/reordering, synonym swaps, LLM paraphrase, "humanizer"-style
   prompts).
3. **Non-native writing.** ELLIPSE and PERSUADE's ELL subset are the only sizeable
   open sources found; both are non-commercial.

## 6. Packaging and runtime findings

- **Inference runtime**: ONNX Runtime (MIT) on CPU with int8 dynamic
  quantisation avoids shipping PyTorch (hundreds of MB) in the app. The
  zero-shot features need *full-vocabulary* logits for both models; ONNX
  Runtime gives these directly. llama.cpp would be faster on CPU but makes
  cross-platform wheels and full-logit extraction harder; it stays a fallback
  if ONNX Runtime latency misses target.
- **PyInstaller** cannot cross-compile: the macOS build must run on macOS and
  the Windows build on Windows, which GitHub Actions provides. macOS hardened
  runtime with PyInstaller needs the
  `com.apple.security.cs.allow-unsigned-executable-memory` entitlement.
- **Unsigned apps**: on macOS Sequoia and later, a downloaded un-notarised app is
  blocked until the user goes to *System Settings → Privacy & Security → Open
  Anyway*. On Windows, SmartScreen shows "Windows protected your PC" for
  unsigned installers. For non-programmer friends, signing removes real
  friction; it costs money (see the open questions).
- **GitHub-hosted runners**: `macos-14` images are deprecated (fully
  unsupported 2026-11-02). Use `macos-15` (arm64) and `macos-15-intel` (x86-64;
  its retirement date is unverified, reportedly 2027) and `windows-latest`.
- **Document parsing**: `python-docx` (MIT) and `pypdf` (BSD-3). PyMuPDF is
  avoided because it is AGPL.
- **Language ID**: `py3langid` (BSD), small and offline.

## Sources

- Binoculars: Hans et al., ICML 2024, <https://proceedings.mlr.press/v235/hans24a.html>; code <https://github.com/ahans30/Binoculars>
- Fast-DetectGPT: Bao et al., <https://arxiv.org/abs/2310.05130>; code <https://github.com/baoguangsheng/fast-detect-gpt>
- DetectGPT code: <https://github.com/eric-mitchell/detect-gpt>
- DivEye: <https://arxiv.org/html/2509.18880v3>, TMLR 2026 <https://mlanthology.org/tmlr/2026/basani2026tmlr-diversity/>
- Luminol-AIDetect: <https://arxiv.org/html/2604.25860v2>
- Alignment Imprint: <https://arxiv.org/html/2604.16923v1>
- DivScore (EMNLP 2025): <https://aclanthology.org/2025.emnlp-main.971.pdf>
- Practical examination of AI-text detectors (Findings of NAACL 2025): <https://aclanthology.org/2025.findings-naacl.271.pdf>
- Multiscaled conformal prediction for bounding FPR: <https://arxiv.org/pdf/2505.05084>
- Small-model Binoculars write-ups: <https://medium.com/@vzzz/zero-shot-llm-text-detectors-in-practice-2b737ffcadd2>, <https://github.com/andrescas168/ai-text-verifier>, <https://github.com/gauravsdama/binoculars-local-mcp>
- Rethinking AI-Generated Text Detection: <https://arxiv.org/pdf/2607.03680>
- Pangram technical report: <https://arxiv.org/pdf/2402.14873>
- Kaggle LLM-Detect top-solution code and write-up link: <https://github.com/nhyha/llm-detect-ai>
- GPT detectors are biased against non-native English writers: <https://arxiv.org/pdf/2304.02819>
- APT-Eval: <https://arxiv.org/abs/2502.15666v1>, <https://preview.aclanthology.org/credits/2025.findings-acl.1303>
- RAID: <https://arxiv.org/pdf/2405.07940>, <https://github.com/liamdugan/raid>
- MAGE: <https://github.com/yafuly/MAGE>, <https://huggingface.co/datasets/yaful/MAGE>
- HC3: <https://huggingface.co/datasets/Hello-SimpleAI/HC3>, <https://github.com/Hello-SimpleAI/chatgpt-comparison-detection>
- Ghostbuster data: <https://github.com/vivek3141/ghostbuster-data>
- Beemo: <https://arxiv.org/pdf/2411.04032>, <https://github.com/Toloka/beemo>
- DetectRL: <https://arxiv.org/pdf/2410.23746>
- MIRAGE / DetectAnyLLM: <https://arxiv.org/pdf/2509.14268>, <https://github.com/fjc2005/detectanyllm>
- ELLIPSE: <https://github.com/scrosseye/ELLIPSE-Corpus>; PERSUADE: <https://github.com/scrosseye/PERSUADE_corpus>
- TextSight 2026: <https://huggingface.co/datasets/textsightai/ai-text-detection-benchmark-2026>
- WasItAIGenerated 2026-09: <https://huggingface.co/datasets/wasitaigeneratedcom/ai-detector-benchmark-2026-09>
- Venn–Abers: <https://pypi.org/project/venn-abers>
- Gatekeeper in Sequoia: <https://eclecticlight.co/2024/08/10/gatekeeper-and-notarization-in-sequoia/>
- PyInstaller signing notes: <https://developer.apple.com/forums/thread/695989>, <https://haim.dev/posts/2020-08-08-python-macos-app>
- macOS runner images: <https://endoflife.ai/github-actions-runner-images/macos-15-arm64>
