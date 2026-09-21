# Pricing truth — code ↔ Stripe ↔ DB parity (G18-A, 2026-09-19)

Founder direction 2026-09-19: "review pricing for correctness, check Stripe and
links, one consistent message across the whole site". This file is the ledger
that lane A produced and the place any future price change is checked against.

**Sources of truth (in this order):**

| What | Where | Pinned by |
|---|---|---|
| Subscription rungs (price, annual, trial, credits, flags) | `web/src/config/pricing/plans.csv` → `plans.generated.ts` (`npx tsx scripts/build-plans.ts`) | `config/pricing/plans*.test.ts` |
| Public copy for each rung (name, bullets, visibility) | `web/src/lib/plans-v2.ts` | `plans-v2.test.ts` (every number back to the csv) |
| One-off reports (A$3) | `web/src/lib/pricing/v3-skus.ts` + `trust-report-price.ts` | `v3-skus.test.ts`, `trust-report-price.test.ts` |
| Credit packs | `web/src/lib/credit-packs.ts` | `credit-packs.test.ts` |
| Credit costs per feature | `web/src/lib/credits.ts` `FEATURE_COSTS` (+ client mirror `credits-public.ts`) | `credits.test.ts` |
| What Stripe holds (names + amounts, **no ids**) | `web/src/config/pricing/stripe-price-catalogue.json` | `lib/pricing/stripe-map.test.ts` (code == catalogue), `scripts/stripe-price-audit.mjs` (Stripe == catalogue, weekly) |
| GST wording | `plans-v2.ts` `GST_SUFFIX` / `GST_POLICY_LINE` / `withGst()` | `lib/pricing/gst-wording.test.ts` |
| Trial copy | `web/src/lib/plans/trial-copy.ts` | `trial-copy.test.ts`, `stripe-map.test.ts` § trials |

Live Stripe state was read once, read-only, into
`docs/ops/stripe-price-audit-2026-09-19.txt` (amounts only). Live DB rows were
read with `docker exec supabase-db psql … select … from plans` on 2026-09-19.

## 1. Parity table — subscriptions

A$ are GST-inclusive. "DB" = `plans` row (price / annual / trial / stripe id present). "Stripe" = the audit file.
`✓` = all four agree after this lane; the **Fix** column says what was wrong before.

