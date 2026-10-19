# xG experiment

An expected-goals model fit on shl.se shot coordinates (`shlbet/xg.py`) uses
distance, angle and rebound for unblocked attempts. Each season is scored by
a model fit only on earlier seasons.

| Season | Attempts | Goals | Sum xG | AUC |
|---|---|---|---|---|
| 2023-24 | 27,040 | 1,769 | 1,769.0 | 0.732 (in-sample fit) |
| 2024-25 | 26,757 | 1,776 | 1,752.4 | 0.731 |
| 2025-26 | 25,604 | 1,822 | 1,705.6 | 0.720 |

Team xG form (EW mean of xG for, xG against and xG share) was added to the
feature GLM. Decision season 2024-25, same pipeline, alpha = 3:

| | 1X2 log loss | Totals 5.5 log loss |
|---|---|---|
| Without xG | 1.0632 | 0.6835 |
| With xG | 1.0633 | 0.6830 |
| 2025-26 without / with (shown only) | 1.0242 / 1.0242 | 0.6777 / 0.6781 |

**Decision: not adopted.** The 2024-25 difference is within noise, and
2025-26 is no better. The likely reasons are that only about 2.5 seasons of
coordinates exist, and that shots and goals form already carry most of the
signal. The code stays behind `run_feat(..., use_xg=True)`.
