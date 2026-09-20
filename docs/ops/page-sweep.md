# Page sweep — every reachable page, every persona (G20-F2)

Owner: CTO (tooling) · QA lead (the live-qa lane). Spec: `docs/plans/g20-ready-for-sale-2026-09-20.md` § 3 F2.

Related: `web/scripts/page-sweep.mjs` (CLI), `web/scripts/lib/page-sweep-core.mjs` (pure helpers —
route enumeration, persona classifier, allow-list, judge, summary), `web/scripts/page-sweep.test.mjs`,
`web/tests/live-qa/33-page-sweep.spec.ts` (the signed-in lane inside `npm run qa:live`),
`web/tests/live-qa/lib/console-guard.ts` (the console/network allow-list the core mirrors),
`web/scripts/crontab.production` (`# G20-F2`).

---

## 1. What it does

1. **Enumerates** every `page.tsx` under `web/src/app` (route groups `(x)` stripped, `api/` skipped,
   parallel slots / intercepting routes ignored). Dynamic segments (`[projectId]`, `[slug]`, …)
   resolve from a fixtures map; unresolved ones are **skipped and listed**, never guessed.
2. **Classifies** each route by the persona it requires — from the route group and URL prefix, plus
   the visible gate in the page source (`requireTierForPage({ feature, minTier })`, an admin-role
   check):

   | persona | routes |
   | --- | --- |
   | `admin` | `/admin/**`, `/dashboard/admin/**`, any page with a `role !== "admin"` check |
   | `reseller` | `(reseller)` group, `/reseller/**` |
   | `accelerator` | `/workspace/accelerator(s)/**`, `/workspace/lp-report` |
   | `evaluator` | `/workspace/investor/**`, `/workspace/evaluations/**`, `/workspace/advisor/**` |
   | `founder` | every other `(app)` route, `/onboarding`, `/checkout/**` |
   | `public` | everything else (marketing, `/tools`, `/showcase`, `/vi`, …) |

3. **Visits** every route with a Chromium context per persona (a Playwright storage-state file;
   `public` = empty cookie jar), `domcontentloaded` + a 700 ms settle, then records per page:
   `status`, `final_url`, `h1_count` + text, `console_errors[]`, `failed_requests[]` (same-origin
   ≥ 400 or network-failed, minus analytics beacons, `favicon`, aborted RSC prefetches and `_rsc=`
   fetches), `overflow_375` (viewport set to 375 px; any element past the right edge outside an
   `overflow-x` scroller, or a document wider than the viewport), `missing_alt[]`, `has_main`,
   `gate_markers[]` (`data-testid` containing gate/locked/paywall/upgrade), `error_boundary`
   (every route `error.tsx` marks its rendered branch `data-testid="error-boundary"` —
   `web/src/app/error-boundaries.test.ts` pins that), `ms`.
4. **Judges** each visit (`judge()` in the core):
   - `public` on a signed-in route → must land on `/auth/login` (`anon_not_bounced_to_login`);
   - 5xx / no response / 404 (unless `allow404`) → defect;
   - 402 → fine when a gate marker or a `<main>` rendered (`402_without_gate_card` otherwise);
   - a signed-in route redirecting anywhere but `/pricing`, a shell landing, `/onboarding` or login
     → `unexpected_redirect` (a public → public redirect is the legacy-redirect table at work and
     is judged on what rendered);
   - on a rendered page: `error_boundary`, `no_main`, `h1_count_N` (≠ 1 unless excepted),
     `missing_alt_N`, `overflow_375`, `console_errors_N`, `failed_requests_N`.
5. **Writes** `web/content/reports/page-sweep-latest.json` (every row) and appends one line per run
   to `page-sweep.jsonl` (`{ts, base, label?, routes, pages, defects, by_persona, skipped_dynamic,
   defect_rows}`); both are gitignored runtime outputs like `link-check-*`. Exit 1 on any defect
   unless `--report-only`; 2 on a crash or a lock collision (`/tmp/blockid-page-sweep.lock`).

Console allow-list — replicated from `console-guard.ts` and pinned by
`scripts/page-sweep.test.mjs` (every constant must appear verbatim in the TS file): ≤ 2 CSP
inline-script refusals while the served HTML carries the Cloudflare tag gateway; the
`email-decode.min.js` refusal + React #418 while the HTML carries email obfuscation; the
"Failed to load resource" echo of an allowed request; the FedCM lines Google Identity Services logs
in a browser with no Google account (`Not signed in with the identity provider.`,
`Provider's accounts list is empty.` — G20-F2).

## 2. How to run

```sh
cd web

# Public routes, anonymous (no accounts needed — this is the cron line):
node scripts/page-sweep.mjs --base https://blockid.au

# Signed-in personas — needs storage-state files. The live-qa suite provisions
# and erases its own qa-live-* accounts; run the lane instead:
#   pgrep -af "qa-live|playwright|deploy-live"     # never two live-qa runs at once
LIVE_QA_ALLOW_DB=1 LIVE_QA_ELEVATE=1 bash scripts/qa-live.sh --wait -- \
  tests/live-qa/28-dossier.spec.ts tests/live-qa/33-page-sweep.spec.ts
# (28 registers + types the evaluator seat that 33 re-uses; LIVE_QA_SPEND_OK stays 0.)

# Ad-hoc with states kept from a debugging run (LIVE_QA_KEEP_ACCOUNT=1 — never in cron):
node scripts/page-sweep.mjs --state founder=test-results/live-qa/storage-state.json \
  --state evaluator=test-results/live-qa/evaluator-storage-state.json \
  --fixtures /tmp/fixtures.json --all-personas
#   fixtures.json: {"[projectId]":"<uuid>","[slug]":"<project-slug>","[evaluationId]":"<uuid>"}
#   --persona founder · --route /workspace/plan (substring) · --limit 40 · --report-only
#   --all-personas also visits every signed-in route anonymously (must bounce to login)
#   and evaluator/accelerator routes as the founder (must gate/redirect, never crash).
```

