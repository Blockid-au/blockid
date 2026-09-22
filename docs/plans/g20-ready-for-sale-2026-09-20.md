# G20 — Ready for sale: feature audit, hide the unfinished, every page error-free

> **Planning authority — 2026-09-22:** [G30 SOURCE OF TRUTH](./SOURCE-OF-TRUTH.md) consolidates the next upgrade, priorities, dependencies and sale gates. **PROPOSED / awaiting founder review; implementation not started.** This document is a historical component plan. Its shipped work is retained; residual work is mapped into G30 §3/§12. Older “continuous”, “defaults ship” or lane-launch instructions do not authorise G30 implementation.

**Opened:** 2026-09-20 (founder: "review lại toàn bộ feature, ẩn đi những chức năng thừa hoặc chưa hoàn thành, rà soát toàn bộ các trang trong site để không còn lỗi và fix, commit, deploy live để product ready sale").
**Owner:** Claude session loop — 3 worktree lanes → merge → full vitest → deploy → elevated live-qa + link-check + page sweep → read-only review → fixes → close.
**Tracked in:** `docs/plans/SOURCE-OF-TRUTH.md` § G20.

## 1. Baseline (2026-09-20)
- 367 page routes (`workspace` 117 · `admin` 45 · `showcase` 18 · `tools` 17 · reseller 17 · `dashboard` 16 · `vi` 15 · `funding` 10 · others). Marketing surface (G17) is on one template; workspace/dashboard/tools/showcase/reseller are not audited yet.
- Pages still carrying "not available yet / coming soon" states: `workspace/settings/enterprise` (SSO, white-label), `workspace/score/listing`, `showcase`, `workspace/weekly-digest`, `admin/rnd`, `admin/tokens`.
- Live: v3.16.0, 12/12, elevated live-qa 184/0, link-check 0 broken (public pages only — signed-in pages are not crawled).
- Messaging map `docs/design/messaging.md`, pricing truth `docs/ops/pricing-truth.md`, design contract `docs/design/unicorn-template.md` are the references.

## 2. Definition of "ready for sale"
1. Every page a customer can reach (public, founder, evaluator, accelerator, reseller personas) renders without an error boundary, console error, 404 link, empty-forever state or placeholder copy.
2. Every feature that is exposed in nav/menus/CTAs either works end-to-end on production or is **hidden** (nav row removed, route answers a clean "not offered" page or 404, no CTA points at it). Unfinished = not wired to a real backend, depends on a founder-only secret that is missing (e.g. a connector with no key), or is explicitly "coming soon".
3. The sold ladder (Free / Starter / Growth · Scout / Firm / Program · Fund / Intake link / Index API · Cohort 25/100 · TBR A$3) — each plan's advertised features exist and are entitled correctly (DB `plans.feature_flags`); the buy → trial → cancel → resume path works.
4. No stale claim, no price drift, one message (G18).

## 3. Lanes

**Coordination with G19 (peer session, Report Quality — score ledger, valuation, TBR/ReportV2, synthesis, showcase):** G20 lanes do NOT touch `web/src/lib/report-*`, `web/src/lib/svi/*scor*`, `web/src/components/tbr/**`, `web/src/app/(app)/(founder)/workspace/reports/**`, `workspace/score/**`, `web/src/app/(marketing)/showcase/**` beyond hiding a nav row; defects found there are reported to the SOT G19 block instead of fixed here. Deploys stay serialized behind the peer's batches.

### F1 — Feature inventory + hide the unfinished (founder + evaluator + accelerator workspaces)
Files: `docs/ops/feature-inventory.md` (new: every nav/menu/CTA-reachable feature × persona × status working / partial / hidden, with evidence), `web/src/lib/nav/*` (hubs, user-menu, persona), `web/src/lib/features/flags.ts` (new: `HIDDEN_FEATURES` list read by nav + pages), the pages/components of hidden features (render a short "Not offered yet — talk to us" card instead of a broken flow, `noindex`), `web/src/lib/entitlements.ts` only if a plan advertises a flag that nothing implements.
1. Walk every hub tab, sidebar row, user-menu row and in-page CTA for the 10 personas (`lib/nav/persona.ts`) and classify against production behaviour (read the code path: does it hit a real route/table; does it need a secret that is unset — check `.env` KEY NAMES only via `grep -c "^KEY=" .env` in the report, never values).
2. Hide (not delete): SSO / white-label / any "coming soon" section; connectors without keys (grep `oauth-*`, `connectors/*` for env requirements: QuickBooks? Xero? Stripe Connect? GA4?); `workspace/score/listing` if the Index listing flow is not sellable; `weekly-digest` if it has no data path; showcase entries that are demos of unshipped things; tools under `/tools` that are broken or duplicate (`/tools/*` 17 pages — each must work or go); `innovator/*`, `guide/*`, `guides/*`, `startup-index/*`, `listings/*`, `verify/*`, `es/*`, `ja/*` stubs — decide per page (keep if it works and is linked; hide + redirect to the nearest live page otherwise; add `legacy-redirects.ts` LIVE rows for hidden public paths so nothing 404s).
3. Plan → feature parity: for each public plan, list advertised bullets (`plans-v2.ts`) ↔ the flag that gates it ↔ the page that delivers it; fix wrong bullets or wrong flags (DB row changes = idempotent migration, not applied by you).
4. Tests: nav tests updated; a `feature-inventory.test.ts` that asserts every `HIDDEN_FEATURES` route is not present in nav/sitemap and answers the "not offered" card; existing page tests green.

