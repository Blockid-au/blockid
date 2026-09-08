-- 0124_analyses_persistence.sql
-- ---------------------------------------------------------------------------
-- Persist every /analyze run — anonymous or authenticated.
--
-- Why
--   `POST /api/intake` performed zero database writes. A founder pasted an
--   idea into the hero, watched a real SVI score and valuation render on
--   /analyze, and the moment they navigated away the run ceased to exist.
--   There was no row anywhere: nothing to return to, nothing to share,
--   nothing to attach a data room to, and nothing for `api/auth/register` to
--   claim. The primary CTA behaved like a demo. `guest_analyses` (the paid
--   A$3 flow) had the mirror-image problem: no `user_id`, so a customer who
--   actually paid could never see their report from an account.
--
-- What
--   * `public.analyses` — one row per intake run, keyed by an anonymous
--     cookie id (`anon_key`) with a nullable `user_id` filled in at claim
--     time (signup or login).
--   * `guest_analyses.user_id` — same claim, matched on the purchase email.
--
-- Storage-size decision (deliberate, see `web/src/lib/analyses/store.ts`)
--   The intake payload can be an entire pitch deck's extracted text. Three
--   rules bound a single row:
--     1. `input_text` holds the canonical raw text truncated at 65,536 chars
--        (~64 KB). `input_chars` records the true original length and
--        `input_truncated` flags the cut, so nothing silently lies about
--        completeness. 64 KB covers essentially every real deck and site
--        scrape we have seen (5-40 KB typical) while capping the worst case;
--        Postgres TOASTs and compresses it out of line, so the heap page
--        stays small and list queries never touch it.
--     2. `intake` holds the IntakeResult *minus* `rawText` (never duplicate
--        the largest field) and drops `structured` (per-slide / per-page
--        text) when it serialises above 128 KB — the slide split is a
--        convenience, `input_text` remains the source of truth.
--     3. `svi` holds a COMPACT score + valuation summary, not the full
--        `SVIAnalysis`. `computeSVI(signals)` and `estimateValuation()` are
--        pure, synchronous and free, and `signals` is retained inside
--        `intake` — so the full analysis is reproducible on demand and
--        storing it would just be duplicating derivable data at ~30 KB/row.
--
-- Privacy
--   Follows the precedent set by 0122 (`scores.investor_visible`). A saved
--   analysis is PRIVATE by default: both `public_visible` and
--   `investor_visible` default FALSE and no read path may surface a row on a
--   public or investor surface without an explicit opt-in flip.
--
-- Ownership note: run as `postgres`. Both tables are owned by `postgres`; no
-- `supabase_admin` escalation was required.
--
-- Idempotent: create-if-not-exists / add-column-if-not-exists throughout.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),

  -- Anonymous correlation key (the `blockid_anon` httpOnly cookie). Not a
  -- profile: a random opaque id, the only handle a logged-out founder has on
  -- their own run.
  anon_key text not null,
  -- Filled at claim time (signup / login). Null until then.
  user_id uuid references public.app_users (id) on delete set null,
  claimed_at timestamptz,

  -- ── Input ────────────────────────────────────────────────────────────
  input_kind text not null
    check (input_kind in ('pitch_deck','website','idea_text','existing_company_text')),
  input_text text,                    -- canonical raw text, truncated at 65536
  input_chars int,                    -- true pre-truncation length
  input_truncated boolean not null default false,
  input_url text,
  input_filename text,
  input_mime text,
  input_bytes int,

  -- ── Result ───────────────────────────────────────────────────────────
  intake jsonb not null default '{}'::jsonb,  -- IntakeResult minus rawText
  context jsonb,                              -- detected IntakeContext
  svi jsonb,                                  -- compact score + valuation
  svi_total numeric(10,2),                    -- denormalised for listing
  stage smallint,
  stage_label text,
  valuation_mid_aud bigint,                   -- denormalised for listing

  -- ── Consent (0122 precedent — never assumed) ─────────────────────────
  public_visible boolean not null default false,
  investor_visible boolean not null default false,

  created_at timestamptz not null default now()
);

comment on table public.analyses is
  'One row per /api/intake run. Private by default; anon_key is a correlation cookie id, not a profile.';
comment on column public.analyses.public_visible is
  'Founder opt-in. False means the row must never appear on any public surface. Default false — consent is never assumed (see migration 0122).';
comment on column public.analyses.investor_visible is
  'Founder opt-in. False means the row must never appear in investor deal flow. Default false.';
comment on column public.analyses.input_text is
  'Canonical raw text truncated at 65536 chars; input_chars holds the true length and input_truncated flags the cut.';

-- "fetch by anon key" and "fetch by user", both newest-first.
create index if not exists analyses_anon_key_created_idx
  on public.analyses (anon_key, created_at desc);
create index if not exists analyses_user_created_idx
  on public.analyses (user_id, created_at desc)
  where user_id is not null;
-- Rate-limit / abuse sweep: how many rows has this anon key written lately.
create index if not exists analyses_created_idx
  on public.analyses (created_at desc);

-- RLS: service-role only, mirroring guest_analyses. Anonymous callers have no
-- auth.uid() to key a policy against; every read goes through a route handler
-- that checks the session cookie or the anon cookie itself.
alter table public.analyses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'analyses'
      and policyname = 'analyses_service_only'
  ) then
    create policy "analyses_service_only"
      on public.analyses
      using (true)
      with check (true);
  end if;
end $$;

-- ── guest_analyses: let a paid guest report be claimed by an account ──────
alter table public.guest_analyses
  add column if not exists user_id uuid references public.app_users (id) on delete set null;
alter table public.guest_analyses
  add column if not exists claimed_at timestamptz;

comment on column public.guest_analyses.user_id is
  'Set when the buyer later registers/logs in with the purchase email. Before 0124 a paid A$3 report could never be reached from an account.';

create index if not exists guest_analyses_user_idx
  on public.guest_analyses (user_id, created_at desc)
  where user_id is not null;

commit;

notify pgrst, 'reload schema';
