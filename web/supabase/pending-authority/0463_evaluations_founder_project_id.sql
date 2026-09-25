-- 0463 — G34 DC05 (25/09/2026): an evaluator's evaluation can point at the
-- claiming founder's OWN project. One startup = one project for the founder:
-- the claim records a link, it never transfers or copies the evaluator's
-- project (0314 header — projects.user_id stays the evaluator's).
-- Additive and nullable: lib/evaluations.ts claimEvaluation() writes it in a
-- separate best-effort update and tolerates the column being absent
-- (42703 / PGRST204), so every retained release is safe before and after.
-- NOT APPLIED — written for review; apply per pending-authority/README.md.
BEGIN;
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS founder_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS evaluations_founder_project_idx
  ON public.evaluations (founder_project_id)
  WHERE founder_project_id IS NOT NULL;
COMMIT;
NOTIFY pgrst, 'reload schema';
