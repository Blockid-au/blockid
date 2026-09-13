-- 0376_investor_touchpoints.sql
-- ---------------------------------------------------------------------------
-- S28-B — Investor CRM: touchpoints (the per-contact timeline).
--
-- Why
--   The pipeline is only as good as its history. A CRM shows every note,
--   call, meeting and email under the contact, and the two things BlockID
--   already knows about an investor land there automatically: the data-room
--   link they opened (S26-A `investor_viewed`) and the cheque recorded
--   against them (`fundraise_commitments`).
--
-- What
--   `investor_touchpoints` — one row per event on a contact.
--     kind         note | email | call | meeting | data_room_view |
--                  commitment | status_change
--     body         free text (the note, or the auto-generated one-liner)
--     occurred_at  when it happened (a note can be back-dated)
--     meta         jsonb — link_id / commitment_id / from→to stage, etc.
--     project_id   denormalised from the contact (FK cascade) so the weekly
--                  digest and RLS can read the timeline without a join.
--     created_by   app_users.id WITHOUT a foreign key (same reason as 0375:
--                  no new FK on app_users). NULL for automatic rows.
--
-- RLS
--   Enabled. Project owner may SELECT (through projects.user_id); writes are
--   service-role only (api/investors/crm/** and the S26-A hooks).
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0376_investor_touchpoints.sql
--
-- Idempotent: IF NOT EXISTS everywhere; DO-guarded policies; apply AFTER 0375.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.investor_touchpoints (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid         NOT NULL REFERENCES public.investor_contacts(id) ON DELETE CASCADE,
  project_id    uuid         NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind          text         NOT NULL
                             CHECK (kind IN ('note', 'email', 'call', 'meeting', 'data_room_view', 'commitment', 'status_change')),
  body          text,
  occurred_at   timestamptz  NOT NULL DEFAULT now(),
  created_by    uuid,        -- app_users.id, no FK (see header); NULL = automatic
  meta          jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investor_touchpoints_contact
  ON public.investor_touchpoints (contact_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_investor_touchpoints_project_occurred
  ON public.investor_touchpoints (project_id, occurred_at DESC);

ALTER TABLE public.investor_touchpoints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'investor_touchpoints'
      AND policyname = 'investor_touchpoints_service_all'
  ) THEN
    CREATE POLICY investor_touchpoints_service_all
      ON public.investor_touchpoints
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'investor_touchpoints'
      AND policyname = 'investor_touchpoints_owner_select'
  ) THEN
    CREATE POLICY investor_touchpoints_owner_select
      ON public.investor_touchpoints
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = investor_touchpoints.project_id AND p.user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.investor_touchpoints IS
  'S28-B: investor CRM timeline — notes / calls / meetings / emails typed by the team, plus automatic data_room_view (S26-A investor_viewed), commitment (fundraise_commitments) and status_change (stage move) rows.';
COMMENT ON COLUMN public.investor_touchpoints.created_by IS
  'App user who wrote the row (app_users.id, no FK on purpose). NULL for automatic rows.';

NOTIFY pgrst, 'reload schema';