| plan id | Public name | Code (plans-v2 / csv) | DB row | Stripe (audit) | Env var | trial_days | Sold from | Status / fix |
|---|---|---|---|---|---|---|---|---|
| `founder_free` | Free | A$0 | 0 · active | — | — | 0 | `/pricing` Founder, `/signup` | ✓ |
| `founder_starter` | Starter | A$29/mo (annual 290 in copy) | 2900 · **annual id NULL** · id ✓ | 29.00/mo inclusive | `STRIPE_PRICE_FOUNDER_STARTER` | 7 | `/pricing#tier-starter`, `/signup?plan=founder_starter` | ✓ monthly. **No annual Stripe price exists** — the Annual toggle is hidden for it by `annualAvailablePlanIds()`; founder: mint `…_ANNUAL` (A$290, inclusive) if annual founder billing is wanted |
| `founder_growth` | Growth | A$69/mo (annual 690 in copy) | 6900 · annual id NULL · id ✓ | 69.00/mo inclusive | `STRIPE_PRICE_FOUNDER_GROWTH` | 7 | `/pricing#tier-growth`, `/signup`, reseller wholesale | ✓ monthly (same annual note). **Fixed:** reseller `create-startup` booked legacy `STRIPE_PRICE_GROWTH` = A$99/mo; `seed-stripe --update-db-only` mapped the row to the same A$99 id |
| `founder_scale` | Pro (retired 2026-09-08) | A$299 · `public:false` · csv `active:false` | 29900 · active **false** | 299.00 **INACTIVE** | `STRIPE_PRICE_FOUNDER_SCALE` | 7 | nowhere | ✓ retired everywhere. **Fixed:** `seed-stripe --update-db-only` mapped it to `STRIPE_PRICE_GROWTH_499` (A$499) |
| `founder_enterprise` | Enterprise | Custom (contact) | NULL · custom | — | `STRIPE_PRICE_FOUNDER_ENTERPRISE` unset (by design) | 0 | `/pricing` contact row | ✓. **Fixed:** plans-v2 said trial 7 → 0 |
| `investor_angel` | Scout | A$79 / 790 | 7900 / 79000 · ids ✓ | 79 + 790 · **tax unspecified** | `STRIPE_PRICE_INVESTOR_ANGEL(_ANNUAL)` | 7 | `/pricing?segment=evaluator#tier-scout`, `/signup?segment=evaluator` | ✓ amounts; tax_behavior → founder (§5) |
| `investor_advisor` | Firm | A$149 / 1,490 | 14900 / 149000 · ids ✓ | 149 + 1490 · tax unspecified | `STRIPE_PRICE_INVESTOR_ADVISOR(_ANNUAL)` | 7 | `#tier-firm` | ✓ amounts; tax → founder |
| `investor_vc_small` | Program | A$349 / 3,490 | 34900 / 349000 · ids ✓ | 349 + 3490 · tax unspecified | `STRIPE_PRICE_INVESTOR_VC_SMALL(_ANNUAL)` | 7 | `#tier-program` | ✓ amounts; tax → founder |
| `investor_fund` | Fund | A$999 / 9,990 | 99900 / 999000 · ids ✓ | 999 + 9990 inclusive | `STRIPE_PRICE_INVESTOR_FUND(_ANNUAL)` | 7 | `#tier-fund` | ✓ |
| `investor_vc_ent` | VC Enterprise | Custom | 250000/3000000 · custom · no id | — | unset (by design) | 0 | contact row; `svi-api/checkout institutional` | ✓. **Fixed:** plans-v2 trial 7 → 0; settings page sold it as "A$2,000/mo Upgrade" (checkout 503) → "Custom · Contact sales" |
| `accelerator_intake` | Intake link | A$249 / 2,490 (annual-first) | 24900 / 249000 · ids ✓ | 249 + 2490 inclusive | `STRIPE_PRICE_ACCEL_INTAKE(_ANNUAL)` | 14 | `/pricing?segment=programs#tier-intake`, `/pilot`, `/solutions/accelerator` | ✓ |
| `accelerator_starter` | Cohort 25 | A$500 / 5,000 | 50000 / 500000 · ids ✓ | 500 (tax **unspecified**) + 5000 (inclusive) | `STRIPE_PRICE_ACCEL_STARTER(_ANNUAL)` | 14 | `#tier-cohort-25` | ✓ amounts; monthly tax → founder |
| `accelerator_growth` | Cohort 100 | A$1,500 / 15,000 | 150000 / 1500000 · ids ✓ | 1500 (tax unspecified) + 15000 (inclusive) | `STRIPE_PRICE_ACCEL_GROWTH(_ANNUAL)` | 14 | `#tier-cohort-100`, `/for/accelerator` | ✓ amounts; monthly tax → founder. **Fixed:** `/for/accelerator` said "7-day trial · Day 8" (now reads `trial_days` = 14) |
| `accelerator_enterprise` | Cohort Enterprise | from A$3,500/mo · contact | **`monthly` · trial 14 · no id** | — (never minted) | `STRIPE_PRICE_ACCEL_ENTERPRISE` unset | 14 → **0** | contact row ("from A$35,000/yr") | **DB row wrong** → csv now `custom` / trial 0; **migration `0413_cohort_enterprise_custom_interval.sql` written, NOT applied** (checkout answered 503 `plan_not_provisioned` instead of `contact_sales`) |
| `index_api` | Index API | A$299 / 2,990 (hidden card; contact row + `/developers`) | 29900 / 299000 · ids ✓ | 299 + 2990 inclusive | `STRIPE_PRICE_INDEX_API(_ANNUAL)` | 0 | `/pricing` contact row, `svi-api/checkout team`, `/workspace/settings/enterprise` | ✓. **Fixed:** settings page card said **A$199/mo** → reads the rung (A$299) |
| `founder_package` | Startup Package | A$149 one-off · 25 credits · 90 d Radar | **no `plans` row** (checkout hard-codes the SKU; csv row exists) | 149.00 one-off inclusive | `STRIPE_PRICE_STARTUP_PACKAGE` | 0 | `/startup-package`, `/docs/startup-package` | ✓ amounts. Note: not in DB by design (`IS_STARTUP_PACKAGE` branch in checkout) |
| Equity add-on | `addon_share_mgmt` | A$59/mo · 590/yr | n/a (add-on, `entitlements` grants) | 59 + 590 inclusive | `STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY/_ANNUAL` | — | `/workspace/billing` drawer, Growth bullet | ✓ |

## 2. Parity table — one-off reports and credit packs

