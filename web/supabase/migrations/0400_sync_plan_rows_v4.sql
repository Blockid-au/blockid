-- 0400_sync_plan_rows_v4.sql
-- ---------------------------------------------------------------------------
-- Pricing v4 — evaluator-first ladder (plan §3.2, 2026-09-16, goal G14).
--
-- Why
--   * report-quota.ts reads ONLY usage_limits.reports_per_month (-1 =
--     unlimited; missing key → 402 quota_not_configured). The three
--     accelerator rows never carried it, so a Cohort subscriber could not
--     batch-score. v4 adds it (Cohort 25 = 50, Cohort 100 = 200, Enterprise
--     = -1) and re-bases seats / credits to the founder-approved figures.
--   * Three new SKUs: investor_fund "Fund" A$999/mo, accelerator_intake
--     "Intake link" A$249/mo, index_api "Index API" A$299/mo.
--   * Cohort Starter / Cohort Growth are relabelled Cohort 25 / Cohort 100
--     (prices untouched — A$500 / A$1,500 monthly, annual = 10×).
--   * The Intake link carries the evaluator flags batch scoring
--     (`lp_export OR accelerator.cohort`) and the sponsor / LP export
--     (`lp_report`) gate on; every cohort rung above it is a strict superset
--     (tier-ladder invariant b) — hence the accelerator flag lists grow too.
--
-- Pattern = 0309_sync_b2b_plan_rows.sql. Prices of existing rows are NOT
-- changed (Stripe Price ids stay valid; a future price change = new Price +
-- grandfather via `active`). Generated from web/src/config/pricing/plans.csv
-- — regenerate plans.generated.ts with `npx tsx scripts/build-plans.ts`
-- when changing either. Idempotent: UPDATEs keyed on id + INSERT … ON
-- CONFLICT (id) DO UPDATE, safe to re-run. stripe_price_id(_annual) on the
-- three new rows is left NULL for scripts/seed-stripe.mjs to fill
-- (founder-gated mint).
--
-- Apply: scripts/db/apply-migration.sh web/supabase/migrations/0400_sync_plan_rows_v4.sql
-- ---------------------------------------------------------------------------

begin;

-- ── Existing accelerator rows: relabel + limits + flag superset ────────────

update plans
   set name                   = 'Cohort 25',
       feature_flags          = '["cohort.view", "cohort.view.stats", "accelerator.cohort", "investor.dealflow", "watchlist", "svi.feed", "diligence_pack", "lp_report", "grant_finder", "money_radar"]'::jsonb,
       usage_limits           = '{"profiles": 25, "reports_per_month": 50, "seats": 5, "monthly_credits": 200}'::jsonb,
       trial_days             = 14,
       active                 = true,
       sort_order             = 100,
       updated_at             = now()
 where id = 'accelerator_starter';

update plans
   set name                   = 'Cohort 100',
       feature_flags          = '["cohort.view", "cohort.view.stats", "accelerator.cohort", "investor.dealflow", "watchlist", "svi.feed", "diligence_pack", "lp_report", "grant_finder", "money_radar", "cohort.manage"]'::jsonb,
       usage_limits           = '{"profiles": 100, "reports_per_month": 200, "seats": 15, "monthly_credits": 800}'::jsonb,
       trial_days             = 14,
       active                 = true,
       sort_order             = 110,
       updated_at             = now()
 where id = 'accelerator_growth';

update plans
   set name                   = 'Cohort Enterprise',
       feature_flags          = '["cohort.view", "cohort.view.stats", "accelerator.cohort", "investor.dealflow", "watchlist", "svi.feed", "diligence_pack", "lp_report", "grant_finder", "money_radar", "cohort.manage", "white_label", "api", "api.access", "sso"]'::jsonb,
       usage_limits           = '{"profiles": -1, "seats": -1, "monthly_credits": -1, "reports_per_month": -1}'::jsonb,
       trial_days             = 14,
       active                 = true,
       sort_order             = 120,
       updated_at             = now()
 where id = 'accelerator_enterprise';

-- ── New rows (Pricing v4) ──────────────────────────────────────────────────

insert into plans (
  id, segment, name, description,
  price_aud_cents, annual_price_aud_cents, interval, trial_days,
  feature_flags, usage_limits, active, sort_order
) values
  ('investor_fund', 'investor_vc', 'Fund',
   'VC funds and family offices — Program plus custom benchmark, multi-fund, weekly delta; unlimited reports, 500 tracked startups, 10 seats. GST-inclusive.',
   99900, 999000, 'monthly', 7,
   '["watchlist", "svi.feed", "investor.dealflow", "advisory_equity", "advisor_portal", "advisor.cohort", "white_label", "portfolio", "diligence_pack", "api", "api.access", "lp_export", "lp_report", "grant_finder", "money_radar", "custom_benchmark", "multi_fund", "weekly_delta"]'::jsonb,
   '{"profiles": 500, "portfolio_size": 500, "reports_per_month": -1, "seats": 10}'::jsonb,
   true, 85),

  ('accelerator_intake', 'accelerator', 'Intake link',
   'One application round scored on intake — 40 reports a month, 60 tracked startups, 3 seats, batch scoring + sponsor / LP export. 14-day trial. GST-inclusive.',
   24900, 249000, 'monthly', 14,
   '["cohort.view", "cohort.view.stats", "accelerator.cohort", "investor.dealflow", "watchlist", "svi.feed", "diligence_pack", "lp_report", "grant_finder", "money_radar"]'::jsonb,
   '{"profiles": 60, "reports_per_month": 40, "seats": 3}'::jsonb,
   true, 98),

  ('index_api', 'investor_vc', 'Index API',
   'Read-only Startup Value Index data API — 1,000 calls a day, 2 keys, no workspace or reports. GST-inclusive.',
   29900, 299000, 'monthly', 0,
   '["api", "api.access", "svi.feed"]'::jsonb,
   '{"profiles": 0, "reports_per_month": 0, "seats": 2, "api_daily_calls": 1000}'::jsonb,
   true, 130)
on conflict (id) do update
   set segment                = excluded.segment,
       name                   = excluded.name,
       description            = excluded.description,
       price_aud_cents        = excluded.price_aud_cents,
       annual_price_aud_cents = excluded.annual_price_aud_cents,
       interval               = excluded.interval,
       trial_days             = excluded.trial_days,
       feature_flags          = excluded.feature_flags,
       usage_limits           = excluded.usage_limits,
       active                 = excluded.active,
       sort_order             = excluded.sort_order,
       updated_at             = now();

commit;

notify pgrst, 'reload schema';
