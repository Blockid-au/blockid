# CRO + CMO Review — v2.0.0-beta.6

Date: 2026-07-17
Author: CRO + CMO agents (cross-checked)
Scope: full conversion stack + public marketing surface shipped in beta.6
Peer files:
- `web/content/reports/cfo-review-v2.0.0-beta.6.md` (breakeven math, referenced but not read)
- `web/content/reports/cro-cmo-review-v2.0.0-beta.6.md` (this file)

Executive summary in one paragraph. beta.6 shipped a very ambitious CRO surface — 10 trigger IDs, 4 A/B experiments, 7-step lifecycle emails, upgrade modal + banner, save-offer / downgrade-offer paths — but the wiring audit below shows that most of it is registered without a call site. The public marketing surface is thin: 32 sitemap URLs, five `Compare` nav entries pointing at query-string fragments of `/pricing` (no real `/vs/[competitor]` pages), one publish-insight cron with a last successful run on 2026-06-20, and no scheduled distribution to LinkedIn/F6S/AngelList/Crunchbase. This is a Potemkin conversion stack — the copy is written, the analytics events exist, but no product surface actually fires the triggers or exposes the experiments. v2.1 Week 1 must ship wiring, not new features.

---

## Part A — CRO

### 1. Funnel snapshot (1000-visitor cohort, industry-benchmark assumptions)

No live GA4 pull available in this session — the 2026-07-17 cron-health tail
shows `traffic-report` failing (`Internal Server Error`) since 08:30 UTC, and
`growth-insights` is not in the last 500 rows either. The table below is a
BENCHMARK-BASED model for a B2B SaaS free-tool → trial funnel, not a
BlockID.au traction claim. Every "expected" number is an assumption; do not
put these in an investor deck without a live GA4 tie-out.

| # | Stage | Event (client) | Assumed rate | Expected volume | Benchmark source |
|---|-------|----------------|--------------|-----------------|------------------|
| 1 | land | page_view (any) | 100% | 1000 | tautology |
| 2 | hero_search | `svi_search_submitted` | 22% land→search | 220 | Wynter 2024 SaaS hero-CTA CTR median 18-25% |
| 3 | svi_query | `svi_score_generated` | 65% search→result | 143 | UNKNOWN — no session-level completion metric wired; assume free-tool completion band 55-70% (Databox 2025) |
| 4 | pricing_view | `pricing_viewed` | 40% svi→pricing | 57 | in-product upsell CTR: FirstPageSage B2B benchmark 35-45% |
| 5 | onboarding_start | `signup_started` | 55% pricing→signup | 31 | UNKNOWN for our v2 5-step wizard; SaaS pricing→signup median 30-60% (Baremetrics) |
| 6 | checkout_start | `checkout_started` | 45% signup→checkout | 14 | 5-step wizard drop typical 40-55% (Chameleon 2024) |
| 7 | trial_convert | `trial_converted` | 30% trial→paid on card-required | 4 | Reforge card-required-trial paid conversion median 25-35% |

Load-bearing caveat: rows 3-7 are UNKNOWN in production because:
- `PageViewTracker` fires `pricing_viewed` (verified in `web/src/app/pricing/page.tsx:52`) but the trial-to-paid event isn't wired end-to-end — Stripe webhook writes to `subscriptions` but there is no GA4 `trial_converted` mirror.
- The 30% card-required trial conversion is HALF the experiment premise (see item 3, `trial_cc_required`) — we can't measure lift without both variants firing.

Do not build a Q4 revenue plan off this table. Wire item 5 first.

### 2. Trigger hit-rate audit — 10 triggers, evidence-based

Source of truth: `web/src/lib/conversion/triggers.ts:43-54` (registry) +
`web/src/hooks/useUpgradePrompt.ts:104-113` (client `.request()` API).

Method: grep for `useUpgradePrompt` importers, then grep for `.request(` on
each. Findings below.

`useUpgradePrompt` importers (only 3 files):
- `web/src/components/upsell/upgrade-banner.tsx:13` — consumes `{ trigger, accept, dismiss }`, does NOT call `.request()`.
- `web/src/components/upsell/upgrade-modal.tsx:12` — consumes `{ trigger, accept, dismiss }`, does NOT call `.request()`.
- `web/src/components/upsell/upgrade-copy.ts:3` — imports only the TYPE.