### F2 — Signed-in page sweep (render + console + a11y on every reachable page, all personas)
Files: `web/tests/live-qa/33-page-sweep.spec.ts` (new), `web/tests/live-qa/lib/*` (persona helpers: founder Free, founder Growth (elevated), evaluator Scout (elevated `investor_angel`), accelerator (`accelerator_starter`) — the existing seat helpers in 22/28/29 specs show how), `web/scripts/page-sweep.mjs` (new: enumerates routes from `src/app` minus dynamic segments without fixtures, drives Playwright per persona, records `{route, persona, status, h1, console_errors, failed_requests, ms}` → `content/reports/page-sweep.jsonl`), fixes for every defect found in the pages/components you own by the finding (coordinate: F1 owns nav/flags; you own page-level rendering bugs, empty states, error boundaries, loading states, mobile overflow).
1. Enumerate: every `page.tsx` under `(app)` + `dashboard` + `workspace` + `tools` + `showcase` + reseller (with the QA reseller fixture if one exists; else skip and list) + `vi`; dynamic segments use the QA project/evaluation ids from run-state.
2. Per page per persona: 200 (or the expected 302/402 for a gate — assert the gate card renders, not a crash), exactly one `h1` or a documented exception, no console errors (allow-list via `console-guard.ts`), no failed same-origin requests, no horizontal overflow at 375 px, every `img` has alt, `main` present.
3. Fix what you find (render bugs, missing empty states, unhandled null data, wrong redirects). Summarise by page in `docs/ops/page-sweep.md` with the fix commit per row.

### F3 — Purchase path E2E + workspace copy sweep
Files: `web/tests/live-qa/34-purchase-path.spec.ts` (new), `web/src/app/(app)/**` copy (workspace/dashboard strings — tone, product names, "8 SVI dimensions", no stale claims — extend `messaging.test.ts` PUBLIC_TREES to `src/app/(app)`, `src/components/workspace`, `src/components/dashboard`, `src/components/svi` with allow-lists), e-mail templates already done (G18-C).
1. Live-qa purchase path WITHOUT spending: Free founder → analyze (seeded) → report page → unlock rail → quote dialog (credits + A$3) → cancel; `/pricing` → Starter CTA → `/signup?plan=founder_starter` renders with trial terms → `POST /api/stripe/checkout` in a mode that returns the session URL without redirect (assert the URL host is checkout.stripe.com, do not open it); evaluator: `/pricing?segment=evaluator` → Scout CTA → register-with-card page renders the 7-day trial + card field; billing page on Free shows no-subscription; `/api/stripe/portal` on Free → 404 no customer (not 500). Everything asserted, nothing paid.
2. Workspace copy sweep per the messaging map (product names, tier names, dimension vocabulary, no "beta", no "coming soon" outside hidden cards, no emoji icons, dates/versions current).
3. Startup Package (A$149) and credit packs: the buy buttons resolve, the quote shows before checkout, the SKUs map to the catalogue (`stripe-map.test.ts` already pins amounts — add the buttons' hrefs/route calls).

## 4. Acceptance
- `docs/ops/feature-inventory.md` complete; every hidden feature unreachable from nav/sitemap and answering a clean card; no "coming soon"/"not available yet" text on any reachable page (guard test).
- Page sweep: 0 error boundaries, 0 console errors, 0 failed requests, 0 overflow across all enumerated pages × personas; `content/reports/page-sweep.jsonl` written; cron weekly (Sun 04:30 UTC) proposed.
- Purchase path lane green; full vitest, tsc, eslint; deploy 12/12 (gate 8 link check); elevated live-qa ≥ 184 + new lanes; production link-check 0 broken.
- Read-only review → fixes → SOT close-out + change-log + memory; `version.json` v3.17.0.

## 5. Founder decisions (defaults ship if silent)
- F-1 Hidden features get a "Not offered yet — talk to us" card (not deleted); the list is in `feature-inventory.md` for the founder to un-hide later.
- F-2 `/tools/*` that duplicate the analyzer or are broken are hidden; the rest stay.
- F-3 `/es`, `/ja` stubs hidden (only `/vi` is a maintained mirror).
