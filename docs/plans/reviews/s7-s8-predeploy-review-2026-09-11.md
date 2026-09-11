> **Disposition (2026-09-11 02:40 UTC):** no P0/P1. P2 #2 #3 #4 #5 #6 #7 fixed on master in the same commit as this file; #1 (retroactive trial count) is moot — `subscription_trial_state` had 0 active trials at review time.

# Review: S7 (`f2f7d3326..3bf836a36`) + S8 (`3bf836a36^..2e96296de`) — behaviour regressions before next deploy

Scope: user-visible behaviour only. Every finding below was verified by reading the code + colocated tests
(17 test files / 252 tests in the touched modules pass locally: `npx vitest run …`). Live build is still
`fea2aa62b` (pre-S7), so nothing here could be checked against production; unverifiable items say so.

## Findings

**No P0.** Nothing in either range breaks a live flow or forces a rollback on its own.

### P1

_None confirmed._ The one candidate (trial quota reinterpretation, below) is the specified G12 §3b behaviour;
it is listed as P2 because the affected cohort is evaluators who started a card trial after 2026-09-10.

### P2

1. **Trial quota is applied retroactively to trials already running** — `web/src/lib/evaluations/report-quota.ts:392-399`
   (`getReportQuota` → `trial.active` → `countTrialReportsUsed` counts every `paid_via='quota'` row since `trial_start`).
   Scenario: a Firm/Program evaluator who started a trial on 2026-09-10 and already ran ≥1 full report on the plan quota
   is, at the swap, at `remaining=0`; `evaluation-batch-runner/route.ts:164-169` then fails every still-queued batch item
   with `quota_exhausted`, and direct runs flip to 3 credits (402 `via:"none"` when balance < 3). Not a brick, but silent.
   Fix: seed the count from `max(trial_start, <deploy timestamp>)` for one cycle, or message the affected users (query
   `subscription_trial_state.status='trialing'` × evaluator plan ids).
2. **`countTrialReportsUsed` with `trial_start = null` counts all-time** — `report-quota.ts:377-379` → `countQuotaUsed(userId, null, null)`.
   The webhook writes `trial_start: toIso(sub.trial_start)` (`stripe/webhook/route.ts:1476`) which is `null` when Stripe omits it;
   a re-trialling or previously-paid user would then show "1/1 used" immediately. Fails toward credits, never blocks.
   Fix: `if (!trial.started_at) return 0;` (or fall back to `trial_end - 7d`).
3. **`getCurrentUser()` now runs 3× per founder request and is not memoised** — `(app)/layout.tsx:58`, `(app)/(founder)/layout.tsx:27`,
   plus every page. `lib/auth.ts:372` has no `React.cache`; each call = `sessions` read + `app_users` read + a fire-and-forget
   `sessions.update`. The founder layout adds `getActiveProject` + one `svi_analyses` read (`founder-phase.ts:181-207`), so
   +4 serial local-Supabase round-trips. Layout and page render concurrently, so TTFB impact is small; the write
   amplification on `sessions.last_used_at` is the real cost. Fix: `export const getCurrentUser = cache(async () => …)`.
4. **Gate 12 warm-up does not cover the 5 new hydrated routes** — `web/scripts/deploy-live.sh:1118` `WARMUP_URLS` still only lists
   `/ /pricing /pricing?tier=accelerator /roadmap /dashboard/portfolio`. `(marketing)/layout.tsx` calls `headers()` (CSP nonce), so
   `/funding`, `/funding/report/demo`, `/docs/unlocks`, `/compare/chatgpt`, `/solutions/accelerator` are all request-rendered
   and cold after the swap. The first spec (`post-deploy.spec.ts` "/funding — hero + 3-question intake") has a 15 s *total*
   budget covering cold goto + hydration probe + 5 form steps + a live `POST /api/funding/preview`. One auto-retry exists
   (`playwright.config.ts:33`), and the preview limit is 30/10 min per IP (`preview/route.ts:29`) so 2 hits per run are safe.
   Likely flake only on a slow cold start. Fix: append the five paths to `WARMUP_URLS`.
5. **400 px overflow assertion measures before fonts/images settle** — `post-deploy.spec.ts` ("no horizontal page overflow"):
   `goto(domcontentloaded)` → form visible → `scrollWidth` immediately. A late web-font swap or a lazy image can widen an
   inline element after the read; the mobile sheet is *not* a factor (`nav-v2.tsx:826` renders it only when `mobileOpen`).
   Could not run it here (S8 not built locally). Fix: `await page.evaluate(() => document.fonts.ready)` +
   `waitForLoadState("networkidle")` before measuring.
6. **Trial-end email date is server-TZ (UTC) while the banner is AEST** — `cron/trial-end-reminder/route.ts:138-143`
   (`toLocaleDateString("en-AU", …)`, no `timeZone`; box is UTC) vs `trial-report-banner.tsx:44-50` (`Australia/Sydney`).
   A trial ending 00:00–10:00 AEST names a different weekday in the email than on the page. Pre-existing, but S7-C's stated
   goal is "banner and dialog never disagree". Fix: add `timeZone: "Australia/Sydney"` in the cron formatter.
