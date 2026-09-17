# Stripe env-var audit (2026-07-24)

Inventory of every `STRIPE_PRICE_*` env var referenced by
`web/src/**/*.{ts,tsx}` grouped by consumer, with the concrete consequence
when the var is missing in production.

The audit script is a one-liner:

```bash
grep -rn "STRIPE_PRICE_" web/src --include='*.ts' --include='*.tsx' \
  | grep -oE 'STRIPE_PRICE_[A-Z0-9_]+' | sort -u
```

The founder does **not** need to publish this file — do NOT paste the
resolved values from `.env.local` here. Values live only on the deploy
host.

## Founder tier — required for /signup

> **RESOLVED 2026-09-08.** The three public tiers are provisioned. Three new
> Products + AUD monthly Prices (`tax_behavior=inclusive`, `metadata.sku` =
> tier id) were minted in live mode; `web/.env` + `web/.env.runtime` carry the
> env vars, and `web/supabase/migrations/0119_founder_ladder_stripe_prices.sql`
> repoints `plans.stripe_price_id`.
>
> That migration also fixed a worse latent fault: `plans.stripe_price_id` was
> not empty but held stale 2025 legacy ids that did **not** match the
> advertised amounts — `founder_starter` (A$29) pointed at a A$99/mo price and
> `founder_scale` (A$299) at a A$499/mo price, so the ladder was mis-charging
> rather than merely returning 503.
>
> `STRIPE_PRICE_FOUNDER_ENTERPRISE` stays intentionally unset: enterprise is
> invoiced offline. `/api/stripe/checkout` now answers custom-priced tiers
> (`plans.interval = 'custom'`) with `{ ok:false, error:"contact_sales",
> contactUrl }` at HTTP 200 instead of a misleading "Invalid or free plan" 400.

| Env var                       | Consumer(s)                                                    | Missing consequence                                     |
|-------------------------------|----------------------------------------------------------------|---------------------------------------------------------|
| `STRIPE_PRICE_FOUNDER_STARTER` | `/api/auth/register-with-card` + `getPlanCached("founder_starter")` | Signup for the Starter tier returns `plan_not_provisioned`; UI shows plan as "(unavailable)" in the picker. |
| `STRIPE_PRICE_FOUNDER_GROWTH`  | Same as above                                                  | Growth tier disabled; blocker for the marketing default CTA. |
| `STRIPE_PRICE_FOUNDER_SCALE`   | Same as above                                                  | Scale tier disabled; power-user segment cannot self-serve. |
| `STRIPE_PRICE_FOUNDER_ENTERPRISE` | Same as above                                              | Enterprise tier disabled (expected — sales-assist path). |

All four are declared by `plans.generated.ts` (from `plans.csv`) so
resolution goes through `plans-db.ts` → `process.env[stripe_env_var]`.

## Legacy founder + growth SKUs

| Env var                        | Consumer                                                    | Missing consequence                                         |
|--------------------------------|-------------------------------------------------------------|-------------------------------------------------------------|
| `STRIPE_PRICE_FOUNDING50`      | `lib/stripe.ts` STRIPE_PRICE_MAP + Founding-50 checkout     | Founding 100 one-off ($5) checkout breaks (`/founding-50`).  |
| `STRIPE_PRICE_FOUNDER`         | Same map                                                    | Legacy Founder monthly (no longer sold); low priority.       |
| `STRIPE_PRICE_GROWTH`          | Same map + Reseller wholesale subs                          | Reseller wholesale subscription route errors.                |
| `STRIPE_PRICE_GROWTH_ANNUAL`   | Same map                                                    | Annual (save 20%) Growth CTA breaks.                         |
| `STRIPE_PRICE_GROWTH_499`      | Same map                                                    | Legacy $499 tier (no longer sold); low priority.             |
| `STRIPE_PRICE_PILOT`           | Same map                                                    | Pilot SKU checkout breaks.                                   |
| `STRIPE_PRICE_ACCELERATOR`     | Same map                                                    | Accelerator pack checkout breaks.                            |
| `STRIPE_PRICE_SVI_ANALYSIS`    | Same map                                                    | Single SVI analysis pay-as-you-go route breaks.              |
| `STRIPE_PRICE_SVI_ANALYSIS_25` | Same map                                                    | 25-analysis bundle checkout breaks.                          |

## Credit packs

| Env var                     | Consumer                | Missing consequence                     |
|-----------------------------|-------------------------|-----------------------------------------|
| `STRIPE_PRICE_CREDITS_5`    | Credit-pack checkout    | A$5 → 5 credits pack disabled.          |
| `STRIPE_PRICE_CREDITS_10`   | Same                    | A$9 → 10 credits pack disabled.         |
| `STRIPE_PRICE_CREDITS_25`   | Same                    | A$20 → 25 credits pack disabled.        |
| `STRIPE_PRICE_CREDITS_50`   | Same                    | A$15 → 50 credits pack disabled.        |
| `STRIPE_PRICE_CREDITS_100`  | Same                    | A$25 → 100 credits pack disabled.       |

## Add-ons (per reseller-module-plan.md §F.5)

