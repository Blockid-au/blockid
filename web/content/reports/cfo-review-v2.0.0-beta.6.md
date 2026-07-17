# CFO review — BlockID.au v2.0.0-beta.6

Author: CFO agent (Auschain PTY LTD, ACN 659 615 111 / ABN 79 659 615 111)
Date: 2026-07-17
Scope: pricing sanity, GST posture, MRR calculation, save-offer P&L, trial economics, runway proxy, refund/chargeback surfacing, top-3 v2.1 W1 actions.
Ledger of record: `revenue_events` (migration 0075).
Marketing catalogue: `web/src/lib/plans-v2.ts`.
Machine catalogue: `web/src/config/pricing/plans.csv` (build-time source; will emit `plans.generated.ts`).
Not financial advice. Consult a registered tax agent for BAS decisions.

---

## 1. Pricing sanity — 12 SKU matrix

Machine source (`web/src/config/pricing/plans.csv`) is the row-oriented truth for Stripe and entitlements. Marketing surface (`web/src/lib/plans-v2.ts`) MUST match it or the codegen job will fail (see §8). All prices are AUD, GST-inclusive per ACL, and stored as integer cents.

| # | id (csv) | segment | name | monthly A$ | annual A$ | interval | trial | credits/mo | Notes |
|---|----------|---------|------|-----------:|----------:|:---------|------:|-----------:|-------|
| 1 | founder_free | founder | Free (anonymous) | 0 | 0 | free | 0 | 5 promo / 2 default | 1 SVI/mo, 0 profiles |
| 2 | founder_starter | founder | Starter | 29 | 290 | monthly | 7 | 25 | 1 profile, 10 SVI/mo |
| 3 | founder_growth | founder | Growth (most popular) | 99 | 990 | monthly | 7 | 200 (csv) / 800 (ts) | See §1.2 mismatch |
| 4 | founder_scale | founder | Scale | 299 | 2,990 | monthly | 7 | 1,000 (csv) / 3,000 (ts) | See §1.2 mismatch |
| 5 | founder_enterprise | founder | Enterprise | 1,500 (csv) / Custom (ts) | 18,000 / Custom | custom | 0 | unlimited | Ts says Custom; csv fixes 1,500/mo — pick one before beta.7 |
| 6 | investor_angel | investor_angel | Angel | 79 | 790 | monthly | 7 | 400 (ts) / n-a in csv | csv only tracks watchlist_size + diligence_packs |
| 7 | investor_advisor | advisor | Advisor | 149 | 1,490 | monthly | 7 | 1,000 (ts) / n-a in csv | csv tracks `clients:25` |
| 8 | investor_vc_small | investor_vc | VC Small (5-seat) | 349 | 3,490 | monthly | 7 | 3,500 (ts) / n-a in csv | 5 seats, 50-startup portfolio |
| 9 | investor_vc_ent | investor_vc | VC Enterprise | 2,500 (csv) / Custom (ts) | 30,000 / Custom | custom | 0 | unlimited | Same csv-vs-ts drift as #5 |
| 10 | accelerator_starter | accelerator | Cohort Starter | 500 | 5,000 (ts) / 6,000 (csv) | monthly | 7 | 5,000 (ts) | csv annual = 6,000; ts = 5,000 — inconsistent discount pct |
| 11 | accelerator_growth | accelerator | Cohort Growth | 1,500 | 15,000 (ts) / 18,000 (csv) | monthly | 7 | 20,000 (ts) | Same drift |
| 12 | accelerator_enterprise | accelerator | Cohort Scale/Enterprise | 3,500 | 35,000 (ts) / 42,000 (csv) | monthly | 7 | 80,000 (ts) | Same drift |

Count = 12 rows in plans.csv, 12 records in `PLANS_V2` — parity holds.

### 1.1 Feature-flag summary (from `plans.csv` col `feature_flags`)

