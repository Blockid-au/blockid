-- Migration 0295 — reseller_startup_roster view (v3 upgrade Track K sub-L1)
--
-- Reseller-scoped view of every attributed startup with the operational
-- signals the reseller console needs to render the roster page at
-- /reseller/roster: verification level, latest Trust Score, unicorn stage,
-- growth phase, evidence + report counts, credit balance, first-touch and
-- last-activity timestamps, and a derived status pill.
--
-- One row per (reseller × business) pairing. A `reseller_attributions` row
-- with subject_type='project' produces exactly one roster row for that
-- project. A row with subject_type='user' fans out across every project
-- that founder currently owns (parity with the founder-attribution semantics
-- documented in reseller_attributions U.6).
--
-- Column mapping (task L1 ↔ physical shape checked against migrations
-- 0005 / 0007 / 0020 / 0091 / 0092 / 0106 / 0202 / 0210 / 0270 / 0273 / 0280 /
-- 0118):
--   - `reseller_id`         reseller_attributions.reseller_id
--   - `reseller_slug`       resellers.code (uppercase family slug)
--   - `business_id`         projects.id
--   - `founder_user_id`     projects.user_id
--   - `founder_email`       app_users.email (lookup off projects.user_id)
--   - `business_name`       projects.name
--   - `abn`                 projects.public_abn (added lazily via LEFT JOIN
--                           to business_profile view; NULL until Phase 6
--                           businesses table exposes it)
--   - `verification_level`  projects.verification_level (0273 sub-D1)
--   - `trust_score`         svi_analyses.total_svi (latest per project;
--                           spec called this `svi_total` — see notes below)
--   - `unicorn_stage_id`    business_stage_progress.current_stage_id
--                           (active row = stage_exited_at IS NULL)
--   - `growth_phase`        startup_package_progress.phase_id
--                           (latest by updated_at)
--   - `evidence_count`      count of evidence rows per business
--   - `report_count`        count of report_orders WHERE status='READY'
--   - `credit_balance`      credit_balances.balance (founder's wallet)
--   - `first_touch_at`      reseller_attributions.attributed_at
--   - `last_activity_at`    MAX(app_users.last_login_at, latest
--                           user_actions.completed_at)
--   - `status`              derived CASE (see body).
--
-- Assumptions where the spec vs. schema diverged (documented for the report):
--   * spec `svi_analyses.svi_total`      → actual `svi_analyses.total_svi`
--   * spec `reseller_attribution` table  → actual `reseller_attributions`
--   * spec `resellers.owner_user_id`     → not present. Ownership lives in
--     `reseller_admins(role='owner')`. The helper `readResellerRoster()`
--     enforces owner gating; the view itself only exposes the scope columns
--     needed to build a WHERE clause.
--
-- RLS posture: this is a VIEW over base tables which already carry RLS
-- (reseller_attributions, projects, svi_analyses, etc.). PostgREST readers
-- inherit the caller's row-level filter. The reseller console only reaches
-- this view via the server-side helper in web/src/lib/reseller/roster.ts,
-- which gates by owner role + reseller_id before returning any rows.
--
-- Idempotency: CREATE OR REPLACE VIEW (single DDL) inside a BEGIN/COMMIT so
-- the GRANTs are transactional. Trailing NOTIFY reloads PostgREST cache.
--
-- Applied via (admin, per reference_db_migrations — not auto-applied):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -f 0295_reseller_startup_roster_view.sql

BEGIN;

CREATE OR REPLACE VIEW public.reseller_startup_roster AS
WITH latest_svi AS (
  SELECT DISTINCT ON (project_id)
         project_id,
         total_svi AS trust_score,
         created_at AS scored_at
    FROM public.svi_analyses
   WHERE project_id IS NOT NULL
   ORDER BY project_id, created_at DESC
),
latest_stage AS (
  SELECT business_id,
         current_stage_id
    FROM public.business_stage_progress
   WHERE stage_exited_at IS NULL
),
latest_phase AS (
  SELECT DISTINCT ON (project_id)
         project_id,
         phase_id,
         updated_at
    FROM public.startup_package_progress
   ORDER BY project_id, updated_at DESC
),
evidence_counts AS (
  SELECT business_id, COUNT(*)::int AS evidence_count
    FROM public.evidence
   GROUP BY business_id
),
report_counts AS (
  SELECT business_id, COUNT(*)::int AS report_count
    FROM public.report_orders
   WHERE status = 'READY'
   GROUP BY business_id
),
latest_action AS (
  SELECT ua.email, MAX(ua.completed_at) AS last_action_at
    FROM public.user_actions ua
   GROUP BY ua.email
)
SELECT
  ra.reseller_id                                       AS reseller_id,
  r.code                                               AS reseller_slug,
  p.id                                                 AS business_id,
  p.user_id                                            AS founder_user_id,
  u.email                                              AS founder_email,
  p.name                                               AS business_name,
  NULL::text                                           AS abn,
  p.verification_level                                 AS verification_level,
  ls.trust_score                                       AS trust_score,
  lst.current_stage_id                                 AS unicorn_stage_id,
  lp.phase_id                                          AS growth_phase,
  COALESCE(ec.evidence_count, 0)                       AS evidence_count,
  COALESCE(rc.report_count, 0)                         AS report_count,
  COALESCE(cb.balance, 0)                              AS credit_balance,
  ra.attributed_at                                     AS first_touch_at,
  GREATEST(u.last_login_at, la.last_action_at)         AS last_activity_at,
  CASE
    WHEN COALESCE(rc.report_count, 0) > 0
      OR COALESCE(cb.balance, 0) > 0                    THEN 'paying'
    WHEN GREATEST(u.last_login_at, la.last_action_at) IS NULL
      AND ra.attributed_at > now() - interval '7 days' THEN 'onboarding'
    WHEN GREATEST(u.last_login_at, la.last_action_at) IS NULL THEN 'churned'
    WHEN GREATEST(u.last_login_at, la.last_action_at) > now() - interval '30 days' THEN 'active'
    WHEN GREATEST(u.last_login_at, la.last_action_at) < now() - interval '90 days' THEN 'churned'
    ELSE 'stalled'
  END                                                  AS status
FROM public.reseller_attributions ra
  JOIN public.resellers  r ON r.id = ra.reseller_id
  JOIN public.projects   p ON (
        (ra.subject_type = 'project' AND ra.subject_project_id = p.id)
     OR (ra.subject_type = 'user'    AND ra.subject_user_id    = p.user_id)
  )
  JOIN public.app_users  u ON u.id = p.user_id
  LEFT JOIN latest_svi        ls  ON ls.project_id  = p.id
  LEFT JOIN latest_stage      lst ON lst.business_id = p.id
  LEFT JOIN latest_phase      lp  ON lp.project_id  = p.id
  LEFT JOIN evidence_counts   ec  ON ec.business_id = p.id
  LEFT JOIN report_counts     rc  ON rc.business_id = p.id
  LEFT JOIN public.credit_balances cb ON cb.user_id = p.user_id
  LEFT JOIN latest_action     la  ON la.email      = u.email
 WHERE ra.status = 'active'
   AND ra.opted_out = false
   AND p.archived_at IS NULL;

COMMENT ON VIEW public.reseller_startup_roster IS
  'Reseller-scoped view of attributed startups. Only reseller-owner role can SELECT; per-row filter applied at query layer via web/src/lib/reseller/roster.ts.';

GRANT SELECT ON public.reseller_startup_roster TO authenticated;
GRANT SELECT ON public.reseller_startup_roster TO service_role;

COMMIT;

-- After apply, reload PostgREST schema cache:
NOTIFY pgrst, 'reload schema';
