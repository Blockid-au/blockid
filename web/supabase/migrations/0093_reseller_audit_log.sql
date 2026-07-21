-- Migration 0093 — reseller_audit_log (Track A P4.1 backfill)
--
-- Fills the gap discovered at P1.4 apply time: every /api/reseller/** route
-- writes to reseller_audit_log via resellerSupabase().auditLog() but no prior
-- migration created the table. Without this file, the entire reseller portal
-- (P4 customers/drawer/reveal-email, P6 credits/grant + sandbox/setup,
--  P7 reports/[month]/signed-url, P9 admin approvals) 500s at first hit.
--
-- Column contract matches web/src/lib/reseller/supabase.ts:141-163.
-- Append-only via mutation trigger (same pattern as audit_events in 0076).
--
-- Applied via: docker exec supabase-db psql -U postgres -d postgres
--              -f 0093_reseller_audit_log.sql
-- Then: NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS public.reseller_audit_log (
  id            bigserial PRIMARY KEY,
  reseller_id   uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  subject_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  action        text NOT NULL,
  fields        text[] NOT NULL DEFAULT ARRAY[]::text[],
  route         text NOT NULL,
  ip            text,
  user_agent    text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reseller_audit_log_reseller_time_idx
  ON public.reseller_audit_log (reseller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reseller_audit_log_subject_idx
  ON public.reseller_audit_log (subject_user_id, created_at DESC)
  WHERE subject_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reseller_audit_log_action_idx
  ON public.reseller_audit_log (action, created_at DESC);

-- Append-only: block UPDATE/DELETE at the row level.
CREATE OR REPLACE FUNCTION public.reseller_audit_log_no_mutate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'reseller_audit_log is append-only';
END $$;

DROP TRIGGER IF EXISTS reseller_audit_log_no_update_trg ON public.reseller_audit_log;
CREATE TRIGGER reseller_audit_log_no_update_trg
  BEFORE UPDATE ON public.reseller_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.reseller_audit_log_no_mutate();

DROP TRIGGER IF EXISTS reseller_audit_log_no_delete_trg ON public.reseller_audit_log;
CREATE TRIGGER reseller_audit_log_no_delete_trg
  BEFORE DELETE ON public.reseller_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.reseller_audit_log_no_mutate();

-- Default-deny RLS; scoped writes go through service-role wrapper only
-- (per web/src/lib/reseller/supabase.ts + scope.ts chokepoint).
ALTER TABLE public.reseller_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.reseller_audit_log IS
  'Append-only per-reseller access audit trail. Every /api/reseller/** row read '
  'or side-effect writes here BEFORE returning to the caller (D3-CISO-01 chokepoint). '
  'See docs/plans/reseller-module-plan.md § U.15.13.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
