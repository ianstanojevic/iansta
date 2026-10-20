# Build report: available

Created 2026-10-20T13:59:50+00:00 from code commit `718885974300`.

**Leakage checks:** leakage checks: all passed

## Documents per split and label

| split | ai | human | mixed |
|---|---|---|---|
| train_clf | 8578 | 3959 | 0 |
| train_meta | 2303 | 1015 | 0 |
| calib | 1488 | 655 | 0 |
| test | 2088 | 1012 | 0 |
| ood | 178244 | 62731 | 46756 |

## Sources

| source | use | licence | loaded | subsampled | dropped in cleaning | in final build |
|---|---|---|---|---|---|---|
| ghostbuster | train | cc-by-3.0 | 21000 | 21000 | refusal_or_ai_disclaimer: 8, under_30_words: 19, over_5000_words: 3 | 17190 |
| ellipse | train | cc-by-nc-sa-4.0 | 3911 | 3911 | under_30_words: 1, not_en: 2 | 3908 |
| beemo | eval_only | mit | 19683 | 19683 | refusal_or_ai_disclaimer: 1, under_30_words: 1825, not_en: 31 | 17755 |
| apt_eval | eval_only | unknown | 15250 | 15250 | refusal_or_ai_disclaimer: 15, under_30_words: 7, not_en: 3 | 14478 |
| detectrl | eval_only | unknown | 179169 | 179169 | refusal_or_ai_disclaimer: 422, under_30_words: 196, not_en: 146 | 176751 |
| m4 | eval_only | unknown | 84249 | 84249 | refusal_or_ai_disclaimer: 83, under_30_words: 243, over_5000_words: 61, not_en: 133 | 74732 |
| gb_toefl91 | eval_only | unknown | 91 | 91 | none | 90 |
| gb_ets | eval_only | unknown | 1000 | 1000 | under_30_words: 1 | 999 |
| gb_pelic | eval_only | unknown | 1000 | 1000 | under_30_words: 476 | 495 |
| gb_lang8 | eval_only | unknown | 1000 | 1000 | under_30_words: 84 | 916 |
| gb_bawe | eval_only | unknown | 1444 | 1444 | over_5000_words: 29 | 1415 |
| gb_undetectable | eval_only | unknown | 100 | 100 | none | 100 |

## Deduplication

- exact duplicates removed: 11473
- near-duplicate clusters spanning groups: 332
- documents dropped to keep evaluation sets unseen: 1780
- documents dropped for conflicting labels: 28
- groups merged: 86

## By source

| source | train_clf/ai | train_clf/human | train_meta/ai | train_meta/human | calib/ai | calib/human | test/ai | test/human | ood/ai | ood/human | ood/mixed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| apt_eval | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 289 | 300 | 13889 |
| beemo | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15912 | 1843 | 0 |
| detectrl | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 99126 | 44758 | 32867 |
| ellipse | 0 | 2331 | 0 | 583 | 0 | 377 | 0 | 617 | 0 | 0 | 0 |
| gb_bawe | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1415 | 0 |
| gb_ets | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 999 | 0 |
| gb_lang8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 916 | 0 |
| gb_pelic | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 495 | 0 |
| gb_toefl91 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 90 | 0 |
| gb_undetectable | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100 | 0 | 0 |
| ghostbuster | 8578 | 1628 | 2303 | 432 | 1488 | 278 | 2088 | 395 | 0 | 0 | 0 |
| m4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 62817 | 11915 | 0 |

## By domain

