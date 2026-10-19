# Phase 3 verdict (revised run)

Full tables are in `phase3_evaluation.md`.

## Changes from the first run, and why

1. **The pooling weight (model vs market) is now fit walk-forward.** The
   weight used in season s is fit only on seasons before s. In the first run
   it was fit on all tuning seasons at once, which flattered the tuning
   numbers.
2. **The markets the strategy may bet are chosen on the tuning seasons by a
   fixed rule:** tuning log-loss gain over the market > 0 AND tuning flat ROI
   at EV > 2% > 0.
3. **The risk constraint was tightened** to P(bankroll halves within one
   season) <= 1% (it was 5%). This was decided before seeing test results for
   any rule it admits. The reason is that the model's EV estimates exceed what
   the closing line implies.
4. **CLV for whole totals lines** now accounts for pushes.

## Probability quality: log-loss gain over the margin-free market (paired bootstrap)

| Market | Tune gain [95% CI] | Test gain [95% CI] | P(gain > 0), test |
|---|---|---|---|
| Totals, late (closing) | +0.0037 [−0.0004, +0.0078] | +0.0046 [−0.0065, +0.0160] | 0.79 |
| Totals, early (opening) | +0.0025 [−0.0006, +0.0058] | +0.0028 [−0.0068, +0.0128] | 0.72 |
| 1X2, late | −0.0013 [−0.0059, +0.0031] | +0.0037 [−0.0024, +0.0098] | 0.88 |
| 1X2, early | −0.0004 [−0.0057, +0.0049] | +0.0043 [−0.0026, +0.0110] | 0.89 |
| Moneyline incl. OT | ≈ 0 | +0.0005 to +0.0007 | 0.61–0.69 |
| ±1.5 | ≈ 0 | ≈ 0 | 0.50 |

**Structural finding:** the market has overpriced *over* in every season from
2020/21 to 2026/27, by 1–7 percentage points (Unibet 5.5 line: implied 0.482
against an actual 0.439, n=538). The totals edge comes from this. The model
bets unders because it learns the league's real scoring rate.

## Strategy chosen on the tuning seasons (late = bet near puck drop at the closing price)

Only totals were admitted. Rule: EV > 2%, quarter Kelly, max 5% of bankroll
per bet.

| Period | Bets | Flat ROI [95% CI] | Log growth (¼ Kelly) | Max drawdown |
|---|---|---|---|---|
| Tune 2020/21–2024/25 | 838 | +8.6% [+2.4, +14.8] | +0.89 | 45% (over 5 seasons) |
| **Test 2025/26** | 203 | **+8.0% [−4.7, +20.2]** | +0.31 | 17% |
| Live 2026/27 | 33 | +9.9% [−21.8, +39.5] | +0.05 | 7% |
| Färjestad only, test | 26 | +15% (meaningless n) | | |

Early scenario (opening prices, projected goalie): moneyline, ±1.5 and totals
were admitted, and the rule chosen was flat stakes at EV > 0. The result is
weaker: test +2.2% [−9.3, +13.8], and the bets did not beat the closing line
(CLV EV −3.4%). For early betting, totals alone is the only part with
support.

## Blunt verdict per market

- **Totals (60 min, Unibet main line): probable small real edge, mostly
  unders.** The cause is structural and has lasted 7 seasons. The rule was
  profitable on tuning (CI above 0) and positive on test and live, but not
  significant on test alone. If the market corrects its over bias, the edge
  disappears; watch the tracker for that.
- **1X2 (60 min): inconclusive.** With honest walk-forward weights it shows no
  gain on the tuning seasons, but +0.004 on test. That is not enough to bet
  on.
- **Moneyline incl. OT: no edge.**
- **±1.5 puck line: no edge.**
- **Färjestad alone:** too few games to show anything. The all-SHL results are
  the evidence; Färjestad games are where you apply them.
