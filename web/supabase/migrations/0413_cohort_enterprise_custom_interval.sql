-- 0413_cohort_enterprise_custom_interval.sql
-- ---------------------------------------------------------------------------
-- G18-A pricing truth (2026-09-19). NOT auto-applied on deploy — apply by hand
-- per docs/ops/db-migrations runbook (docker exec supabase-db psql … +
-- NOTIFY pgrst, 'reload schema').
--
-- Why
--   `accelerator_enterprise` ("Cohort Enterprise") is sold contact-sales
--   everywhere — plans-v2 `cta_kind: "contact"`, `public: false`, the
--   /pricing contact row says "from A$35,000/yr" — and no Stripe price was
--   ever minted for STRIPE_PRICE_ACCEL_ENTERPRISE (stripe-price-audit
--   2026-09-19). Its plans row still said `interval = 'monthly'`, so
--   POST /api/stripe/checkout { plan: "accelerator_enterprise" } answered
--   503 `plan_not_provisioned` instead of the `contact_sales` shape the
--   other two enterprise rows (founder_enterprise, investor_vc_ent —
--   `interval = 'custom'`) return. plans.csv is corrected in the same
--   commit; this brings the DB row into line.
--
--   A contact-sales rung has no self-serve trial either (the other two custom
--   rows carry trial_days 0; plans.generated.test pins "custom ⇒ 0"), so the
--   row's trial_days 14 becomes 0 with it.
--
-- Idempotent: a no-op once interval = 'custom' and trial_days = 0.

update plans
   set interval   = 'custom',
       trial_days = 0,
       updated_at = now()
 where id = 'accelerator_enterprise'
   and (interval <> 'custom' or trial_days <> 0);

notify pgrst, 'reload schema';
