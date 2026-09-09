-- 0130_analysis_free_summary_delivery.sql
-- ---------------------------------------------------------------------------
-- The free tier: one 5-page summary, emailed once, per analysis.
--
-- Why
--   The funnel is now three rungs — a free 5-page summary emailed to you, the
--   A$3 written report, and the A$29/mo workspace. Rung one needs somewhere to
--   record that a summary was asked for and that it went out, because the one
--   promise the free tier makes is "send once". Without a row-level marker the
--   only thing standing between a double-click and two identical emails is
--   client-side state, which is not a guarantee.
--
-- What
--   Four columns on `public.analyses`:
--     * `summary_email`         — the address the founder typed, lowercased.
--     * `summary_requested_at`  — the CLAIM. Set by a conditional UPDATE that
--                                 only matches while it is still null, so two
--                                 concurrent requests cannot both proceed.
--     * `summary_sent_at`       — set after the provider accepted the message.
--     * `summary_send_error`    — the last failure reason, for support.
--
-- The idempotency contract (see `web/src/lib/analyses/free-summary.ts`)
--   1. `update analyses set summary_email = $1, summary_requested_at = now()
--       where id = $2 and summary_requested_at is null returning id`
--      Zero rows back means somebody else already claimed it → no-op, and the
--      caller answers "already sent" rather than sending a second copy.
--   2. On a successful send, `summary_sent_at` is stamped and the claim stands
--      for the life of the row. Every later attempt is a no-op.
--   3. On a FAILED send the claim is RELEASED (`summary_requested_at = null`)
--      and the reason recorded, because a founder whose email bounced on our
--      side must be able to press the button again. Releasing only ever
--      happens on a send we know did not land.
--
-- Privacy
--   `summary_email` is the only identifying value that has ever been attached
--   to an anonymous `analyses` row, and it is here because the founder typed
--   it in and asked us to send them something. It is not a marketing list:
--   suppression is enforced through the existing `email_preferences` table via
--   `canSendEmail(email, "promotions")`, and the unsubscribe link on the email
--   writes there, not here. Nothing in this migration creates a second
--   suppression mechanism.
--
-- Ownership note: run as `postgres` — `public.analyses` is owned by
-- `postgres` (see 0124); no `supabase_admin` escalation was required.
--
-- Idempotent: add-column-if-not-exists throughout.
-- ---------------------------------------------------------------------------

begin;

alter table public.analyses
  add column if not exists summary_email text;
alter table public.analyses
  add column if not exists summary_requested_at timestamptz;
alter table public.analyses
  add column if not exists summary_sent_at timestamptz;
alter table public.analyses
  add column if not exists summary_send_error text;

comment on column public.analyses.summary_email is
  'Address the founder asked us to send the free 5-page summary to. Lowercased. Suppression lives in email_preferences, never here.';
comment on column public.analyses.summary_requested_at is
  'The send claim. A conditional UPDATE matching only while this is null is what makes delivery once-only; released back to null when a send provably failed, so a retry can work.';
comment on column public.analyses.summary_sent_at is
  'Set once the mail provider accepted the message. Non-null means never send again.';
comment on column public.analyses.summary_send_error is
  'Last failure reason for a summary send. Support-facing only.';

-- "has this address already been sent a summary" and the ops sweep of
-- requested-but-never-sent rows. Partial: the vast majority of analyses have
-- no summary email at all.
create index if not exists analyses_summary_email_idx
  on public.analyses (summary_email)
  where summary_email is not null;

create index if not exists analyses_summary_pending_idx
  on public.analyses (summary_requested_at)
  where summary_requested_at is not null and summary_sent_at is null;

commit;

notify pgrst, 'reload schema';
