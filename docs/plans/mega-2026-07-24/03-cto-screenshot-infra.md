# CTO Plan — Screenshot / Guide-Media Auto-Capture Pipeline

Date: 2026-07-24
Owner: CTO agent
Scope: Deterministic, repeatable capture of feature-tour screenshots for BlockID
guide walkthroughs, wired to a skill agents can invoke.

## 1. Goal

Every guided walkthrough on blockid.au (onboarding, valuation, tokenization, exit
readiness, reseller admin, etc.) needs a matched set of PNGs stored under
`web/public/tour/<tour-id>/step-N.png`. Today screenshots are hand-captured and
drift out of sync with UI. We want:

- Single command: `npm run tour:capture -- --tour=onboarding` produces N PNGs.
- Deterministic viewport, locale, auth state, and test data.
- Pixel-diff regression to detect UI drift before deploy.
- Invocable from an agent skill (`screenshot-tour`) so any C-Level agent can
  refresh a tour when it edits the underlying flow.
- No Docker, no CI. Runs locally against `http://localhost:3000` (dev) or a
  local staging port. Matches the "Server IS production, deploy from src"
  memory rule.

## 2. Runtime choice — Playwright, not Puppeteer

- `playwright ^1.60` is already a devDependency (used by `test:e2e`).
- `puppeteer-core ^25` is a runtime dep for PDF rendering only; it does not
  ship a chromium binary. Reusing the Playwright chromium keeps one browser
  install for the repo.
- Bootstrap: `npx playwright install chromium` (one-time, guarded by the
  capture script — it detects a missing browser and prints the exact command
  rather than silently failing).

## 3. Component layout

```
web/
  src/lib/tours/feature-tours.ts     # registry of tours + steps (typed)
  public/tour/                       # generated PNGs (gitkept, .png ignored)
    .gitkeep
    README.md                        # explains generated content, do-not-edit
scripts/
  tour-capture.mjs                   # playwright driver (this doc)
  tour-verify.mjs                    # pixel-diff regression driver
.claude/skills/screenshot-tour/
  SKILL.md                           # agent-invocable capture skill
```

`web/scripts/capture-screenshots.mjs` already exists for one-off marketing
shots. The new `scripts/tour-capture.mjs` (repo root `scripts/`, sibling of
`deploy-live.sh`) is tour-aware and is the canonical driver going forward.
The older script stays untouched.

## 4. Tour registry — `web/src/lib/tours/feature-tours.ts`

Typed source of truth. Consumed by (a) the capture driver, (b) any in-app
overlay that renders the walkthrough, (c) the verify script.

```ts
export type TourStep = {
  id: string;                 // stable slug — becomes step-<id>.png
  path: string;               // route relative to baseURL, e.g. "/dashboard"
  waitFor?: string;           // CSS/text selector to await before shooting
  hoverSelector?: string;     // optional highlight target
  clickBefore?: string[];     // selectors to click prior to capture (drawer open, tab select…)
  mask?: string[];            // selectors to blur/redact (dynamic timestamps, avatars)
  viewport?: { width: number; height: number };
  fullPage?: boolean;         // default false — viewport shot
  caption: string;            // used by guide UI + alt text
};

export type FeatureTour = {
  id: string;                 // slug — becomes tour/<id>/ directory
  title: string;
  requiresAuth: boolean;
  role?: 'founder' | 'reseller' | 'admin';
  steps: TourStep[];
};

export const FEATURE_TOURS: FeatureTour[] = [
  {
    id: 'onboarding',
    title: 'Founder onboarding',
    requiresAuth: true,
    role: 'founder',
    steps: [
      { id: '01-welcome',    path: '/onboarding',            waitFor: 'h1', caption: 'Welcome screen' },
      { id: '02-idea',       path: '/onboarding/idea',       waitFor: 'form',caption: 'Describe your idea' },
      { id: '03-svi',        path: '/dashboard',             waitFor: '[data-testid="svi-score"]', caption: 'SVI score' },
      // …
    ],
  },
  // valuation, tokenization, dividend, exit-readiness, reseller-admin
];
```

## 5. Capture driver — `scripts/tour-capture.mjs`

Responsibilities:

1. Parse args: `--tour=<id|all>`, `--baseUrl=http://localhost:3000`,
   `--out=web/public/tour`, `--headed`, `--role=<role>`.
2. Preflight:
   - Ensure Playwright chromium installed; if not, print
     `npx playwright install chromium` and exit non-zero.
   - Ping `${baseUrl}/api/health`; if down, print how to start `npm run dev`.