| Env var                                      | Consumer                                         | Missing consequence                                              |
|----------------------------------------------|--------------------------------------------------|------------------------------------------------------------------|
| `STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY`      | `lib/stripe.ts` ADDON_PRICE_IDS + reseller flow  | Monthly share-management add-on blocked (documented human-blocker P8.5). |
| `STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL`       | Same                                             | Annual share-management add-on blocked.                          |

## Investor / advisor / accelerator SKUs

Referenced in `plans.generated.ts` for future paid tiers. Missing today
does not break existing flows because there are no live UI CTAs pointing
at these SKUs yet — checkout is gated by the plan picker in each segment
page (which itself filters on `stripe_price_id != null`).

| Env var                          | Segment       |
|----------------------------------|---------------|
| `STRIPE_PRICE_INVESTOR_ANGEL`    | Investor      |
| `STRIPE_PRICE_INVESTOR_ADVISOR`  | Advisor       |
| `STRIPE_PRICE_INVESTOR_VC_SMALL` | Investor VC   |
| `STRIPE_PRICE_INVESTOR_VC_ENT`   | Investor VC   |
| `STRIPE_PRICE_ACCEL_STARTER`     | Accelerator   |
| `STRIPE_PRICE_ACCEL_GROWTH`      | Accelerator   |
| `STRIPE_PRICE_ACCEL_ENTERPRISE`  | Accelerator   |

## Pricing v4 SKUs — minted 2026-09-17 (G14)

> **RESOLVED 2026-09-17.** All 10 pricing-v4 env vars are live in `.env` +
> `.env.runtime` (founder-authorised, live-mode keys). Minted by
> `scripts/seed-stripe.mjs --skus=investor_fund,accelerator_intake,index_api,
> accelerator_starter,accelerator_growth` (monthly + annual Prices per SKU,
> `tax_behavior=inclusive`, `metadata.sku` = plan id); audited clean by
> `scripts/sync-stripe-pricing.mjs` (live config amount/cadence vs Stripe
> Price object — all match, `plans.generated.ts` / `plans.csv` unchanged).
> Pilot + accelerator marketing CTAs flipped from Program to
> `accelerator_intake` the same day.

| Env var                              | Plan id                    | Cadence | Amount (AUD) | Consumer / missing consequence |
|---------------------------------------|-----------------------------|---------|---------------|----------------------------------|
| `STRIPE_PRICE_INVESTOR_FUND`          | `investor_fund` (Fund)      | monthly | $999/mo       | `lib/stripe.ts` STRIPE_PRICE_MAP; investor Fund tier checkout — missing returns `plan_not_provisioned`, pricing card shows Contact sales. |
| `STRIPE_PRICE_INVESTOR_FUND_ANNUAL`   | `investor_fund_annual`      | annual  | $9,990/yr     | Same map; annual Fund CTA. |
| `STRIPE_PRICE_ACCEL_INTAKE`           | `accelerator_intake` (Intake link) | monthly | $249/mo | Same map; program intake-link tier — pilot/accelerator marketing CTAs now target this SKU (flipped 2026-09-17). |
| `STRIPE_PRICE_ACCEL_INTAKE_ANNUAL`    | `accelerator_intake_annual` | annual  | $2,490/yr     | Same map; annual Intake link CTA. |
| `STRIPE_PRICE_INDEX_API`              | `index_api` (Index API)     | monthly | $299/mo       | Same map + `svi-api/checkout`, `svi_api_team` alias; 1,000 calls/day developer tier — missing 503s `/svi-api/checkout`. |
| `STRIPE_PRICE_INDEX_API_ANNUAL`       | `index_api_annual`          | annual  | $2,990/yr     | Same map; annual Index API CTA. |
| `STRIPE_PRICE_ACCEL_STARTER`          | `accelerator_starter` (Cohort 25) | monthly | $500/mo | Same map; Cohort 25 public accelerator tier (G12 §9.6 item now closed). |
| `STRIPE_PRICE_ACCEL_STARTER_ANNUAL`   | `accelerator_starter_annual` | annual | $5,000/yr    | Same map; annual Cohort 25 CTA. |
| `STRIPE_PRICE_ACCEL_GROWTH`           | `accelerator_growth` (Cohort 100) | monthly | $1,500/mo | Same map; Cohort 100 public accelerator tier. |
| `STRIPE_PRICE_ACCEL_GROWTH_ANNUAL`    | `accelerator_growth_annual` | annual  | $15,000/yr   | Same map; annual Cohort 100 CTA. |

**Webhook:** `customer.subscription.created` is now enabled on the live
webhook endpoint (`we_1TYooWJ7OAnXQ9sVpIpaTzqP`, 2026-09-17) — resolves the
`subscription_created` GA4 plan-label gap for these SKUs;
`/api/health/stripe` reports `missing_events: []`.

## Prioritised remediation for the current directive

1. `STRIPE_PRICE_FOUNDER_STARTER` — default plan on the `/signup` page.
   Missing here means the Start Trial button 500s.
2. `STRIPE_PRICE_FOUNDER_GROWTH` — marketing CTA target on the pricing
   page.
3. `STRIPE_PRICE_FOUNDER_SCALE` — needed for the power-user upsell path.
4. Everything else — nice-to-have, no signup blocker.

## Non-signup env vars (out of scope for this audit)

`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`. These are pre-existing operational
env vars — verify they're set with `printenv STRIPE_SECRET_KEY` on the
deploy host (never checked in, never logged).
