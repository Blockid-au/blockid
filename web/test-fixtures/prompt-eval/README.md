# prompt-eval fixtures

Seed directory for the `/api/cron/prompt-eval-nightly` route
(Master Upgrade Plan §17.10 item H).

## Naming

`{agent}-{version}.json` — e.g. `ceo-v3.json`, `llm-auditor-v2.json`.

The nightly cron reads `prompt_versions` rows whose `status IN
('shadow','canary')` and attempts to `readFile` the matching fixture.
Missing fixtures are surfaced in the route response
(`missingFixtures[]`) so the ops dashboard can flag "canary without a
golden set".

## Fixture shape (TBD, follow-up PR)

```json
{
  "cases": [
    {
      "id": "case-1",
      "input": { ... },
      "goldenOutput": { ... },
      "assertions": ["...contains ABN...", "...trust_score in [0,100]..."]
    }
  ]
}
```

Until the eval loop ships in a follow-up PR, this directory exists so
the route deploys cleanly and returns `evaluated: 0`.
