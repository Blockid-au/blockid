-- 0355_fundraise_commitments_investor_followups.sql
-- ---------------------------------------------------------------------------
-- S26-A — fundraise tracker (commitments), auto data room on activation,
-- investor follow-up automation.
--
-- Why
--   `fundraise_rounds` (0030) only knew a target and a draft → active →
--   closed status. A founder running a real raise tracks every cheque
--   (Carta / Cap-table-style): who said "soft yes", who committed, who has
--   signed, whose money has landed. And DocSend-style follow-up — "Blackbird
--   opened the room, read 4 sections, has not been back in two business
--   days" — needs a per-link opt-in and a once-per-link send ledger.
--
-- What
--   1. `fundraise_rounds` gains the denormalised totals the API maintains
--      (never triggers): `soft_aud`, `committed_aud`, `funded_aud`; the
--      project the round belongs to (`project_id`, nullable for the legacy
--      account-only rows); the data room attached when the round went
--      active (`data_room_id`); `activated_at` / `updated_at`.
--   2. `fundraise_commitments` — one row per investor cheque on a round.
--        status      soft | committed | signed | funded | withdrawn
--        instrument  safe | convertible_note | priced_equity
--        access_token_id  optional tie to the data-room link the investor
--                         holds (`data_room_access_tokens`, the data-room
--                         investor-link table), so a room viewer becomes a
--                         cheque without re-typing their name.
--        created_by  the app user who recorded it (FK → app_users, SET NULL;
--                    erasure-map mode `detach`).
--   3. `data_room_access_tokens.auto_follow_up` — founder opt-in per link
--      for the 2-business-day follow-up email.
--   4. `data_room_follow_ups` — send ledger, UNIQUE(access_token_id): at most
--      one follow-up per link, ever. `account_id` is the room owner (the
--      same tenancy key every data_room_* table carries — no app_users FK).
--
-- RLS
--   Enabled on both new tables. Owner (auth.uid() = account_id) may SELECT;
--   every write is a service-role route. No anon access.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0355_fundraise_commitments_investor_followups.sql
--
-- Idempotent: IF NOT EXISTS everywhere; safe to re-run.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. fundraise_rounds — totals + project / data-room pointers -----------------
ALTER TABLE public.fundraise_rounds
  ADD COLUMN IF NOT EXISTS soft_aud       numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS committed_aud  numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funded_aud     numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_id     uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_room_id   uuid REFERENCES public.data_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.fundraise_rounds.soft_aud IS
  'Sum of fundraise_commitments.amount_aud with status soft. Maintained by the commitments API, not a trigger.';
COMMENT ON COLUMN public.fundraise_rounds.committed_aud IS
  'Sum of fundraise_commitments.amount_aud with status committed or signed (money promised, not yet landed). Maintained by the API.';
COMMENT ON COLUMN public.fundraise_rounds.funded_aud IS
  'Sum of fundraise_commitments.amount_aud with status funded (money received). Maintained by the API.';
COMMENT ON COLUMN public.fundraise_rounds.data_room_id IS
  'Data room attached when the round went active (S26-A). Generated once if the project had none; an existing room is linked, never regenerated.';

CREATE INDEX IF NOT EXISTS idx_fundraise_rounds_project
  ON public.fundraise_rounds (project_id, created_at DESC);

-- 2. fundraise_commitments ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fundraise_commitments (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id         uuid          NOT NULL REFERENCES public.fundraise_rounds(id) ON DELETE CASCADE,
  account_id       uuid          NOT NULL,   -- round owner (tenancy key, mirrors fundraise_rounds.account_id)
  investor_name    text          NOT NULL,
  investor_email   text,
  investor_org     text,
  amount_aud       numeric(14,2) NOT NULL CHECK (amount_aud > 0),
  status           text          NOT NULL DEFAULT 'soft'
                                 CHECK (status IN ('soft', 'committed', 'signed', 'funded', 'withdrawn')),
  instrument       text          NOT NULL DEFAULT 'safe'
                                 CHECK (instrument IN ('safe', 'convertible_note', 'priced_equity')),
  notes            text,
  access_token_id  uuid          REFERENCES public.data_room_access_tokens(id) ON DELETE SET NULL,
  committed_at     timestamptz,
  signed_at        timestamptz,
  funded_at        timestamptz,
  withdrawn_at     timestamptz,
  created_by       uuid          REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fundraise_commitments_round
  ON public.fundraise_commitments (round_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fundraise_commitments_account
  ON public.fundraise_commitments (account_id);
CREATE INDEX IF NOT EXISTS idx_fundraise_commitments_token
  ON public.fundraise_commitments (access_token_id)
  WHERE access_token_id IS NOT NULL;

ALTER TABLE public.fundraise_commitments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fundraise_commitments'
      AND policyname = 'fundraise_commitments_service_all'
  ) THEN
    CREATE POLICY fundraise_commitments_service_all
      ON public.fundraise_commitments
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fundraise_commitments'
      AND policyname = 'fundraise_commitments_owner_select'
  ) THEN
    CREATE POLICY fundraise_commitments_owner_select
      ON public.fundraise_commitments
      FOR SELECT TO authenticated USING (auth.uid() = account_id);
  END IF;
END $$;

COMMENT ON TABLE public.fundraise_commitments IS
  'S26-A: one row per investor cheque on a fundraise round (soft → committed → signed → funded, or withdrawn). Totals roll up to fundraise_rounds.{soft,committed,funded}_aud via the API.';

-- 3. Per-link follow-up opt-in ------------------------------------------------
ALTER TABLE public.data_room_access_tokens
  ADD COLUMN IF NOT EXISTS auto_follow_up boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.data_room_access_tokens.auto_follow_up IS
  'S26-A: founder opt-in. When true, api/cron/investor-followups emails the investor once, 2 business days after a view with no return visit (never while an NDA is required and unaccepted).';

-- 4. Follow-up send ledger ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_room_follow_ups (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token_id  uuid        NOT NULL UNIQUE REFERENCES public.data_room_access_tokens(id) ON DELETE CASCADE,
  data_room_id     uuid        NOT NULL REFERENCES public.data_rooms(id) ON DELETE CASCADE,
  account_id       uuid        NOT NULL,   -- room owner (tenancy key)
  investor_email   text        NOT NULL,
  viewed_at        timestamptz NOT NULL,   -- the view the follow-up answers
  sent_at          timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_room_follow_ups_room
  ON public.data_room_follow_ups (data_room_id, sent_at DESC);

ALTER TABLE public.data_room_follow_ups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'data_room_follow_ups'
      AND policyname = 'data_room_follow_ups_service_all'
  ) THEN
    CREATE POLICY data_room_follow_ups_service_all
      ON public.data_room_follow_ups
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'data_room_follow_ups'
      AND policyname = 'data_room_follow_ups_owner_select'
  ) THEN
    CREATE POLICY data_room_follow_ups_owner_select
      ON public.data_room_follow_ups
      FOR SELECT TO authenticated USING (auth.uid() = account_id);
  END IF;
END $$;

COMMENT ON TABLE public.data_room_follow_ups IS
  'S26-A: one row per investor follow-up email sent by api/cron/investor-followups. UNIQUE(access_token_id) = at most one per link, ever.';

NOTIFY pgrst, 'reload schema';
