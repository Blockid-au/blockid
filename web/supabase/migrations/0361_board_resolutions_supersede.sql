-- 0361_board_resolutions_supersede.sql
-- ---------------------------------------------------------------------------
-- S27-A — board resolutions can be regenerated (S26 post-ship review P2-7).
--
-- Why
--   0360 froze ONE resolution per (project, kind, record_id). That is right
--   for a share issue, but `esop_pool` is upserted on the same id when the
--   founder resizes the pool and a dividend record can be edited, so the
--   stored resolution went stale with no way to produce a fresh one — the
--   button kept serving the old payload.
--
-- What
--   Versions. A regenerate marks the current row superseded and inserts
--   version n+1; the old row is kept (a circulated resolution is a corporate
--   record — s 251A / s 286 — and its PDF now carries a "SUPERSEDED by v<n>
--   on <date>" banner). The unique index becomes PARTIAL: one CURRENT
--   (not superseded) resolution per record, any number of superseded ones.
--
--     version         1 for every existing row; n+1 on regenerate
--     superseded_at   when this version stopped being current (NULL = current)
--     superseded_by   the row that replaced it (self-FK, SET NULL if that row
--                     is ever removed so the history row survives)
--
--   No user FK is added (same stance as 0360 — `user_id` stays a bare uuid).
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0361_board_resolutions_supersede.sql
-- ---------------------------------------------------------------------------

ALTER TABLE public.board_resolutions
  ADD COLUMN IF NOT EXISTS version       INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'board_resolutions_version_positive' AND conrelid = 'public.board_resolutions'::regclass
  ) THEN
    ALTER TABLE public.board_resolutions
      ADD CONSTRAINT board_resolutions_version_positive CHECK (version >= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'board_resolutions_superseded_by_fkey' AND conrelid = 'public.board_resolutions'::regclass
  ) THEN
    ALTER TABLE public.board_resolutions
      ADD CONSTRAINT board_resolutions_superseded_by_fkey
      FOREIGN KEY (superseded_by) REFERENCES public.board_resolutions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- One CURRENT resolution per referenced record; superseded versions are history.
DROP INDEX IF EXISTS public.uq_board_resolutions_record;
CREATE UNIQUE INDEX IF NOT EXISTS uq_board_resolutions_record_current
  ON public.board_resolutions (project_id, kind, record_id)
  WHERE superseded_at IS NULL;

-- Version lookups for the list / PDF `?version=` reads.
CREATE INDEX IF NOT EXISTS idx_board_resolutions_record_version
  ON public.board_resolutions (project_id, kind, record_id, version DESC);

COMMENT ON COLUMN public.board_resolutions.version IS
  'S27-A: 1 for the first generation; n+1 on each regenerate (the previous row is superseded, never deleted).';
COMMENT ON COLUMN public.board_resolutions.superseded_at IS
  'S27-A: when this version stopped being current. NULL = the current resolution for (project, kind, record_id) — enforced by uq_board_resolutions_record_current.';
COMMENT ON COLUMN public.board_resolutions.superseded_by IS
  'S27-A: id of the board_resolutions row that replaced this one (self-FK, ON DELETE SET NULL).';

NOTIFY pgrst, 'reload schema';
