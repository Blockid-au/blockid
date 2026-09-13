-- 0379_listing_profiles.sql
-- ---------------------------------------------------------------------------
-- S29-A — listing readiness profile (ASX / Nasdaq checker).
--
-- Why
--   The listing readiness checker (/workspace/listing-readiness) computes
--   spread, free float, market capitalisation and bank-line profit from the
--   cap table and the share price, but audited financial years, board and
--   committee composition, market makers, balance-sheet figures and the
--   AUD→USD rate exist in no stored record. The founder ticks them here,
--   with dates, and every row of the checker says whether it came from a
--   stored record or from this profile ("entered").
--
-- What
--   listing_profiles — 1:1 with projects:
--     project_id          PK, FK projects(id) ON DELETE CASCADE (no app_users FK)
--     facts               jsonb — validated by lib/listing/profile.ts
--                         (`parseListingFactsPatch`); unknown keys are never
--                         written
--     pdf_credits_charged the credits charged for the readiness PDF export
--                         (charged once per project; re-downloads free —
--                         same rule as board resolutions)
--     pdf_charged_at      when that charge landed
--     created_at / updated_at
--
-- RLS
--   Enabled; service role for all; the project OWNER may read their own row
--   (members go through the API, which resolves the role table).
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0379_listing_profiles.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.listing_profiles (
  project_id           UUID         PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  facts                JSONB        NOT NULL DEFAULT '{}'::jsonb,
  pdf_credits_charged  NUMERIC(8,2) NOT NULL DEFAULT 0,
  pdf_charged_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT listing_profiles_facts_object CHECK (jsonb_typeof(facts) = 'object'),
  CONSTRAINT listing_profiles_pdf_credits_nonneg CHECK (pdf_credits_charged >= 0)
);

CREATE OR REPLACE FUNCTION public.listing_profiles_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_profiles_touch ON public.listing_profiles;
CREATE TRIGGER trg_listing_profiles_touch
  BEFORE UPDATE ON public.listing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.listing_profiles_touch();

ALTER TABLE public.listing_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'listing_profiles'
      AND policyname = 'listing_profiles_service_all'
  ) THEN
    CREATE POLICY listing_profiles_service_all
      ON public.listing_profiles
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'listing_profiles'
      AND policyname = 'listing_profiles_owner_select'
  ) THEN
    CREATE POLICY listing_profiles_owner_select
      ON public.listing_profiles
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = listing_profiles.project_id AND p.user_id = auth.uid())
      );
  END IF;
END $$;

COMMENT ON TABLE public.listing_profiles IS
  'S29-A: founder-ticked listing readiness facts (audited FYs, board / committee composition, market makers, balance-sheet figures, AUD→USD rate) behind /workspace/listing-readiness; 1:1 with projects. facts validated by lib/listing/profile.ts.';

NOTIFY pgrst, 'reload schema';