| SKU | Code | Stripe | Env var | Sold from | Status / fix |
|---|---|---|---|---|---|
| Trusted Business Report (`sku_trust_report_5aud`) | A$3.00 inc. GST (`TRUST_REPORT_5AUD`, `FEATURE_COSTS.trust_report` = 3 credits) | 3.00 one-off inclusive | `STRIPE_PRICE_TRUST_REPORT_5AUD` | `ReportPaywallGate`, unlock rail, `/api/reports/checkout` | ✓ |
| One-Click Report (`sku_one_click_report_3aud`) | A$3.00 | 3.00 one-off **tax unspecified** | `STRIPE_PRICE_ONE_CLICK_REPORT` | `/one-click-report`, guest checkout, **now also** `/api/stripe/analysis` (SVI paywall "Quick Report") | ✓ amount; tax → founder. **Fixed:** `/api/stripe/analysis` booked `SVI_ANALYSIS_25` = **A$25** since the 2026-08-01 early-bird while the card said "0.50 cr" |
| Money Finder report (`sku_funding_report_3aud`) | A$3.00 | 3.00 one-off inclusive | `STRIPE_PRICE_FUNDING_REPORT` | `/funding` paywall, `/api/funding/checkout` | ✓ |
| ~~Cohort Validation Pilot~~ (`cohort_pilot_25` / `cohort_pilot_50`, G21 P0-C) | **retired 2026-09-21 (G25, founder: "bỏ luôn coupon và pilot")** — no SKU, no constant, no catalogue row; the prices were never minted | never minted — nothing to archive | `STRIPE_PRICE_COHORT_PILOT_25` / `_50` — env NAMES retired, unset everywhere | none — `/pilot`, `/vi/pilot` 301 → the programs pages; the Programs surfaces sell Cohort 25 / Cohort 100 only | `POST /api/stripe/checkout {plan:"cohort_pilot_25"}` answers `400 Invalid or free plan`; `pilot_orders` (0416 / 0434) stays as a read-only ledger (0437 re-comments it) |
| Credits 5 / 10 / 25 / 50 / 100 | A$5 / 9 / 20 / 35 / 60 (`CREDIT_PACKS`) | 5 / 9 / 20 / 35 / 60 one-off, all tax unspecified | `STRIPE_PRICE_CREDITS_5…100` | `/workspace/billing#credits`, SVI paywall, `/api/credits` | ✓ amounts; tax → founder. **Fixed copy:** e-mails still sold "50 credits A$15 Save 70%", "10 credits for A$5"; env-audit doc said A$15 / A$25 |

## 3. Legacy Stripe prices (still active in Stripe, no consumer in `web/src` after G18-A)

Removed from `STRIPE_PRICE_MAP` and from every route (commit `79d4b78b8`). Each could book an amount no page shows:

| Env var | Stripe | Was read by | Verdict |
|---|---|---|---|
| `STRIPE_PRICE_FOUNDING50` | A$3.00 one-off (promo closed 2026-09-01; DB legacy row says 500 ¢) | `/api/lead` founding50 fork (dead behind `isFoundingPromoActive()` = false) — fork deleted | **safe to archive** |
| `STRIPE_PRICE_FOUNDER` | A$99/mo | nothing | safe to archive |
| `STRIPE_PRICE_GROWTH` | A$99/mo | reseller wholesale (fixed → FOUNDER_GROWTH); `planId:"growth"` checkout (now remaps to `founder_growth`); admin stripe-sync audit row (kept, reads env directly) | safe to archive once no `growth` subscription remains |
| `STRIPE_PRICE_GROWTH_ANNUAL` | A$950/yr | `growth_annual` checkout (now remaps → `founder_growth` annual, which has no price → bills monthly, never A$950) | safe to archive once no subscription remains |
| `STRIPE_PRICE_GROWTH_499` | A$499/mo | checkout early-bird escalation `planId==="growth" && !isGrowthEarlyBird()` — **deleted** | safe to archive |
| `STRIPE_PRICE_PILOT` | A$5,000 one-off | nothing (the old `/pilot` page is a 301 since G25) | safe to archive |
| `STRIPE_PRICE_ACCELERATOR` | A$20,000/yr | nothing | safe to archive |
| `STRIPE_PRICE_SVI_ANALYSIS` / `_25` | A$1 / A$25 one-off | `/api/stripe/analysis` — retargeted to the A$3 One-Click price | safe to archive |

Legacy **plan ids** (`free`, `founding50`, `growth`, `growth_annual`) stay in `lib/plans.ts` `LEGACY_PLANS` / `LEGACY_PLAN_MAP` for entitlement grandfathering and the DB rows stay; they are never billable any more.

## 4. Copy drift fixed (file → new value)

All fixed figures now read a constant; none is re-typed. Commits `1a5ac90f5` (copy), `79d4b78b8` (routes), `c14ccdf53` (GST).