- founder_free — `svi.public`
- founder_starter — `profile.multi`, `svi.premium`
- founder_growth — `+cap_table.write`, `+data_room.access`, `+investor_links.premium`, `+term_sheet_ai`
- founder_scale — `+esop.manage`, `+blockchain.sync`, `+advisor_portal`, `+white_label`
- founder_enterprise — `+api.access`, `+sso`
- investor_angel — `investor.dealflow`, `investor.watchlist`
- investor_advisor — `+advisor.clients`, `white_label`
- investor_vc_small — `+investor.portfolio`, `investor.lp_export`
- investor_vc_ent — `+api.access`, `custom_benchmarks`
- accelerator_starter — `accelerator.cohort`, `accelerator.batch_svi`
- accelerator_growth — `+accelerator.lp_report`
- accelerator_enterprise — `+api.access`

Feature-flag additivity is respected (each tier is a strict superset except that VC Small has no `white_label` — Advisor gets it, VC Small doesn't; probably a bug — see §1.2).

### 1.2 Discrepancies to fix before beta.7

The plans-v2.ts docstring claims `cfo-spec.md §3.2` is source of truth, but three concrete mismatches exist against `plans.csv` today:

1. **Monthly credit grants** (founder_starter 25 vs 200; founder_growth 200 vs 800; founder_scale 1,000 vs 3,000). Marketing surface (`PLANS_V2`) advertises the higher number; entitlement code reads from `plans.csv → usage_limits.monthly_credits`. Result: customer sees "800 AI credits/month" on the pricing page but Supabase grants 200. **This is a refund-risk / ACL-misleading-advertising problem** — see §7 CLO surface. Fix: either raise csv to 800 or lower marketing copy to 200. Recommendation: raise csv to 800 for founder_growth since our COGS math (§1.3) still comfortably supports it.

2. **Enterprise & VC-Enterprise pricing floor** — csv has fixed A$1,500/mo and A$2,500/mo respectively; ts+cfo-spec show `Custom`. This means Stripe seeder will create real prices, but the pricing page hides them behind "contact-sales". Either publish those floors or set `active=false` in csv until sales-led SKUs have a price rail.

3. **Accelerator annual discount** — ts uses `annual_aud = monthly × 10` (17% off — matches all other SKUs); csv uses `monthly × 12` (0% off). If we sell an accel_growth annual today the customer will pay A$18k/yr for what the marketing page said was A$15k. **Refund risk.** Fix csv annual values to match ts.

### 1.3 Per-credit unit economics

Formula: **per-credit AUD ceiling** = plan price / credits granted.

| SKU | A$/mo | Credits/mo (ts) | A$/credit ceiling | Marginal cost per credit (est) | Gross margin per credit |
|---|---:|---:|---:|---:|---:|
| founder_starter | 29 | 200 | 0.145 | ~0.04 | 72% |
| founder_growth | 99 | 800 | 0.124 | ~0.04 | 68% |
| founder_scale | 299 | 3,000 | 0.100 | ~0.04 | 60% |
| investor_angel | 79 | 400 | 0.198 | ~0.05 | 75% |
| investor_advisor | 149 | 1,000 | 0.149 | ~0.05 | 66% |
| investor_vc_small | 349 | 3,500 | 0.100 | ~0.05 | 50% |
| accel_starter | 500 | 5,000 | 0.100 | ~0.04 | 60% |
| accel_growth | 1,500 | 20,000 | 0.075 | ~0.04 | 47% |
| accel_scale | 3,500 | 80,000 | 0.044 | ~0.04 | ~10% (thin) |

Marginal cost derivation (per `web/src/lib/credits.ts` FEATURE_COSTS):
- 1 credit ≈ 1,000 words output at the standard tier (see `SECTION_DEPTH_CONFIG.deep`).
- 1,000 words ≈ 1,400 output tokens + ~2,000 input context.
- At Claude Sonnet rates (US$3 in / US$15 out per M tokens, roughly A$4.50 in / A$22.50 out) → 2,000 × 4.50e-6 + 1,400 × 22.50e-6 ≈ A$0.009 + A$0.0315 = **A$0.041 marginal COGS per credit** at output-heavy workloads. Free-model fallback (`ai-free-models.json`) drops this to near-zero.

**Upside-down risk: accel_scale.** At A$0.044/credit ceiling and A$0.04 marginal cost we run at ~10% margin per credit — one prompt-length regression or a model-price uptick puts this SKU underwater. Options:
- Cap credits at 40,000/mo (still generous for 100 seats) — restores ~50% GM.
- Or add a "fair-use burst" cap that kicks in at 60,000/mo.

**Nothing else is upside-down.** Founder_growth at A$99/mo × 800 credits gives A$0.124 ceiling vs A$0.041 COGS = 66% GM per credit — comfortably above the 60% floor.

Reference the calculation to `getConfiguredCreditCost()` (credits.ts:179) — that path lets admin dial `credit_cost_*` down in `platform_config` if Claude ever raises prices, which is the correct COGS-defence lever.

---

## 2. GST + AU tax posture

### 2.1 `web/src/lib/gst.ts` audit (lines cited)

The helper is 38 lines and correct:

- **Line 27-28** (`isAU` derivation): `customerJurisdiction.trim().toUpperCase() === "AU"` — tolerant of "au", " AU ", "AU", rejects "AUS", "Australia". This is intentional per ISO-3166 alpha-2. NON-AU customers therefore never accrue GST. Good.
- **Line 30-32** (`if (!registered || !isAU || gross <= 0)`): three-way gate — matches the four-quadrant policy:
  - Registered × AU → `gst = round(gross / 11)`, `net = gross - gst`.
  - Registered × non-AU → GST-free (export).
  - Unregistered × AU → no GST charged (below A$75k turnover threshold — legally correct).
  - Unregistered × non-AU → no GST charged.
- **Line 35** (`Math.round(gross / 11)`): correct GST-inclusive extraction; a A$99 gross becomes A$9 GST / A$90 net. Round-half-to-even would be marginally better for BAS aggregation but the rounding drift over A$100k of revenue is <A$10 — acceptable.
- **Line 26** (`Math.trunc(gross_aud_cents)`): defensive against float input from Stripe raw amount; correct.

**Gap:** the helper has no unit-test file at `web/src/lib/gst.test.ts` yet. The cfo-spec §8.1 promises 10 test cases. Add before beta.7.

### 2.2 `registered` flag — where does it come from?

`calculateGst()` takes `registered` as a parameter. Callers should read it from a `gst_config` singleton (per cfo-spec §4). I could not find that table in `web/supabase/migrations/` (searched 0074 and 0075). **Confirmed gap:** the `registered` flag is currently hardcoded false in the checkout webhook path, meaning **we are NOT collecting GST on any AU sale as of beta.6**. This is intentional pre-threshold (turnover < A$75k) but there is no automated flip when we cross A$75k rolling turnover.

**Action for v2.1 W1:** create `gst_config` table (single row: `registered boolean`, `registered_at timestamptz`, `abn text`), and a nightly job that sums `revenue_events.gross_aud_cents` over the trailing 12 months. Alarm CFO at 80% (A$60k), auto-register at 100%.

### 2.3 CFO dashboard reads `gst_aud_cents` correctly

`web/src/app/admin/pricing-metrics/page.tsx` line 68-70:

```ts
supabase
  .from("revenue_events")
  .select("gst_aud_cents")
  .gte("ts", thirtyDaysAgo)
```

Sum on line 74: `(revLast30.data ?? []).reduce((sum, r) => sum + (r.gst_aud_cents ?? 0), 0)`.

This is correct — we sum the `gst_aud_cents` column across every kind (including refunds/chargebacks/credit_pack — see §7 for why that matters). But there is a subtle issue: **refunds should be recorded with negative gst_aud_cents to keep the accrual honest**. Grep shows no refund-writer path; verify via a synthetic Stripe refund test before v2.1.

Also — line 53 restricts the *MRR/ARR* tile to `kind IN ('subscribe','renewal','upgrade')` but line 68 does not restrict `kind` for the GST accrual sum. Consequence: a `credit_pack` purchase raises the GST accrual (correct) but not the "Revenue 30d" tile (also correct — credit packs are not recurring revenue). Both queries are internally consistent; the label "Revenue (30d, net)" is misleading only because it excludes credit_pack — see §3.

---

## 3. Real MRR calculation

### 3.1 Why the current "Revenue 30d" tile is not MRR

The tile sums 30 days of `net_aud_cents` from `subscribe + renewal + upgrade` events. This means:

- A yearly-billed founder_growth purchase (A$990 up-front) shows as A$990 that month and A$0 the next 11 months. MRR should show A$82.50/mo throughout.
- A trial-convert on day 25 shows one A$99 charge, understating steady-state MRR of that cohort.
- A one-off `credit_pack` (A$25 pack) is excluded — correct for MRR, but the label reads as "revenue" so credit-pack revenue is invisible on this tile.

Net effect: the tile is a **cash inflow proxy**, not an MRR figure. Any month that includes a lumpy annual renewal will look outsized and mislead runway planning.

### 3.2 Proposed SQL for true MRR

Off the `subscription_trial_state` × `plans` join (per user request):

```sql
with active_monthly_prices as (
  select
    p.price_aud_cents
    / (case p.interval when 'yearly' then 12 else 1 end) as monthly_cents
  from subscription_trial_state sts
  join plans p on p.id = sts.plan_id
  where sts.status = 'active'
)
select
  count(*) as active_subs,
  sum(monthly_cents) / 100.0 as mrr_aud,
  sum(monthly_cents) * 12 / 100.0 as arr_aud
from active_monthly_prices;
```

Corrections needed vs the ideal:

- `plans` interval column is `monthly | free | custom` in current csv; there's no `yearly` row (annual is expressed via `annual_price_aud_cents` on the monthly row). So the SQL becomes:

```sql
with active_prices as (
  select
    sts.user_id,
    -- annual customers pay annual_price_aud_cents up-front for 12 months;
    -- monthly customers pay price_aud_cents each month.
    case
      when sts.detail->>'billing_cycle' = 'annual'
        then p.annual_price_aud_cents / 12
      else p.price_aud_cents
    end as monthly_cents
  from subscription_trial_state sts
  join plans p on p.id = sts.plan_id
  where sts.status = 'active'
    and p.active = true
)
select
  count(*) as active_subs,
  sum(monthly_cents) / 100.0 as mrr_aud_gross,
  sum(monthly_cents) * 12 / 100.0 as arr_aud_gross
from active_prices;
```

To net GST out, subtract 1/11 for AU-registered rows once §2.2 lands.

### 3.3 Suggested `/admin/pricing-metrics` tile shape (post-swap)

Replace the current single tile with three tiles that are grounded in `subscription_trial_state`:

- **MRR (recurring)** — `sum(monthly_cents)` from the SQL above. Sub-caption: "N active subs, breakdown: founder X / investor Y / accel Z".
- **ARR (recurring × 12)** — same source × 12. Sub-caption: "Net of GST when registered".
- **Cash inflow (30d)** — the current "Revenue (30d, net)" query. Sub-caption: "Includes annual up-fronts and credit_pack".

The three together let the CFO reconcile: cash inflow spikes on annual renewals; MRR stays smooth. If they diverge more than 30%, we have either a data lag or a lumpy renewal cohort.

Tile file to edit: `web/src/app/admin/pricing-metrics/page.tsx` lines 45-71 (query block) and 145-151 (render).

---

## 4. Save-offer P&L — COMEBACK30 and DOWNGRADE_STARTER50

Assumptions given: monthly LTV baseline = A$300 per active customer (customer lifetime value, not monthly revenue — treating it as total forward value at time of cancel attempt). 30-day cancel rate = 8%. All figures pre-tax.

### 4.1 Offer cost per acceptance

**COMEBACK30** — 30% off × 3 months, applies to any plan. Cost per acceptance depends on plan:

| Plan | Monthly A$ | Discount/mo | 3-mo discount cost |
|---|---:|---:|---:|
| founder_starter | 29 | 8.70 | 26.10 |
| founder_growth | 99 | 29.70 | 89.10 |
| founder_scale | 299 | 89.70 | 269.10 |
| investor_advisor | 149 | 44.70 | 134.10 |

Weighted-average cost using our current expected paid-plan mix (founder_growth ~55%, founder_starter ~25%, others ~20%): ≈ **A$95 discount cost per acceptance**.

**DOWNGRADE_STARTER50** — 50% off Starter A$29 × 3 months = A$14.50 × 3 = **A$43.50 per acceptance**.

### 4.2 True-save breakeven

Frame: of N acceptances, fraction F would have truly churned without the offer (true saves), fraction (1-F) would have stayed anyway (cannibalisation).

- Net gain per true save = LTV recovered − offer cost = A$300 − offer cost.
- Net cost per cannibal = offer cost (pure discount to someone we didn't need to save).
- Breakeven: F × (LTV − cost) = (1 − F) × cost → F = cost / LTV.

| Offer | Offer cost | Breakeven true-save rate F |
|---|---:|---:|
| COMEBACK30 (weighted A$95) | 95 | **31.7%** |
| COMEBACK30 on founder_growth (A$89.10) | 89.10 | 29.7% |
| COMEBACK30 on founder_scale (A$269.10) | 269.10 | 89.7% — **do not apply to Scale** |
| DOWNGRADE_STARTER50 (A$43.50) | 43.50 | **14.5%** |

**Reading:**

- COMEBACK30 must convince at least ~30% of acceptors to be genuine save-cases. Anecdotal SaaS win-back offer acceptance is 40-60% and true-save fraction is typically 50-70%, so this is comfortably above breakeven for founder tiers.
- COMEBACK30 on founder_scale is a **losing offer** — the 30% off a 3-month A$299/mo eats A$269 of LTV, and unless the customer would definitely have churned we're worse off. **Restrict COMEBACK30 to founder_starter/growth + investor_angel** by setting `applies_to.products` on the coupon.
- DOWNGRADE_STARTER50 is a very cheap save with a 14.5% breakeven — nearly any acceptance rate wins. Its risk is different: it re-prices the plan-price ladder. If half of our starter cohort learns this exists, ARPU drops 25% on starter for 3 months without saving anyone. Enforce with `max_redemptions` on the coupon and lifecycle-mailer gating (only serve after cancel-intent event, not on the pricing page).

### 4.3 Base-case P&L on offer campaign

Assume 100 monthly-cancelling founder_growth customers/mo (8% churn on 1,250 subs — a bull scenario). If 40% accept COMEBACK30 and 60% of accepters are true saves:

- 40 acceptances × A$89.10 = A$3,564 total discount cost.
- 40 × 0.60 = 24 true saves × (A$300 − A$89.10) = A$5,062 recovered LTV.
- 40 × 0.40 = 16 cannibals × A$89.10 = A$1,426 pure discount to non-churners.
- **Net gain: A$5,062 − A$1,426 = A$3,636/mo.**

If true-save rate slides to 30% (breakeven), net gain ≈ A$0. Below 30% the campaign is net-negative. Monitor `churn_events.detail->>'save_offer_accepted'` and cohort survival at 30-, 60-, 90-day marks — if 90-day retention of saved customers dips below 70%, the LTV recovered was illusory.

---

## 5. Trial-end conversion economics

Given: 7-day trial, card required (`web/src/lib/trial.ts` — `requiresPayment` flips at day-6 with no payment method). Founder_growth SKU at A$99/mo is the "load-bearing" price point.

### 5.1 Required subs to hit ARR targets (founder_growth only, single-SKU model)

- **Base A$240k ARR** → A$20k MRR → A$20,000 / A$99 = **202 active founder_growth subs**.
- **Bull A$594k ARR** → A$49.5k MRR → **500 active founder_growth subs**.

Neither figure appears verbatim in `cfo-spec.md` or `IMPLEMENTATION-PLAN.md` (spec quotes A$85k MRR / A$1.02M ARR base 12-month, A$180k MRR / A$2.16M ARR bull — richer than the numbers in the prompt). **Flagging: the A$240k / A$594k numbers referenced in the prompt are not in-repo — unknown provenance.** Proceeding with them as stated.

### 5.2 Trial → paid conversion required

Steady-state math (holds when adds ≈ churn × subs):

- Founder churn baseline: 4%/mo (per cfo-spec §6 assumption).
- To sustain 202 subs, we lose 8 subs/mo → need 8 net new paid/mo.
- To reach 202 subs from 0 over 12 months requires ~25 net new paid/mo blended.

Let T = trial starts/mo, C = trial-to-paid conversion rate. Then C × T = net new paid.

| ARR target | Steady-state paid | Required net new/mo | If T = 50 trials/mo, C needed | If T = 100, C needed | If T = 200, C needed |
|---|---:|---:|---:|---:|---:|
| A$240k (base, 202 subs) | 202 | 25 (ramp) or 8 (steady) | 50% (ramp) / 16% (steady) | 25% / 8% | 12.5% / 4% |
| A$594k (bull, 500 subs) | 500 | 60 (ramp) or 20 (steady) | 120% (impossible) / 40% | 60% / 20% | 30% / 10% |

**Reading:**

- Base A$240k ARR is achievable at ~25% trial→paid with 100 trials/mo. That's within cfo-spec's stated target range (25-35%).
- Bull A$594k ARR requires **200+ trials/mo at 30% conversion**. That is a marketing volume problem more than a conversion problem — CMO needs a paid-channel budget calibrated to `cac_ceiling_aud = A$300` (cfo-spec §6).
- The 7-day trial with card required is the correct policy: it artificially thins bottom-of-funnel, raising conversion at the cost of trial volume. If we can't hit 200 trials/mo with card-required, consider a card-not-required alternative for `founder_starter` only (A$29/mo has a low chargeback/refund risk profile).

### 5.3 Trial economics per trial start

Assume:
- Trial cost per user (AI credits, storage, email) ≈ A$1.50 (2 free reports × ~A$0.75 marginal COGS).
- Conversion 30% → 3 in 10 trials pay → A$99 gross × 30% = A$29.70 revenue per trial start.
- Net per trial start: A$29.70 − A$1.50 = A$28.20 before CAC.
- With CAC ceiling A$300 for founder_growth (cfo-spec §6), effective CAC per trial ≤ A$90 (assuming 30% conversion) — leaves ~A$210 gross contribution against LTV A$1,400 (per §6 of spec). Healthy.

Break-even conversion at CAC A$300: A$99 × (1/churn) × C × GM ≥ A$300 → at churn 4%, LTV/paid = A$99 × 25 × 0.84 ≈ A$2,079. Break-even conversion given trial cost ≈ A$1.50: C ≥ A$1.50 / A$2,079 = 0.07% — essentially zero. **The economics forgive missed conversion on individual trials; the real constraint is CAC efficiency, not trial→paid rate.**

---

## 6. Runway proxy — real formula

The prior "runway" tile was a constant divided by a constant; correctly dropped in beta.5. Real runway needs a live cash balance and a burn/inflow rate. The formula that should live in the admin tile:

```
runway_months = cash_balance_aud / max(monthly_cash_burn_aud - monthly_cash_inflow_aud, 1)
```

Guard the divisor with `max(_, 1)` so cash-flow-positive months don't return infinity — instead cap the display at ">36mo" and colour it green.

### 6.1 Data plumbing — new singleton table

Nothing today records cash or burn. Draft migration (additive-only, per repo convention — see `reference_db_migrations`):

```sql
-- web/supabase/migrations/0082_cfo_ledger.sql
-- Additive-only. Single-row singleton (enforced by id=1 PK).
create table if not exists cfo_ledger (
  id smallint primary key check (id = 1),
  cash_balance_aud_cents bigint not null default 0,
  cash_burn_monthly_aud_cents bigint not null default 0,  -- rolling 3-mo avg opex
  cash_inflow_monthly_aud_cents bigint not null default 0, -- rolling 3-mo avg net revenue
  cash_updated_at timestamptz not null default now(),
  burn_updated_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb
);

insert into cfo_ledger (id) values (1) on conflict do nothing;

alter table cfo_ledger enable row level security;

drop policy if exists cfo_ledger_service_all on cfo_ledger;
create policy cfo_ledger_service_all on cfo_ledger
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists cfo_ledger_admin_read on cfo_ledger;
create policy cfo_ledger_admin_read on cfo_ledger
  for select using (
    exists (
      select 1 from app_users u where u.id = auth.uid() and u.role = 'admin'
    )
  );
```

Update paths:
- `cash_balance_aud_cents` — manual once/week by CFO via `/admin/cfo-ledger` (build in v2.1), later automated via a Xero/QuickBooks read-only integration.
- `cash_burn_monthly_aud_cents` — nightly cron computes trailing-3-month operating expenses (Claude API bill + GCP + SaaS subscriptions) from an `opex_events` table (out of scope for this review — flag as unbuilt).
- `cash_inflow_monthly_aud_cents` — nightly cron sums trailing-3-month `revenue_events.net_aud_cents` where `kind IN ('subscribe','renewal','upgrade','credit_pack') AND kind NOT IN ('refund','chargeback')`.

### 6.2 Tile render

```tsx
<Tile
  label="Runway"
  value={m.runwayMonths >= 36 ? ">36mo" : `${m.runwayMonths.toFixed(1)}mo`}
  sub={`Cash A$${m.cashBalance} / burn A$${m.netBurn}/mo`}
/>
```

Alarm rule (COO owns per cfo-spec §5): alert Slack #runway when `runway_months < 9`. Auto-page CEO when `< 6`.

**Do not ship a runway tile until `cfo_ledger` is seeded with a real cash number.** A pretend runway is worse than no runway.

---

## 7. Refund + chargeback surface

Grep on `/admin/pricing-metrics/page.tsx`:

- Line 53 filters MRR/ARR queries to `kind IN ('subscribe','renewal','upgrade')` — **excludes** `refund` and `chargeback`.
- Line 68-70 (GST accrual) does not filter kind — refund/chargeback rows *do* flow into GST if their `gst_aud_cents` is negative (per §2.3 recommendation).
- The tile has no dedicated "Refunds 30d" or "Chargebacks 30d" counter.

**Gaps to close in v2.1:**

- Add a **"Refunds (30d)"** tile summing `abs(net_aud_cents)` where `kind = 'refund'` and `ts > now() - 30d`. Colour red if it exceeds 5% of `Revenue (30d)`.
- Add a **"Chargebacks (30d)"** tile summing `abs(net_aud_cents)` where `kind = 'chargeback'`. Colour red if > 1% of Revenue — this is the Stripe/Visa threshold for elevated-risk flagging.
- Verify the webhook path writes negative `gross_aud_cents`, `gst_aud_cents`, `net_aud_cents` for refunds and chargebacks. If it writes positives with `kind='refund'`, our GST accrual is silently over-stated. Add a check-constraint: `CHECK ((kind IN ('refund','chargeback') AND net_aud_cents <= 0) OR (kind NOT IN ('refund','chargeback') AND net_aud_cents >= 0))` in a later additive migration.
- Wire a Slack alert (COO channel) on any single chargeback > A$500 — those tend to be fraud loops.

---

## 8. Top-3 CFO actions for v2.1 Week 1

1. **Ship real MRR + ARR tiles + drop the misleading "Revenue 30d" label.** Query per §3.2. Replace the single tile with three (MRR, ARR, Cash-inflow) so annual renewals stop distorting the top-line read. Owner: CFO + CTO. Blocker for board-readout accuracy.

2. **Automate GST BAS-quarterly return.** Create `gst_config` singleton, wire the A$75k rolling-turnover watcher (§2.2), and generate a downloadable BAS worksheet at `/admin/bas` each Jan/Apr/Jul/Oct 1st. Worksheet columns: quarter, gross AUD, GST collected, GST paid on inputs (needs `opex_events` — stub for now), net payable. This eliminates the manual quarterly bookkeeping I currently do in Excel and prevents a late-BAS penalty (ATO general interest charge ~11% pa) once we cross the threshold. Owner: CFO + CLO for disclaimer copy.

3. **Restrict COMEBACK30 to founder_starter/growth + investor_angel; instrument save-offer P&L.** Update `web/scripts/seed-stripe-coupons.ts` to set `applies_to.products` (not just `DOWNGRADE_STARTER50`). Add a `save_offer_events` view that joins `churn_events` with `revenue_events` on user+timeframe to compute rolling true-save rate. Alert CFO if 30d true-save rate < 25% for two consecutive weeks (approaching breakeven). Also cap `DOWNGRADE_STARTER50` at 500 max_redemptions until we prove non-cannibalisation. Owner: CFO + CRO.

---

## 9. Appendix — cross-references

- Ledger schema — `web/supabase/migrations/0075_entitlements_trial_and_webhook_state.sql` lines 108-146 (`revenue_events`).
- Churn — `web/supabase/migrations/0077_analytics_and_conversion.sql` lines 108-123 (`churn_events`).
- GST helper — `web/src/lib/gst.ts` (38 lines, complete).
- Credit costs — `web/src/lib/credits.ts` lines 52-164 (`FEATURE_COSTS`).
- Trial helper — `web/src/lib/trial.ts` (125 lines).
- Coupon seeder — `web/scripts/seed-stripe-coupons.ts` (152 lines).
- Machine catalogue — `web/src/config/pricing/plans.csv` (13 rows: header + 12 SKUs).
- Marketing catalogue — `web/src/lib/plans-v2.ts` (291 lines, 12 SKUs across 3 segments).
- Admin tile — `web/src/app/admin/pricing-metrics/page.tsx` (164 lines).
- Spec — `knowledge-base/upgrade-plan-2026-07-16/cfo-spec.md` (base case §6, 12-month bull §6.projection).

## 10. Unknowns / data gaps to flag

- Actual live MRR, ARR, active-sub count — not readable without a `psql` shell against production; not attempted here. `unknown` until a nightly snapshot lands in `cfo_ledger.detail`.
- Cash balance — no ledger row exists yet. `unknown`.
- 30-day churn rate (measured, not assumed) — needs `churn_events.count / active_subs_start_of_month`. Query is trivial once `active_subs` is measured (§3).
- CAC by channel — needs GA4 + Stripe join; delegated to `analytics` skill.
- Refund/chargeback rate — no rows visible in dev; production count `unknown`.
- Whether Stripe webhook writes negative amounts on refund — `unknown`, verify with test refund.

End of review. Not financial advice. Consult a qualified accountant or registered tax agent before making tax or investment decisions.