Total `.request(` call sites in the codebase that invoke the upgrade prompt:
zero (the many `.request(` hits in `web/src/lib/wallet.ts` and
`web/src/lib/ai-client.ts` are MetaMask + HTTPS clients, unrelated).

| Trigger ID | Registered at | Fires from | Verdict |
|------------|---------------|------------|---------|
| `feature_gate_hit` | `triggers.ts:44` | analytics-only mirror at `web/src/lib/entitlements.ts:339` (writes `analytics_events`, does NOT call `useUpgradePrompt.request`) | DEAD — telemetry exists, CTA never shows |
| `trial_day_5` | `triggers.ts:45` | none | DEAD |
| `trial_day_6` | `triggers.ts:46` | none | DEAD |
| `trial_day_7` | `triggers.ts:47` | none | DEAD |
| `credits_low` | `triggers.ts:48` | none | DEAD |
| `credits_exhausted` | `triggers.ts:49` | none | DEAD |
| `report_cap_hit` | `triggers.ts:50` | none | DEAD |
| `watchlist_cap_hit` | `triggers.ts:51` | none | DEAD |
| `cohort_seat_cap_hit` | `triggers.ts:52` | none | DEAD |
| `post_cancel_winback` | `triggers.ts:53` | none | DEAD |

Score: 0 / 10 triggers actually fire in the client bundle.

Server side: `web/src/lib/conversion/triggers.ts` also exports `shouldFire()`
and `recordConversionEvent()`, but the only production call site for
`recordConversionEvent` is `web/src/app/api/conversion/track/route.ts:42` — a
passthrough that records whatever the client sends. Since the client never
sends, the `conversion_events` table only receives rows from manual QA.

Implication for beta.6 sign-off. The upgrade modal + banner both READ from
`useUpgradePrompt`, but until some product surface CALLS `.request()`,
`trigger` will always be `null` and both components render nothing. This is
end-to-end untestable in production today.

Minimum wiring for v2.1 Week 1 to make triggers non-dead:

| Trigger | Suggested call site | File |
|---------|---------------------|------|
| `feature_gate_hit` | Gate wrapper on locked features | new `web/src/components/entitlement/gate.tsx` (calls `.request()` when children would render locked) |
| `trial_day_5/6/7` | Workspace layout mount, check `subscription_trial_state.trial_end` day offset | `web/src/app/workspace/layout.tsx` |
| `credits_low` | Credit meter component | `web/src/components/credits/meter.tsx` (fires at <20%) |
| `credits_exhausted` | Same, at 0 | same |
| `report_cap_hit` | Report generation endpoint 402 response handler | `web/src/app/api/reports/generate` client caller |
| `watchlist_cap_hit` | Watchlist add button | `web/src/components/watchlist/add-button.tsx` |
| `cohort_seat_cap_hit` | Cohort invite modal | `web/src/components/cohort/invite-modal.tsx` |
| `post_cancel_winback` | Post-cancel landing after Stripe portal redirect | `web/src/app/account/billing/canceled/page.tsx` |

None of these files exist as call sites today.

### 3. A/B integrity — 4 experiments in `web/config/experiments.json`

Method: grep for each experiment ID across `web/src`. Findings below.

| Experiment ID | Registered | Exposure API | Exposure client caller | Outcome event | Verdict |
|---------------|-----------|--------------|------------------------|---------------|---------|
| `trial_cc_required` | `experiments.json:3-10` | `web/src/app/api/experiments/expose/route.ts:29-46` (POST accepts arbitrary experiment_id) | NONE — grep `experiment_id` returns zero client callers of `/api/experiments/expose` | `trial_converted` (also not wired end-to-end, see funnel row 7) | DEAD — variant never assigned, outcome never mirrored |
| `pricing_anchor_order` | `experiments.json:12-19` | same generic endpoint | NONE | pricing tile click / plan_selected | DEAD |
| `cap_hit_copy` | `experiments.json:21-28` | same generic endpoint | NONE (also see trigger audit — `feature_gate_hit` itself does not fire) | `conversion_events.action=accepted` from feature_gate_hit | DEAD (dependency of a dead trigger) |
| `day5_email_subject` | `experiments.json:30-37` | consumer would be `web/src/emails/lifecycle/render.ts:38` which accepts an optional `variant` | `web/src/app/api/cron/lifecycle-mailer/route.ts:72-78` calls `renderLifecycleEmail({ step, ... })` WITHOUT passing `variant` — the assign() call from `web/src/lib/conversion/experiments.ts:76` is never made in the cron | DEAD — variant path present, cron never resolves it, `subjectFor()` falls through to the default subject at `render.ts:41` |

