-- 0114_dataroom_storage_path.sql
-- Storage-backed dataroom templates (2026-07-24).
--
-- Adds three columns to `public.dataroom_files` so the 10-doc Day-0
-- template seeder (`web/src/lib/dataroom/seed-templates.ts`) can back each
-- row with a real file in Supabase storage bucket `dataroom`:
--
--   storage_path      — bucket-relative path, e.g.
--                       'startup-<project_id>/templates/v1/pitch-deck.docx'
--   template_slug     — stable manifest slug (pitch-deck, cap-table, …).
--                       Used by the future re-seed diff job to find rows
--                       eligible for version bumps.
--   template_version  — 'v1' initially. Bump when the source file changes.
--
-- Existing rows are untouched — placeholder rows from populateFromAtlassian
-- keep `storage_path IS NULL` and continue to render as "missing" in the UI.
--
-- Design note (migration number): 0110 is already taken by
-- 0110_trial_warnings.sql (see /home/dovanlong/blockid.au/web/supabase
-- /migrations/0110_trial_warnings.sql). The design spec called for 0110
-- but the next free slot after 0113 is 0114 — renumbered accordingly.

ALTER TABLE public.dataroom_files
  ADD COLUMN IF NOT EXISTS storage_path     text,
  ADD COLUMN IF NOT EXISTS template_slug    text,
  ADD COLUMN IF NOT EXISTS template_version text;

-- Partial index — fast lookup of storage-backed template rows for the
-- scheduled re-seed job (find all rows that need bumping to v2, etc).
CREATE INDEX IF NOT EXISTS dataroom_files_template_slug_idx
  ON public.dataroom_files (user_id, template_slug)
  WHERE template_slug IS NOT NULL;

COMMENT ON COLUMN public.dataroom_files.storage_path IS
  'Supabase storage bucket-relative path when this row is backed by an uploaded file. NULL for placeholder rows (see mime_type=''application/vnd.blockid.template'').';
COMMENT ON COLUMN public.dataroom_files.template_slug IS
  'Stable manifest slug from web/src/lib/dataroom/template-manifest.ts. NULL for user-uploaded and Atlassian-placeholder rows.';
COMMENT ON COLUMN public.dataroom_files.template_version IS
  'Manifest version at the time of seeding. Bumped when the source-of-truth .docx/.xlsx changes; scheduled re-seed job diffs on this column.';
