---
name: screenshot-tour
description: Capture and verify BlockID feature-tour screenshots via the Playwright driver. Use when the user says "screenshot tour", "capture tour", "tour capture", or "regenerate tour images".
arguments: [tour_id]
allowed-tools: Bash, Read, Write, Edit
---

# Screenshot Tour

Drive the feature-tour screenshot pipeline defined by
`scripts/tour-capture.mjs` + `scripts/tour-verify.mjs`, reading the tour
registry from `web/src/lib/product-tour/feature-tours.ts` (or the fallback
inside `tour-capture.mjs`).

**Argument:** `$0` — tour id from the FEATURE_TOURS registry (default:
`onboarding`; pass `list` to enumerate tours; pass `all` to capture every
tour).

## Steps

1. **Pre-flight**
   - Confirm the local dev server is up:
     `curl -sf http://localhost:3000/ >/dev/null || echo "start dev: cd web && npm run dev"`
   - If chromium is missing, the driver will exit with the exact
     `npx playwright install chromium` command — surface it verbatim.

2. **List (when arg is `list`)**
   - Run: `cd web && npm run tour:capture -- --tour=list`
   - Report the tour ids and titles to the user.

3. **Capture**
   - Run: `cd web && npm run tour:capture -- --tour=<id>`
   - PNGs land in `web/public/tour/<id>/step-*.png` alongside `manifest.json`
     (with gitSha + step metadata).

4. **Verify**
   - Run: `cd web && npm run tour:verify -- --tour=<id>`
   - Drift rows append to `web/content/reports/tour-drift.jsonl`; non-zero
     exit means UI changed vs baseline.

5. **Commit immediately**
   - Per the autonomous git-reset memory rule, stage and commit the freshly
     captured assets right away — a background loop runs `git reset --hard`.
   - `git add web/public/tour/<id>/ web/content/reports/tour-drift.jsonl`
   - Commit with a message like `chore(tour): recapture <id> screenshots`.

## Safety

- The driver refuses `--baseUrl=https://blockid.au` (allow-list: localhost,
  127.0.0.1, `*.local`, and `staging.blockid.au` only with `--allow-staging`).
- Do NOT commit `.env.local` or demo-founder credentials.