3. Import `FEATURE_TOURS` via `tsx` (already devDep).
4. For each requested tour:
   - Launch chromium, new context with pinned locale `en-AU`, timezone
     `Australia/Sydney`, viewport `1440x900` (override per step).
   - If `requiresAuth`, authenticate:
     - Preferred: POST to `/api/auth/dev-login` with
       `DEMO_FOUNDER_EMAIL` / `DEMO_FOUNDER_PASSWORD` (env). If that route is
       absent, fall back to Supabase magic-link exchange via
       `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never committed).
     - Persist storageState under
       `scratchpad/tour-auth/<role>.json` for reuse across steps.
   - For each step: goto → run `clickBefore` → wait for `waitFor` → hover if
     set → mask dynamic selectors (`await page.locator(sel).evaluate(el => el.style.filter = 'blur(6px)')`) → screenshot to
     `web/public/tour/<tour>/step-<id>.png` with `omitBackground:false`,
     `animations:'disabled'`, `caret:'hide'`.
   - Also emit `web/public/tour/<tour>/manifest.json`
     `{ generatedAt, gitSha, steps:[{ id, caption, path, file, bytes, width, height }] }`
     — feeds guide UI and the verify step.
5. Exit code: non-zero on any step failure; log which step + which selector
   timed out.

Runtime target: whole suite < 90s on a warm dev server so it fits an overnight
cron slot.

## 6. Verify driver — `scripts/tour-verify.mjs`

- Reads `manifest.json` for each tour.
- Re-runs the same steps into a `scratchpad/tour-verify/<tour>/` staging dir.
- Diffs pixel-by-pixel against the committed baseline using
  `playwright`'s built-in `expect(image).toMatchSnapshot` in a standalone
  harness, or a small `pixelmatch` shim (add `pixelmatch` + `pngjs` as
  devDeps only if needed — first cut can use `Buffer.equals` byte compare
  and only escalate to pixelmatch when false-positives appear).
- Writes a diff report to `web/content/reports/tour-drift.jsonl` (matches the
  existing report pattern).
- Exit non-zero when drift exceeds threshold (default 1% of pixels).

## 7. npm scripts (edit `web/package.json`)

Add under `scripts`:

```json
"tour:capture": "node ../scripts/tour-capture.mjs",
"tour:verify":  "node ../scripts/tour-verify.mjs"
```

Root-relative path because the driver lives at repo `scripts/`, aligning with
`deploy-live.sh` and the other ops scripts. Usage:

```
cd web
npm run tour:capture -- --tour=onboarding
npm run tour:capture -- --tour=all --baseUrl=http://localhost:3000
npm run tour:verify  -- --tour=all
```

Nightly cron entry (adds to `web/scripts/crontab.production`):

```
30 3 * * * cd /home/dovanlong/blockid.au/web && npm run tour:capture -- --tour=all >> /var/log/blockid/tour-capture.log 2>&1
```

## 8. Skill — `.claude/skills/screenshot-tour/SKILL.md`

Shape mirrors `deploy/SKILL.md`:

```
---
name: screenshot-tour
description: Capture PNG walkthroughs for a named feature tour by driving the running dev server with Playwright. Use when the user says "capture tour", "refresh guide screenshots", "screenshot walkthrough".
arguments: [tour_id]
---
```

Steps the skill will follow:

1. Confirm dev server up (`curl -sf http://localhost:3000/api/health`).
2. If tour_id is `list`, print the FEATURE_TOURS ids and exit.
3. Run `cd web && npm run tour:capture -- --tour=<tour_id>`.
4. Diff against committed baseline (`npm run tour:verify -- --tour=<tour_id>`)
   and report drift.
5. If PNGs changed, stage `web/public/tour/<tour_id>/**` and commit with
   message `chore(tour): refresh <tour_id> screenshots` (per the autonomous
   git reset rule — commit immediately or lose work).

## 9. Secrets / credentials

- `DEMO_FOUNDER_EMAIL`, `DEMO_FOUNDER_PASSWORD` in `.env.local` (git-ignored).
- Optional `SUPABASE_SERVICE_ROLE_KEY` (already present for other scripts) as
  the magic-link fallback.
- Driver refuses to run against `blockid.au` — production is not a capture
  target. Baseurl allow-list: `localhost`, `127.0.0.1`, `*.local`,
  `staging.blockid.au` gated behind `--allow-staging`.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Playwright chromium not installed | Preflight prints exact `npx playwright install chromium` command, exits non-zero. |
| Demo account missing | Driver detects auth failure, prints `create-test-accounts.ts` invocation, exits. |
| Flaky selectors → false diffs | Registry requires stable `data-testid` on `waitFor`; `mask` list handles dynamic content. |
| PNG churn bloats git | `web/public/tour/**/*.png` committed but capped ~200KB each via `screenshot({ quality })`; consider Git LFS if size grows past 20 MB. |
| Cron running while dev server down | Cron wraps command in a health-check gate; on failure it logs and exits 0 so alarm doesn't fire spuriously. |
| Drift verify is byte-compare (too strict) | Escalate to `pixelmatch` when first false-positive appears; threshold config in `feature-tours.ts` per tour. |

## 11. Acceptance criteria

- `npm run tour:capture -- --tour=onboarding` writes N PNGs under
  `web/public/tour/onboarding/step-*.png` and a `manifest.json` sibling.
- `npm run tour:verify -- --tour=onboarding` exits 0 on an unchanged UI and
  non-zero (with a jsonl drift row) when a step's screenshot changes.
- `find-skills` lists `screenshot-tour` and its description matches
  the SKILL.md front-matter.
- Nightly cron entry present in `web/scripts/crontab.production`.
- Driver refuses to target `https://blockid.au`.
