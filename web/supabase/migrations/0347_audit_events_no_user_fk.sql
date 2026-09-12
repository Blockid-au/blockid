-- 0347 — audit_events must not block account deletion.
--
-- 0076 declared `audit_events.user_id REFERENCES app_users(id) ON DELETE SET
-- NULL`. Since 0335/0338 the table is append-only (UPDATE raises), so the
-- cascade's UPDATE fails and DELETE FROM app_users is impossible — which
-- breaks the privacy policy's deletion right and the QA-account cleanup
-- (found 2026-09-12). The audit log is a tamper-evident ledger: it keeps the
-- pseudonymous user id after deletion (no PII lives in the row), so the FK is
-- dropped rather than weakened. Hash chain untouched.

BEGIN;
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_user_id_fkey;
COMMENT ON COLUMN public.audit_events.user_id IS
  'Actor app_users.id at the time of the event; intentionally NOT a foreign key so account deletion never touches the append-only ledger.';
COMMIT;

NOTIFY pgrst, 'reload schema';
