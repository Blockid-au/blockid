export const meta = {
  name: 'blockid-w3-w8',
  description: 'W3-W8 parallel: onboarding wizard, GA4 analytics, investor+advisor+accelerator dashboards, equity request-a-call scaffold, QA seed+Playwright, menu progressive disclosure',
  phases: [
    { title: 'W3-W8 fan-out', detail: '8 parallel agents build workstreams W3-W8 across non-overlapping file sets' },
  ]
}

const SHARED = `
# W3-W8 - shared context (W1+W2 already landed)

Master plan: /home/dovanlong/blockid.au/docs/IMPLEMENTATION-PLAN-v2.md (all sections)
Specs dir: /home/dovanlong/blockid.au/knowledge-base/upgrade-plan-2026-07-16/

## Landed foundations you can use
- web/src/lib/entitlements.ts (can(), requireFeature(), usageRemaining(), recordGateHit())
- web/src/lib/plans-db.ts (getPlansCached(), getPlanCached())
- web/src/lib/plans-v2.ts (12-SKU literal)
- web/src/lib/trial.ts (isInTrial(), daysRemaining(), trialSummary())
- web/src/lib/legal/{gates,versions,surfaces}.ts (assertLegalReviewPassed(), requireAck(), DISCLAIMER_VERSIONS)
- web/src/lib/jurisdiction.ts (detectJurisdiction())
- web/src/lib/consent.ts + audit.ts (recordConsent(), appendAudit() hash-chained)
- web/src/lib/gst.ts (calculateGst())
- web/src/lib/stripe/verify.ts (verifyWebhookSignature())
- web/src/hooks/useEntitlement.ts (client-side)
- web/src/components/access/FeatureGate.tsx
- web/src/app/api/entitlement/me/route.ts
- web/src/app/api/stripe/{checkout,webhook,change-plan,trial-status}/route.ts (7-day trial wired)
- Migrations 0073-0079 applied (segments, plans, entitlements, compliance, analytics, deploy_incidents, perf_samples)
- Homepage v2 components: hero-v2, segment-tabs, pricing-matrix, faq-v2, trial-strip, value-props, trust-strip
- Luxury theme: body[data-theme='lux'] with brand-navy/gold/cyan palette

## Guardrails
- Autonomous git reset runs. DO NOT commit - main orchestrator commits atomic.
- All new user-visible surfaces gated by NEXT_PUBLIC_UPGRADE_V2 (staged rollout).
- Additive-only migrations (all future ones must be 0080+, current W3-W8 mostly no new migrations).
- npm (not pnpm).
- Read AGENTS.md warning: Next.js has breaking changes vs training data. If unsure, read node_modules/next/dist/docs/.

Return ONLY file paths written, one per line.
`

phase('W3-W8 fan-out')