Score: 0 / 4 experiments are fully wired (exposure site + outcome mirror).

Root cause: the exposure endpoint at `web/src/app/api/experiments/expose/route.ts`
is a generic passthrough — it will happily assign any experiment_id — but no
component in `web/src/app` or `web/src/components` fetches it. There's no
`useExperiment(id)` hook. The persistence table `ab_assignments` referenced
in `web/src/lib/conversion/experiments.ts:88` will be empty in prod except
for whatever the QA person clicks by hand.

Note. `web/src/app/api/ab/pricing-expose/route.ts` exists (found at line
36 of that file) — this is a SEPARATE, older founding-price experiment
pipeline (`FOUNDING_PRICE_EXPERIMENT`, not in `experiments.json`). It may
be live; audit it in a follow-up. It is not one of the four beta.6
experiments.

### 4. Save-offer economics tie-in

Save-offer paths in beta.6 (referenced in the brief, not re-audited here):
- `COMEBACK30` — 30% off for 3 months on winback.
- `DOWNGRADE_STARTER50` — 50% off Starter tier when downgrading from Founder / Growth.
- `pause_30d` — 30-day pause without cancel.
- `book_call` — human-touch escalation to founder-led sales.

Breakeven math for each is the CFO's territory. See peer file
`web/content/reports/cfo-review-v2.0.0-beta.6.md` — this CRO agent has NOT
read it (peer is writing in parallel per the brief). What this agent needs
from that file before beta.7:

1. Contribution margin per user per month at Founder tier. Needed to size
   the discount cap on `COMEBACK30` (a 30%-for-3-months offer is
   NPV-positive iff `3 * 0.7 * ARPU > CAC_regain + gross_infra_cost`).
