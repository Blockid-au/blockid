-- 0430_outcomes_owner_insert_check.sql
-- G21 P3 post-ship review (2026-09-21): the founder INSERT policy on
-- startup_outcomes constrained recorded_by / source / ownership but not the
-- status or the confidence. Latent today (app_users.id ≠ auth.uid(), so no
-- direct PostgREST writes match), but if the ids ever align a founder could
-- insert `status='confirmed', confidence=100` and feed the calibration.
-- A founder-inserted row is always a proposal at the default confidence.
DROP POLICY IF EXISTS startup_outcomes_owner_insert ON public.startup_outcomes;
CREATE POLICY startup_outcomes_owner_insert ON public.startup_outcomes
  FOR INSERT WITH CHECK (
    recorded_by = auth.uid()
    AND source = 'founder'
    AND status = 'proposed'
    AND confirmed_by IS NULL
    AND confidence <= 60
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = startup_outcomes.project_id AND p.user_id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';
