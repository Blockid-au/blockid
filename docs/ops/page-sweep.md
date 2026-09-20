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

First production runs, 2026-09-20 (v3.16.0 live; fixes below are in the G20-F2 branch, not yet
deployed — the next lane-33 run after the merge is the "after" number).

### 4.1 Numbers

| persona | source | pages | 200 | gate | redirect | login | defects before → after fixes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| public (anonymous) | CLI, 369 routes, 58 dynamic skipped | 136 | 115 | 0 | 21 | 0 | 40 → 26 (judge) → **17 expected** after the branch deploys (16 showcase `no_main` + `/tbr/demo` = G19) |
| founder (Free/Growth) | lane 33, run 2 | 0 | — | — | — | — | not swept: the lane asserted `> 100` routes before sweeping (90 enumerated) — threshold fixed to `> 60`; **main session runs lane 33 after the merge** |
| evaluator (investor_angel) | lane 33, run 2 | 14 | 13 | 1 | 0 | 0 | 3 → 0 expected |
| accelerator (accelerator_starter) | lane 33, run 2 | 8 | 8 | 0 | 0 | 0 | 5 → 0 expected (3 were the shared `svi` 20/min bucket — see below) |

### 4.2 Defects

| route | persona | defect | owner / fix |
| --- | --- | --- | --- |
| `/changelog`, `/legal/[doc]` | public | `overflow_375` — unwrapped inline `<code>` | F2 · `d7369651e` |
| `/dataset` | public | `failed_requests_1` — `next/link` to `/api/index/svi` prefetched with `&_rsc=` → 400 | F2 · `6e8cc4bc8` |
| `/version` | public | `no_main`, `overflow_375` | F2 · `6e8cc4bc8` |
| `/developers/api` | public | `overflow_375` — card grid auto track | F2 · `6e8cc4bc8` |
| `/tools/cap-table`, `/tools/equity-split`, `/tools/funding-plan`, `/tools/safe-calculator` (+ `/tools/term-sheet` same pattern) | public | `overflow_375` — 706 px at 375 px (implicit grid track + 640 px table) | F2 · `6e8cc4bc8` |
| `/status` | public | `error_boundary` false positive ("Application errors (1 h)" prose) | F2 tooling · `6e8cc4bc8` (boundary marker) |
| `/auth/login` + every `?next=` bounce | public | FedCM / One Tap console lines in a browser with no Google account | F2 allow-list · `6e8cc4bc8`, `faae20c2a` |
| `/register`, `/svi`, `/score`, `/idea-lab`, `/idea-clarify`, `/guide/reports`, `/reports/samples` | public | `unexpected_redirect` — legacy-redirect table | F2 judge · `6e8cc4bc8` (public → public redirects judged on what rendered) |
| `/docs/design-system` | public | `h1_count_7` | exception (§ 3) |
| `/showcase/**` (16 pages) | public | `no_main` — the showcase shell renders no `<main>` landmark | **G19** (showcase is the peer's) — report to SOT G19 |
| `/sample-business-report` | public | `no_main`, `overflow_375`, `GET /api/svi/report/peers?projectId=sample` → 401 in the console | **G19** (`workspace/reports/business/business-report-client`) |
| `/tbr/demo` | public | `overflow_375` — `components/tbr/v2/valuation.tsx` table (`mt-1 w-full text-xs`) has no `overflow-x-auto` wrapper | **G19** (`components/tbr/**`) |
| `/workspace/advisor/notes`, `/workspace/advisor/roster` | evaluator | `h1_count_0` — the whole page sat inside the client `<FeatureGate>` (nothing renders until `/api/entitlement/me`; the Scout plan lacks `advisor.cohort` so the gate card replaced the heading) | F2 · heading moved outside the gate (this commit) |
| `/workspace/accelerator/cohort`, `/workspace/accelerator/quarterly-report` | accelerator | `h1_count_0` — same pattern | F2 · this commit |
| `/workspace/investor/startup/[projectId]` | evaluator | `no_main`, `h1_count_0`, 2 CSP console errors — `redirect()` to the dossier thrown after `workspace/loading.tsx` streamed → Next downgrades it to `<meta http-equiv=refresh>` + two nonce-less inline scripts the CSP refuses; the redirect itself works | F2 tooling follows the streamed redirect and tolerates its 2 refusals (this commit). **Product follow-up (F2/F1, not fixed):** move the `findEvaluationIdForProject` redirect above the loading boundary or drop `loading.tsx` for that segment so it is a real 307 (same class as the G13 `/dashboard` fix). |
| `/workspace/accelerators`, `/workspace/accelerators/criteria`, `/workspace/lp-report` | accelerator | `GET /api/svi/phase-progress` → 429 — the `svi` bucket is 20/min per session and `ProductTour` + `GrowthProgressDashboard` call it on every workspace page; 4 pages in flight × 8 routes tripped it | Sweep artefact (one seat opened 22 workspace pages in ~45 s) — the lane allow-lists exactly `/api/svi/phase-progress` → 429 via `allowRequests` (this commit); **product note for F1/main:** a real accelerator tabbing through 20 workspace pages in a minute hits the same 429 and the tour banner silently stays hidden; consider a `svi-read` bucket (60/min) for `phase-progress` |
| `/workspace/esop/offers` | founder | h1 inside `<FeatureGate>` (same class, found by the guard test, not by a live visit) | documented exception in `feature-gate-heading.test.ts` — owner to move the header out |

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
