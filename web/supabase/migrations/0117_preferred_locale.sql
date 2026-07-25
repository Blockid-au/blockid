-- Migration 0117 — founder_profiles.preferred_locale (T-1403.11)
--
-- Adds a per-user language preference so the runtime i18n stack can
-- restore a user's locale across devices / cookie clears. The client
-- still writes the `blockid_locale` cookie (source of truth for
-- anonymous visitors); the sync direction is:
--
--   sign-in     : if profile.preferred_locale set → set cookie
--   locale pick : if signed in → POST /api/founder-profile/locale
--
-- The column is nullable + not indexed — we read it exactly once per
-- session (at auth completion) and the founder_profiles table already
-- has a unique constraint on account_id so the point-lookup is O(1)
-- via that index.
--
-- Values are validated against the LOCALES tuple in
-- web/src/lib/i18n/locales.ts by the API route, not by a DB CHECK, so
-- adding a new locale doesn't need a fresh migration.
--
-- Applied via (per project memory reference_db_migrations):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--        -v ON_ERROR_STOP=1 < 0117_preferred_locale.sql
-- Then:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--        -c "NOTIFY pgrst, 'reload schema';"
--
-- Manual apply — never auto-applied on deploy.

alter table founder_profiles
  add column if not exists preferred_locale text;

comment on column founder_profiles.preferred_locale is
  'ISO-639 code (currently ''en'' | ''vi''). Validated by API layer; nullable = use cookie or browser default.';
