-- 0230_prompt_versions.sql
-- v3 Master Upgrade Plan Phase 4 sub-H1 — §6.3 prompt registry.
--
-- Purpose: version every prompt the platform runs (AIR-001..AIR-010 model
-- pipeline agents + the eleven C-Level agents) so we can shadow-test new
-- versions, canary a small % of traffic, promote to prod atomically, and
-- roll back to the previous prod version if quality regresses.
--
-- Lifecycle (status column):
--   draft       — authored, not yet run
--   shadow      — runs alongside prod on every request; results scored
--                 offline, no user impact
--   canary      — routed to a small % of real traffic (feature-flagged)
--   prod        — the version chosen when callers ask for `agent`
--                 (enforced by partial unique index below)
--   rolled_back — was prod, replaced by a newer prod; kept for audit
--
-- Only ONE prod version per agent at a time. The partial unique index on
-- (agent) WHERE status='prod' enforces this at the database level so a
-- race between two promotion workers can never leave two rows both marked
-- prod for the same agent.
--
-- rollback_from: when a canary is promoted to prod, the current prod is
-- flipped to rolled_back and its id is stored on the new prod row so the
-- prompt-registry helper can atomically restore the prior version.
--
-- Idempotency: DDL uses IF NOT EXISTS. RLS enabled defense-in-depth —
-- all writes go through the service-role key (BYPASSRLS).

BEGIN;

CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Open enum: AIR-001..AIR-010 (model pipeline agents from §5.4) plus
  -- the eleven C-Level agents (CEO, CFO, CTO, CMO, COO, CPO, CRO, CHRO,
  -- CDO, CISO, CLO). Left as free text — the app validates via Zod so a
  -- new agent (e.g. an AIR-011 self-upgrade agent) does not require a
  -- schema migration.
  agent text NOT NULL,

  -- Semver format (major.minor.patch). Not CHECK-constrained so a
  -- pre-release tag (`1.0.0-rc.1`) is permitted; the app-side Zod schema
  -- enforces the shape.
  version text NOT NULL,

  purpose text NOT NULL,

  -- Model identifier — e.g. `claude-sonnet-5`, `gpt-4o-mini`. Free text
  -- so a new model does not require a schema migration.
  model text NOT NULL,

  -- List of variable names the prompt template substitutes. Stored as a
  -- JSON array so the shape stays flexible (some prompts want typed
  -- variable specs, some just names).
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The Zod output schema serialised to JSON — the machine-readable
  -- contract the caller uses to validate model responses.
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- List of AIR-101..AIR-110 guardrail codes this prompt is expected to
  -- honour (hallucination guard, PII guard, jailbreak guard, etc).
  guardrails text[] NOT NULL DEFAULT '{}'::text[],

  -- Points at a fixture set used for nightly regression evaluation.
  test_set_id uuid,

  -- Latest evaluation stats: accuracy MAE, hallucination%, cost per run,
  -- p50/p95 latency. Free-form JSON so the eval harness can evolve.
  evaluation_result jsonb DEFAULT '{}'::jsonb,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','shadow','canary','prod','rolled_back')),

  released_at timestamptz,

  -- When a canary is promoted, this points at the prior prod row so a
  -- rollback restores exactly the version being replaced.
  rollback_from uuid REFERENCES public.prompt_versions(id),

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (agent, version)
);

-- Only one prod row per agent — enforced at the database level so two
-- concurrent promoteCanaryToProd() calls can never leave two prod rows.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_versions_agent_prod_uniq
  ON public.prompt_versions (agent)
  WHERE status = 'prod';

CREATE INDEX IF NOT EXISTS prompt_versions_agent_status_idx
  ON public.prompt_versions (agent, status);

CREATE INDEX IF NOT EXISTS prompt_versions_created_idx
  ON public.prompt_versions (created_at DESC);

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.prompt_versions IS
  'Every prompt version the platform runs. One prod row per agent (enforced by partial unique index). Powers shadow/canary rollout, promotion, and rollback. Master Upgrade Plan Phase 4 §6.3.';

COMMENT ON COLUMN public.prompt_versions.agent IS
  'AIR-001..AIR-010 pipeline agents or one of the eleven C-Level agents (CEO/CFO/CTO/CMO/COO/CPO/CRO/CHRO/CDO/CISO/CLO). Free text — new agents do not require a migration.';

COMMENT ON COLUMN public.prompt_versions.status IS
  'draft → shadow → canary → prod; supplanted rows become rolled_back. Only one prod row per agent at a time.';

COMMENT ON COLUMN public.prompt_versions.rollback_from IS
  'The prior prod row this version replaced when it was promoted. Enables atomic rollback.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
