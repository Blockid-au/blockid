-- Migration 0100 — showcase_reviews (Track B B9 reviews & feedback surface)
--
-- Per docs/plans/reseller-module-plan.md § U.9 §5 (line 284) + § U.8 Track B
-- roadmap B9 (line 304). Phase 9 investor reviews land here as one row per
-- invited reviewer. The literal schema in the plan is
--
--   showcase_reviews(project_id, reviewer_email, rating int, comment_hash text, created_at)
--
-- with the explicit rule "hash the comment so reseller can't reconstruct".
-- We store `comment` as an OPTIONAL plaintext column too so the founder can
-- read the review body in-app (§284: "shown to the founder in-app"); the
-- reseller-side rollup path in web/src/lib/reseller/supabase.ts NEVER selects
-- `comment` — only rating + created_at + comment_hash. RLS enforces the same
-- boundary at the DB layer.
--
-- The reviewer-facing capture flow authenticates via a
-- data_room_access_tokens.token (0062:70-91) so the invited investor doesn't
-- need a BlockID account. access_token_id is captured for audit but is
-- nullable so authed founder-side test submissions remain valid.
--
-- Applied via: docker exec supabase-db psql -U postgres -d postgres
--              -f 0100_showcase_reviews.sql
-- Then: NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS public.showcase_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  access_token_id uuid,
  reviewer_email  text NOT NULL,
  rating          int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         text,
  comment_hash    text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Attach the data_room_access_tokens FK opportunistically. The target table
-- ships in migration 0062 which is not applied on every host (dev boxes have
-- historically skipped it — see B1.3 tick 42 note). Constraint is added only
-- when the target exists; hosts without 0062 store the uuid without a hard FK.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'data_room_access_tokens'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'public'
       AND table_name = 'showcase_reviews'
       AND constraint_name = 'showcase_reviews_access_token_fk'
  ) THEN
    ALTER TABLE public.showcase_reviews
      ADD CONSTRAINT showcase_reviews_access_token_fk
      FOREIGN KEY (access_token_id)
      REFERENCES public.data_room_access_tokens(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS showcase_reviews_project_time_idx
  ON public.showcase_reviews (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS showcase_reviews_email_idx
  ON public.showcase_reviews (reviewer_email);

-- One review per (project, reviewer) — investors can be re-invited but we
-- store the latest submission by UPSERTing on this key from the API layer.
CREATE UNIQUE INDEX IF NOT EXISTS showcase_reviews_project_reviewer_uidx
  ON public.showcase_reviews (project_id, lower(reviewer_email));

ALTER TABLE public.showcase_reviews ENABLE ROW LEVEL SECURITY;

-- Default deny: all reads/writes go through service_role via the typed
-- reseller wrapper + reviewer-token API. The founder-facing view lives in
-- authenticated app-layer code that already scopes by project ownership.
CREATE POLICY showcase_reviews_service ON public.showcase_reviews FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.showcase_reviews IS
  'Phase-9 investor reviews per U.9 §5. Reseller-lens queries never select '
  '`comment` — only rating + created_at + comment_hash. Founder-lens queries '
  'may include `comment` since the reviewer submitted it to that founder.';

COMMENT ON COLUMN public.showcase_reviews.comment_hash IS
  'SHA-256 of the trimmed comment body. Reseller aggregate uses this to '
  'de-duplicate identical submissions across projects without ever seeing '
  'the plaintext.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