The lane (`33-page-sweep.spec.ts`) runs three persona sweeps, one browser context each with 4
pages in flight, ≤ 4 min per persona, then writes the same report with `label: "live-qa"`:

- **founder** — the run's account on Free; routes that gated (redirect to `/pricing`, 402, gate
  marker) are re-visited on Growth when `LIVE_QA_ELEVATE=1` (`elevatePlan`, same step as
  `01-elevate`); the credit balance is asserted unchanged (nothing is ever clicked);
- **evaluator** — the seat `28-dossier` registered and typed `investor_angel`
  (`evaluator-storage-state.json`; skipped when the lane did not run);
- **accelerator** — the SAME seat re-typed `accelerator` (+ plan `accelerator_starter` when
  elevated) for the duration of its sweep, then restored to `investor_angel` in a `finally` — the
  register bucket is 3 / 15 min per IP and the founder, member and evaluator registers hold the
  three (`lib/db.ts` `setAccountType` / `elevatePlan` already accept both values).

Dynamic segments resolve from the run state: `[projectId]` (founder's project; the evaluated
project for the evaluator/accelerator seat), `[slug]` (project slug), `[evaluationId]`
(`dossier.evaluationId`), `[roundId]` (`fundraise.roundId` when 06 ran), `[chapter]` = `01-vision`,
`[role]` = `cfo`, `[id]` (a report id when 20-funding ran, else a nil uuid → 404 allowed). Everything
else (`[scenarioId]`, `[modelId]`, `[startup_id]`, `[batchId]`, `[founderId]`, admin `[code]`/`[id]`,
`[metric]`) is skipped and listed under `skipped_dynamic`.

## 3. Exceptions (`PAGE_SWEEP_EXCEPTIONS`)

| route | exception | reason |
| --- | --- | --- |
| `/docs/design-system` | `h1: 7` | noindex typography specimen page — every display / h1 level renders a real `<h1>` on purpose (golden-snapshot QA target) |
| `/workspace/reports/[id]` | `allow404` | G19-owned report page; a sweep-only run has no completed analysis, so the fixture id answers 404 |

## 4. Baseline + defect table (2026-09-20)

_Filled in from the first production run — see § 4.1 for the numbers and § 4.2 for every defect,
its owner and the fix commit._

### 4.1 Numbers

PENDING_NUMBERS

### 4.2 Defects

PENDING_DEFECTS

## 5. Cron proposal (not installed by this lane)

Append to `web/scripts/crontab.production` under `# G20-F2` and `crontab` it when the founder
approves — Sunday 04:30 UTC, after the 03:00–04:00 Sunday jobs (restore drill, disk cleanup,
backtest, model discovery) and before the 04:45 migration audit:

```cron
# G20-F2 (2026-09-20) — weekly public page sweep (Playwright chromium, read-only GET,
# anonymous; own pid lock /tmp/blockid-page-sweep.lock). Every page.tsx route the
# public persona reaches: status, one h1, console, failed requests, 375 px overflow,
# alt, main, error boundary → content/reports/page-sweep.jsonl + -latest.json.
# Exits 1 on any defect. The signed-in personas run inside the weekly live-qa
# suite (33-page-sweep.spec.ts) with the suite's throw-away accounts.
# Docs: docs/ops/page-sweep.md.
30 4 * * 0 cd /home/dovanlong/blockid.au/web && node scripts/page-sweep.mjs --base https://blockid.au --persona public >> /data/logs/blockid-page-sweep.log 2>&1
```

## 6. Reading a failure

- `anon_not_bounced_to_login` — a signed-in route rendered for an anonymous visitor: the
  `(app)/layout.tsx` gate or a page outside the group is missing its auth check. P0.
- `error_boundary` — a route `error.tsx` mounted (unhandled throw in a server component / loader).
  The console row usually carries the digest; `docs/ops/error-digest.md` has the server side.
- `h1_count_0` — the page has no heading (often an empty state that renders nothing); `h1_count_2+`
  — a shell + page both render one, or a component reused as a section still carries its `<h1>`.
- `overflow_375` — the row's `overflow_wide[]` lists the first elements past the edge. Typical
  causes: a `grid lg:grid-cols-N` with no base track (`grid-cols-1` + `min-w-0` on the items — the
  implicit `auto` track grows to a wide table's min-content even inside `overflow-x-auto`); an
  unwrapped inline `<code>` / long identifier (`[overflow-wrap:anywhere]`); a `shrink-0` badge next
  to a title (`flex-wrap`).
- `failed_requests_N` — a client fetch answering ≥ 400 on load: a `next/link` to an `/api` route
  (prefetch → `?…&_rsc=` → 400; use `<a>`), a page calling an authed API anonymously, or a missing
  fixture.
