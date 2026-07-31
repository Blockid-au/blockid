-- 0231_ai_runs.sql
-- v3 Master Upgrade Plan Phase 4 sub-H1 — §5.4 AI orchestration audit log.
--
-- Purpose: one row per LLM call the platform makes, recording which
-- prompt version was used, the input/output content hashes (for
-- reproducibility without storing raw prompts/responses), token counts,
-- cost, latency, terminal status, and the evidence rows the call cited.
--
-- Status values:
--   ok           — model returned a response that passed Zod validation
--   schema_fail  — model returned a response that failed Zod twice
--                  (initial parse + one repair pass)
--   model_error  — provider errored (network, 5xx, timeout)
--   rate_limited — 429 / quota exceeded
--   rejected     — guardrail (hallucination, PII, jailbreak) blocked
--
-- Purpose classification: `customer_report` (billed to a business),
-- `platform_self_upgrade` (CEO/CTO loop), `nightly_eval` (regression
-- harness). Free text so new purposes don't require a migration.
--
-- Idempotency: DDL uses IF NOT EXISTS. RLS enabled defense-in-depth —
-- inserts happen from the service-role key which bypasses RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  prompt_version_id uuid NOT NULL
    REFERENCES public.prompt_versions(id),

  -- Nullable: platform-internal runs (CEO/CTO self-upgrade, nightly
  -- eval) are not tied to a customer business. When set, points at the
  -- business being analysed. ON DELETE SET NULL preserves the audit
  -- trail even after a business is deleted (GDPR-safe: no PII is stored
  -- in ai_runs, only hashes and token counts).
  business_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,

  user_id uuid REFERENCES public.app_users(id),

  model text NOT NULL,

  -- SHA-256 hex of canonical-JSON of the model input. Lets us dedupe
  -- identical calls and reproduce a run without persisting raw prompts.
  input_hash text NOT NULL,

  -- Nullable: absent when the call failed before returning content.
  output_hash text,

  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,

  cost_usd numeric(8,4) NOT NULL DEFAULT 0,

  latency_ms integer,

  status text NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok','schema_fail','model_error','rate_limited','rejected')),

  -- Evidence rows the model was allowed to cite for this call. The
  -- report renderer cross-checks output citations against this list.
  evidence_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],

  -- customer_report | platform_self_upgrade | nightly_eval | …
  purpose text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_runs_prompt_version_created_idx
  ON public.ai_runs (prompt_version_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_runs_purpose_created_idx
  ON public.ai_runs (purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_runs_business_created_idx
  ON public.ai_runs (business_id, created_at DESC);

ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_runs IS
  'One row per LLM call. Records prompt version, input/output content hashes, tokens, cost, status, cited evidence. Master Upgrade Plan Phase 4 §5.4.';

COMMENT ON COLUMN public.ai_runs.input_hash IS
  'SHA-256 hex of canonical-JSON input. Reproducibility without storing raw prompts (GDPR/PII-safe).';

COMMENT ON COLUMN public.ai_runs.status IS
  'ok | schema_fail (Zod parse failed even after one repair pass) | model_error | rate_limited | rejected (guardrail block).';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
