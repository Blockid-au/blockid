-- 0305_legacy_plans_seed.sql
-- Seed the grandfathered legacy plan IDs into the `plans` table so the
-- monthly credit-reset cron (web/src/app/api/cron/credit-reset/route.ts)
-- picks up existing subscribers whose app_users.plan still holds the
-- pre-v2 catalogue values ('growth', 'growth_annual', 'founding50').
--
-- Why: migration 0074 seeded only the v2 12-SKU catalogue. Any user who
-- subscribed before the v2 rollout still has plan='growth' or
-- plan='growth_annual' on app_users. The credit-reset cron joins on
-- plans.id → no match → no monthly refill → silent entitlement loss.
--
-- Amounts mirror PLAN_CREDITS in web/src/lib/credits.ts (source-of-truth
-- for legacy grants) and platform-config defaults:
--   growth        → 9900¢/month, 200 credits/month
--   growth_annual → 9900¢/month billed at 95000¢/year, 200 credits/month
--   founding50    → 500¢ one-off, 50 credits lifetime (no monthly refill)
--
-- ADDITIVE ONLY. `on conflict do nothing` keeps this idempotent and
-- non-destructive if run against an already-seeded DB.

insert into plans (
  id, segment, name, description,
  price_aud_cents, annual_price_aud_cents, interval, trial_days,
  feature_flags, usage_limits, active, sort_order
) values
  ('growth', 'founder', 'Growth (legacy)',
   'Grandfathered monthly plan pre-v2 rollout. Mirrors founder_growth entitlements.',
   9900, null, 'monthly', 0,
   '["profile.multi","cap_table.write","data_room.access","investor_links.premium","term_sheet_ai"]'::jsonb,
   '{"profiles":3,"svi_per_month":50,"monthly_credits":200}'::jsonb,
   true, 900),

  ('growth_annual', 'founder', 'Growth Annual (legacy)',
   'Grandfathered annual plan pre-v2 rollout. Same monthly entitlements as growth.',
   9900, 95000, 'yearly', 0,
   '["profile.multi","cap_table.write","data_room.access","investor_links.premium","term_sheet_ai"]'::jsonb,
   '{"profiles":3,"svi_per_month":50,"monthly_credits":200}'::jsonb,
   true, 901),

  -- One-off lifetime deal — no monthly_credits key so credit-reset skips it
  -- (cron filters usage_limits.monthly_credits > 0). Initial 50 credits are
  -- granted at checkout via PLAN_CREDITS.founding50 in the Stripe webhook.
  ('founding50', 'founder', 'Founding 100 (legacy)',
   'Grandfathered one-off lifetime deal. 50 credits granted at checkout, no monthly refill.',
   500, null, 'once', 0,
   '["profile.basic","svi.full"]'::jsonb,
   '{"profiles":1,"svi_per_month":10}'::jsonb,
   true, 902)
on conflict (id) do nothing;
