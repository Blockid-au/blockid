# Public claims policy (G21 P0-D, 2026-09-20)

**Why.** Trust is the product. An assessment platform that overstates its own traction has no standing to assess anyone else's. Every quantified statement on a public surface — a count, a percentage, a time, a multiple — is therefore classified, sourced and machine-checked before it ships.

**Where.** The ledger is `web/content/claims-register.json`. The guard is `web/src/lib/marketing/claims.test.ts` (extractor in `web/src/lib/marketing/claims.ts`): it walks the marketing trees, extracts every quantified claim and fails CI on any claim that is not in the register. Prices are out of scope here — they are governed by `docs/ops/pricing-truth.md` and `stripe-map.test.ts`.

## 1. The three classes

| Class | Meaning | May be presented as |
|---|---|---|
| **Proven** | A production fact: a code constant, a database count from a committed script, a signed contract, a published policy. Reproducible by anyone with the repo. | Fact. ("The Startup Value Index scores eight dimensions.") |
| **Observed** | Measured on limited customer usage or on production runs, but not yet at a sample size that generalises; or a third-party statistic cited on the surface with its source. | Observation with its scope. ("A first score is shown in about 60 seconds.") |
| **Hypothesis** | A model output, a target, an estimate or an illustrative sample; something the paid pilots are designed to measure. | Design intent + how it will be measured. Never as traction. |

A hypothesis is **never** presented as traction, and an observed figure is never rounded up into a promise.

## 2. Examples

| Bad | Good |
|---|---|
| "Reduces screening cost by 80%." | "Designed to reduce first-pass screening time — paid pilots will measure the actual reduction." |
| "Trusted by Australia's leading accelerators." | "Built for accelerators, incubators, universities and innovation programs." (no logos without permission) |
| "Predicts which startups will raise." | "Calibration is published: index at first score versus raise, revenue and survival outcomes, with n and confidence intervals." |
| "Scores above the Australian average." | "Above the stage median of the current cohort (n = 34)." |
| "Thousands of startups scored." | The actual count from `scripts/traction-snapshot.mjs`, dated, or nothing. |

## 3. Rules

1. **Every number on a public surface is in the register** with `id`, `claim`, `class`, `value`, `source`, `surfaces`, `reviewed` and the `patterns` the extractor matches. The guard prints the exact token to add.
2. **Source is a path**: a code constant (`src/lib/report-pipeline/dimension-owners.ts`), a committed script (`scripts/…`), a document (`docs/ops/pricing-truth.md`) or a cited external page. "Founder said so" is not a source.
3. **External statistics** are registered as *observed* only while the citation is on the surface next to them; uncited they are *hypothesis* and must be cited or removed. The register notes an `UNSOURCED` source explicitly so the gap is visible (example on 2026-09-20: the 70 % cap-table line on `/about/invest`).
4. **Illustrative samples** (the homepage sample runs, demo reports) are labelled as samples on the surface and registered as *hypothesis* — they are not BlockID results.
5. **Benchmarks** follow `docs/product/score-governance.md` § 7: no percentile below n = 10, "indicative" from 10–29, always with n, never "Australian average" without n.
6. **No user counts, no agent counts, no provider counts** on public surfaces (`docs/design/messaging.md` § 11).
7. **Review date**: every row carries `reviewed`; rows older than 90 days are re-verified at the next release review. A row whose patterns no longer appear on any surface is removed (the guard fails on stale rows).
8. **Pitch decks** read the register: the validation slide of `content/pitch/pitch-deck-v4.md` may only carry numbers that are *proven* or *observed* here; everything else is worded "paid pilots will measure …".

## 4. How to add a claim

1. Write the sentence on the surface.
2. Run `npx vitest run src/lib/marketing/claims.test.ts --project unit`; the failure names the file, line and the normalised token (for example `token "eight dimensions"`).
3. Add a row to `web/content/claims-register.json` (or a pattern to an existing row when it is the same fact) with the class, the source path and today's date.
4. If the class is *hypothesis*, re-read the sentence: it must say what will measure it.

## 5. What the extractor deliberately ignores

Prices (`A$…`), CSS / Tailwind values, code comments, import lines, `_comment.*` message keys, the history pages (`/roadmap`, `/changelog` — release facts with their own guard) and the calibration page (statistical labels rendered from the backtest JSON). Small spelled-out numbers (one … five) are not extracted; a sentence such as "two founders" is copy, not a claim.
