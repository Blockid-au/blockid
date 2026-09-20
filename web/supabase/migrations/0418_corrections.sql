-- 0418_corrections.sql
-- ---------------------------------------------------------------------------
-- G21 P1-C (2026-09-20, docs/plans/g21-fi-upgrade-2026-09-20.md § P1-C;
-- docs/product/score-governance.md § 10 "Correction and re-run").
-- The founder correction workflow: a founder flags something BlockID holds
-- or says about their startup; an admin accepts or rejects it. A correction
-- NEVER overwrites data — it records the resolution, and an accepted
-- sector / stage correction is written through the existing project update
-- path (versioned, audit-logged) with the resolution noting what changed.
--
--   project_id    the startup (projects, CASCADE — one founder record)
--   kind          incorrect_data | stale_data | misunderstood_evidence |
--                 duplicate_company | wrong_sector_stage | unsupported_statement
--   target_ref    what is being corrected — "dimension:traction",
--                 "claim:<uuid>", "report:<id>#section", "profile:sector" …
--   message       the founder's explanation (required, ≤ 4 000 chars)
--   proposed      optional structured proposal, e.g. {"industry":"fintech"}
--                 or {"stage":3} — read by the admin accept path, never
--                 applied automatically
--   status        open | accepted | rejected
--   submitted_by  the founder (app_users, SET NULL on erasure)
--   resolved_by   the admin (app_users, SET NULL)
--   resolution    the admin's note — what was done / why not
--   resolved_at   when the status left "open"
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS). NOT applied by the
-- lane — the merging session applies via scripts/db/apply-migration.sh and
-- commits content/reports/schema-migrations.json.
--
-- Rollback
--   DROP TABLE IF EXISTS public.corrections;

CREATE TABLE IF NOT EXISTS public.corrections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN (
                  'incorrect_data',
                  'stale_data',
                  'misunderstood_evidence',
                  'duplicate_company',
                  'wrong_sector_stage',
                  'unsupported_statement'
                )),
  target_ref    text NULL,
  message       text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  proposed      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  submitted_by  uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  resolved_by   uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  resolution    text NULL,
  resolved_at   timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS corrections_project_created_idx
  ON public.corrections (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS corrections_status_created_idx
  ON public.corrections (status, created_at DESC);

COMMENT ON TABLE public.corrections IS
  'G21 P1-C: founder correction requests (incorrect / stale data, misunderstood evidence, duplicate company, wrong sector or stage, unsupported report statement). Logged, never overwritten: an accepted correction records a resolution; sector / stage changes go through the project update path. project_id FKs projects (CASCADE); user FKs app_users (SET NULL).';

-- ─── RLS: the project owner reads + files; every resolution is service-role ──

ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corrections_owner_select ON public.corrections;
CREATE POLICY corrections_owner_select ON public.corrections
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = corrections.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS corrections_owner_insert ON public.corrections;
CREATE POLICY corrections_owner_insert ON public.corrections
  FOR INSERT WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = corrections.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS corrections_service_all ON public.corrections;
CREATE POLICY corrections_service_all ON public.corrections
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
