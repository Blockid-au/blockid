-- 0377_bank_transactions.sql
-- ---------------------------------------------------------------------------
-- S28-C — expense categorisation AI ("Expense categorization AI", roadmap-v2).
--
-- Why
--   POST /api/evidence/bank-statement parsed an uploaded bank CSV into ONE
--   svi_evidence row (burn / net cash flow) and threw the rows away. Nothing
--   on the platform knew what the money was spent on, so /workspace/revenue
--   fell back to estimates whenever Xero / Stripe were not connected.
--
-- What
--   bank_transactions — one row per parsed statement line, per project.
--     project_id       FK projects(id) ON DELETE CASCADE (no app_users FK —
--                      erasure follows the project)
--     statement_ref    the upload this row came from ("<bank>:<file>:<sha>")
--                      so a re-import of the same file is a no-op
--     occurred_on      transaction date (AU DD/MM/YYYY parsed server-side)
--     description      raw narration, trimmed to 500 chars
--     amount_aud       signed: money OUT negative, money IN positive
--     counterparty     normalised merchant token the rules matched on
--     category         one of the fixed AU small-business chart
--                      (web/src/lib/expenses/categories.ts — keep the CHECK
--                      list and CATEGORY_KEYS in sync)
--     category_source  rule | ai | manual   (NULL until something decided)
--     confidence       0..1 (rules 0.9+, AI as returned, manual 1)
--     needs_review     true when no rule matched and the model was unsure
--                      (< 0.5) or has not run yet
--     gst_treatment    gst | gst_free | input_taxed | unknown — a DEFAULT per
--                      category; the founder's BAS is theirs to prepare
--     hash             sha256(occurred_on|amount|description) — UNIQUE per
--                      project, the dedupe key across uploads
--
-- RLS
--   Enabled; service role only. Every read/write goes through the project-
--   scoped API routes (lib/project-members/http.ts, viewer+ / editor+).
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0377_bank_transactions.sql
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID           NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  statement_ref    TEXT           NOT NULL,
  occurred_on      DATE           NOT NULL,
  description      TEXT           NOT NULL,
  amount_aud       NUMERIC(14,2)  NOT NULL,
  counterparty     TEXT,
  category         TEXT           NOT NULL DEFAULT 'other',
  category_source  TEXT,
  confidence       NUMERIC(4,3)   NOT NULL DEFAULT 0,
  needs_review     BOOLEAN        NOT NULL DEFAULT true,
  gst_treatment    TEXT           NOT NULL DEFAULT 'unknown',
  hash             TEXT           NOT NULL,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT bank_transactions_category_check CHECK (category IN (
    'revenue','cost_of_sales','contractors','salaries_wages','superannuation','rent',
    'software_subscriptions','cloud_hosting','marketing_advertising','travel',
    'meals_entertainment','professional_fees','insurance','bank_fees','interest',
    'equipment','r_and_d','government_grants','owner_drawings','transfer','other'
  )),
  CONSTRAINT bank_transactions_source_check CHECK (category_source IS NULL OR category_source IN ('rule','ai','manual')),
  CONSTRAINT bank_transactions_gst_check CHECK (gst_treatment IN ('gst','gst_free','input_taxed','unknown')),
  CONSTRAINT bank_transactions_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT bank_transactions_description_check CHECK (char_length(description) BETWEEN 1 AND 500),
  CONSTRAINT bank_transactions_hash_check CHECK (char_length(hash) BETWEEN 16 AND 128),
  CONSTRAINT bank_transactions_project_hash_key UNIQUE (project_id, hash)
);

-- Summary + list: a project's rows by date.
CREATE INDEX IF NOT EXISTS idx_bank_transactions_project_date
  ON public.bank_transactions (project_id, occurred_on DESC);

-- "Needs review first" + the categorise queue.
CREATE INDEX IF NOT EXISTS idx_bank_transactions_review
  ON public.bank_transactions (project_id, needs_review, occurred_on DESC)
  WHERE needs_review = true;

CREATE OR REPLACE FUNCTION public.bank_transactions_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_transactions_touch ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_touch
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bank_transactions_touch();

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bank_transactions'
      AND policyname = 'bank_transactions_service_all'
  ) THEN
    CREATE POLICY bank_transactions_service_all
      ON public.bank_transactions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.bank_transactions IS
  'S28-C: parsed bank-statement lines per project, categorised by rules → AI → manual (lib/expenses). Dedupe key = (project_id, hash). General information only, not tax advice.';
COMMENT ON COLUMN public.bank_transactions.gst_treatment IS
  'Default GST treatment of the category (estimate, flagged in the UI) — not a BAS figure.';
COMMENT ON COLUMN public.bank_transactions.hash IS
  'sha256 of normalised occurred_on|amount_aud|description — the same line in two uploads is stored once.';

NOTIFY pgrst, 'reload schema';
