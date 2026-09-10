-- 0320 — email_drips: Money Radar deadline drips (T0246, G11 §4h "Deadline
-- scheduling via the drip worker").
--
-- The weekly money-radar-sweep (0318) leaves `last_notified.pending_email`
-- on every funding_matches row whose deadline crossed a T-30 / T-14 / T-3
-- tier for an email-channel subscriber. T0246's enqueuer turns each pending
-- entry into ONE email_drips row (campaign radar_t30 / radar_t14 / radar_t3,
-- scheduled_for = now) and clears the key, so the existing hourly
-- /api/cron/email-drip worker sends them through the same claim / expiry /
-- suppression path as the onboarding sequence. `radar_status_changed` is the
-- optional "{program} paused — here are 2 alternatives" touch.
--
-- The campaign CHECK from 0088 is inline (unnamed → Postgres named it
-- email_drips_campaign_check). Same drop/add pattern as 0307 for status.
-- Idempotent: re-running only re-asserts the constraint.

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
    'radar_status_changed'::text
  ]));

-- enqueueRadarDrip dedupes on (email, campaign, payload->>'ref_id') inside a
-- 45-day window; this expression index keeps that lookup off a seq scan.
create index if not exists email_drips_radar_ref_idx
  on public.email_drips (email, campaign, (payload->>'ref_id'))
  where campaign like 'radar_%';

notify pgrst, 'reload schema';
