-- 0327 — email_drips: Founder Radar activation nudges (S11-A, plan §4i D-2
-- `no_profile` tile state + D-3 re-engagement voice).
--
-- The weekly money-radar-sweep finds Radar subscribers with zero targets —
-- no `project_grant_profiles` row and no Money Finder intake — so Radar can
-- never match anything for them and the dashboard tile's `no_profile` state
-- is the only signal. The sweep now queues ONE `radar_setup` email_drips
-- row (due now) for each such subscriber, and ONE `radar_setup_2` follow-up
-- 14 days later if they are still empty. Never a third: the sweep reads the
-- cap off these rows (`listRadarSetupTouches`), any status counts, so an
-- opted-out or expired row still blocks a repeat. No new table.
--
-- Same drop/add of the inline CHECK from 0088 as 0320 did (unnamed →
-- Postgres named it email_drips_campaign_check). Idempotent: re-running
-- only re-asserts the constraint.

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
    'radar_setup_2'::text
  ]));

-- The sweep asks "has this address ever had a setup touch?" once per
-- zero-target subscriber; 0320's partial index already covers
-- `campaign like 'radar_%'` on (email, campaign, payload->>'ref_id'), and
-- (email, campaign) is its leading prefix, so no new index is needed.

notify pgrst, 'reload schema';
