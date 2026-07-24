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
