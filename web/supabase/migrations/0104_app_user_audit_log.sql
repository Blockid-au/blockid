-- Migration 0104 — app_user_audit_log (Iteration-12 T5 / SOC2-lite backfill)
--
-- Generalises the reseller_audit_log pattern (0093) to a per-user audit trail
-- scoped to app_users. Every critical mutation route (project create, project
-- archive, checkout initiated, …) writes an append-only row here BEFORE
-- returning to the caller, providing SOC2-lite evidence of who did what and
-- from which route.
--
-- Column contract matches web/src/lib/audit/log.ts:
--   id            uuid   PK (gen_random_uuid)
--   user_id       uuid   NOT NULL → app_users(id)
--   action        text   NOT NULL (e.g. 'project.create', 'stripe.checkout')
--   subject_type  text   NOT NULL (e.g. 'project', 'stripe_session')
--   subject_id    uuid   nullable (the row/entity the action operated on)
--   fields        jsonb  NOT NULL DEFAULT '{}' (non-PII metadata: names of
--                                              changed fields, plan id, etc.)
--   route         text   NOT NULL (Next.js route path, e.g. '/api/projects')
--   ip            inet   nullable (best-effort from x-forwarded-for)
--   user_agent    text   nullable (best-effort from headers)
--   created_at    timestamptz NOT NULL DEFAULT now()
--
-- Append-only via mutation trigger; default-deny RLS with a single SELECT
-- policy that lets the row owner read their own trail via
-- /workspace/audit-log.
--
-- Applied via: docker exec supabase-db psql -U postgres -d postgres
--              -f 0104_app_user_audit_log.sql
-- Then: NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_user_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  action       text NOT NULL,
  subject_type text NOT NULL,
  subject_id   uuid,
  fields       jsonb NOT NULL DEFAULT '{}'::jsonb,
  route        text NOT NULL,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_user_audit_log_user_id_created_at_idx
  ON public.app_user_audit_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_user_audit_log_action_idx
  ON public.app_user_audit_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS app_user_audit_log_subject_idx
  ON public.app_user_audit_log (subject_type, subject_id, created_at DESC)
  WHERE subject_id IS NOT NULL;

-- Append-only: block UPDATE/DELETE at the row level (mirrors 0093).
CREATE OR REPLACE FUNCTION public.app_user_audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'app_user_audit_log is append-only';
END $$;

DROP TRIGGER IF EXISTS app_user_audit_log_no_update ON public.app_user_audit_log;
CREATE TRIGGER app_user_audit_log_no_update
  BEFORE UPDATE ON public.app_user_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.app_user_audit_log_append_only();

DROP TRIGGER IF EXISTS app_user_audit_log_no_delete ON public.app_user_audit_log;
CREATE TRIGGER app_user_audit_log_no_delete
  BEFORE DELETE ON public.app_user_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.app_user_audit_log_append_only();

-- Default-deny RLS. Writes always go through the service-role client in
-- web/src/lib/audit/log.ts. Row owners read their own rows via the /workspace
-- viewer, which uses the service-role client but filters by user_id.
ALTER TABLE public.app_user_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own audit rows" ON public.app_user_audit_log;
CREATE POLICY "user reads own audit rows" ON public.app_user_audit_log
  FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE public.app_user_audit_log IS
  'Append-only SOC2-lite audit trail for app_users. Every critical mutation '
  'route writes a row here after success. Generalises reseller_audit_log '
  '(0093) to non-reseller users. See web/src/lib/audit/log.ts.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