- `components/svi/svi-entrance.tsx` paywall "A. Quick Report" → `A$3` (`ONE_CLICK_REPORT_3AUD`), "one report · inc. GST" (was "0.50 cr" → charged A$25)
- `components/svi/rnd-page-lock.tsx` → "Unlock — 1 credit" (`RND_REPORT_CREDITS`), Starter link (was "Unlock — A$1" + "Get Founding 100 — A$5 (50 credits, lifetime)" → `/founding-50`)
- `components/svi/rnd-locked-section.tsx` → "1 credit for the full report", "buy credit packs from A$5" (`CREDIT_PACKS[0]`), Starter link (was "From A$0.50 per section", "unlimited reports — A$1 lifetime")
- `lib/sales/cta-variants.ts` (5 rows) → Starter / Growth / Scout, `/pricing#tier-*` (was "Founding-50 A$5", "Founder Pro", "Start 7-day Pro trial")
- `app/search/page.tsx` → "See plans →" `/pricing#tier-starter` (was "Founding 100 · A$5" → `/founding-50`)
- `app/for/[segment]/segment-content.ts` + `page.tsx` → labels Growth / Scout / Cohort 100 from the catalogue, trial line reads `trial_days` (Cohort 100 = 14)
- `workspace/settings/referrals/referrals-client.tsx` → "You get 2 credits. They get 1 bonus credit" (`credits-public`), promo note removed (was 5 / 3 "until 31 July 2026")
- `reseller/create-startup/page.tsx` → "45 credits/month" (was 200)
- `workspace/settings/enterprise/svi-api-section.tsx` + `lib/svi-api-auth.ts` → Team A$299 (Index API rung), Institutional "Custom · Contact sales" (was A$199 / A$2,000 + broken Upgrade)
- `lib/credits.ts` `SIGNUP_CREDITS()` post-promo → `FREE_SIGNUP_CREDITS` (3) (was 2 while the grant and copy said 3)
- `lib/email.ts`: `sendCreditLowAlert` ("Buy 10 credits for A$9"), `sendD9LastCall` (Starter A$29 last call; was Founding 100 A$5 / "A$49/mo" / `/founding-50`), `sendNurtureFreeDay7/14`, `sendLowCreditAlert` + `sendUnlockDeeperAnalysis` (packs from `CREDIT_PACKS`; was 50 for A$15 "Save 70%"), `sendD1Welcome` (0.5 of 3 credits), `sendPaymentLink` neutralised
- `api/cron/onboarding-sequence` D+7, `api/cron/nurture-emails` D+7 → Starter A$29 / Growth A$69 + credits (was Founding 100 A$5, "back to A$99/mo")
- `api/cron/growth-insights` LLM context + two recommendations → ladder from `PLANS_V2` / `trustReportPriceLabel()` (was "Founding 100 $1", "SVI Report $25", "Founder $99 / Growth $499")
- `lib/email-drip.ts` d14 → `STARTER_MONTHLY_CREDITS` from plans.generated
- `app/docs/page.tsx` evaluator line → generated from the catalogue incl. Fund; trial line reads `trial_days`
- `app/(marketing)/roadmap/page.tsx` "A$5.50 inc-GST checkout" → "one-off checkout (since re-priced to A$3 inc. GST)"
- `lib/api-docs-registry.ts` sample "From $19/mo" → "From A$29/mo"
- `lib/startup-package/interview-steps.ts` placeholders "A$99/mo Starter and A$299/mo Growth" → neutral "A$49/mo Basic and A$199/mo Team" (they read as our ladder)
- `docs/API-REFERENCE.md`: credit costs 0.5 / 0.25 / 0.5 / 0.5 / 1 (were 1 / 1 / 2 / 3 / 3), `/api/stripe/analysis` note, Plan Credits appendix rebuilt (was Free 1 / Founding 50 A$49 / Founder A$99 / Growth A$499)
- `lib/plans/trial-copy.ts` `after_trial()` takes `trialDays` (signup said "After 7 days" on 14-day Programs rungs); `TRIAL_WARNING_HOURS_BEFORE` 48 → **72** (the installed cron is `trial-end-reminder` T-3 d; `trial-charge-warning` 48 h is not in the crontab)
- `plans-v2.ts`: `founder_enterprise` / `investor_vc_ent` / `accelerator_enterprise` trial_days → 0
- Deleted dead components still selling closed promos: `components/ui/promo-banner.tsx` ("A$0.50, normally A$25"), `components/landing/hero-v3.tsx` ("Claim Your Founding Spot — A$5")

Not changed (intentional): `content/insights/*` dated articles; `src/remotion/*` pitch-video scripts (public only if re-rendered); admin-only surfaces (`admin/roadmap`, `admin/config` legacy fields, `platform-config.ts` legacy defaults); i18n "+ GST" competitor quotes.

## 5. GST rule

Prices are **GST-inclusive** (Stripe `tax_behavior: "inclusive"`; ATO tax invoice per charge). Two spellings, defined once in `plans-v2.ts`:

- after an amount: `withGst("A$3")` → **"A$3 inc. GST"** (`GST_SUFFIX`)
- policy sentence, once per surface: **"AUD pricing, GST-inclusive. Every charge produces an ATO tax invoice."** (`GST_POLICY_LINE`, rendered by `/pricing` and the matrix footer)

`lib/pricing/gst-wording.test.ts` fails on any retired spelling (`inc-GST`, `inc GST`, `incl. GST`, `GST-incl.`, `GST included`, `GST inclusive`) anywhere in `web/src` except the ATO invoice checker. Receipt copy: `ReportOrderView` "Paid A$x.xx inc. GST" goes through `withGst()`; Stripe checkout creates the invoice with the ABN custom field and GST-registered footer (`api/stripe/checkout` one-off branch).

