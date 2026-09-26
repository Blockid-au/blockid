-- 0468 — score_views can record a view of an svi_analyses share (26/09/2026).
--
-- /s/<slug> serves two kinds of subject: a legacy `scores` row and an
-- `svi_analyses` row (every /startup-index listing links to its analysis id).
-- `score_views.score_id` is `text NOT NULL REFERENCES scores(id)`, so every
-- view of an svi_analyses share failed with FK 23503 and was silently dropped:
-- no score_views row has been written since 2026-09-08.
--
-- Additive: a nullable `svi_analysis_id` FK (svi_analyses.id is text) with
-- ON DELETE CASCADE (erasing an analysis erases its view log, exactly like
-- score_id), `score_id` loses NOT NULL, and a CHECK keeps exactly one subject
-- per row. Every existing row has score_id set and svi_analysis_id NULL, so
-- the CHECK holds for them. Retained releases keep writing score_id only and
-- are unaffected; the new code (lib/share/score-views.ts) writes
-- svi_analysis_id for analysis shares and falls back to the old behaviour
-- while this file is not applied. No personal data in the new column (an
-- analysis id) — the erasure map is keyed on app_users FKs and is unchanged.
BEGIN;
ALTER TABLE public.score_views
  ADD COLUMN IF NOT EXISTS svi_analysis_id text
    REFERENCES public.svi_analyses(id) ON DELETE CASCADE;
ALTER TABLE public.score_views
  ALTER COLUMN score_id DROP NOT NULL;
ALTER TABLE public.score_views
  DROP CONSTRAINT IF EXISTS score_views_one_subject_check;
ALTER TABLE public.score_views
  ADD CONSTRAINT score_views_one_subject_check
    CHECK (num_nonnulls(score_id, svi_analysis_id) = 1);
CREATE INDEX IF NOT EXISTS score_views_svi_analysis_id_viewed_at_idx
  ON public.score_views (svi_analysis_id, viewed_at DESC)
  WHERE svi_analysis_id IS NOT NULL;
COMMIT;
NOTIFY pgrst, 'reload schema';
