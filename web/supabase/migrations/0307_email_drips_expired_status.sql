-- 0307 — email_drips: add the `expired` terminal status.
--
-- The drip worker (/api/cron/email-drip) had never been scheduled, so the
-- queue accumulated 60 pending rows, the oldest 50 days past its
-- scheduled_for. The drip copy is time-anchored ("Day 1 — your report is
-- ready", "you have been on the free tier for two weeks"), so firing a
-- 50-day-late row is both factually wrong and a cold blast at addresses
-- that have not heard from us in weeks — exactly the way a sending domain
-- we need for transactional mail (the A$3 report, the free 5-page summary)
-- earns spam complaints.
--
-- The worker now runs expireStaleDrips() BEFORE any send: pending rows more
-- than DRIP_EXPIRY_DAYS (14) past scheduled_for become `expired` instead of
-- being sent. `expired` is deliberately distinct from `cancelled` (a
-- deliberate suppression / opt-out) and from `failed` (the transport
-- rejected it) so the queue stays auditable.
--
-- Idempotent: re-running only re-asserts the constraint.

alter table public.email_drips
  drop constraint if exists email_drips_status_check;

alter table public.email_drips
  add constraint email_drips_status_check
  check (status = any (array['pending'::text, 'sent'::text, 'cancelled'::text, 'failed'::text, 'expired'::text]));

-- The expiry sweep and the once-only claim both filter on sent_at IS NULL
-- alongside (status, scheduled_for). Partial index keeps both cheap as the
-- sent/expired tail grows.
create index if not exists email_drips_unsent_due_idx
  on public.email_drips (scheduled_for)
  where status = 'pending' and sent_at is null;

notify pgrst, 'reload schema';