7. **`dns.lookup(..., { verbatim: true })` is the deprecated spelling** — `lib/security/outbound-url.ts:152`. Node 22.23 on the box
   still honours it (doc-deprecated; `order` is the replacement). Harmless today. Fix: `{ all: true, order: "verbatim" }`.

## Checked OK

- **S7-A phase resolver.** `/dashboard` phase = `max(navPhaseFromSvi, navPhaseFromGrowthPhase)` (`dashboard/page.tsx:708-711`);
  old `computePhase` band table moved verbatim → phase is ≥ pre-S7 for every founder, never fewer groups. Sidebar fallback is
  prop > context > 0 (`workspace-layout.tsx:449`, `founder-nav-context.tsx:48`); no page in `(founder)` passes a lower explicit
  prop (`funding/page.tsx:213` now passes the resolver's value instead of `projects.stage`). Reseller / compliance / admin shells
  are outside the group → context `null` → 0 as before. Loader is fully try/catch'd, `getSupabaseAdmin()===null` → phase 0,
  PostgREST errors return `{data:null}` → `svi=null`; evaluators/checkout/onboarding under the group just get phase 0/whatever.
- **S7-C trial.** No `subscription_trial_state` row / lookup error / `status!='trialing'` / expired `trial_end` → `NO_TRIAL`
  → plan quota unchanged (`trialFromState`, `getTrialState`). Founder-plan users never reach `getReportQuota` (`evaluations/page.tsx:58`
  gates on `isEvaluatorUser`); reminder line is gated on `isEvaluatorPlanId` (`trial-end-reminder/route.ts:62`). Program trial + batch:
  1 item passes (`batch/route.ts:109`), >1 → 402 `trial_limit` with copy, runner re-checks per item — never bricks. Rescores are
  always `paid_via='credits'` (`resolveReportCharge` quota branch is `kind==="full"` only) and rows are written only after a
  successful pipeline (`[id]/report/route.ts:283`, runner `:188`) → neither counted. Banner/dialog dates in `Australia/Sydney`.
- **S8-C CSRF.** `rejectCrossSite` rejects only `Sec-Fetch-Site: cross-site`; absent header, `none`, `same-origin`, `same-site`
  all pass (`request-guards.ts:81-87`, tests). All 11 guarded routes are called only by same-origin `fetch()` from app components
  (dashboard/widget-grid, investor-visibility-form, funding-review-client, funding-paywall, grant-draft-editor,
  report-owner-actions, batch-dialog, report-dialog, evaluations-client incl. claim). No `<form action>` posts, no partner/embedded
  widget; reseller `*.blockid.au` subdomains (`proxy.ts:193-203`) are `same-site`; Stripe returns are GET; curl/cron have no header.
- **S8-C SSRF.** All 100 seed hosts are public `https://` FQDNs (business.gov.au → www redirect is a normal hop). Redirects are
  followed manually ≤5 hops, each re-checked; `dns_failed` / private → `refused` result, never a throw (`fetch-source.ts:118-163`),
  and `refresh.ts:350-368` counts it as `errors++` per row — the Sunday run continues. `dns.lookup` works in standalone.
  GrantConnect alt-feed now restricted to the same host (`refresh.ts:442`); the real feed is on `www.grants.gov.au` itself.
  Cron auth: `cron-runner.sh:101` sends `Authorization: Bearer $CRON_SECRET`; `isCronAuthorised` accepts exactly that.
- **S8-A SEO.** Layout `FAQPage` removal is safe — `/compare/*`, `/solutions/*`, `/pricing`, tools pages emit their own `FAQJsonLd`.
  Rewritten pages all set `title` via `pageMetadata` (string → root `%s | BlockID.au`, or `{absolute}`); no page lost its title.
  Remaining self-suffixed titles (`/features`, `/roadmap`, `/legal`, …) are untouched pre-existing pages, not regressions.
  Sitemap: `listGrants()` defaults to `exclude_from_matching=false` (`funding/data.ts:66`) so no 404 grant URLs;
  `lastModified` comes from `timestamptz` ISO strings via `new Date()`; `/vi/funding` exists for the hreflang pair.
- **S8-B a11y.** Every `useModalDialog` consumer (batch-dialog, report-dialog, evaluations add-dialog) already had a click-to-close
  button; Escape adds a second path, never removes one. `widget-grid.tsx` keyboard/button moves go through `commit()` →
  `writeLocalLayout` + `syncRef.schedule` (debounced PUT, flushed on unmount) — same persistence as drag.
- **Gate 12 selectors** all exist: `data-funding-intake`, labels `fi-description`/`fi-state`, radio "MVP — …", `aria-pressed`
  sector chips, "Show my matches — free", preview `<h3>` "We found N grants…/No exact matches yet", `demo-report-banner/-cta`
  (`/funding?intent=money`), region "Grants, ranked", SVG `role="img"` titled "12-month funding timeline",
  `unlock-matrix-table`/`unlock-rules-table`, compare headers "BlockID"/"ChatGPT", `pilot-cta-link` →
  `/signup?plan=investor_vc_small&trial=1&from=pilot`. Tests in one file run serially (no `fullyParallel`), so rate limits are safe.
- **Safe redirects.** `safeNextPath` accepts every `next=` the app produces (`(app)/layout.tsx:81` only ever sends a leading-slash
  path); `isUuid` gates match real column types (`projects.id`, drafts, evaluations are `uuid`).
