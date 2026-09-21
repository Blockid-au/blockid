-- 0438_org_settings_onboarding_metrics.sql
-- ---------------------------------------------------------------------------
-- G25 lane A (2026-09-21) — the Cohort onboarding kit
-- (/workspace/accelerator/onboarding) replaces the pilot delivery kit. Its
-- success-metric capture form (review time per startup, evaluator
-- consistency, startups processed, evidence completion, satisfaction,
-- repeat / renewal intent, willingness to pay, case-study consent, notes —
-- lib/accelerator/onboarding-metrics.ts) used to save on
-- `pilot_orders.metrics`; with the paid pilot retired it saves per
-- ORGANISATION on `org_settings` (0428), the acting org of the evaluator
-- who owns it (PATCH /api/accelerator/onboarding/metrics, owner only,
-- service role after the owner check in code — same pattern as the other
-- org_settings writes).
--
--   org_settings.onboarding_metrics  jsonb NOT NULL DEFAULT '{}'
--
-- No app_users FK (org_settings never had one — the erasure map is
-- unchanged); no RLS change (the existing service-all / member-select
-- policies cover the new column). Readers fall back on 42703 / PGRST204
-- until this file is applied (the form renders read-only with a note).
--
-- Idempotent: IF NOT EXISTS.
--
-- Rollback
--   alter table public.org_settings drop column if exists onboarding_metrics;
--
-- Apply: scripts/db/apply-migration.sh web/supabase/migrations/0438_org_settings_onboarding_metrics.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS onboarding_metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.org_settings.onboarding_metrics IS
  'G25: the Cohort onboarding success metrics the program and BlockID measure together (lib/accelerator/onboarding-metrics.ts schema; updated_at inside). Written by PATCH /api/accelerator/onboarding/metrics for the org owner; case_study_consent gates any case study.';

COMMIT;
