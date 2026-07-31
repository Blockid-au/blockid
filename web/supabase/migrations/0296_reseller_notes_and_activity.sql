-- Migration 0296 — reseller_notes + reseller_activity_signals (Track K sub-L4)
--
-- Two tables the /reseller/roster drawer uses to (a) persist mentor notes
-- against an attributed startup and (b) log lightweight audit signals the
-- roster view can surface via last_activity_at.
--
-- Both tables are RLS-on; writes flow through the /api/reseller/note route
-- which enforces `reseller_admins.role='owner'` and verifies the target
-- business is actually attributed to that reseller before insert.
--
-- Idempotency: every DDL uses IF NOT EXISTS. Trailing NOTIFY reloads
-- PostgREST cache. Applied manually per reference_db_migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- reseller_notes — mentor notes captured from the roster drawer
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reseller_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL
    REFERENCES public.resellers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.app_users(id),
  note text NOT NULL,
  visibility text NOT NULL DEFAULT 'reseller_only'
    CHECK (visibility IN ('reseller_only', 'shared_with_founder')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reseller_notes_note_len CHECK (char_length(note) <= 2000)
);

CREATE INDEX IF NOT EXISTS reseller_notes_reseller_business_idx
  ON public.reseller_notes (reseller_id, business_id, created_at DESC);

ALTER TABLE public.reseller_notes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.reseller_notes IS
  'Mentor notes captured from the /reseller/roster drawer. Owner-only writes; visibility=shared_with_founder is the trigger for later founder-side reveal (not yet exposed).';

-- ---------------------------------------------------------------------------
-- reseller_activity_signals — light audit of what the reseller has seen/done
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reseller_activity_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL
    REFERENCES public.resellers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,
  signal_kind text NOT NULL
    CHECK (signal_kind IN ('viewed', 'noted', 'contacted', 'shared')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reseller_activity_signals_reseller_business_idx
  ON public.reseller_activity_signals (reseller_id, business_id, created_at DESC);

ALTER TABLE public.reseller_activity_signals ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.reseller_activity_signals IS
  'Audit stream of reseller-side interactions with a startup (viewed roster row, wrote a note, contacted, shared a report). Feeds the roster last_activity_at derivation in follow-up work.';

-- ---------------------------------------------------------------------------
-- Seed reseller_admins links for INFOVISION + DOVANLONG resellers.
-- The user requested the roster be immediately usable by the two seeded
-- resellers. Owner is looked up by email in app_users; if the user row is
-- not present yet the INSERT is silently skipped (WHERE u.id IS NOT NULL).
-- Re-runnable via ON CONFLICT DO NOTHING against the (reseller_id, user_id)
-- UNIQUE from migration 0091.
-- ---------------------------------------------------------------------------

INSERT INTO public.reseller_admins (reseller_id, user_id, role, status)
SELECT r.id, u.id, 'owner', 'active'
  FROM public.resellers r
  JOIN public.app_users u ON lower(u.email) = 'dovanlong@gmail.com'
 WHERE r.code = 'DOVANLONG'
ON CONFLICT (reseller_id, user_id) DO NOTHING;

INSERT INTO public.reseller_admins (reseller_id, user_id, role, status)
SELECT r.id, u.id, 'owner', 'active'
  FROM public.resellers r
  JOIN public.app_users u ON lower(u.email) IN (
    'admin@blockid.au',
    'dovanlong@gmail.com'
  )
 WHERE r.code = 'INFOVISION'
ON CONFLICT (reseller_id, user_id) DO NOTHING;

COMMIT;

-- After apply, reload PostgREST schema cache:
NOTIFY pgrst, 'reload schema';
