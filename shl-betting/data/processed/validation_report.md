# Data validation report

## 1. Games per season and source
| season   |   games |   period_scores |   shots |   start_goalies |   fs_event |   fs_stats |   fs_pp |   faceoffs |   shlapi |   blocked |   rest |
|:---------|--------:|----------------:|--------:|----------------:|-----------:|-----------:|--------:|-----------:|---------:|----------:|-------:|
| 2018-19  |     364 |             364 |     363 |             364 |        364 |        364 |     364 |        364 |        0 |         0 |    360 |
| 2019-20  |     364 |             364 |     362 |             364 |        364 |        364 |     364 |        364 |        0 |         0 |    362 |
| 2020-21  |     364 |             364 |     364 |             364 |        364 |        364 |     364 |        364 |        0 |         0 |    355 |
| 2021-22  |     364 |             364 |     364 |             364 |        364 |        364 |     364 |        364 |        0 |         0 |    360 |
| 2022-23  |     364 |             364 |     364 |             364 |        364 |        364 |     364 |        364 |        0 |         0 |    362 |
| 2023-24  |     364 |             364 |     363 |             364 |        364 |        364 |     364 |        364 |      364 |       314 |    359 |
| 2024-25  |     364 |             364 |     364 |             364 |        364 |        364 |     364 |        364 |      364 |       364 |    359 |
| 2025-26  |     364 |             364 |     364 |             364 |        364 |        364 |     364 |        363 |      364 |       364 |    360 |
| 2026-27  |      69 |              69 |      69 |              69 |         69 |         69 |      69 |         68 |       69 |        69 |     64 |

## 2. Games per team per season (complete seasons must be 26 home + 26 away)
All complete.

Current season 2026-27: 69 games played; games per team 9-10.

## 3. Cross-source consistency
- Final score swehockey == betexplorer: 1.0000 (0 mismatches of 2981)
- OT/SO flag swehockey (#periods) == betexplorer (AET/AfP): 1.0000 (0 mismatches)
- Final score swehockey == shl.se API: 1.0000 (0 mismatches of 1161)
- Regulation tie <=> OT played: 1.0000 (0 violations)
- Every game has a winner after OT/SO: 1.0000
- Shots on goal swehockey vs flashscore: identical 0.952, within 2: 0.994

## 4. Odds coverage (share of played games)
|                          |   2018-19 |   2019-20 |   2020-21 |   2021-22 |   2022-23 |   2023-24 |   2024-25 |   2025-26 |   2026-27 |
|:-------------------------|----------:|----------:|----------:|----------:|----------:|----------:|----------:|----------:|----------:|
| avg 1X2 (betexplorer)    |         0 |     0.728 |     1     |     0.94  |     0.981 |     1     |     1     |     1     |     1     |
| Unibet 1X2 close         |         0 |     0     |     0     |     0     |     1     |     1     |     1     |     1     |     1     |
| Unibet 1X2 open          |         0 |     0     |     0     |     0     |     1     |     1     |     1     |     1     |     1     |
| Unibet ML close          |         0 |     0     |     0     |     0     |     1     |     1     |     0.962 |     0     |     0     |
| Unibet ML open           |         0 |     0     |     0     |     0     |     1     |     1     |     0.962 |     0     |     0     |
| Unibet PL home-1.5 close |         0 |     0     |     0     |     0     |     1     |     0.992 |     1     |     1     |     1     |
| Unibet PL away-1.5 close |         0 |     0     |     0     |     0     |     0.989 |     0.97  |     0.978 |     0.967 |     0.986 |
| Unibet total close       |         0 |     0     |     0     |     0     |     1     |     1     |     1     |     1     |     1     |
| Unibet total open        |         0 |     0     |     0     |     0     |     1     |     1     |     1     |     1     |     1     |
| SE consensus 1X2         |         1 |     1     |     1     |     1     |     1     |     1     |     1     |     1     |     1     |
| SE consensus ML          |         1 |     1     |     1     |     1     |     1     |     1     |     1     |     1     |     1     |
| SE consensus PL          |         1 |     1     |     0.997 |     0.997 |     1     |     1     |     1     |     1     |     1     |
| SE consensus total       |         1 |     1     |     1     |     0.997 |     1     |     1     |     1     |     1     |     1     |

Bookmakers with 1X2 closing odds, by season (games covered):
| book      |   2018-19 |   2019-20 |   2020-21 |   2021-22 |   2022-23 |   2023-24 |   2024-25 |   2025-26 |   2026-27 |
|:----------|----------:|----------:|----------:|----------:|----------:|----------:|----------:|----------:|----------:|
| 1x2       |         0 |         0 |         0 |         0 |         0 |         0 |         0 |         0 |        69 |
| BetMGM.se |         0 |         0 |         0 |         0 |         0 |         0 |         0 |       316 |        69 |
| Coolbet   |       364 |       364 |       364 |       364 |       322 |       364 |       364 |         7 |        69 |
| Dbet      |         0 |         0 |         0 |         0 |         0 |         0 |         0 |         0 |        69 |
| Expektse  |         0 |         0 |         0 |         0 |         0 |       167 |       364 |       364 |        69 |
| MrGreen   |         0 |       336 |         0 |         0 |         0 |         0 |         0 |         0 |        28 |
| Unibetse  |         0 |         0 |         0 |         0 |       364 |       364 |       364 |       364 |        69 |
| bet365    |       364 |       364 |       363 |       364 |       364 |       364 |       364 |       364 |        69 |

## 5. Odds sanity
- Unibet x closing overround: median 1.0370, 1-99% [1.0281, 1.0500], n=1525
  - share where opening == closing for all sides: 0.023
- Unibet ml closing overround: median 1.0334, 1-99% [1.0266, 1.0411], n=1078
  - share where opening == closing for all sides: 0.040
- Unibet plh closing overround: median 1.0425, 1-99% [1.0367, 1.0574], n=1522
  - share where opening == closing for all sides: 0.059
- Unibet tot closing overround: median 1.0412, 1-99% [1.0376, 1.0542], n=1525
  - share where opening == closing for all sides: 0.150
- Home/away identity: |log(Unibet home / avg home)| median 0.022; possible swaps 0 of 1518
- 1X2 log loss: SE closing consensus 1.0308 vs constant base rate 1.0518 (n=2981)
- 60-min outcome base rates: home 0.461, draw 0.213, away 0.325
