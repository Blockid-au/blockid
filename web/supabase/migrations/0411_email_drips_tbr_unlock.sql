-- 0411 — email_drips: G16-B (F-2) Trusted Business Report unlock nudge.
--
-- After the first SVI analysis a free founder gets ONE `tbr_unlock_24h`
-- row (due +24 h): "Your report is ready — unlock the full version for A$3",
-- deep-linking to /workspace/reports/business where the unlock rail opens
-- the confirm-before-charge step. Queued by lib/email-drip.ts
-- enqueueTbrUnlockNudge (one row per address ever, never for qa-live-*),
-- suppressed at send time by tbrUnlockSuppression when a paid report_orders
-- row exists or the plan carries report.premium. No new table, no new index
-- (the (email, campaign) prefix of 0320's partial index covers the dedupe).
--
-- Same drop/add of the CHECK as 0320 / 0327. Idempotent: re-running only
-- re-asserts the constraint. Apply with scripts/db/apply-migration.sh —
-- until it lands, the nudge insert is rejected by the old CHECK and logged
-- (the onboarding five are a separate insert and unaffected).

alter table public.email_drips
  drop constraint if exists email_drips_campaign_check;

alter table public.email_drips
  add constraint email_drips_campaign_check
  check (campaign = any (array[
    'onboarding_d1'::text,
    'onboarding_d3'::text,
    'onboarding_d7'::text,
    'onboarding_d14'::text,
    'nps_d30'::text,
    'radar_t30'::text,
    'radar_t14'::text,
    'radar_t3'::text,
    'radar_status_changed'::text,
    'radar_setup'::text,
    'radar_setup_2'::text,
    'tbr_unlock_24h'::text
  ]));

notify pgrst, 'reload schema';
