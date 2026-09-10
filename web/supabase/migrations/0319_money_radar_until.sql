-- 0319_money_radar_until.sql
-- ---------------------------------------------------------------------------
-- Startup Package → 3 months Founder Radar (G11 §4h ladder row "Startup
-- Package A$149 one-off includes 1 Money Finder Report + 3 months Founder
-- Radar alerts"; T0247).
--
-- founder_package is a one-off SKU, not a subscription, so the plan-level
-- `money_radar` flag (0316) alone would grant the radar for ever. This
-- column time-boxes it: the Stripe webhook (handleStartupPackagePurchase)
-- stamps `money_radar_until = now() + 90 days` and
-- src/lib/entitlements/timed-grants.ts adds `money_radar` to the user's
-- effective flags only while the stamp is in the future. A later Starter /
-- Growth subscription keeps working through the plan flag regardless.
--
-- The partial index is for the daily money-radar-sweep (T0245), which
-- selects every user whose radar is live.
-- Idempotent. Apply: docker exec psql < this file, then NOTIFY pgrst.
-- ---------------------------------------------------------------------------

alter table public.app_users
  add column if not exists money_radar_until timestamptz;

comment on column public.app_users.money_radar_until is
  'Founder Radar (money_radar) granted until this instant regardless of plan — set by the Startup Package webhook (now()+90d, T0247). NULL = no timed grant.';

create index if not exists app_users_money_radar_until_idx
  on public.app_users (money_radar_until)
  where money_radar_until is not null;

notify pgrst, 'reload schema';
