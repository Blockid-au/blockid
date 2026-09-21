-- 0428_benchmark_segments_org_settings.sql
-- ---------------------------------------------------------------------------
-- G21 P3-B (2026-09-20) — honest segmented benchmarks + institutional admin
-- (docs/plans/g21-fi-upgrade-2026-09-20.md § P3-B; docs/product/
-- score-governance.md § 7 benchmark publication rules).
--
--   public.benchmark_segments  — one row per benchmark segment, computed
--       nightly by /api/cron/benchmark-segments from ONE latest score per
--       company (never per analysis row). Stage-only segments
--       (`stage:4`) and stage × sector segments (`stage:4|sector:saas`).
--       Every segment is stored, including n < 10 — RLS hides those from
--       anon / authenticated readers (`USING (n >= 10)`, the publication
--       floor BENCHMARK_MIN_N) so a client can never read an unpublished
--       figure; the service role reads all rows (the cron's own diff, the
--       admin view). `band` is the publication band for n
--       (`indicative` 10–29 · `benchmark` 30–99 · `segmented` 100+ · `none`).
--
--   public.org_settings        — per-organisation institutional settings
--       (investor_organisations, 0393): `retention_days` (null = keep;
--       30–3650) applied weekly by /api/cron/org-retention to the org's own
--       artefacts only (cohort_snapshots, intake_submissions,
--       assessment_overrides older than the window — never a founder's
--       project) and `audit_export_enabled` (the org owner's CSV export of
--       audit rows). The acting user is recorded on the audit row
--       (`org.settings.updated`), NOT on this table — no app_users FK, so
--       the erasure map (lib/privacy/erasure-map.ts) is unchanged.
--
-- House rules
--   * No app_users FK (deliberate — see above). org_id cascades from
--     investor_organisations; nothing here references projects.
--   * RLS on both tables; service-role all. org_settings rows are readable
--     by the org's owner and seats (writes go through the service role
--     from /api/org/settings after the owner check in code).
--   * Every reader is fail-soft (42P01-guarded) until this file is applied:
--     the Assessment Card falls back to the live stage benchmark, the
--     institutional /benchmarks endpoint answers an empty list, the
--     retention page renders "not configured".
--
-- Idempotent. Apply by hand (never on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0428_benchmark_segments_org_settings.sql
-- then add the two crontab rows (benchmark-segments 03:25 UTC daily,
-- org-retention Sun 04:40 UTC) from web/scripts/crontab.production.
--
-- Rollback
--   drop table if exists public.org_settings;
--   drop table if exists public.benchmark_segments;
-- ---------------------------------------------------------------------------

BEGIN;

-- ─── 0. shared updated_at helper (same body as 0304/0311/0314/0392/0393) ───
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── 1. benchmark_segments ─────────────────────────────────────────────────
create table if not exists public.benchmark_segments (
  segment_key  text primary key,
  stage        integer not null check (stage >= 0 and stage <= 12),
  sector       text null check (sector is null or (length(sector) between 1 and 40)),
  n            integer not null default 0 check (n >= 0),
  median       numeric null check (median is null or (median >= 0 and median <= 100)),
  p25          numeric null check (p25 is null or (p25 >= 0 and p25 <= 100)),
  p75          numeric null check (p75 is null or (p75 >= 0 and p75 <= 100)),
  band         text not null default 'none' check (band in ('none', 'indicative', 'benchmark', 'segmented')),
  computed_at  timestamptz not null default now()
);

create index if not exists benchmark_segments_stage_sector_idx
  on public.benchmark_segments (stage, sector);

comment on table public.benchmark_segments is
  'G21 P3-B: nightly stage / stage × sector SVI benchmark segments (one latest score per company). Rows with n < 10 exist for the cron diff but are hidden from anon / authenticated readers by RLS (score-governance § 7).';
comment on column public.benchmark_segments.segment_key is
  '`stage:<n>` or `stage:<n>|sector:<key>` — lib/benchmarks/segments.ts segmentKey().';
comment on column public.benchmark_segments.band is
  'Publication band for n: none (< 10) · indicative (10–29) · benchmark (30–99) · segmented (100+).';

alter table public.benchmark_segments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'benchmark_segments' and policyname = 'benchmark_segments_service_all') then
    create policy benchmark_segments_service_all on public.benchmark_segments
      for all to service_role using (true) with check (true);
  end if;
  -- The publication floor, enforced at the row level: a client can only
  -- ever read a segment that may be published (BENCHMARK_MIN_N = 10).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'benchmark_segments' and policyname = 'benchmark_segments_published_select') then
    create policy benchmark_segments_published_select on public.benchmark_segments
      for select to anon, authenticated using (n >= 10);
  end if;
end $$;

grant select on public.benchmark_segments to anon, authenticated;
grant all on public.benchmark_segments to service_role;

-- ─── 2. org_settings ───────────────────────────────────────────────────────
create table if not exists public.org_settings (
  org_id                uuid primary key references public.investor_organisations(id) on delete cascade,
  retention_days        integer null check (retention_days is null or (retention_days between 30 and 3650)),
  audit_export_enabled  boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.org_settings is
  'G21 P3-B: institutional settings per investor organisation. retention_days (null = keep) is applied weekly by /api/cron/org-retention to the org''s own cohort_snapshots / intake_submissions / assessment_overrides only. The actor of every change is on the audit row (org.settings.updated) — deliberately no app_users FK.';
comment on column public.org_settings.retention_days is
  'Null = keep everything. 30–3650: org-owned artefacts older than this many days are deleted by the weekly cron (docs/ops/retention.md).';

drop trigger if exists org_settings_set_updated_at on public.org_settings;
create trigger org_settings_set_updated_at
  before update on public.org_settings
  for each row execute function public.set_updated_at();

alter table public.org_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'org_settings' and policyname = 'org_settings_service_all') then
    create policy org_settings_service_all on public.org_settings
      for all to service_role using (true) with check (true);
  end if;
  -- Owner or seat of the org may read its settings (writes: service role
  -- only, after the owner check in /api/org/settings).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'org_settings' and policyname = 'org_settings_member_select') then
    create policy org_settings_member_select on public.org_settings
      for select to authenticated using (
        exists (
          select 1 from public.investor_organisations o
           where o.id = org_settings.org_id and o.owner_user_id = auth.uid()
        )
        or exists (
          select 1 from public.investor_organisation_members m
           where m.org_id = org_settings.org_id and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

grant select on public.org_settings to authenticated;
grant all on public.org_settings to service_role;

COMMIT;
