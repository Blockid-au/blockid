-- 0360_board_resolutions.sql
-- ---------------------------------------------------------------------------
-- S26-B — board resolutions (AU circulating resolutions of the directors).
--
-- Why
--   The data room shipped a placeholder `board-consent.docx` template only.
--   The cap-table workflow produces three events that need a board
--   resolution before they are effective — a share issue (s 254X notice
--   within 28 days), a dividend declaration (s 254T solvency test) and the
--   adoption of an ESOP — and nothing generated them from the records the
--   founder already keeps.
--
-- What
--   `board_resolutions` — one row per (project, kind, referenced record):
--   the resolution payload frozen as generated (the PDF renders from THIS,
--   never a recompute — a resolution that has been circulated for
--   signature must not change under the directors), the SHA-256 of the
--   canonical payload, and the credits charged. Re-downloading a generated
--   resolution is free; the unique index makes "Board resolution" safe to
--   press twice.
--
--     kind        share-issue | dividend | esop
--     record_id   share_transactions.id / dividend_records.id / esop_pool.id
--                 — no FK on purpose: the three sources have different
--                 lifecycles (esop_pool rows are upserted, share_transactions
--                 rows are never deleted, dividend_records cascade) and the
--                 resolution is a corporate record that must outlive an
--                 edited source row. The route resolves the record through
--                 the project scope before it ever reads this table.
--     user_id     the caller who generated it (owner OR an accepted
--                 editor/admin member) — provenance only. Deliberately NO
--                 foreign key to app_users: a signed board resolution is a
--                 corporate record the company must keep for 7 years
--                 (Corporations Act s 251A / s 286), and S24-B's erasure map /
--                 `erase_account` RPC are pinned to the live FK inventory;
--                 the project FK (CASCADE) governs the row's life instead.
--                 (Same stance as 0350 `dividend_statements`.)
--
-- RLS
--   Enabled. Owner may SELECT their project's resolutions (through
--   projects.user_id); every write goes through the service role from the
--   board-resolution routes, which resolve member roles via project_members.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0360_board_resolutions.sql
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.board_resolutions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID         NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id          UUID         NOT NULL,
  kind             TEXT         NOT NULL CHECK (kind IN ('share-issue', 'dividend', 'esop')),
  record_id        UUID         NOT NULL,
  content_hash     TEXT         NOT NULL CHECK (content_hash ~ '^blockid:v1:[0-9a-f]{64}$'),
  payload          JSONB        NOT NULL,
  credits_charged  NUMERIC(8,2) NOT NULL DEFAULT 0,
  issued_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One resolution per referenced record — a second press is a free re-download.
CREATE UNIQUE INDEX IF NOT EXISTS uq_board_resolutions_record
  ON public.board_resolutions (project_id, kind, record_id);

CREATE INDEX IF NOT EXISTS idx_board_resolutions_project
  ON public.board_resolutions (project_id, issued_at DESC);

ALTER TABLE public.board_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_resolutions_owner_select ON public.board_resolutions;
CREATE POLICY board_resolutions_owner_select ON public.board_resolutions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = board_resolutions.project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS board_resolutions_service_all ON public.board_resolutions;
CREATE POLICY board_resolutions_service_all ON public.board_resolutions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.board_resolutions IS
  'S26-B: generated circulating resolutions of the directors (share issue / dividend / ESOP adoption) — frozen payload + SHA-256; one per (project, kind, record); written only by service-role routes.';
COMMENT ON COLUMN public.board_resolutions.record_id IS
  'share_transactions.id (share-issue) / dividend_records.id (dividend) / esop_pool.id (esop). No FK — see header.';
COMMENT ON COLUMN public.board_resolutions.payload IS
  'BoardResolutionPayload as generated (lib/board-resolutions/build.ts); the PDF renders from this, never from a recompute.';
COMMENT ON COLUMN public.board_resolutions.user_id IS
  'Generator (owner or accepted editor/admin member). No FK on purpose — corporate record kept 7 y; see header.';

NOTIFY pgrst, 'reload schema';
