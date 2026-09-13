-- 0375_investor_contacts.sql
-- ---------------------------------------------------------------------------
-- S28-B — Investor CRM: contacts.
--
-- Why
--   A founder running a raise keeps a pipeline (Affinity / Notion / HubSpot
--   style): every investor they are talking to, which stage the
--   conversation is at, who owns it, what the next step is and when it is
--   due. S26-A gave the raise a tracker for cheques (`fundraise_commitments`)
--   and the data room a per-link engagement signal; this table is the
--   layer above both — the people, before and after they write a cheque.
--
-- What
--   `investor_contacts` — one row per investor per project.
--     type        angel | vc | family_office | accelerator | advisor | other
--     stage       researching | contacted | meeting | diligence | committed |
--                 passed | invested   (the kanban columns)
--     email       stored lower-cased by the API; UNIQUE per project so a CSV
--                 re-import updates instead of duplicating. Nullable — a
--                 contact can start as a name from a warm intro.
--     tags        free text[] ("lead", "follow-on", "sydney")
--     owner_user_id / created_by   app_users ids WITHOUT a foreign key on
--                 purpose (the erase_account() map is generated from the
--                 app_users FK graph; a new FK would force a re-emit of the
--                 function). The project FK cascades the rows away with the
--                 project; a member who leaves keeps their pointer as an
--                 opaque id.
--     archived_at soft delete — a CRM never hard-deletes a relationship.
--
-- RLS
--   Enabled. The project owner may SELECT (through projects.user_id); every
--   write is a service-role route (api/investors/crm/**), which resolves
--   member roles via project_members. No anon access.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0375_investor_contacts.sql
--
-- Idempotent: IF NOT EXISTS everywhere; DO-guarded policies; safe to re-run.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.investor_contacts (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid         NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name             text         NOT NULL,
  email            text,
  org              text,
  role             text,
  type             text         NOT NULL DEFAULT 'other'
                                CHECK (type IN ('angel', 'vc', 'family_office', 'accelerator', 'advisor', 'other')),
  stage            text         NOT NULL DEFAULT 'researching'
                                CHECK (stage IN ('researching', 'contacted', 'meeting', 'diligence', 'committed', 'passed', 'invested')),
  source           text,
  tags             text[]       NOT NULL DEFAULT '{}',
  last_touch_at    timestamptz,
  next_step        text,
  next_step_due    date,
  owner_user_id    uuid,        -- app_users.id, no FK (see header)
  created_by       uuid,        -- app_users.id, no FK (see header)
  archived_at      timestamptz,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT investor_contacts_email_lower CHECK (email IS NULL OR email = lower(email))
);

-- One row per address per project — the CSV import upserts on it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_contacts_project_email
  ON public.investor_contacts (project_id, email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_investor_contacts_project_stage
  ON public.investor_contacts (project_id, stage)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_investor_contacts_project_created
  ON public.investor_contacts (project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_investor_contacts_next_step_due
  ON public.investor_contacts (project_id, next_step_due)
  WHERE archived_at IS NULL AND next_step_due IS NOT NULL;

ALTER TABLE public.investor_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'investor_contacts'
      AND policyname = 'investor_contacts_service_all'
  ) THEN
    CREATE POLICY investor_contacts_service_all
      ON public.investor_contacts
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'investor_contacts'
      AND policyname = 'investor_contacts_owner_select'
  ) THEN
    CREATE POLICY investor_contacts_owner_select
      ON public.investor_contacts
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = investor_contacts.project_id AND p.user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.investor_contacts IS
  'S28-B: investor CRM — one row per investor per project (kanban by stage, next step + due date, tags). Written only by service-role routes under api/investors/crm.';
COMMENT ON COLUMN public.investor_contacts.email IS
  'Lower-cased by the API (CHECK enforces); UNIQUE per project where not null so CSV re-imports update instead of duplicating.';
COMMENT ON COLUMN public.investor_contacts.owner_user_id IS
  'The team member who owns the relationship (app_users.id, no FK on purpose — see file header).';
COMMENT ON COLUMN public.investor_contacts.created_by IS
  'The app user who created the row (app_users.id, no FK on purpose — see file header).';
COMMENT ON COLUMN public.investor_contacts.archived_at IS
  'Soft delete. An archived contact is hidden from the pipeline but keeps its touchpoints.';

NOTIFY pgrst, 'reload schema';
