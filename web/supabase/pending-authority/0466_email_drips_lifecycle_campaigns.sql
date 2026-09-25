-- 0466 — email_drips: G34-BT4 lifecycle flows (plan §9.2, EM12–EM20).
--
-- NOT APPLIED. Additive; kept in pending-authority/ (see README.md) until the
-- schema-authority transition admits it. Apply live with one transaction:
--   psql -v ON_ERROR_STOP=1 -1 -f 0466_email_drips_lifecycle_campaigns.sql
--
-- The one commercial-mail engine (`email_drips` + lib/email-drip.ts) gains
-- nine campaign ids, all rendered by lib/lifecycle/templates.ts and queued by
-- lib/lifecycle/enqueue.ts (EM12, from the re-score routes) and
-- lib/lifecycle/scan.ts (the `lifecycle-scan` cron):
--
--   score_updated                           EM12  T  re-score finished: old → new, what moved
--   evidence_gap_1, evidence_gap_2          EM14  C  report seen, no evidence (+48 h, +7 d)
--   intake_abandoned_1, intake_abandoned_2  EM13  C  onboarding idle (+24 h, ≥ 74 h later)
--   rerun_prompt                            EM15  C  new evidence since the last analysis
--   free_quota_used                         EM16  C  second free report delivered (+3 d)
--   monthly_digest                          EM19  C  monthly digest (quiet months included)
--   sunset_check                            EM20  C  90 d without a sign-in: keep or stop?
--
-- Until this lands every lifecycle insert is rejected by the old CHECK and
-- logged ("is pending-authority/0466 applied?"); the onboarding / radar /
-- unlock rows are separate inserts and unaffected. Same drop/add of the
-- CHECK as 0320 / 0327 / 0411; idempotent.
--
-- Index: the scan's dedupe reads (email, campaign, created_at) and the
-- score_updated merge reads (email, campaign, status). 0088's
-- email_drips_email_campaign_idx covers (email, campaign); the created_at /
-- status filters are cheap on top. No new index.

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
    'tbr_unlock_24h'::text,
    'score_updated'::text,
    'evidence_gap_1'::text,
    'evidence_gap_2'::text,
    'intake_abandoned_1'::text,
    'intake_abandoned_2'::text,
    'rerun_prompt'::text,
    'free_quota_used'::text,
    'monthly_digest'::text,
    'sunset_check'::text
  ]));

notify pgrst, 'reload schema';
