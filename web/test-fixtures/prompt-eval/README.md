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

## Promotion rule

`web/src/lib/ai/eval-runner.ts::shouldPromote(result)` returns `true`
iff:

- accuracy ≥ 0.80
- hallucination ≤ 0.02
- no case triggered a hard-fail signal

When a canary passes, the nightly cron calls `promoteCanaryToProd()`
from the prompt registry. When it fails, the canary stays canary and the
`evaluation_result` JSON on `prompt_versions` records what missed.
