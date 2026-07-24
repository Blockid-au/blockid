-- Migration 0115 — mentor_console (CLO Mentor Console permissions + storage)
--
-- Adds four tables that layer a tiered consent/mentor workflow on top of the
-- existing reseller_attributions seed (0091/0092). Mentor console is NOT a
-- new isolation domain — it is a consent layer. A reseller admin already
-- attributed to a founder (reseller_attributions row) may hold a mentor grant
-- that raises the mentor read/write tier 0..3:
--
--   0 none        — no mentor access (default when no grant row exists).
--   1 overview    — high-level snapshot (svi_score, phase_slug).
--   2 progression — + weekly check-ins + private notes.
--   3 full        — + notes shared with founder + engagement history.
--
-- Tables:
--   mentor_access_grants          — consent row per (reseller, founder|project).
--   mentor_notes                  — private/shared notes on a founder.
--   mentor_check_ins              — weekly wins/blockers/focus jsonb.
--   mentor_engagement_snapshots   — nightly cron-produced snapshot.
--
-- RLS: every table has RLS ENABLED with NO authenticated policies. Access
-- goes via resellerSupabase() (service-role bypass) + application-layer
-- guards in web/src/lib/mentor/access-guards.ts. Anon-key or authenticated
-- clients get silent zero rows (documented — footgun R7 in the design doc).
--
-- Applied via:
--   docker exec supabase-db psql -U postgres -d postgres \
--     -f web/supabase/migrations/0115_mentor_console.sql
-- Then:
--   NOTIFY pgrst, 'reload schema';

BEGIN;

-- ---------------------------------------------------------------------------
-- mentor_access_grants — tiered consent from reseller → founder|project.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mentor_access_grants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id       uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  founder_user_id   uuid REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  tier              smallint NOT NULL DEFAULT 0
                    CHECK (tier IN (0, 1, 2, 3)),
  granted_by        uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  revoked_at        timestamptz,
  source            text NOT NULL DEFAULT 'reseller_admin'
                    CHECK (source IN ('reseller_admin', 'founder_invite', 'cohort_auto', 'system')),
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Founder XOR project — exactly one subject must be populated.
  CONSTRAINT ck_mentor_grants_subject_xor CHECK (
    (founder_user_id IS NOT NULL AND project_id IS NULL)
    OR
    (founder_user_id IS NULL     AND project_id IS NOT NULL)
  )
);

-- Only one ACTIVE grant per (reseller, founder). Revoked rows are kept for audit.
CREATE UNIQUE INDEX IF NOT EXISTS mentor_grants_active_user_uidx
  ON public.mentor_access_grants (reseller_id, founder_user_id)
  WHERE founder_user_id IS NOT NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mentor_grants_active_project_uidx
  ON public.mentor_access_grants (reseller_id, project_id)
  WHERE project_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS mentor_grants_reseller_idx
  ON public.mentor_access_grants (reseller_id);

CREATE INDEX IF NOT EXISTS mentor_grants_founder_idx
  ON public.mentor_access_grants (founder_user_id)
  WHERE founder_user_id IS NOT NULL;

ALTER TABLE public.mentor_access_grants ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.mentor_access_grants IS
  'Tiered consent grants layered on top of reseller_attributions (mig 0091). Never a duplicate seed — grant creation must first call assertAttributionExists(). RLS ENABLED with zero authenticated policies: access is via service-role wrapper + application-layer guards in web/src/lib/mentor/access-guards.ts. R2: if founder revokes attribution, existing grants remain until a follow-up trigger set_grant_revoked_on_attribution_optout is added.';

-- ---------------------------------------------------------------------------
-- mentor_notes — private (tier 2) or shared (tier 3) notes on a founder.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mentor_notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id           uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  mentor_id             uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  founder_user_id       uuid REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id            uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  body                  text NOT NULL CHECK (char_length(body) <= 20000),
  shared_with_founder   boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_mentor_notes_subject_xor CHECK (
    (founder_user_id IS NOT NULL AND project_id IS NULL)
    OR
    (founder_user_id IS NULL     AND project_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS mentor_notes_mentor_idx
  ON public.mentor_notes (mentor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mentor_notes_founder_idx
  ON public.mentor_notes (founder_user_id, created_at DESC)
  WHERE founder_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mentor_notes_reseller_idx
  ON public.mentor_notes (reseller_id, created_at DESC);

ALTER TABLE public.mentor_notes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.mentor_notes IS
  'Mentor notes on a founder. shared_with_founder=false requires tier >= 2 (progression); shared_with_founder=true requires tier >= 3 (full). Body capped at 20k chars to defuse jsonb/blob abuse. RLS ENABLED with zero authenticated policies (see 0115 header + R7).';

-- ---------------------------------------------------------------------------
-- mentor_check_ins — weekly wins/blockers/focus (Monday-ISO week bucket).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mentor_check_ins (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id       uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  mentor_id         uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  founder_user_id   uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  week_start        date NOT NULL,
  wins              jsonb NOT NULL DEFAULT '[]'::jsonb,
  blockers          jsonb NOT NULL DEFAULT '[]'::jsonb,
  focus             jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One check-in per (mentor, founder, ISO week Monday).
CREATE UNIQUE INDEX IF NOT EXISTS mentor_check_ins_week_user_uidx
  ON public.mentor_check_ins (mentor_id, founder_user_id, week_start);

CREATE INDEX IF NOT EXISTS mentor_check_ins_founder_week_idx
  ON public.mentor_check_ins (founder_user_id, week_start DESC);

CREATE INDEX IF NOT EXISTS mentor_check_ins_reseller_week_idx
  ON public.mentor_check_ins (reseller_id, week_start DESC);

ALTER TABLE public.mentor_check_ins ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.mentor_check_ins IS
  'Weekly mentor check-in per founder (ISO Monday week_start). wins/blockers/focus are jsonb arrays — enforced at write time by Zod (see web/src/lib/mentor/types.ts). R6: no DB-level array check yet; add CHECK (jsonb_typeof(wins) = ''array'') if corruption is observed. Requires mentor tier >= 2 to write.';

-- ---------------------------------------------------------------------------
-- mentor_engagement_snapshots — nightly cron output for the mentor dashboard.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mentor_engagement_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id           uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  founder_user_id       uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  snapshot_date         date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  svi_score             numeric(6, 2),
  svi_delta_7d          numeric(6, 2),
  phase_slug            text,
  last_login_at         timestamptz,
  engagement_score      smallint CHECK (engagement_score IS NULL OR (engagement_score BETWEEN 0 AND 100)),
  metrics               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- One snapshot per (reseller, founder, date) — cron re-runs are idempotent via upsert.
CREATE UNIQUE INDEX IF NOT EXISTS mentor_snapshots_daily_uidx
  ON public.mentor_engagement_snapshots (reseller_id, founder_user_id, snapshot_date);

CREATE INDEX IF NOT EXISTS mentor_snapshots_founder_date_idx
  ON public.mentor_engagement_snapshots (founder_user_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS mentor_snapshots_reseller_date_idx
  ON public.mentor_engagement_snapshots (reseller_id, snapshot_date DESC);

ALTER TABLE public.mentor_engagement_snapshots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.mentor_engagement_snapshots IS
  'Nightly cron-produced engagement snapshot per (reseller, founder, date). Read at tier >= 1 (overview). Populated by service-role cron using serviceRoleBypass() so guard logic is skipped. RLS ENABLED with zero authenticated policies (see 0115 header + R7).';

COMMIT;

-- After apply:
NOTIFY pgrst, 'reload schema';
