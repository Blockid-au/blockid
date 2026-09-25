-- 0462 — G34 DC01 / AF13 (25/09/2026): an /analyze run can belong to a project.
-- Additive and nullable: every retained release ignores the column; rows
-- without a confident match stay NULL (never guessed, never backfilled).
BEGIN;
ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS analyses_project_created_idx
  ON public.analyses (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
COMMIT;
NOTIFY pgrst, 'reload schema';