**Stripe `tax_behavior` expectation:** every active price should be `inclusive`. 14 active prices are still `unspecified` (dashboard-only change — the founder edits each Price's tax behaviour, no code change, the catalogue + weekly audit then need the row flipped to `inclusive`):

`STRIPE_PRICE_INVESTOR_ANGEL`, `…_ANGEL_ANNUAL`, `…_INVESTOR_ADVISOR`, `…_ADVISOR_ANNUAL`, `…_INVESTOR_VC_SMALL`, `…_VC_SMALL_ANNUAL`, `…_ACCEL_STARTER` (monthly only), `…_ACCEL_GROWTH` (monthly only), `…_CREDITS_5`, `…_CREDITS_10`, `…_CREDITS_25`, `…_CREDITS_50`, `…_CREDITS_100`, `…_ONE_CLICK_REPORT` — plus the 9 legacy prices in § 3 (archive instead).

## 6. Trials

DB `plans.trial_days` (2026-09-19): **7** — founder_starter, founder_growth, investor_angel, investor_advisor, investor_vc_small, investor_fund; **14** — accelerator_intake, accelerator_starter, accelerator_growth; **0** — index_api, investor_vc_ent, founder_enterprise, founder_free (and accelerator_enterprise after 0413). `stripe-map.test.ts` § trials pins plans-v2 === plans.csv === migrations 0309 / 0400 / 0413 for every public plan.

Exact Stripe behaviour (both entry points):

| Step | `/api/stripe/checkout` (Checkout Session, `mode: subscription`) | `/api/auth/register-with-card` (direct `subscriptions.create`) |
|---|---|---|
| Card | `payment_method_collection: "always"` — Checkout collects a card even at A$0 due today | `default_payment_method: <SetupIntent pm>` — card confirmed client-side first |
| Trial | `subscription_data.trial_period_days = plans.trial_days` (only when > 0) | `trial_period_days = resolveTrialDays(plan)` (row value, fallback 7) |
| No card at end | `trial_settings.end_behavior.missing_payment_method: "cancel"` — Stripe cancels instead of charging | same |
| First charge | invoice at trial end (day 8 / day 15), Stripe retries per dunning; `invoice.payment_failed` → grace, `customer.subscription.deleted` → entitlements revoked (webhook) | same |
| Reminder | `trial-end-reminder` cron hourly, window T-3 d (+ Stripe `trial_will_end` at T-3 d as backup) → e-mail "ends in 3 days, charged A$x on <date> unless you cancel" | same |
| Cancel | Billing portal / cancel route (other lane) — cancelling during the trial ends it at period end with no invoice | same |

So the public promise "card required · cancel any time · no charge before day 8 (day 15 on Programs)" is what Stripe does. The 48 h reminder in copy was the one untrue detail — fixed to 72 h.

## 7. Founder-only Stripe actions

1. Flip `tax_behavior` → `inclusive` on the 14 active prices in § 5, then set their catalogue rows to `inclusive`.
2. Archive (never delete) the 9 legacy prices in § 3 once the dashboard shows no live subscription on them; drop the env vars afterwards.
3. Decide founder annual billing: mint `STRIPE_PRICE_FOUNDER_STARTER_ANNUAL` (A$290) / `…_GROWTH_ANNUAL` (A$690) inclusive, `plans.stripe_price_id_annual` via `seed-stripe.mjs`, then add both to the catalogue — or drop `annual_aud` from those two plans-v2 rows.
4. Apply migration `0413_cohort_enterprise_custom_interval.sql` (`scripts/db/apply-migration.sh`).
5. Install the `# G18-A` crontab line (weekly Monday 03:20 UTC `scripts/stripe-price-audit.mjs`).
6. ~~G21 P0-C (F-2): mint the two Cohort Validation Pilot prices~~ — **withdrawn by G25 (2026-09-21)**: the pilot SKUs and the conversion coupons are retired; nothing to mint. If `STRIPE_PRICE_COHORT_PILOT_25/50` or `STRIPE_COUPON_PILOT_CREDIT_25/50` were ever set in `web/.env.production`, remove the lines (no code reads them). Apply `0437_pilot_orders_retired.sql` (comment only) and `0438_org_settings_onboarding_metrics.sql` (the Cohort onboarding kit's metrics column) with `scripts/db/apply-migration.sh`.

## 8. Checkout links (every buy / trial CTA on the audited surfaces)

Audited 2026-09-19 (G25 2026-09-21: `/pilot` is a 301, the programs CTA "Start a cohort" → `/signup?segment=evaluator&plan=accelerator_starter&trial=1&interval=annual`, the card-required trial): `/pricing` (+ `/vi/pricing`), `/solutions/*`, gate cards (`credit-gate`, `ReportPaywallGate`, unlock rail, `funding-paywall`, `upgrade-modal`, `paywall-nudge`), `/one-click-report` + guest checkout, `/funding`, Startup Package, `/workspace/billing#credits`. Every href resolves to an existing route (or a `next.config.ts` redirect: `/svi` → `/startup-index`, `/login` → `/auth/login`, `/founding-50` → `/pricing`); every paid CTA reaches a checkout route that books the env var in § 1–2 (`/api/stripe/checkout` → `plans.stripe_price_id[_annual]` / `STRIPE_PRICE_STARTUP_PACKAGE`; `/api/reports/checkout` → `TRUST_REPORT_5AUD`; `/api/guest-analysis/create-order` → `ONE_CLICK_REPORT`; `/api/funding/checkout` → `FUNDING_REPORT`; `/api/credits` → `CREDITS_n`; `/api/svi-api/checkout` → `INDEX_API` / contact). Every `#tier-*` fragment is one `pricing-matrix.tsx` renders. Fixed: `paywall-nudge` `?highlight=` and `upgrade-modal` `/auth/login?next=/pricing?plan=` (unencoded, unread) → `#tier-<x>` via `pricingHrefForPlan()`.

Follow-ups (harmless, params the destination ignores): `/contact?plan=…&contact_reason=…` (contact form reads only `?topic=`), `trial=1` / `from=pilot` on `/signup` (analytics only), legacy `growth` / `growth_annual` in `SIGNUP_ALLOWED_PLAN_IDS` (no CTA passes them; `resolvePreferredPlan` falls back).

## 9. Verification (this lane)

`tsc --noEmit` clean; eslint 0 errors on touched files; targeted vitest green:
`src/lib/pricing` (stripe-map 16, gst-wording 2, svi-api-tiers 4, trust-report, v3-skus, report-credit-cost), `src/lib/plans-v2*`, `src/config/pricing` (plans, generated, gate-pairing), `src/lib/credits`, `src/lib/plans*`, `src/app/(marketing)/pricing`, `components/landing/pricing-matrix`, `lib/seo/site-meta`, `api/stripe/{checkout,change-plan,analysis,webhook}`, `api/lead`, `lib/stripe*`, `lib/email*`, `api/cron/onboarding-sequence`, `scripts/stripe-price-audit.test.mjs`; `node scripts/stripe-price-audit.mjs --dry-run` (39 rows; all 39 vars set on the production env).

## 10. Plan features — bullet ↔ flag ↔ page parity (G20-F1, 2026-09-20)

Appended by lane F1 of G20 (`docs/plans/g20-ready-for-sale-2026-09-20.md` § 3 F1.3). For every **public** plan card (`plans-v2.ts` `public: true`), each advertised bullet, the flag / `minPlan` that gates it, the page that delivers it, and the verdict after this lane. `csv` = `web/src/config/pricing/plans.csv` (→ `plans.generated.ts`, `LEGACY_FEATURE_FALLBACK`, tier ladder, DB `plans.feature_flags`). Hidden surfaces are in `web/src/lib/features/hidden.ts` and `docs/ops/feature-inventory.md`.

**Fixed by this lane (copy):** Growth — `"Connect Stripe or Xero — … weekly"` → `"Investor Pack — one-click PDF pack for your raise, plus the secondary-offer simulator"` (both OAuth apps are unprovisioned on production: `STRIPE_CLIENT_ID` 0, `XERO_CLIENT_ID` 0; `investor_pack` + `secondary_market.view` were csv flags with no bullet). Scout — `"ICS calendar and share-link tracking"` → `"ICS calendar of every grant and program deadline"` (no evaluator share-link tracking exists). Firm — `"White-label PDF reports + client roster"` / `"Full mentor access to each client's workspace"` / `"R&DTI / ESIC / s708 checks per client"` → `"Client roster + engagement notes on every client"` / `"Intake link — score every applicant on one rubric"` / `"ESIC, R&DTI and s708 eligibility checkers"` (white-label hidden; mentor routes gate on `reseller.console`; no per-client compliance surface). Cohort 25 — `"… weekly re-score of every startup"` → `"Cohort dashboard with weekly progress deltas on every startup"` (no per-cohort re-score cron; Progress Radar supplies the deltas). Cohort 100 — `"Cohort management — mentors, check-ins and notes"` → `"LP report composer — anonymised cohort performance for your limited partners"` (mentor tooling is the reseller console).

**Fixed by this lane (flags):** `accelerator.cohort` added to `investor_vc_small`, `investor_fund`, `investor_vc_ent` — the Program / Fund "Cohort dashboard + quarterly LP / sponsor report export" bullet 402-ed on `/workspace/accelerator/cohort` and `/quarterly-report` (both gate on that flag) while the export API (`lp_report`) worked. csv + generated + fallback + ladder carry it; **migration `0414_program_fund_accelerator_cohort.sql` written, NOT applied** (idempotent `feature_flags || '["accelerator.cohort"]'` where absent). `feature-gates.manifest.ts`: `api/data-room/engage` → `investor_links.premium` (was `share_management`, a Growth add-on flag on a Starter-sold feature; the route body never enforced the manifest).

| Plan | Bullet | Flag / minPlan | Delivering page | Verdict |
|---|---|---|---|---|
| Free | Your SVI score across all eight dimensions | none (free path) | `/analyze` → `/workspace/score` | ✓ |
| Free | 1 startup workspace | `lib/startups/startup-limit.ts` (csv `profiles: 0` is not the founder limit — documented in plans-v2) | `/workspace/projects` | ✓ (note) |
| Free | Five-page summary, e-mailed as PDF | none | `lib/analyses/free-summary.ts` | ✓ |
| Free | Valuation range with its low and high | none | inside the free report (the `/workspace/valuation` hub is Starter) | ✓ (note) |
| Free | Money Finder preview | `grant_finder` absent = preview | `/workspace/funding` | ✓ |
| Free | Trusted Business Report A$3 pay-as-you-go | credits | `/api/funding/report`, unlock rail | ✓ |
| Starter | Everything in Free · 1 workspace · 20 credits · e-mail support | `profiles: 1`, `monthly_credits: 20` | — | ✓ |
| Starter | Data room, filling in the order investors ask | `data_room.access` | `/workspace/documents/data-room` | ✓ |
| Starter | Share a live link instead of a PDF | `investor_links.premium` | `POST /api/data-room/access` → `/s/dr/[token]` | ✓ |
| Starter | NDA click-wrap + watermarked PDFs | `investor_links.premium` | `api/data-room/nda`, `share/[token]/pdf` | ✓ |
| Starter | See which sections each investor read | `investor_links.premium` (manifest fixed) | `GET /api/data-room/engage` | ✓ (fixed) |
| Starter | Founder Radar — deadline alerts, monthly re-match, weekly next step | `money_radar` | crons `money-radar-sweep`, `founder-weekly-digest`; `/workspace/funding`; prefs | ✓ |
| Starter | (silent) full Money Finder report | `grant_finder` | `/workspace/funding` | flag-without-bullet, harmless |
| Growth | Everything in Starter · 45 credits · priority support | `monthly_credits: 45` | — | ✓ |
| Growth | Cap-table sync + data room | `cap_table.write`, `share_management` | `/workspace/equity/cap-table` | ✓ |
| Growth | Term Sheet AI drafter | credit-metered (`term_sheet_ai` flag unread) | `/workspace/raise/term-sheet`, `/api/term-sheet` | ✓ (flag dead, feature live) |
| Growth | + investor matching, unlimited application drafts, quarterly expert update | tier ≥ growth (`lib/funding/growth-extras.ts`) | `/api/funding/draft`, `lib/funding/investor-match.ts` | ✓ |
| Growth | **Investor Pack + secondary-offer simulator** (new) | `investor_pack`, `secondary_market.view` | `/workspace/reports/investor-pack`, `/workspace/equity/secondary` | ✓ (fixed) |
| Growth | Equity add-on A$59 — ESOP, vesting, on-chain sync | add-on grants `esop.manage`, `vesting.*`, `blockchain.sync` | `/workspace/esop`, `/api/blockchain/*` | ✓ |
| Scout | 10 TBRs / month · 25 startups, 1 seat | `reports_per_month`, `profiles`, `seats` | report quota, `/workspace/investor/team` | ✓ |
| Scout | Weekly Progress Radar | `money_radar` | cron `evaluator-progress-weekly` | ✓ |
| Scout | Deal-flow feed + watchlist | `investor.dealflow`, `watchlist` | `/workspace/investor/dealflow`, `/watchlist` | ✓ |
| Scout | **ICS calendar of every deadline** (fixed) | `money_radar` | `/api/funding/calendar.ics` | ✓ (fixed) |
| Scout / Firm / Program / Fund / Programs | Money Finder & Progress Radar included | `grant_finder`, `money_radar` | as above | ✓ |
| Firm | Everything in Scout · 30 TBRs · 50 startups, 3 seats | limits | — | ✓ |
| Firm | **Client roster + engagement notes** (fixed) | `advisor.cohort` | `/workspace/advisor/roster`, `/notes` | ✓ (fixed) |
| Firm | **Intake link** (fixed; was silent) | `intake.manage` | `/workspace/accelerator/applications`, `/apply/[slug]` | ✓ (fixed) |
| Firm | **ESIC, R&DTI and s708 checkers** (fixed) | none (public tools) | `/tools/esic`, `/tools/rnd-tax`, `/compliance/s708` | ✓ (fixed) |
| Program | Everything in Firm · 100 TBRs · 200 startups, 5 seats | limits | — | ✓ |
| Program | Batch scoring — one rubric across a round | `lp_export` (or `accelerator.cohort`) | `POST /api/evaluations/batch` | ✓ |
| Program | Cohort dashboard + quarterly LP / sponsor export | `accelerator.cohort` (**added, 0414**), `lp_report` | `/workspace/accelerator/cohort`, `/quarterly-report`, `/api/reports/quarterly` | ✓ (fixed) |
| Program | Read-only API access | `api.access` | `/workspace/settings/enterprise#api-keys`, `/developers` | ✓ |
| Fund | Everything in Program · unlimited TBRs · 500 startups, 10 seats | limits | — | ✓ |
| Fund | Your own rubric weights on every batch and cohort table | none (any batch caller) | `api/evaluations/batch` `rubric_weights` | ✓ (not Fund-exclusive — copy only) |
| Fund | Weekly Progress Radar across the portfolio | `money_radar` | cron | ✓ |
| Fund | Quarterly LP / sponsor export | `lp_report` + `accelerator.cohort` (**added**) | as Program | ✓ (fixed) |
| Fund | Read-only API access | `api.access` | as Program | ✓ |
| Intake link | 40 TBRs · 60 startups, 3 seats · batch scoring · cohort table + CSV + quarterly report · deal flow + watchlist | `accelerator.cohort`, `lp_report`, `investor.dealflow`, `watchlist` | accelerator hub | ✓ (the SKU's own intake link is `intake.manage`, silent in the copy — harmless) |
| Cohort 25 | Everything in Intake · 50 TBRs · 25 startups, 5 seats · 200 credits | limits | — | ✓ |
| Cohort 25 | **Cohort dashboard with weekly progress deltas** (fixed) | `accelerator.cohort`, `money_radar` | `/workspace/accelerator/cohort` + Progress Radar | ✓ (fixed) |
| Cohort 100 | Everything in Cohort 25 · 200 TBRs · 100 startups, 15 seats · 800 credits | limits | — | ✓ |
| Cohort 100 | **LP report composer** (fixed) | `minPlan: accel_growth` (`cohort.manage` flag unread) | `/workspace/lp-report` (preview-only composer) | ✓ (fixed; partial page) |

**Still dead flags (granted, nothing reads them — no customer impact, listed for a later csv prune):** `svi.public`, `profile.multi`, `svi.premium`, `term_sheet_ai`, `per_investor_share_links`, `svi.feed`, `advisory_equity`, `advisor_portal`, `diligence_pack`, `portfolio` (page uses `minPlan`), `custom_benchmark`, `multi_fund`, `weekly_delta`, `cohort.view`, `cohort.view.stats`, `cohort.manage`, `api` (only `api.access` is read), `white_label`, `sso`.

**csv ↔ DB drift noticed (not fixed here):** migration `0316_grant_finder_flags.sql` omitted `founder_scale` (Pro, inactive) from the `grant_finder` / `money_radar` append, so the DB row lacks two flags the csv lists — inert (row inactive, fallback bundle has both). `founder_package` has no seeding migration for its `plans` row (checkout hard-codes the SKU by design, § 1).

## 11. ~~Pilot → annual Cohort plan — the credit coupons~~ — retired (G25, 2026-09-21)

Founder decision 2026-09-21, verbatim: **"bỏ luôn coupon và pilot"** — the paid Cohort Validation Pilot (G21 P0-C) and the pilot → annual credit coupons (G23-B) are gone. There is no pilot SKU, no `convert_from_pilot` body field, no `STRIPE_COUPON_PILOT_CREDIT_25/50` env NAME, no conversion write in the webhook, no conversion card. Evaluators go straight to the sold ladder — § 1 unchanged:

| Buyer | Path | Price |
|---|---|---|
| Program (accelerator / incubator / university) | **Start a cohort** → `/signup?segment=evaluator&plan=accelerator_starter&trial=1&interval=annual` (Cohort 25) or the Cohort 100 rung on `/solutions/accelerator#plans` / `/pricing?segment=programs` | Cohort 25 A$5,000 / Cohort 100 A$15,000 a year inc. GST, 14-day trial, card required (`plans.trial_days`) |
| Evaluator desk | Scout / Firm / Program trial sign-up | A$79 / A$149 / A$349 a month (unchanged) |

What replaced the pilot machinery:

- `/workspace/accelerator/onboarding` — the **Cohort onboarding kit** (was the pilot delivery kit; old path 301s): demo pre-step, Setup → Intake → Assessment → Workshop → Report checklist, the success-metric form saved per organisation on `org_settings.onboarding_metrics` (migration 0438, `PATCH /api/accelerator/onboarding/metrics`, org owner only), the applicant consent screen. No purchase, no conversion.
- `/admin/validation` — L3 "Written proposals" (the **Cohort proposal** PDF from `lib/validation/proposal.ts` + `lib/pdf/cohort-proposal-pdf.tsx`, priced from plans-v2, no credit rule), L4 "First paying program" and L5 "Renewal or second paying organisation" auto-filled from `revenue_events` (kinds subscribe / renewal / upgrade on `accelerator_starter` / `accelerator_growth` / `investor_vc_small`) — never from `pilot_orders`.
- `pilot_orders` (0416, 0434) stays applied as a **read-only ledger** (0437 only re-comments the table; erase_account() still anonymises it). `/admin/pilots` lists past comps and can end a running one; `POST /api/admin/pilots` answers `410 pilots_retired`.
- Redirects (301, `next.config.ts`): `/pilot` → `/solutions/accelerator`, `/vi/pilot` → `/vi/solutions/accelerator`, `/pilot/investor` → `/solutions/investor`, `/workspace/accelerator/pilot` → `/workspace/accelerator/onboarding`. No sitemap / hreflang row for any of them.
- Copy guard: `docs/design/messaging.md` § 11 forbids "Cohort Validation Pilot", "paid pilot", "cohort pilot", "book a / the pilot", "start a pilot", "pilot fee / credit / coupon", "thí điểm", and the literals A$1,500 / A$2,500 on every public and signed-in surface (history pages and the admin ledger excepted).
