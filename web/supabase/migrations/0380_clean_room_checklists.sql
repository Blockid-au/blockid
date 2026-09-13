-- 0380_clean_room_checklists.sql
-- ---------------------------------------------------------------------------
-- S29-A — clean-room preparation checklist (M&A / strategic due diligence
-- where the buyer is a competitor).
--
-- Why
--   /workspace/clean-room walks the founder through the standard clean-team
--   process (scope the clean team → classify documents → redaction rules →
--   access tiers → NDA + clean-team agreement → logging & retention →
--   post-deal destruction). Tasks that the data room can prove (NDA gate on,
--   watermark on, per-recipient links, restricted sections, engagement log)
--   are computed live from `data_rooms` / `data_room_access_tokens` /
--   `data_room_engagement`; the rest are ticked by the founder here.
--
-- What
--   clean_room_checklists — 1:1 with projects:
--     project_id   PK, FK projects(id) ON DELETE CASCADE (no app_users FK)
--     tasks        jsonb — { "<task_id>": { "done": bool, "at": iso, "note": text|null } }
--                  for the FOUNDER-TICKED tasks only; computed task ids are
--                  never written here (lib/listing/clean-room.ts decides)
--     created_at / updated_at
--
-- RLS
--   Enabled; service role for all; the project OWNER may read their own row.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0380_clean_room_checklists.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clean_room_checklists (
  project_id   UUID         PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  tasks        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT clean_room_checklists_tasks_object CHECK (jsonb_typeof(tasks) = 'object')
);

CREATE OR REPLACE FUNCTION public.clean_room_checklists_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_room_checklists_touch ON public.clean_room_checklists;
CREATE TRIGGER trg_clean_room_checklists_touch
  BEFORE UPDATE ON public.clean_room_checklists
  FOR EACH ROW EXECUTE FUNCTION public.clean_room_checklists_touch();

ALTER TABLE public.clean_room_checklists ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clean_room_checklists'
      AND policyname = 'clean_room_checklists_service_all'
  ) THEN
    CREATE POLICY clean_room_checklists_service_all
      ON public.clean_room_checklists
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clean_room_checklists'
      AND policyname = 'clean_room_checklists_owner_select'
  ) THEN
    CREATE POLICY clean_room_checklists_owner_select
      ON public.clean_room_checklists
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = clean_room_checklists.project_id AND p.user_id = auth.uid())
      );
  END IF;
END $$;

COMMENT ON TABLE public.clean_room_checklists IS
  'S29-A: founder-ticked task states for the clean-room preparation guide (/workspace/clean-room); computed tasks (NDA gate, watermark, links, sections, engagement log) are derived live from the data room, never stored here. 1:1 with projects.';

NOTIFY pgrst, 'reload schema';
