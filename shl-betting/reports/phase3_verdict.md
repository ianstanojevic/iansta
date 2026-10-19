# Phase 3 verdict

Read `phase3_evaluation.md` for all tables. Everything below was selected on
the tuning seasons 2020/21–2024/25. The 2025/26 test season was looked at once,
after every choice had been fixed. 2026/27 so far (69 games) is reported as
live data.

## Probability quality vs the market (paired bootstrap, log-loss gain over the margin-free Swedish-book consensus)

| Market | Scenario | Tune gain | Test gain [95% CI] | P(gain > 0), test |
|---|---|---|---|---|
| 1X2 (60 min) | early (opening prices) | +0.0016 | +0.0037 [−0.0016, +0.0088] | 0.90 |
| 1X2 (60 min) | late (closing prices) | +0.0008 | +0.0030 [−0.0013, +0.0075] | 0.91 |
| Totals (60 min) | early | +0.0027 | +0.0028 [−0.0068, +0.0127] | 0.73 |
| Totals (60 min) | late | +0.0042 | +0.0045 [−0.0078, +0.0162] | 0.77 |
| Moneyline incl. OT | early / late | +0.0014 / +0.0003 | ≈ 0 | 0.62 / 0.71 |
| ±1.5 | early / late | +0.0011 / +0.0006 | ≈ 0 | 0.46 / 0.49 |

The tuning-season gains are slightly optimistic, because the pooling weight was
chosen on those same seasons. The test-season gains carry no such bias.

### Structural finding: overs are overpriced

In every season from 2020/21 to 2026/27, the margin-free market probability
of *over* was above the actual over rate.

| Season | 2020/21 | 2021/22 | 2022/23 | 2023/24 | 2024/25 | 2025/26 | 2026/27 so far |
|---|---|---|---|---|---|---|---|
| Market P(over) | 0.472 | 0.471 | 0.501 | 0.502 | 0.503 | 0.496 | 0.473 |
| Actual | 0.427 | 0.434 | 0.479 | 0.480 | 0.491 | 0.461 | 0.406 |

At Unibet's 5.5 line the market implied 0.482 against an actual 0.439 (n=538).
This is the main source of the totals edge. The model bets unders because it
learns the league's real scoring rate.

## Betting (single best bet per game; Unibet price when the feed has it, otherwise bet365)

| Scenario | Period | Bets | Flat ROI [95% CI] | Note |
|---|---|---|---|---|
| early | tune | 1439 | +7.5% [+1.7, +13.4] | CLV EV −1.4%; beats the closing price 52% of the time |
| early | **test** | 324 | **+7.1% [−6.0, +20.8]** | CLV EV −3.6%; beats close only 38% |
| late | tune | 1499 | +6.5% [+0.6, +12.5] | |
| late | **test** | 329 | **+7.8% [−5.7, +21.7]** | |
| early | live 2026/27 | 59 | +0.8% | too few bets to read |
| Färjestad only, early | test | 43 | +20.6% [−17.8, +60.3] | meaningless sample |

Staking chosen on the tuning seasons was EV > 0 with half Kelly and a 5% cap.
It had the highest log growth while keeping the chance of halving the
bankroll at or below 5%. **Recommendation: quarter Kelly instead.** On the
tuning seasons it keeps about 60% of half Kelly's growth with roughly 0% risk
of ruin. The model's EV estimates are also inflated: the closing line rates
the chosen bets at −1% to −4% EV, while the model rates them clearly
positive. That gap means the true edge is smaller than the model believes.

## Blunt verdict per market

- **Totals (60 min, Unibet main line): probable small edge, mostly on unders.**
  The cause is real and has persisted for 7 seasons. The bets were profitable
  on the tuning seasons (95% CI above 0 in the late scenario) and positive on
  the test season, but not significant there. If the market corrects its over
  bias, this edge disappears.
- **1X2 (60 min): inconclusive, leaning positive.** The model beats the market
  in both tuning and test, but the CIs include zero, and in the test season
  the bets did not beat the closing line.
- **Moneyline incl. OT: no demonstrated edge.**
- **±1.5 puck line: no edge.** Do not bet it.
- **Färjestad alone:** about 50 games a season, so nothing can be shown
  statistically. The all-SHL results are the evidence; Färjestad games are
  simply where you apply them.