| domain | train_clf/ai | train_clf/human | train_meta/ai | train_meta/human | calib/ai | calib/human | test/ai | test/human | ood/ai | ood/human | ood/mixed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| academic_abstract | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 42901 | 14180 | 8389 |
| academic_writing | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1415 | 0 |
| blog | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 52 | 2461 |
| creative_writing | 2667 | 446 | 725 | 121 | 431 | 72 | 634 | 106 | 24551 | 11199 | 8150 |
| email_content | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 43 | 1901 |
| encyclopedia | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 13955 | 2939 | 0 |
| forum_answer | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16096 | 2999 | 0 |
| game_review | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 51 | 2362 |
| how_to | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14991 | 2988 | 0 |
| instruction_closed_qa | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1106 | 48 | 0 |
| instruction_generation | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4450 | 549 | 0 |
| instruction_open_qa | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3386 | 427 | 0 |
| instruction_rewrite | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3996 | 494 | 0 |
| instruction_summarize | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2974 | 325 | 0 |
| learner_essay | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 495 | 0 |
| learner_journal | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 916 | 0 |
| narrativeqa | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 98 | 0 | 0 |
| news | 2963 | 594 | 831 | 165 | 545 | 108 | 661 | 131 | 24495 | 11219 | 10355 |
| paper_abstract | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 51 | 2479 |
| review | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25054 | 11200 | 8360 |
| speech | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 52 | 2299 |
| squad1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 62 | 0 | 0 |
| student_essay | 2948 | 588 | 747 | 146 | 512 | 98 | 793 | 158 | 0 | 0 | 0 |
| student_essay_k12 | 0 | 2331 | 0 | 583 | 0 | 377 | 0 | 617 | 0 | 0 | 0 |
| toefl_essay | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1089 | 0 |
| truthfulqa | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 129 | 0 | 0 |

## By generator family

| generator_family | train_clf/ai | train_clf/human | train_meta/ai | train_meta/human | calib/ai | calib/human | test/ai | test/human | ood/ai | ood/human | ood/mixed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| anthropic-claude | 1630 | 0 | 435 | 0 | 279 | 0 | 394 | 0 | 24811 | 0 | 8227 |
| bigscience-bloom | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11927 | 0 | 0 |
| cohere | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9531 | 0 | 0 |
| databricks-dolly | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11753 | 0 | 0 |
| deepseek | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3138 |
| google-gemma | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1746 | 0 | 0 |
| google-palm | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 24015 | 0 | 7867 |
| google-t5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5777 | 0 | 0 |
| human | 0 | 3959 | 0 | 1015 | 0 | 655 | 0 | 1012 | 0 | 29161 | 0 |
| meta-llama | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 30294 | 0 | 16087 |
| mistral | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3119 | 0 | 0 |
| openai-gpt3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11989 | 0 | 0 |
| openai-gpt3.5 | 6948 | 0 | 1868 | 0 | 1209 | 0 | 1694 | 0 | 37259 | 0 | 8384 |
| openai-gpt4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5906 | 0 | 3053 |
| other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 33570 | 0 |
| stability | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 62 | 0 | 0 |
| zhipu-glm | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 55 | 0 | 0 |

## By writer l1

| writer_l1 | train_clf/ai | train_clf/human | train_meta/ai | train_meta/human | calib/ai | calib/human | test/ai | test/human | ood/ai | ood/human | ood/mixed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| non_native | 0 | 2331 | 0 | 583 | 0 | 377 | 0 | 617 | 0 | 2500 | 0 |
| unknown | 8578 | 1628 | 2303 | 432 | 1488 | 278 | 2088 | 395 | 178244 | 60231 | 46756 |

## By edit type

| edit_type | train_clf/ai | train_clf/human | train_meta/ai | train_meta/human | calib/ai | calib/human | test/ai | test/human | ood/ai | ood/human | ood/mixed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ai_polish | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10815 |
| ai_polish_1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1112 |
| ai_polish_10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1313 |
| ai_polish_20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1322 |
| ai_polish_35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1344 |
| ai_polish_5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1158 |
| ai_polish_50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1300 |
| ai_polish_75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1296 |
| ai_polish_extreme_minor | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1249 |
| ai_polish_major | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1173 |
| ai_polish_minor | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1318 |
| ai_polish_slight_major | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1304 |
| back_translation | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11033 | 0 | 11041 |
| char_attack | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11150 | 11190 | 0 |
| char_word_attack | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11134 | 11190 | 0 |
| dipper_paraphrase | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11000 | 0 | 11011 |
| expert_edit | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1910 | 0 | 0 |
| humanizer | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100 | 0 | 0 |
| llm_edit | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12032 | 0 | 0 |
| llm_polish | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11112 | 0 | 0 |
| none | 8578 | 3959 | 2303 | 1015 | 1488 | 655 | 2088 | 1012 | 76091 | 29161 | 0 |
| prompt_few_shot | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10522 | 0 | 0 |
| prompt_sico_evasion | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11017 | 0 | 0 |
| word_attack | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11143 | 11190 | 0 |

