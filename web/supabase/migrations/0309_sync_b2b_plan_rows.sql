-- 0309_sync_b2b_plan_rows.sql
-- ---------------------------------------------------------------------------
-- Resync the 7 investor / advisor / accelerator plan rows to plans.csv.
--
-- Why
--   These rows were last written by 0074 (2026-07) and never re-synced: the DB
--   still carried flags like watchlist.premium / contact_unlock /
--   secondary_market.view that no page gates on, investor_vc_ent had a NULL
--   price, accelerator rows had trial_days 7 (csv: 14). getEntitlements()
--   reads the DB row, so a paying Angel/Advisor/VC user would have been locked
--   out of every investor workspace page (they gate on investor.dealflow,
--   watchlist, portfolio, advisor_portal, advisor.cohort, accelerator.cohort,
--   lp_report). G12 pre-implementation review 2026-09-10, item G12-1/G12-2.
--
--   Flag vocabulary = src/lib/entitlements/tier-ladder.ts feature lists (the
--   ones tests pin and pages check). usage_limits gain `profiles` (evaluators
--   may create N startups they evaluate), `reports_per_month` and `seats`.
--
-- Generated from web/src/config/pricing/plans.csv — regenerate
-- plans.generated.ts with `npx tsx scripts/build-plans.ts` when changing either.
-- Idempotent: plain UPDATEs keyed on id, safe to re-run.
-- ---------------------------------------------------------------------------

update plans
   set price_aud_cents        = 7900,
       annual_price_aud_cents = 79000,
       interval               = 'monthly',
       trial_days             = 7,
       feature_flags          = '["watchlist", "svi.feed", "investor.dealflow"]'::jsonb,
       usage_limits           = '{"profiles": 25, "watchlist_size": 25, "reports_per_month": 10, "seats": 1}'::jsonb,
       active                 = true,
       sort_order             = 60,
       updated_at             = now()
 where id = 'investor_angel';

update plans
   set price_aud_cents        = 14900,
       annual_price_aud_cents = 149000,
       interval               = 'monthly',
       trial_days             = 7,
       feature_flags          = '["watchlist", "svi.feed", "investor.dealflow", "advisory_equity", "advisor_portal", "advisor.cohort", "white_label"]'::jsonb,
       usage_limits           = '{"profiles": 50, "clients": 50, "reports_per_month": 30, "seats": 3}'::jsonb,
       active                 = true,
       sort_order             = 70,
       updated_at             = now()
 where id = 'investor_advisor';

update plans
   set price_aud_cents        = 34900,
       annual_price_aud_cents = 349000,
       interval               = 'monthly',
       trial_days             = 7,
       feature_flags          = '["watchlist", "svi.feed", "investor.dealflow", "advisory_equity", "advisor_portal", "advisor.cohort", "white_label", "portfolio", "diligence_pack", "api", "api.access", "lp_export", "lp_report"]'::jsonb,
       usage_limits           = '{"profiles": 200, "portfolio_size": 200, "reports_per_month": 100, "seats": 5}'::jsonb,
       active                 = true,
       sort_order             = 80,
       updated_at             = now()
 where id = 'investor_vc_small';

update plans
   set price_aud_cents        = 250000,
       annual_price_aud_cents = 3000000,
       interval               = 'custom',
       trial_days             = 0,
       feature_flags          = '["watchlist", "svi.feed", "investor.dealflow", "advisory_equity", "advisor_portal", "advisor.cohort", "white_label", "portfolio", "diligence_pack", "api", "api.access", "lp_export", "lp_report", "custom_benchmark", "multi_fund", "sso", "weekly_delta"]'::jsonb,
       usage_limits           = '{"profiles": -1, "seats": -1, "reports_per_month": -1}'::jsonb,
       active                 = true,
       sort_order             = 90,
       updated_at             = now()
 where id = 'investor_vc_ent';

update plans
   set price_aud_cents        = 50000,
       annual_price_aud_cents = 500000,
       interval               = 'monthly',
       trial_days             = 14,
       feature_flags          = '["cohort.view", "cohort.view.stats", "accelerator.cohort"]'::jsonb,
       usage_limits           = '{"profiles": 25, "seats": 15, "monthly_credits": 2000}'::jsonb,
       active                 = true,
       sort_order             = 100,
       updated_at             = now()
 where id = 'accelerator_starter';

update plans
   set price_aud_cents        = 150000,
       annual_price_aud_cents = 1500000,
       interval               = 'monthly',
       trial_days             = 14,
       feature_flags          = '["cohort.view", "cohort.view.stats", "accelerator.cohort", "cohort.manage"]'::jsonb,
       usage_limits           = '{"profiles": 100, "seats": 50, "monthly_credits": 8000}'::jsonb,
       active                 = true,
       sort_order             = 110,
       updated_at             = now()
 where id = 'accelerator_growth';

update plans
   set price_aud_cents        = 350000,
       annual_price_aud_cents = 3500000,
       interval               = 'monthly',
       trial_days             = 14,
       feature_flags          = '["cohort.view", "cohort.view.stats", "accelerator.cohort", "cohort.manage", "white_label", "api", "api.access", "sso", "lp_report"]'::jsonb,
       usage_limits           = '{"profiles": -1, "seats": -1, "monthly_credits": -1}'::jsonb,
       active                 = true,
       sort_order             = 120,
       updated_at             = now()
 where id = 'accelerator_enterprise';

notify pgrst, 'reload schema';
