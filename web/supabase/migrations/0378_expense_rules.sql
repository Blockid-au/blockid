-- 0378_expense_rules.sql
-- ---------------------------------------------------------------------------
-- S28-C — per-project learned categorisation rules.
--
-- Why
--   When a founder re-categorises a bank line by hand (PATCH
--   /api/expenses/[id]), the next import of the same merchant should land in
--   that category BEFORE the built-in keyword table and the model run — the
--   founder's own decision outranks both, and it costs no credits.
--
-- What
--   expense_rules — one row per (project, normalised merchant token):
--     project_id     FK projects(id) ON DELETE CASCADE (no app_users FK)
--     merchant_key   lowercase token lib/expenses/categorise.ts derives from
--                    the narration (digits / references stripped)
--     category       the fixed chart key (same CHECK list as 0377)
--     hits           how many rows the rule has re-categorised — the UI
--                    shows "learned from N lines"
--     last_applied_at
--
-- RLS
--   Enabled; service role only (same as 0377).
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0378_expense_rules.sql
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.expense_rules (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID         NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  merchant_key     TEXT         NOT NULL,
  category         TEXT         NOT NULL,
  hits             INTEGER      NOT NULL DEFAULT 0,
  last_applied_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT expense_rules_category_check CHECK (category IN (
    'revenue','cost_of_sales','contractors','salaries_wages','superannuation','rent',
    'software_subscriptions','cloud_hosting','marketing_advertising','travel',
    'meals_entertainment','professional_fees','insurance','bank_fees','interest',
    'equipment','r_and_d','government_grants','owner_drawings','transfer','other'
  )),
  CONSTRAINT expense_rules_merchant_check CHECK (char_length(merchant_key) BETWEEN 2 AND 120),
  CONSTRAINT expense_rules_project_merchant_key UNIQUE (project_id, merchant_key)
);

CREATE INDEX IF NOT EXISTS idx_expense_rules_project
  ON public.expense_rules (project_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.expense_rules_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_rules_touch ON public.expense_rules;
CREATE TRIGGER trg_expense_rules_touch
  BEFORE UPDATE ON public.expense_rules
  FOR EACH ROW EXECUTE FUNCTION public.expense_rules_touch();

ALTER TABLE public.expense_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expense_rules'
      AND policyname = 'expense_rules_service_all'
  ) THEN
    CREATE POLICY expense_rules_service_all
      ON public.expense_rules
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.expense_rules IS
  'S28-C: per-project merchant → category rules learned from manual re-categorisation; applied before the built-in keyword table and before any AI call.';

NOTIFY pgrst, 'reload schema';
