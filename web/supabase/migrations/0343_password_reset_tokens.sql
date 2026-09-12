-- 0343_password_reset_tokens.sql (release QA-4 P2-d, 2026-09-12)
--
-- Token-based password reset. Until now POST /api/auth/reset-password
-- overwrote app_users.password_hash the moment anyone submitted a victim's
-- email (forced reset / lockout, rate-limited only 3 per 15 min per IP).
-- A reset REQUEST now mints a row here; the hash is rotated only when the
-- token is consumed with a new password (lib/auth.ts consumePasswordReset).
--
--   token_hash   sha256 hex of the 32-char nanoid the email carries — the
--                plaintext is never stored, so a DB read cannot replay it
--   expires_at   request time + 30 min (PASSWORD_RESET_TTL_MIN)
--   consumed_at  flipped BEFORE the hash rotates; a consumed row is inert
--   ip_hash      salted hash of the requesting address (abuse forensics)
--
-- RLS enabled, no policies: service-role only, same as magic_links / sessions.
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker exec -i supabase-db psql -U postgres -d postgres < this file
--   then: NOTIFY pgrst, 'reload schema';

create table if not exists public.password_reset_tokens (
  token_hash    text primary key,
  user_id       uuid not null references public.app_users(id) on delete cascade,
  email         text not null,
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now(),
  ip_hash       text
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id);
create index if not exists password_reset_tokens_expires_at_idx
  on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

comment on table public.password_reset_tokens is
  'Single-use, 30-minute password reset tokens (sha256 of the emailed token). QA-4 P2-d.';
