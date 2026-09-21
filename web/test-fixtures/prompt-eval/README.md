# prompt-eval fixtures

Golden-fixture set for `/api/cron/prompt-eval-nightly` (Master Upgrade Plan
§6.3 + §15.5). The nightly cron reads every `prompt_versions` row whose
`status IN ('shadow','canary')` and loads the matching fixture from this
directory. Missing fixtures are surfaced in the route response so the ops
dashboard can flag "canary without a golden set".

## Naming

`{agent}-{version}.json` — e.g. `AIR-003-v1.0.0.json`, `AIR-010-v1.2.0.json`.

`agent` matches the `prompt_versions.agent` value. `version` is semver,
prefixed with `v` (`v1.0.0`, `v1.2.0-rc.1`), matching `prompt_versions.version`.

## Shape

```jsonc
{
  "agent": "AIR-003",
  "version": "1.0.0",
  "purpose": "Business capability assessment",
  "cases": [
    {
      "id": "case_1",
      "name": "Founder-led SaaS at Series A stage",
      "input": { "businessId": "…", "areaId": "financials", "…": "…" },
      "expected": {
        "proposed_score": { "min": 60, "max": 80 },
        "confidence":     { "min": 0.5 },
        "must_have_gaps":       ["cap_table_clean", "runway_12mo"],
        "must_not_hallucinate": ["specific_investor_names"]
      }
    }
  ]
}
```

The `expected` block encodes the constraints
`web/src/lib/ai/eval-runner.ts` compares model output against. Each
constraint is optional — omit any field the fixture doesn't want to
assert. See `web/src/lib/ai/eval-runner.ts` for the exact scoring rules
(accuracy points, hallucination hard-fail signal, aggregation).

## Coverage

Ten agents seeded (AIR-001..AIR-010), three cases each — see
[Master Upgrade Plan §6](../../../docs/plans/SOURCE-OF-TRUTH.md) for the
role of each agent in the pipeline.

| Agent    | Purpose                     | Cases                                              |
|----------|-----------------------------|----------------------------------------------------|
| AIR-001  | Discovery                   | S0 fresh idea · S2 traction · S4 Series A         |
| AIR-002  | Evidence classifier         | valid invoice · expired insurance · malformed OCR |
| AIR-003  | Assessment (§6 pillars)     | L&P strong · S&C weak · O&P mixed                 |
| AIR-004  | Risk finder                 | cyber · governance · financial                    |
| AIR-005  | Investment readiness        | pre-seed · seed · Series A                        |
| AIR-006  | Growth coach                | revenue plateau · hiring block · PM misfit        |
| AIR-007  | Compliance mapping          | ASD E8 · ISO 27001 · Modern Slavery               |
| AIR-008  | Procurement                 | SIG Lite · insurance · ABN verification           |
| AIR-009  | Grant eligibility           | R&D TI · ESIC · EMDG                              |
| AIR-010  | Report composer             | exec summary · citation coverage · tone           |

Plus the eight Trusted Business Report chapter fixtures (G13 S-R2/S-R5):
`TBR-<dim>-v2.0.0.json` for `tre mpc ftv ptd cgh iri lco svm`, three cases
each (idea · seed · series A) = **24 cases**. Each case carries the W4
dimension-chapter input (§C.11) and expects `proposed_score` inside the
ANCHORS p25–p75 band, `must_have_gaps`, `must_not_hallucinate`,
`must_cite`, `primary_visual.kind` and — for the 16 cases with evidence
rows — `grounded_share_min: 0.8` (§C.9 citation gate: strengths, gaps,
verdict and criterion-card verdicts must carry an `[ev:<id>]` marker or a
citation). `eval-runner.test.ts` runs a deterministic in-band runner over
all 24 nightly-style (no LLM) so a fixture edit that cannot pass is caught
in CI.

G19 adds two W4-shaped fixtures pinned by `report-pipeline/tbr-fixtures.test.ts`:
`TBR-ledger-v2.1.0.json` (S41 score ledger — TRE seed, FTV idea *unassessed*,
CGH seed: the verdict must name ≥ 1 `scoreLedger.signals[].signal` it was
given, `verdict_must_mention_any`, and never a signal outside the ledger) and
`TBR-valuation-inputs-v2.1.0.json` (S42/S46 valuation truth — a pre-revenue
case whose verdict must say "pre-revenue" / "Berkus" and where any `ARR A$` /
`MRR A$` figure hard-fails, and a Stripe-connector case whose verdict must
name the source and cite the row).

G23-A adds `TBR-grounding-v2.3.0.json` (pinned by `tbr-fixtures.test.ts`): three
W4-shaped cases with uuid-shaped evidence ids for the three grounding fixes —
(a) an owner payload that quotes Stripe / founder numbers without an id must
ground ≥ 0.85 once `auto-cite.ts` has mapped them (and an invented ARR still
hard-fails), (c) a 100-word verdict is trimmed to the last full sentence within
`verdict_max_words: 80` instead of failing the chapter, (b) a good CMO answer cut
mid-JSON is salvaged (`lib/ai/json-salvage.ts`) and still meets every
constraint. `verdict_max_words` is the new `expected` key (within +1, over -1).

## Promotion rule

`web/src/lib/ai/eval-runner.ts::shouldPromote(result)` returns `true`
iff:

- accuracy ≥ 0.80
- hallucination ≤ 0.02
- grounded share ≥ 0.80 over the cases that had evidence to cite (S-R5;
  cases without evidence rows never block)
- no case triggered a hard-fail signal

When a canary passes, the nightly cron calls `promoteCanaryToProd()`
from the prompt registry. When it misses narrowly, the canary stays canary
and the `evaluation_result` JSON on `prompt_versions` records what missed.
When it fails outright — `shouldDemote()`: a hard-fail, hallucination
> 5 %, accuracy < 50 % or grounded share < 60 % — the cron calls
`demoteCanary()` (status → `rolled_back`, `demoted_reason` stored) and posts
a Telegram ops note; prod is never touched (S-R5, spec §C.10).
