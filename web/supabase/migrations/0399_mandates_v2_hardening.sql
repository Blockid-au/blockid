-- 0399 — W3 post-ship review hardening for 0393 objects (defence in depth;
-- PostgREST is not reachable from browsers today, all reads use the service
-- role — these close the holes for the day it is).
BEGIN;

-- 1. The founder view was auto-updatable and `authenticated` inherited
--    INSERT/UPDATE/DELETE/TRUNCATE on it via default privileges — a founder
--    with a Supabase JWT could have widened `shared_fields` or deleted the
--    evaluator's assessment through the view. SELECT only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.v_assessment_founder_view FROM anon, authenticated;

-- 2. Evaluator UPDATE on startup_taxonomy: USING must also exclude
--    founder-confirmed rows (WITH CHECK alone let an evaluator un-confirm a
--    row and strip a founder-declared protected tag in the same statement),
--    and the columns a founder owns are not updatable by evaluators at all.
DROP POLICY IF EXISTS startup_taxonomy_evaluator_update ON public.startup_taxonomy;
CREATE POLICY startup_taxonomy_evaluator_update ON public.startup_taxonomy
  FOR UPDATE TO authenticated
  USING (
    confirmed_at IS NULL AND confirmed_by IS NULL
    AND EXISTS (SELECT 1 FROM public.evaluations e WHERE e.project_id = startup_taxonomy.project_id AND e.evaluator_user_id = auth.uid())
  )
  WITH CHECK (
    confirmed_at IS NULL AND confirmed_by IS NULL
    AND NOT (tags && ARRAY['female_founded','first_nations']::text[])
    AND EXISTS (SELECT 1 FROM public.evaluations e WHERE e.project_id = startup_taxonomy.project_id AND e.evaluator_user_id = auth.uid())
  );
REVOKE UPDATE (project_id, tags, confirmed_at, confirmed_by) ON public.startup_taxonomy FROM authenticated;

COMMIT;