const results = await parallel([
  // W3 Onboarding wizard
  () => agent(
    `${SHARED}

## W3: Onboarding Wizard (segment picker -> tier picker -> Stripe checkout)

### /home/dovanlong/blockid.au/web/src/app/onboarding/onboarding-wizard.tsx (REWRITE, 'use client')
Read existing file first to understand current shape.

New 5-step wizard using useReducer + URL query step:
- Step 1: StepSegment - pick founder/investor_angel/investor_vc/advisor/accelerator (skip 'lp' for now)
- Step 2: StepGoal - pick primary goal ("Raise funding" / "Track cap table" / "Find deals" / "Advise startups" / "Run cohort") - drives copy in next steps
- Step 3: StepTier - show only plans for chosen segment from plans-v2.ts (import from '@/lib/plans-v2'); highlight Most Popular; explain 7-day trial
- Step 4: StepTrial - review benefits + trial-end date + "your card will be charged A\$X on <date>"; require consent checkbox 'I agree to Terms + 7-day auto-renew' (record consent via /api/legal/ack POST)
- Step 5: StepPayment - Stripe Elements card capture via SetupIntent (uses api/stripe/checkout with mode=setup+subscription+trial_period_days=7)

Reducer state: { step, segment, goal, planId, consentGranted, paymentMethodId, error }
URL: ?step=1 to 5 (updates on next/back)
Skip button on non-critical steps back to step 1

### /home/dovanlong/blockid.au/web/src/components/onboarding/step-segment.tsx (NEW)
### /home/dovanlong/blockid.au/web/src/components/onboarding/step-goal.tsx (NEW)
### /home/dovanlong/blockid.au/web/src/components/onboarding/step-tier.tsx (NEW)
### /home/dovanlong/blockid.au/web/src/components/onboarding/step-trial.tsx (NEW)
### /home/dovanlong/blockid.au/web/src/components/onboarding/step-payment.tsx (NEW, imports @stripe/react-stripe-js)

All step components: props { state, dispatch, goNext, goBack }.

### /home/dovanlong/blockid.au/web/src/app/api/onboarding/save-progress/route.ts (NEW)
POST: persist { user_id, step, state } to app_users.onboarding_state jsonb column - graceful if column missing (skip)

### /home/dovanlong/blockid.au/web/src/app/api/legal/ack/route.ts (NEW)
POST: { kind, disclaimer_version, granted } -> calls recordConsent() -> returns { consent_id }

Return 8 file paths, one per line.`,
    { label: 'W3-onboarding', phase: 'W3-W8 fan-out' }
  ),

  // W4 GA4 Analytics
  () => agent(
    `${SHARED}

## W4: GA4 Analytics + Conversion Events + BQ Export

### /home/dovanlong/blockid.au/web/src/lib/analytics/events.ts (NEW)
- export type AnalyticsEvent (discriminated union of 20 event types from CDO spec)
- Events: sign_up, trial_start, trial_end, subscribe, plan_upgrade, plan_downgrade, plan_cancel, report_generate, dashboard_view, feature_gate_hit, credits_spend, credits_purchase, equity_offer_request, share_link_open, evidence_upload, svi_analyze, agent_invoke, cohort_action, investor_view_deal, session_start
- Each event has typed params
- export async function trackEvent(name, params, opts?: { userId?, sessionId? }): calls server-side helper (analytics/server.ts)
- Zod validation: reject events with PII in top-level params (email, phone, credit-card patterns)

### /home/dovanlong/blockid.au/web/src/lib/analytics/consent.ts (NEW)
- export function getConsent(): { granted: boolean; timestamp?: string }
- export function grantConsent(): void (localStorage + cookie)
- export function denyConsent(): void
- Consent-mode v2 defaults: ad_storage=denied, analytics_storage=denied until user grants; for AU users, default deny; for non-AU, default deny too (opt-in only)

### /home/dovanlong/blockid.au/web/src/lib/analytics/server.ts (NEW)
- Server-side event emitter: POSTs to GA4 Measurement Protocol AND mirrors to Supabase analytics_events table
- Idempotency via event_id UUID (never re-send same event)
- Batch mode: buffer events in memory, flush every 5s or 20 events (whichever first)
- Env: GA4_MEASUREMENT_ID, GA4_API_SECRET

### /home/dovanlong/blockid.au/web/src/app/api/analytics/ingest/route.ts (NEW)
- POST: batch insert to analytics_events (server_source='client')
- Rate limit: 100 events/min per user_id via existing rate-limit helper if any
- Rejects PII fields (email/phone regex)

### /home/dovanlong/blockid.au/web/src/components/analytics/consent-banner.tsx (NEW, 'use client')
- Bottom banner on first visit (not in dashboard/workspace routes)
- Copy: "We use analytics to improve BlockID. AU users can opt in below. [Learn more]"
- Buttons: Accept | Reject | Customize (opens preferences modal)
- Writes gtag('consent', 'update', { ... }) + localStorage
- Hidden after choice recorded

### EDIT /home/dovanlong/blockid.au/web/src/app/layout.tsx
- Add GA4 gtag.js loader (async partytown-style) ONLY if NEXT_PUBLIC_GA4_MEASUREMENT_ID env set
- Add ConsentBanner mount
- Add gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', region: ['AU'] }) BEFORE gtag.js loads

### /home/dovanlong/blockid.au/web/scripts/bq-export-events.ts (NEW)
- Nightly cron script: exports last 24h analytics_events from Supabase to BigQuery via MERGE
- Idempotency via event_id UUID key
- Uses @google-cloud/bigquery if available; otherwise logs 'BQ_DISABLED' and exits 0
- Env: BQ_PROJECT, BQ_DATASET, BQ_TABLE, GOOGLE_APPLICATION_CREDENTIALS_JSON

### /home/dovanlong/blockid.au/web/src/app/api/cron/bq-export-events/route.ts (NEW)
- GET (with x-cron-secret): runs bq-export-events.ts via node child_process, logs result

Return 8 paths, one per line.`,
    { label: 'W4-analytics', phase: 'W3-W8 fan-out' }
  ),

  // W5a Investor workspace
  () => agent(
    `${SHARED}

## W5a: Investor Workspace (deal-flow, watchlist, portfolio)

### /home/dovanlong/blockid.au/web/src/app/workspace/investor/page.tsx (NEW)
Server component. Uses FeatureGate feature='investor.dealflow'.
Layout: 3-col grid: Deal Flow Inbox | Watchlist | Portfolio.
Reuse existing web/src/lib/investor-links.ts + api/watchlist for data.

### /home/dovanlong/blockid.au/web/src/app/workspace/investor/dealflow/page.tsx (NEW)
Table of verified startups matching investor's stated preferences (sector, stage, geo).
Filter chips: stage, sector, SVI score band, jurisdiction.
Per row: startup name, SVI score badge, stage, "View report" / "Add to watchlist" / "Request contact" actions.
Sortable columns.

### /home/dovanlong/blockid.au/web/src/app/workspace/investor/watchlist/page.tsx (NEW)
Reads existing watchlist API.
Groups: Following / Contacted / Passed.
Per startup: SVI trend sparkline (last 90d), latest weekly report link, "Send message" CTA.

### /home/dovanlong/blockid.au/web/src/app/workspace/investor/portfolio/page.tsx (NEW)
Gated by feature='investor.portfolio' (VC Small+).
Table of portfolio companies with valuation, ownership%, quarterly reports link.
LP export CTA (CSV + PDF) - gated feature='investor.lp_export'.

### /home/dovanlong/blockid.au/web/src/lib/investor-portal.ts (NEW)
Helpers: getDealFlow(user_id, filters), getWatchlist(user_id), getPortfolio(user_id), addToWatchlist(user_id, startup_id), moveWatchlistTag(user_id, startup_id, tag).

### /home/dovanlong/blockid.au/web/src/app/api/investor/dealflow/route.ts (NEW)
GET: returns filtered dealflow list based on investor preferences and jurisdictional gates.

### /home/dovanlong/blockid.au/web/src/app/api/investor/preferences/route.ts (NEW)
GET/POST: investor's stated preferences (sector, stage, cheque size band, geo).
Writes to new app_users column investor_prefs jsonb IF EXISTS (skip gracefully if column missing).

Return 7 paths, one per line.`,
    { label: 'W5a-investor', phase: 'W3-W8 fan-out' }
  ),

  // W5b Accelerator workspace + Advisor workspace
  () => agent(
    `${SHARED}

## W5b: Accelerator Workspace + Advisor Workspace

### /home/dovanlong/blockid.au/web/src/app/workspace/accelerator/page.tsx (NEW)
Server component. FeatureGate feature='accelerator.cohort'.
Sections:
- Active Cohort card: cohort name, founder count, cohort start/end dates, batch SVI avg + trend
- Applicant Pipeline: table of applicants (name, submitted, initial SVI, status) - link to Apply intake form
- LP Report CTA (feature='accelerator.lp_report'): "Generate Q3-2026 LP Report" button -> triggers cron
- Program KPIs: graduated %, avg funding raised, top exits (placeholder cards)

### /home/dovanlong/blockid.au/web/src/app/workspace/accelerator/cohort/[id]/page.tsx (NEW)
Cohort detail: roster of founders, per-founder SVI card, message-all button, cohort settings.

### /home/dovanlong/blockid.au/web/src/app/workspace/accelerator/applications/page.tsx (NEW)
Application intake pipeline (status: submitted / reviewing / accepted / rejected / interviewed).

### /home/dovanlong/blockid.au/web/src/app/workspace/advisor/page.tsx (NEW or extend existing)
FeatureGate feature='advisor.clients'.
Sections:
- Client Roster: list of client startups, per-client SVI, engagement status
- Engagement Notes: rich-text notes per client
- Weekly Digest: opt-in summary of client SVI changes

### /home/dovanlong/blockid.au/web/src/app/workspace/advisor/client/[id]/page.tsx (NEW)
Client detail page: SVI report link, meeting notes, next-step action items.

### /home/dovanlong/blockid.au/web/src/lib/accelerator-portal.ts (NEW)
Helpers: getCohort(user_id, cohort_id), listApplicants(cohort_id), getCohortSviAvg(cohort_id).

### /home/dovanlong/blockid.au/web/src/lib/advisor-portal.ts (NEW)
Helpers: getClientRoster(advisor_id), getClientNotes(advisor_id, client_id), saveNote(advisor_id, client_id, body).

### /home/dovanlong/blockid.au/web/src/app/api/accelerator/cohort/route.ts (NEW)
GET/POST: cohort management CRUD.

### /home/dovanlong/blockid.au/web/src/app/api/advisor/notes/route.ts (NEW)
GET/POST: engagement notes CRUD.

Return 8-10 paths, one per line.`,
    { label: 'W5b-accel-advisor', phase: 'W3-W8 fan-out' }
  ),

  // W6 Equity Request-a-Call scaffold (compliance-gated)
  () => agent(
    `${SHARED}

## W6: Equity-for-Solution "Request a Call" scaffold (compliance-gated Phase 3)

CRITICAL: This is a compliance-gated feature. NO auto-issuance of securities. Only intake form + audit-logged request. All copy must include "Not financial advice" + "Seek independent counsel" + "This is not an offer of securities".

### /home/dovanlong/blockid.au/web/src/app/workspace/equity-offer/page.tsx (NEW, server component)
FeatureGate feature='equity_offer.request'.
Show "Equity-in-lieu-of-cash" landing:
- Header: "Pay in Equity: Enterprise Solution + 5-10% Equity"
- Big disclaimer block at top (imported from '@/lib/legal/surfaces' surface='equity_offer_page'):
  - "This is NOT an offer of securities. Nothing on this page constitutes financial or legal advice.
    Any equity arrangement will be documented via an off-platform legal instrument (advisory SAFE, warrant, or option agreement) executed only after counsel review by both parties. BlockID does not facilitate the offer or issuance of securities.
    Seek independent legal, tax, and financial advice before proceeding."
- Overview: what BlockID delivers in this arrangement (full Scale/Enterprise stack, dedicated CSM, quarterly LP reports)
- Terms indicative table: stage-based equity band, vesting (2yr monthly), instrument type - all marked INDICATIVE
- CTA: "Request a Call" button (opens intake form) - GATED behind checkbox "I have read and acknowledge the disclaimers above" + jurisdictional check

### /home/dovanlong/blockid.au/web/src/app/workspace/equity-offer/request/page.tsx (NEW, 'use client')
5-field intake form:
- Company name (pre-filled from user profile)
- Stage (dropdown: idea/pre-seed/seed/series-a+)
- Equity band you'd offer (5-10% slider)
- Scope requested (multi-select: SVI + valuation, Cap table + ESOP, Blockchain sync, Investor reporting, Full stack)
- Message (textarea, min 100 chars)
Submit button disabled until wholesale certification declared or 'not applicable' + all disclaimers acknowledged.
On submit: POST /api/equity/request -> shows "Thank you. We will contact you within 3 business days." (no equity auto-created).

### /home/dovanlong/blockid.au/web/src/app/api/equity/request/route.ts (NEW)
POST always returns 202 (accepted; async processing).
Writes:
1. recordConsent(kind='equity_offer_disclaimer', granted=true, disclaimer_hash=hash of surface body)
2. INSERT INTO equity_requests (user_id, stage, equity_pct_requested, scope, jurisdiction, consent_event_id, status='pending_review', detail={message, ...})
3. appendAudit(action='equity_request_submitted', resource_type='equity_request', resource_id=inserted.id, detail={stage, pct})
4. Notify admin via Telegram (best-effort)
5. Send acknowledgment email to user (best-effort, uses existing email lib)
Rate limit: 3 requests per user per 30d (return 429 with next-eligible-date).

### /home/dovanlong/blockid.au/web/src/components/legal/not-financial-advice.tsx (NEW)
'use client'. Renders standardized disclaimer block. Props: { kind, jurisdiction, compact? }.
Reads copy from '@/lib/legal/surfaces'.
Modal variant: <NotFinancialAdviceModal open onOpenChange />

### /home/dovanlong/blockid.au/web/src/components/legal/advice-warning-modal.tsx (NEW, 'use client')
Full-screen consent modal shown once per session on equity page.
Requires scrolling to bottom before Accept button enables.
On accept: recordConsent(kind='general_advice_warning', granted=true).

### /home/dovanlong/blockid.au/web/src/components/legal/wholesale-gate.tsx (NEW, 'use client')
Modal: "Are you a wholesale investor per Corps Act s708(8)?"
Options: Yes (upload certification via /api/legal/wholesale-verify), No (proceeds as retail), Not sure (blocks with FAQ link).

### /home/dovanlong/blockid.au/web/src/app/api/legal/wholesale-verify/route.ts (NEW)
POST: accepts wholesale certification file upload, stores hash to app_users.wholesale_status='wholesale_certified', writes consent_event.

### /home/dovanlong/blockid.au/web/scripts/verify-equity-gate.sh (NEW, executable)
Static grep gate:
#!/usr/bin/env bash
set -euo pipefail
# Fails CI if equity path directly imports blockchain-sync or tokenization without going through legal_review_passed gate
HITS=$(grep -rn --include='*.ts' --include='*.tsx' -lE '(blockchain-sync|tokenization)' /home/dovanlong/blockid.au/web/src/app/workspace/equity-offer /home/dovanlong/blockid.au/web/src/app/api/equity 2>/dev/null || true)
if [[ -n "$HITS" ]]; then
  echo "❌ Equity path directly imports blockchain — must go through /lib/legal/gates.ts assertLegalReviewPassed()"
  echo "$HITS"
  exit 1
fi
echo "✓ No direct blockchain imports from equity path"

Return 8-9 paths, one per line.`,
    { label: 'W6-equity', phase: 'W3-W8 fan-out' }
  ),

  // W7 QA + test accounts + Playwright
  () => agent(
    `${SHARED}

## W7: QA seed + Playwright suite

### /home/dovanlong/blockid.au/web/scripts/seed-test-users.mjs (NEW, Node ESM)
Creates 12 test accounts via Supabase admin API (idempotent - checks if email exists first, skips or updates).
Per QA spec: 2 accounts per segment × 6 segments (founder, investor_angel, investor_vc, advisor, accelerator, lp).
Naming: qa-<segment>-<index>@blockid.au (e.g., qa-founder-1@blockid.au, qa-investor_angel-2@blockid.au).
Each account gets:
- Random password (log to /tmp/blockid-qa-accounts.txt with permissions 600)
- plan_started_at staggered: T-8d (trial expired), T-7d (last day trial), T-5d (mid trial), T-1d (just started), T-30d (active paid), T-60d (renewed)
- 12 accounts x 2 users each = 24 profile records with startups auto-created
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Idempotency: on re-run, no duplicates created; updates plan_started_at + status if changed.
Prints table of created/skipped accounts at end.
Flags: --dry-run, --reset (delete all qa-* first), --segment <name> (create only that segment).

### /home/dovanlong/blockid.au/web/scripts/stripe-mock-webhook.mjs (NEW, Node ESM)
Synthesize signed Stripe webhook events for local testing.
Types: checkout.session.completed, customer.subscription.trial_will_end, customer.subscription.updated (trialing→active), customer.subscription.updated (trialing→canceled), invoice.paid, invoice.payment_failed.
Signs with STRIPE_WEBHOOK_SECRET.
POSTs to http://localhost:3000/api/stripe/webhook.
Flag --at T+Nd for clock-offset simulation.

### /home/dovanlong/blockid.au/web/tests/e2e/fixtures/accounts.ts (NEW)
Playwright fixture: loginAs(page, email) via Supabase magic-link stub OR direct-set cookie.

### /home/dovanlong/blockid.au/web/tests/e2e/fixtures/stripe.ts (NEW)
Playwright fixture: advanceTrialClock(userId, days), simulatePaymentFailure(userId), assertEntitlement(userId, feature).

### /home/dovanlong/blockid.au/web/tests/e2e/journeys/01-signup-trial.spec.ts (NEW)
Playwright test: visit /pricing (upgradeV2=true) -> click Start Trial on Growth card -> onboarding wizard segment picker -> tier confirm -> payment (test card 4242) -> land on dashboard -> assert trial banner shows "6 days left" -> assert entitlement includes 'cap_table.write'.

### /home/dovanlong/blockid.au/web/tests/e2e/journeys/02-upgrade-mid-trial.spec.ts (NEW)
Login as qa-founder-1 (trial day 3) -> visit /workspace/billing -> click Upgrade to Scale -> confirm proration -> assert plan flips to Scale -> assert entitlement now includes 'esop.manage'.

### /home/dovanlong/blockid.au/web/tests/e2e/journeys/03-trial-end-auto-charge.spec.ts (NEW)
Login as qa-founder-1 (trial day 7 via test-clock) -> trigger webhook customer.subscription.updated status=active -> assert first invoice charged -> assert Telegram announced (mock).

### /home/dovanlong/blockid.au/web/tests/e2e/journeys/04-downgrade.spec.ts (NEW)
Cancel scale plan -> get exit survey -> accept downgrade to Starter -> assert plan_from='founder_scale' plan_to='founder_starter' in churn_events.

### /home/dovanlong/blockid.au/web/tests/e2e/journeys/05-cancel-reactivate.spec.ts (NEW)
Cancel -> see COMEBACK30 offer -> reject -> confirm cancel -> reactivate within 30d -> assert coupon applied.

### /home/dovanlong/blockid.au/web/tests/e2e/regression/menu-visibility.spec.ts (NEW)
Login as each of 12 QA accounts -> visit /dashboard -> assert menu items match plan matrix (from cpo-spec).

### /home/dovanlong/blockid.au/web/tests/e2e/regression/gate-blocks.spec.ts (NEW)
Try to visit gated route as free user -> assert redirect to /pricing?feature=xyz + upgrade prompt shown + feature_gate_hit event logged.

### /home/dovanlong/blockid.au/web/tests/e2e/regression/disclaimers.spec.ts (NEW)
Visit /workspace/equity-offer as retail user -> assert 'Not financial advice' block present + Accept modal requires scroll-to-bottom.

### /home/dovanlong/blockid.au/web/tests/e2e/regression/homepage-v2.spec.ts (NEW)
Visit / with NEXT_PUBLIC_UPGRADE_V2=true -> assert h1 text 'Get Fundable in 7 Days' + segment tabs present + pricing matrix has 4 cards for founder segment.

### /home/dovanlong/blockid.au/web/scripts/qa-release-gate.sh (NEW, executable)
Orchestrator: runs seed-test-users -> npx playwright test tests/e2e/journeys/ -> npx playwright test tests/e2e/regression/ -> reports summary. Exit non-zero on any failure. Called by deploy-live.sh pre-flight.

### /home/dovanlong/blockid.au/web/playwright.config.ts (NEW OR extend)
Base config with baseURL http://localhost:3000 (or PLAYWRIGHT_BASE_URL env).

Return 15 paths, one per line.`,
    { label: 'W7-qa', phase: 'W3-W8 fan-out' }
  ),

  // W8 Menu progressive disclosure + workspace layout
  () => agent(
    `${SHARED}

## W8: Menu Progressive Disclosure + Segment-aware Workspace Layout

### EDIT /home/dovanlong/blockid.au/web/src/components/workspace/workspace-layout.tsx
Read existing file (~200 lines).
Modifications:
1. Extract NAV_GROUPS + ADMIN_NAV_GROUP to a new file web/src/components/workspace/nav-groups.ts (see W8b task below).
2. Import nav groups from that file.
3. Import can() from '@/lib/entitlements' + useEntitlement from '@/hooks/useEntitlement'.
4. For each nav item, filter by:
   - minPhase (existing behavior, keep)
   - minPlan (NEW): item hidden if user.plan tier < item.minPlan (rank: free < starter < growth < scale < enterprise)
   - segments[] (NEW): item hidden if user.segment not in segments[]
5. Optionally show grayed-out with lock icon + "Upgrade" tooltip instead of full hide (progressive disclosure, per CPO spec).
6. Preserve admin group visibility.
7. Add <TrialBanner> at top of layout (below navbar) if inTrial.

### /home/dovanlong/blockid.au/web/src/components/workspace/nav-groups.ts (NEW)
Export const NAV_GROUPS with all existing items PLUS new segment+plan gates.
Schema per NavItem:
type NavItem = {
  label: string
  href: string
  icon?: ReactNode
  minPhase?: number
  minPlan?: 'free' | 'starter' | 'growth' | 'scale' | 'enterprise' | 'angel' | 'advisor' | 'vc_small' | 'vc_ent' | 'accel_starter' | 'accel_growth' | 'accel_ent'
  segments?: Array<'founder' | 'investor_angel' | 'investor_vc' | 'advisor' | 'accelerator' | 'lp' | 'admin'>
  lifecycle?: 'beta' | 'live' | 'stable'
  feature?: string  // entitlement check (superset of minPlan)
}
type NavGroup = { title, items: NavItem[], segments?, minPlan?, collapsible? }

Include ALL existing 5 phase-gated groups + Account + Admin. Add:
- Investor group (segments=['investor_angel','investor_vc']): items Deal Flow, Watchlist, Portfolio, Preferences
- Advisor group (segments=['advisor']): items Client Roster, Notes, Weekly Digest
- Accelerator group (segments=['accelerator']): items Cohort, Applications, LP Report

Per-item minPlan matrix (representative subset):
- Overview items: minPlan='free' (visible to all trial/free)
- Evaluation, Evidence Vault, Metrics, Weekly Reports, Knowledge Base: minPlan='starter'
- Cap Table, Shareholders, ESOP setup: minPlan='growth'
- ESOP Manage, Blockchain Sync, Advisor Portal, White-label: minPlan='scale'
- API Keys, SSO, Custom Branding, Enterprise: minPlan='enterprise'
- Investor Portfolio (feature='investor.portfolio'): minPlan='vc_small'
- Accelerator LP Report (feature='accelerator.lp_report'): minPlan='accel_growth'
- Equity Offer request: feature='equity_offer.request' (available on Scale + Enterprise founder + Advisor)

### /home/dovanlong/blockid.au/web/src/components/workspace/trial-banner.tsx (NEW)
'use client'. Shows if user is in trial:
- Amber background (bg-brand-gold/10) on days 5-6, red (bg-red-500/10) on day 7
- Text: "X days left in your free trial. Your card will be charged \$Y on <date>."
- CTAs: "Choose Plan" (link /workspace/billing) + "Cancel Trial" (POST /api/stripe/cancel with confirm)
- Dismissible per-day (localStorage.dismissed_trial_banner=<YYYY-MM-DD>)

### /home/dovanlong/blockid.au/web/src/lib/segments.ts (NEW)
export type Segment = 'founder' | 'investor_angel' | 'investor_vc' | 'advisor' | 'accelerator' | 'lp' | 'admin'
export type PlanTier = 'free' | 'starter' | 'growth' | 'scale' | 'enterprise' | 'angel' | 'advisor' | 'vc_small' | 'vc_ent' | 'accel_starter' | 'accel_growth' | 'accel_ent'
export function planTierRank(tier: PlanTier): number
export function segmentLabel(s: Segment): string
export function planLabel(t: PlanTier): string
export function inheritsFrom(t: PlanTier): PlanTier[]

Return 4-5 paths (edit + 3 new), one per line.`,
    { label: 'W8-menu', phase: 'W3-W8 fan-out' }
  ),

  // W7b Cron additions + Metrics dashboard
  () => agent(
    `${SHARED}

## W7b: Cron additions + Pricing metrics admin dashboard

### /home/dovanlong/blockid.au/web/src/app/api/cron/trial-end-reminder/route.ts (NEW)
GET (with x-cron-secret): finds users where subscription_trial_state.trial_end is in [now+3d, now+3d+1h] AND not already reminded (lifecycle_state.history doesn't contain 'trial_reminder_t3d') -> send email + Telegram + upsert lifecycle_state.

### /home/dovanlong/blockid.au/web/src/app/api/cron/dunning-retry/route.ts (NEW)
GET: for users with subscription_trial_state.status='past_due', retry Stripe invoice payment attempt if last attempt > 24h ago; after 4 attempts, mark as canceled + churn_event.

### /home/dovanlong/blockid.au/web/src/app/api/cron/weekly-metrics/route.ts (NEW)
GET: aggregate weekly pricing metrics into a snapshot table (or file to web/content/reports/pricing-metrics-YYYY-WW.jsonl):
- trial_starts, trial_conversions, mrr, arr, arpu_by_segment, churn_by_segment, cac_estimate, ltv_estimate.
- Posts weekly-metrics summary to Telegram.

### /home/dovanlong/blockid.au/web/src/app/api/cron/performance-audit/route.ts (NEW) — G-06
GET: runs Lighthouse CI (chrome-launcher + lighthouse npm packages if present, else logs 'lh not installed'). Routes: /, /pricing, /dashboard, /score, /workspace/billing. Writes perf_samples table (from migration 0079). Auto-files GitHub issue on >10% regression via gh CLI if available.

### /home/dovanlong/blockid.au/web/src/app/api/cron/server-cleanup/route.ts (NEW) — G-05
GET (with x-cron-secret): exec web/scripts/server-cleanup.sh via node child_process. Logs output to /tmp/blockid-cleanup.log. Telegram summary.

### /home/dovanlong/blockid.au/web/src/app/api/admin/rollback/route.ts (NEW) — G-10
POST: admin-gated (session role='admin'). Body: { target_sha?: string, reason: string }. Runs deploy-live.sh --rollback. Logs to deploy_incidents (kind='rollback', severity='critical'). Returns { ok, rolled_back_to, smoke_passed }.

### /home/dovanlong/blockid.au/web/src/app/dashboard/admin/pricing-metrics/page.tsx (NEW)
Admin-only. Renders 6 charts (using @tanstack/react-charts or simple SVG):
- Trial->Paid funnel (weekly)
- MRR by segment (line)
- ARR total (line)
- Feature gate-hits heatmap (top 10)
- Churn by segment (bar)
- Equity requests pipeline (funnel: pending_review -> contacted -> converted)
Data from Supabase SQL views (v_trial_conversion, revenue_events aggregates, feature_gate_hit event counts).

### /home/dovanlong/blockid.au/web/src/app/dashboard/admin/uptime-guardian/page.tsx (NEW) — G-16
Admin-only. Live tiles:
- Current uptime %, last 24h probe success rate
- p95 latency last hour (from perf_samples)
- Disk %, mem %, next scheduled cleanup
- Last 20 deploy_incidents rows (severity color-coded)
- Rollback button (POST /api/admin/rollback with confirm modal)
- Guardian auto-fix log (from guardian-history.jsonl via cat)

### /home/dovanlong/blockid.au/web/content/reports/self-fix-playbook.json (NEW) — G-09
[
  { "pattern": "EADDRINUSE.*:4001", "action": "kill_stale_next_server", "cooldown_s": 300 },
  { "pattern": "PGRST refresh timeout", "action": "notify_pgrst_reload", "cooldown_s": 60 },
  { "pattern": "Stripe webhook 401", "action": "rotate_stripe_secret_and_redeploy", "cooldown_s": 3600 },
  { "pattern": "ENOSPC.*build cache", "action": "run_server_cleanup_then_retry_build", "cooldown_s": 600 },
  { "pattern": "Anvil chainId mismatch", "action": "restart_anvil_container", "cooldown_s": 300 }
]

Return 9 paths, one per line.`,
    { label: 'W7b-cron-metrics', phase: 'W3-W8 fan-out' }
  ),
])

return {
  results: results.filter(Boolean),
  nextSteps: 'Main orchestrator: commit W3-W8 atomic + push; run build; deploy staging w/ UPGRADE_V2=true; smoke; seed test users; run playwright regression; announce v2.0 launch'
}
