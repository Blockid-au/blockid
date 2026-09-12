-- 0337 — audit hash-chain functions must not depend on the caller's search_path.
--
-- 0335's trigger called bare `digest()`; pgcrypto lives in the `extensions`
-- schema and PostgREST's `service_role` session has search_path = public only,
-- so EVERY audit_events insert from the app failed with 42883
-- ("function digest(text, unknown) does not exist") — swallowed by the
-- apiRoute sink, so handlers kept working while the audit log stayed empty
-- (found live 2026-09-12 04:30 UTC, 0 rows after the S20-A deploy).
-- Fix: pin search_path on both functions and schema-qualify digest().

BEGIN;

ALTER FUNCTION public.audit_events_hash_chain() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.audit_events_verify_chain(bigint, integer) SET search_path = public, extensions, pg_temp;

COMMIT;

NOTIFY pgrst, 'reload schema';
