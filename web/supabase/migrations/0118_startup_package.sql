-- 0118_startup_package.sql
-- Startup Package Ship-1 — DB + entitlement foundations.
--
-- Delivers the four tables that back the packaged founder journey (interview
-- → agent analysis → dataroom auto-fill → reserved cap-table → weekly digest):
--
--   startup_package_purchases           — Stripe one-off receipt per project
--   startup_package_interview           — per-step answer store
--   startup_package_reserved_allocations— DB-first cap-table reservation
--   startup_package_progress            — per-growth-phase progress snapshot
--
-- Plus two additive columns each on `projects` (purchase timestamp + ticker
-- hint) and `email_preferences` (weekly package-progress opt-in).
--
-- Fully idempotent — every CREATE/ALTER uses IF NOT EXISTS, every COMMENT ON
-- uses a single-string literal (mig 0114 lesson: NO || concatenation inside
-- COMMENT ON — Postgres rejects the expression syntax there).
--
-- RLS: enabled on all 4 new tables. No policies are created; the app talks to
-- Postgres exclusively via the service-role key, which has BYPASSRLS, so this
-- is pure defense-in-depth (mirror mig 0091 + 0050 patterns).

BEGIN;

-- ---------------------------------------------------------------------------
-- startup_package_purchases — one row per (user × project × Stripe session)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.startup_package_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stripe_session_id text UNIQUE,
  stripe_price_id text,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  seed_credits integer NOT NULL DEFAULT 25,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','refunded','disputed'))
);

CREATE INDEX IF NOT EXISTS startup_package_purchases_user_idx
  ON public.startup_package_purchases (user_id);

CREATE INDEX IF NOT EXISTS startup_package_purchases_project_idx
  ON public.startup_package_purchases (project_id);

ALTER TABLE public.startup_package_purchases ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.startup_package_purchases IS
  'One row per Stripe one-off purchase of the Startup Package SKU. stripe_session_id UNIQUE gives webhook idempotency. status transitions to refunded/disputed via the reseller webhook-refund-integration handler.';

-- ---------------------------------------------------------------------------
-- startup_package_interview — per-step answer store (upsert by step_key)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.startup_package_interview (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  step_key text NOT NULL,
  answer_text text NOT NULL DEFAULT '',
  char_count integer GENERATED ALWAYS AS (char_length(answer_text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique lets a project have at most one row per step_key without
-- blocking a soft-delete pattern (rows keep step_key populated always today).
CREATE UNIQUE INDEX IF NOT EXISTS startup_package_interview_project_step_uniq
  ON public.startup_package_interview (project_id, step_key);

ALTER TABLE public.startup_package_interview ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.startup_package_interview IS
  'Per-step interview answers for the Startup Package guided flow. Upserted on every /api/startup-package/save-answer POST. char_count is a stored generated column so the credit-cost lookup does not have to re-scan text on read.';

-- ---------------------------------------------------------------------------
-- startup_package_reserved_allocations — DB-first cap-table reservation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.startup_package_reserved_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  pct_reserved numeric(5,2) NOT NULL
    CHECK (pct_reserved >= 10 AND pct_reserved <= 100),
  ticker_hint text
    CHECK (ticker_hint IS NULL OR char_length(ticker_hint) BETWEEN 3 AND 4),
  on_chain_token_id text,
  opt_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.startup_package_reserved_allocations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.startup_package_reserved_allocations IS
  'Reserved on-chain allocation for the Startup Package. Written DB-first on Day-0; on_chain_token_id + opt_in_at stay NULL until the founder actively mints via /api/blockchain/create-token (Ship 2). project_id UNIQUE enforces one reservation per project.';

-- ---------------------------------------------------------------------------
-- startup_package_progress — per-growth-phase progress snapshot
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.startup_package_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id text NOT NULL,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','review','completed')),
  completion_pct integer NOT NULL DEFAULT 0
    CHECK (completion_pct BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS startup_package_progress_project_phase_uniq
  ON public.startup_package_progress (project_id, phase_id);

ALTER TABLE public.startup_package_progress ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.startup_package_progress IS
  'Per-growth-phase progress for a Startup Package project. phase_id references lib/startup-growth-phases.ts GROWTH_PHASES[].id — kept as text (not FK) because the phase list is a code-side enum, not a table.';

-- ---------------------------------------------------------------------------
-- Projects — additive columns for Startup Package purchase state.
-- ---------------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS package_purchased_at timestamptz,
  ADD COLUMN IF NOT EXISTS package_ticker text;

COMMENT ON COLUMN public.projects.package_purchased_at IS
  'Timestamp at which the Startup Package SKU was purchased for this project. NULL for projects that have not bought the package. Set by the Stripe webhook.';
COMMENT ON COLUMN public.projects.package_ticker IS
  'Optional 3-4 letter ticker hint captured during the Startup Package flow. Bound to the reserved allocation row when the founder opts in on-chain.';

-- ---------------------------------------------------------------------------
-- Email preferences — weekly Package-progress digest opt-in.
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS package_progress boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.email_preferences.package_progress IS
  'When true, the founder-weekly-digest cron prepends a Startup Package progress block to the weekly email. Defaults true — user opts OUT via the unsubscribe page.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