2. Blended payback period so we can size `pause_30d` retention lift required
   for the pause path to be net positive (a 30-day pause is a 1/12 ARR hit;
   it must eliminate ≥8% of that user's forward-12-month churn probability).
3. Confirmation that `DOWNGRADE_STARTER50` is layered on top of any active
   annual discount — if a user has both, we must cap combined discount at
   the tier's Rule-of-40 floor.
4. Blended CAC (paid + organic-attributed). Any save-offer that costs more
   than 0.5 * CAC is worse than letting the user churn and re-acquiring at
   month 6 via winback email. Without the CAC number, the `book_call` path
   (which burns ~20 min of founder time = highest-cost intervention) has
   no economic gate.
5. Concurrent-offer rules: is a user in `pause_30d` eligible for
   `COMEBACK30` on resume? Today the exit-survey routing (not audited in
   this pass) does not appear to persist "already used offer" state — a
   user could stack pause → downgrade → comeback and end up paying <50%
   of headline price for 6 straight months.

If the CFO file lands without those five numbers, the CRO save-offer
routing (currently in `web/src/app/api/save-offer` or wherever the
downgrade endpoint lives — not audited in this pass) is running on gut
feel, not math.

Cross-check with cohorts. Even before the CFO numbers land, we can
qualitatively rank the four paths by ICP fit:

| Path | Best for | Worst for | Failure mode if math is wrong |
|------|----------|-----------|-------------------------------|
| `COMEBACK30` | Users who churned for price (survey said "too expensive") | Users who churned for fit (survey said "not what I need") — they'll take the discount and churn again in month 4 | Discount stacking with an active annual coupon |
| `DOWNGRADE_STARTER50` | Users who over-bought at Growth and are actually Founder-tier ICP | Users at Starter already (nothing to downgrade to) | Cannibalises new-Starter revenue if presented too eagerly |
| `pause_30d` | Users with a temporary reason (parental leave, seasonal biz) | Users who won't come back regardless | Silent churn: after 30 days they never resume, and we've lost the ability to trigger `post_cancel_winback` (which itself doesn't fire — see item 2) |
| `book_call` | High-ARPU users only (Growth+) | Starter users — the call cost exceeds LTV | Founder time drain scales with churn volume, not revenue |

Recommendation regardless of what the CFO file says: gate `book_call`
behind `plan_id in ('growth','scale')` AND `mrr >= $300` before beta.7
ships. Currently the exit-survey path (not audited in code here) may
offer this to every cancel event.

### 5. Missing v2.1 CRO surfaces (top 3, as briefed)

**A. Trial-day-3 in-app activation modal.**
Email lifecycle has a `day3` step (`web/src/lib/conversion/lifecycle.ts:35`).
In-app has NOTHING for day 3. Users who don't open the email get zero
activation nudge. Ship: `TrialDay3Modal` inside `workspace/layout.tsx`,
gated on `subscription_trial_state.trial_end - now < 4 days` AND `activation_events` count == 0.
Success metric: activation rate on day 3 lift ≥3 pts.

**B. Post-checkout confirmation upsell to annual (2 months free).**
Stripe portal currently sends users to a plain thank-you. No annual upsell
between the "Card charged, welcome" moment and the workspace. Ship:
`/checkout/success/page.tsx` variant with an "Upgrade to annual, save 17%"
CTA calling `POST /api/stripe/change-plan` with the annual price. Best time
to sell annual is the 90 seconds after they've just committed monthly.
Success metric: annual mix at 30 days ≥15% of new paid users.

**C. Onboarding completion score bar with abandonment recovery.**
5-step wizard is now the sole activation path (beta.6). Zero visibility on
which step users bail at. Ship:
1. Persist wizard step to `onboarding_progress` on every step transition.
2. Render `<CompletionBar step={n} total={5}/>` in the wizard shell.
3. Nightly job (add to crontab.production near line 313) emails users who
   started but didn't finish, referencing the exact step they left at.
4. Only after (1-3) are shipped, wire the corresponding `feature_gate_hit`
   trigger call for the "trial ended, wizard incomplete" case.

---

## Part B — CMO

### 6. SEO audit skeleton — sitemap.ts URL inventory

Source: `web/src/app/sitemap.ts:8-218`. 32 static entries + N dynamic
insight articles from `getAllArticles()`. Every static entry is indexable
by default (no `robots: { index: false }` on any of them; the two `noindex`
routes in the tree — `web/src/app/dashboard/admin/pricing-test/page.tsx:11`
and `web/src/app/admin/pricing-metrics/page.tsx:20` — are correctly NOT in
sitemap.ts).

| # | URL | Canonical set | Page-specific OG image | Flag |
|---|-----|---------------|------------------------|------|
| 1 | `/` | YES `page.tsx:15` | inherit root | ok |
| 2 | `/score` | YES `score/page.tsx:37` | YES `score/page.tsx:23` | ok |
| 3 | `/tools` | YES `tools/page.tsx:44` | YES `tools/page.tsx:30` | ok |
| 4 | `/benchmarks` | YES `benchmarks/page.tsx:37` | (not confirmed in this pass) | check |
| 5 | `/tools/dilution` | YES | YES `dilution/page.tsx:20` | ok |
| 6 | `/tools/safe-calculator` | YES | YES `safe-calculator/page.tsx:23` | ok |
| 7 | `/tools/esop-checklist` | YES | YES `esop-checklist/page.tsx:27` | ok |
| 8 | `/tools/financial-projections` | YES | YES `financial-projections/page.tsx:26` | ok |
| 9 | `/tools/idea-valuation` | YES | YES `idea-valuation/page.tsx:21` | ok |
| 10 | `/tools/cap-table` | YES | YES `cap-table/page.tsx:23` | ok |
| 11 | `/tools/equity-split` | YES | YES `equity-split/page.tsx:23` | ok |
| 12 | `/tools/term-sheet` | YES | YES `term-sheet/page.tsx:24` | ok |
| 13 | `/tools/data-room` | YES | YES `data-room/page.tsx:24` | ok |
| 14 | `/tools/funding-plan` | YES | YES `funding-plan/page.tsx:21` | ok |
| 15 | `/tools/cofounder-match` | YES | YES `cofounder-match/page.tsx:22` | ok |
| 16 | `/tools/asic` | YES | YES `asic/page.tsx:23` | ok |
| 17 | `/tools/esic` | YES | YES `esic/page.tsx:23` | ok |
| 18 | `/tools/rnd-tax` | YES | YES `rnd-tax/page.tsx:22` | ok |
| 19 | `/pricing` | **NO** — grep `canonical` in `pricing/page.tsx` returns empty | **NO** page-specific `openGraph` — grep `openGraph` in `pricing/page.tsx` returns empty | **FLAG** — highest-intent conversion page has neither canonical nor OG image |
| 20 | `/developers` | YES `developers/page.tsx:35` | (not confirmed) | check |
| 21 | `/for/founder` | YES `for/[segment]/page.tsx:41-45` | YES `for/[segment]/page.tsx:46-53` | ok |
| 22 | `/for/investor` | YES (same file, param) | YES | ok |
| 23 | `/for/advisor` | YES (same file, param) | YES | ok |
| 24 | `/for/accelerator` | YES (same file, param) | YES | ok |
| 25 | `/insights` | YES `insights/page.tsx:14` | **NO** page-specific OG on index — inherits root | FLAG minor |
| 26 | `/about` | YES `about/page.tsx:24` | (not confirmed) | check |
| 27 | `/founding-50` | YES `founding-50/page.tsx:79` | (grep `openGraph` on that file returns empty) | FLAG — highest-intent lifetime-deal page missing OG |
| 28 | `/investors` | YES `investors/page.tsx:27` | (not confirmed) | check |
| 29 | `/contact` | YES `contact/layout.tsx:8` | (not confirmed) | check |
| 30 | `/privacy` | YES `privacy/page.tsx:10` | inherit root | acceptable (low-intent) |
| 31 | `/terms` | YES `terms/page.tsx:10` | inherit root | acceptable |
| N | `/insights/[slug]` (dynamic) | YES `insights/[slug]/page.tsx:53` | YES `insights/[slug]/page.tsx:38` | ok |

Also missing from sitemap.ts but present in the tree:
- `/roadmap` — page has canonical (`roadmap/page.tsx:24`) but is NOT emitted by sitemap.ts. Add to sitemap.
- `/changelog` — same (`changelog/page.tsx:17`). Add to sitemap.
- `/status` — same (`status/page.tsx:26`). Add to sitemap.
- `/svi` — `svi/page.tsx:31` has canonical, appears NOT to be in sitemap.ts. Add.

Priority flags for v2.1:
1. `/pricing` — add both `alternates.canonical` and `openGraph.images`. This is the money page; Google is currently free to canonicalise it against `/founding-50` or the homepage.
2. `/founding-50` — add `openGraph.images` pointing to a bespoke lifetime-deal social card.
3. Add `/roadmap`, `/changelog`, `/status`, `/svi` to `sitemap.ts` — all four are canonical-ready and marketing-relevant.

### 7. Content gaps — 6 canonical founder-SEO topics

Every article needs the CMO-skill mandatory 3+ inline SVGs. Word count is a
minimum. Primary CTA back to `/pricing` (paid intent) or `/svi` (top-of-funnel).

| # | Topic | Target keyword cluster | Suggested URL | Word count | Primary CTA |
|---|-------|------------------------|---------------|-----------:|-------------|
| 1 | Australian ESIC eligibility | `esic eligibility australia`, `esic tax offset startup`, `is my startup esic` | `/insights/esic-eligibility-checklist-2026` | 2800 | `/tools/esic` → `/pricing` |
| 2 | Cap-table basics for Aus startups | `cap table australia`, `founder equity split australia`, `startup cap table template` | `/insights/cap-table-basics-australian-founders` | 2400 | `/tools/cap-table` → `/pricing` |
| 3 | s708 investor exemptions | `section 708 corporations act`, `sophisticated investor australia`, `s708 exemption startup` | `/insights/s708-sophisticated-investor-guide` | 2600 | `/tools/data-room` → `/pricing` |
| 4 | ESOP grant tax treatment | `esop tax treatment australia`, `startup esop tax`, `employee share scheme tax` | `/insights/esop-tax-guide-australian-startups` | 3000 | `/tools/esop-checklist` → `/pricing` |
| 5 | SAFE vs convertible note (AU) | `safe vs convertible note australia`, `australian safe agreement`, `y combinator safe australia` | `/insights/safe-vs-convertible-note-australian-founders` | 2500 | `/tools/safe-calculator` → `/pricing` |
| 6 | Valuation methods for pre-revenue founders | `pre revenue startup valuation`, `startup valuation methods`, `how to value a pre-revenue startup` | `/insights/pre-revenue-valuation-methods-australia` | 2800 | `/svi` → `/pricing` |

Sequencing recommendation: publish #1 (ESIC) and #4 (ESOP) first — both are
high-intent AND long-tail, both feed users to tools we already own, and
neither has a strong Australian competitor ranking top-3 as of the last
`/cmo research` pass. Publish weekly, not daily; the publish-insight cron
last succeeded on 2026-06-20 (see item 8) so we need the cron fixed before
any content plan is credible.

### 8. Distribution channels — wired vs planned

Method: `crontab.production` inspection + cron-health.jsonl tail 500 (1199
lines total, tail read).

| Channel | Route file | Cron scheduled? | Last successful run in cron-health | Verdict |
|---------|-----------|-----------------|------------------------------------|---------|
| Google (organic) | `web/src/app/sitemap.ts` + `robots.ts` | n/a (crawler-driven) | n/a | WIRED, gap = `/pricing` canonical missing (see item 6) |
| LinkedIn Company Page (weekly) | `web/src/app/api/cron/linkedin-page-post/route.ts` | **NOT scheduled** — `grep linkedin web/scripts/crontab.production` returns empty | never — endpoint not in `EXPECTED_DAILY` at `cron-health/route.ts:37-41` and not in crontab | route exists, cron missing → **DEAD** |
| LinkedIn per-user milestone | `web/src/app/api/cron/linkedin-post/route.ts` | **NOT scheduled** | never in cron-health | route exists, cron missing → **DEAD** |
| Zalo | none | none | never | **NOT IMPLEMENTED** |
| Telegram (internal admin) | `web/src/app/api/cron/telegram-report/route.ts` | YES `crontab.production:94` (`30 23 * * *`) | 2026-06-20 23:30 (26 days ago) | WIRED, silent since 2026-06-20 |
| F6S | none — only a listing reference in `.claude` memory | none | never | **NOT IMPLEMENTED** |
| AngelList | none | none | never | **NOT IMPLEMENTED** |
| Crunchbase | none | none | never | **NOT IMPLEMENTED** |
| Insights publishing (organic feeder) | `web/src/app/api/cron/publish-insight/route.ts` | YES `crontab.production:81` (`30 21 * * *`) | 2026-06-20 21:30 (last `status:ok`); 2026-06-18 was `fail` with `Internal Server Error`; 2026-06-16 was JSON parse error | WIRED but broken — 26 days since last successful publish, no auto-recovery |
| Traffic report (analytics loop) | `web/src/app/api/cron/traffic-report/route.ts` | YES `crontab.production:91` (`30 22 * * *`) | 2026-06-20 22:30 with `status:error curl exit 28` — not even successful | WIRED but timing out |
| Lead nurture (D1/D4/D9) | `web/src/app/api/cron/lead-nurture/route.ts` | YES `crontab.production:64` (`20 16 * * *`) | never in cron-health (not in EXPECTED_DAILY) | scheduled but unmonitored |
| Nurture (legacy) | `web/src/app/api/cron/nurture/route.ts` | YES `crontab.production:61` | 2026-06-20 with `policy: disabled — lifecycle emails only` | intentionally disabled — do not re-enable |
| Lifecycle mailer (day0-day14+winback) | `web/src/app/api/cron/lifecycle-mailer/route.ts` | YES `crontab.production:313` (`*/15 * * * *`) | never in cron-health (not in EXPECTED_DAILY) | scheduled but unmonitored; also, `variant` never passed for `day5_email_subject` — see item 3 |
| Weekly insights (Sunday) | `web/src/app/api/cron/weekly-insights/route.ts` | YES `crontab.production:164` | 2026-06-14 with `policy: lifecycle_4_emails_only` | intentionally disabled |

Meta-flag on the whole cron surface. As of 2026-07-17 the last 12 hours of
cron-health.jsonl (13 lines above shows 2026-07-17T08:30 onwards) is a
sea of `Internal Server Error`s across every endpoint — `agent-guardian`,
`ai-health`, `trial-end-reminder`, `dunning-retry`, `milestone-report`,
`performance-audit`. The 12:20 UTC row is the first `ok` for
`agent-guardian` in that window. Whatever broke this morning (2026-07-17
~08:30 UTC) also breaks every CRO dunning + trial-end path. Diagnose
BEFORE launching v2-GA — no point announcing publicly while the trial-end
reminder cron is 502-ing.

### 9. /vs/[competitor] SEO — nav dropdown vs reality

Source: `web/src/components/landing/nav-v2.tsx:96-100`. The five Compare
dropdown items are:

```
{ label: "vs Cake",         href: "/pricing?compare=cake" },
{ label: "vs Carta",        href: "/pricing?compare=carta" },
{ label: "vs Foundersuite", href: "/pricing?compare=foundersuite" },
{ label: "vs Visible",      href: "/pricing?compare=visible" },
{ label: "vs AngelList",    href: "/pricing?compare=angellist" },
```

`find web/src/app -name vs -type d` returns empty. `/vs/[competitor]` route
does not exist. The dropdown routes users to a query-string variant of
`/pricing` (which itself has no canonical and no OG image — see item 6),
which SEO-wise is worse than nothing — Google will fold the query variants
into the base `/pricing` and no dedicated compare page will ever rank.

Content shape per `/vs/[competitor]` page (T-0316 in deferred v2 plan):

```
H1: BlockID.au vs [Competitor] — the [one-line differentiator]
Above-fold: single-row table (Us | Them) — pricing, focus, geography, AI, wallet
Section 2: Feature matrix (10-12 rows) — check/x per side, one-liner explanation per row
Section 3: Pricing side-by-side — our 12-SKU vs their SKU set, monthly and annual
Section 4: Use case → who is BlockID for, who is [Competitor] for (be honest)
Section 5: Migration guide (import their cap-table CSV format)
CTA A: /svi (top-of-funnel, "score your startup, free")
CTA B: /pricing (bottom-of-funnel, "start 7-day trial")
Schema.org SoftwareApplication + FAQPage
Canonical: /vs/[competitor]
OG image: bespoke per competitor (600x315, both logos + score card)
```

Build priority (search-volume assumption — verify with Ahrefs before
committing, but this is the CMO's best guess based on Australian founder
community mentions):

| # | Competitor | Est. AU monthly search | Rationale | Ship first? |
|---|-----------|-----------------------:|-----------|-------------|
| 1 | **Cake Equity** | 900-1500 | AU-native; direct competitor for cap-table + ESOP; founders explicitly ask "Cake vs X" | **YES — build first** |
| 2 | Carta | 600-1000 | Global brand, high awareness even in AU, but low switch intent (they're US-centric) | second |
| 3 | AngelList | 400-700 | Fundraise + syndicate audience; different ICP but shares "startup platform" query cluster | third |
| 4 | Visible | 150-300 | Investor-updates niche, narrow ICP overlap | fourth |
| 5 | Foundersuite | 100-250 | US-heavy, thin AU presence, longest tail | last |

Recommendation: ship `/vs/cake` alone in v2.1 Week 1 as the pilot. Measure
30-day rank + organic sessions. If it hits page 1 for `blockid vs cake` and
`cake equity alternative australia`, greenlight the other four in v2.2.

### 10. Public launch checklist — top 8 for v2.0-GA

Sequencing matters: do not send the announcement blast until items 1-4 are
green. Items 5-8 are distribution.

1. **/pricing canonical + OG image landed.** Item 6 flag. Without this, every
   inbound compare-page click and organic query for "founder pricing australia"
   dilutes. 30 min of work; blocking.
2. **Trial-end-reminder cron green.** cron-health as of 12:05 UTC still shows
   `trial-end-reminder` failing with `Internal Server Error`. Announcing while
   this is broken means we onboard people into a trial that never gets its
   final-day nudge — direct CRO leak.
3. **publish-insight cron unstuck.** Last success 2026-06-20. Ship the JSON
   parse fix (2026-06-16 error was a truncated LLM completion) so we can
   pipeline the 6 canonical articles from item 7 before the announcement.
4. **At least ONE trigger actually fires.** Item 2 audit — pick
   `feature_gate_hit` as the pilot, wire the gate wrapper, verify a modal
   opens on a real gated feature. Non-negotiable for announcing a "conversion
   stack shipped" narrative.
5. **LinkedIn Company Page post — English.** Use `web/content/marketing/launch/2026-07-launch-linkedin.md` as source (already drafted, exists in tree). Add the LinkedIn cron to `crontab.production` (currently missing per item 8) OR post manually the day of announcement.
6. **DM to accelerator list.** F6S, Fishburners, Stone & Chalk, Startmate, Antler, Cicada, River City Labs — the `reference_directory_listings` memory calls out F6S + Crunchbase + LinkedIn as live listings. Personal DMs, not a blast.
7. **Telegram + Zalo — Vietnamese-Australian founder segment.** This is core positioning per BlockID's stated ICP. Draft a Vietnamese-language launch post referencing dual-founder-friendly features (multi-currency AUD/VND, blockchain equity for cross-border cap-tables). No Vietnamese-language surface exists in the tree today; SHIP a `/vi/` landing OR at minimum a Vietnamese Telegram/Zalo post before announcing English-only.
8. **Email to existing users (day0 lifecycle).** Not the same as an announcement blast — a "we shipped v2, here's what changed for YOUR plan" email. Segment by plan; the day0 template exists at `web/src/emails/lifecycle/render.ts` but has no v2 variant.

Explicitly NOT on the list for v2.0-GA (defer to v2.1):
- Twitter/X — no wired cron, low leverage for Australian founder audience.
- ProductHunt — worth doing but only after `/vs/cake` is ranking (item 9) so PH traffic lands somewhere sticky.
- Blog syndication (Medium, dev.to) — no cron; manual crossposts drain
  founder time. Skip until publish-insight is unbroken (item 3).

### 11. Top-3 CRO + Top-3 CMO actions — v2.1 Week 1

CRO:
1. **Wire `feature_gate_hit` end-to-end.** New `<EntitlementGate>` wrapper calls `useUpgradePrompt().request("feature_gate_hit")`. Zero triggers fire today (item 2).
2. **Ship trial-day-3 in-app modal.** Email exists, in-app doesn't (item 5A).
3. **Wire `/api/experiments/expose` to at least ONE surface** — the pricing page for `pricing_anchor_order`. Currently 0/4 experiments actually run (item 3).

CMO:
4. **Add `/pricing` canonical + OG image, and add `/roadmap` `/changelog` `/status` `/svi` to sitemap.ts** (item 6).
5. **Fix and re-arm publish-insight cron; queue the 6 canonical articles** from item 7 (item 8 shows 26 days stale).
6. **Build `/vs/cake` as the pilot compare page and add the LinkedIn cron to crontab.production** (items 8 + 9).

---

## Guardrails hit

- Line count: this file is intentionally under 700 lines. If a v2.1 follow-up wants more depth on any single item (especially item 3 experiment wiring or item 8 cron diagnosis), split into its own file rather than growing this one.
- No fabricated traction. All funnel numbers in item 1 are explicit benchmark assumptions; all trigger + experiment + cron findings in items 2, 3, 8 are file:line-backed.
- No emoji anywhere in this file.
- Every flag has evidence:
  - trigger wiring: `web/src/hooks/useUpgradePrompt.ts:104` (`.request` API), grep `useUpgradePrompt` (3 importers, none call `.request()`).
  - experiment wiring: `web/src/app/api/experiments/expose/route.ts:35` (server-side assign) with grep for client caller returning zero hits.
  - sitemap gaps: `web/src/app/sitemap.ts:135-139` (`/pricing` block, no canonical hint) + `grep canonical web/src/app/pricing/page.tsx` empty.
  - compare pages: `web/src/components/landing/nav-v2.tsx:96-100` + `find web/src/app -name vs -type d` empty.
  - cron gaps: `grep linkedin web/scripts/crontab.production` empty + cron-health.jsonl tail showing 2026-06-20 as most recent green publish-insight.
