# web/public/tour/

Generated screenshot-tour assets. **Do not hand-edit.**

Each subdirectory is one tour (id from the `FEATURE_TOURS` registry) and
contains:

- `step-<id>.png` — one PNG per tour step, captured at 1440×900 in en-AU /
  Australia/Sydney, animations disabled.
- `manifest.json` — capture metadata (gitSha, capturedAt, per-step path +
  caption).

## Regenerating

```bash
cd web
npm run tour:capture -- --tour=<id>   # or --tour=all
npm run tour:verify  -- --tour=<id>   # pixel-diff vs the committed baseline
```

The driver is at `scripts/tour-capture.mjs`; the registry it walks is
`web/src/lib/product-tour/feature-tours.ts` (fallback: a small hardcoded
registry inside `tour-capture.mjs`).

## Related

- Skill: `.claude/skills/screenshot-tour/SKILL.md`
- Drift log: `web/content/reports/tour-drift.jsonl`
- Nightly capture: `web/scripts/crontab.production`
