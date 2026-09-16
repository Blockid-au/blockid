-- 0394_startup_taxonomy.sql
-- ---------------------------------------------------------------------------
-- G13-W1-T1 (S-T1) — canonical startup taxonomy, persisted 1:1 with projects
-- (docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md
-- §B.5; decision D3 in docs/plans/investor-clarity-2026-09-15.md §3).
--
--   public.startup_taxonomy — one row per project: industry (24-value enum),
--   sub_industry (detectSector slug), business_model (11), customer_types[],
--   stage_key (8 canonical stages), hq_state / geo_scope, tags[] (11, two of
--   them founder-declared only), ANZSIC anchor, plus `sources` / `confidence`
--   / `suggested` jsonb so the pipeline's suggestion and the founder's
--   confirmation are both recorded and confirmed fields are never
--   overwritten (DQ-2 / DQ-5). "unclassified" is an honest state (DQ-1).
--
-- Enum values are enforced by CHECK constraints built from the same lists as
-- web/src/lib/taxonomy/startup-taxonomy.ts (TAXONOMY_VERSION 1.0.0); a
-- vocabulary change bumps `taxonomy_version` and ships a mapping (DQ-7).
--
-- House rules: FK to public.projects(id) ONLY — `confirmed_by` carries a
-- user id but deliberately has NO FK to app_users (the erasure map pins the
-- app_users FK inventory; the project row cascades on erasure anyway).
-- RLS mirrors the project-scoped neighbour `project_grant_profiles` (0311):
-- owner via projects.user_id, plus evaluators holding an `evaluations` row
-- on the project (they own evaluator-created projects and may confirm the
-- classification — §B.6 step 3), service-role all.
--
-- Idempotent. Apply by hand (never on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0394_startup_taxonomy.sql
-- then backfill:
--   node scripts/db/backfill-startup-taxonomy.mjs           # dry-run report
--   node scripts/db/backfill-startup-taxonomy.mjs --write
--
-- ORDER MATTERS: apply this migration BEFORE deploying the release that
-- ships the writer (lib/taxonomy/store.ts). The writer is try/catch-guarded
-- and only logs when the table is missing, but nothing is classified until
-- the table exists.
--
-- Rollback
--   drop table if exists public.startup_taxonomy;
--   (public.set_updated_at() is shared with 0304/0311/0314/0323 — leave it.)
-- ---------------------------------------------------------------------------

begin;

-- ─── 0. shared updated_at helper (idempotent, same body as 0304/0311/0314) ───
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── 1. startup_taxonomy ─────────────────────────────────────────────────────
create table if not exists public.startup_taxonomy (
  project_id          uuid primary key references public.projects(id) on delete cascade,
  taxonomy_version    text not null default '1.0.0',
  -- §B.2 industry enum
  industry            text not null default 'unclassified'
                      check (industry in (
                        'software_saas','ai_ml','fintech','healthtech_medtech','biotech_pharma',
                        'climate_cleantech','agtech_food','advanced_manufacturing','deeptech_quantum',
                        'space','defence_dualuse','mining_resources_tech','edtech','proptech_construction',
                        'retail_ecommerce','media_creative_gaming','travel_tourism_hospitality',
                        'transport_logistics_mobility','hr_worktech','legal_regtech_govtech',
                        'cybersecurity','sports_wellness','professional_services','unclassified')),
  -- detectSector slug (svi-analysis.ts) for finer multiples lookup, or null
  sub_industry        text check (sub_industry is null or sub_industry ~ '^[a-z]{2,32}$'),
  industry_secondary  text check (industry_secondary is null or industry_secondary in (
                        'software_saas','ai_ml','fintech','healthtech_medtech','biotech_pharma',
                        'climate_cleantech','agtech_food','advanced_manufacturing','deeptech_quantum',
                        'space','defence_dualuse','mining_resources_tech','edtech','proptech_construction',
                        'retail_ecommerce','media_creative_gaming','travel_tourism_hospitality',
                        'transport_logistics_mobility','hr_worktech','legal_regtech_govtech',
                        'cybersecurity','sports_wellness','professional_services')),
  -- §B.3 business model enum
  business_model      text not null default 'unclassified'
                      check (business_model in (
                        'saas_subscription','marketplace_platform','transactional_fintech','consumer_app',
                        'ecommerce_d2c','hardware_devices','deeptech_ip_licensing','biotech_regulated_pipeline',
                        'services_enabled_tech','agency_consultancy','unclassified')),
  -- §B.4 (iv) multi-select, primary first
  customer_types      text[] not null default '{}'
                      check (customer_types <@ array['b2b','b2c','b2b2c','b2g','unclassified']::text[]),
  -- §B.4 (iii) CANONICAL_STAGES (journey-vocabulary.ts)
  stage_key           text not null default 'idea'
                      check (stage_key in ('idea','validation','mvp_early_revenue','seed','series_a','series_b_c','late_stage','public_exit')),
  -- §B.4 (v)
  hq_state            text check (hq_state is null or hq_state in ('NSW','VIC','QLD','WA','SA','TAS','ACT','NT','national')),
  hq_country          text not null default 'AU',
  geo_scope           text check (geo_scope is null or geo_scope in ('local','national','anz','apac','global')),
  -- §B.4 (vi) — female_founded / first_nations are founder-declared only (DQ-4; enforced in code, see sources.tags)
  tags                text[] not null default '{}'
                      check (tags <@ array['esic_eligible','rdti_claimant','female_founded','first_nations',
                                           'university_spinout','climate_impact','defence_dualuse','regulated',
                                           'impact_social_enterprise','csiro_on_alumni','accelerator_alumni']::text[]),
  anzsic_division     char(1) check (anzsic_division is null or anzsic_division ~ '^[A-S]$'),
  anzsic_class        text check (anzsic_class is null or anzsic_class ~ '^[0-9]{4}$'),
  -- {industry:'auto'|'founder'|'evaluator', business_model:…, tags:{esic_eligible:'auto', …}}
  sources             jsonb not null default '{}'::jsonb check (jsonb_typeof(sources) = 'object'),
  -- {industry:0.82, business_model:0.6, …}
  confidence          jsonb not null default '{}'::jsonb check (jsonb_typeof(confidence) = 'object'),
  -- last pipeline suggestion in full (for "AI suggested X, you chose Y")
  suggested           jsonb check (suggested is null or jsonb_typeof(suggested) = 'object'),
  -- user id of the confirmer — NO FK on purpose (house rule: app_users FKs are pinned by the erasure map)
  confirmed_by        uuid,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.startup_taxonomy is
  'G13 S-T1: canonical classification of one startup (1:1 with projects). Pipeline writes `suggested` + auto-filled live columns (sources=auto); founder/evaluator confirmation sets confirmed_at and per-field sources; confirmed fields are never overwritten by the pipeline (DQ-5). unclassified = honest unknown (DQ-1).';
comment on column public.startup_taxonomy.sub_industry is 'detectSector() slug (svi-analysis.ts) kept for finer sector-multiples lookup; null when unknown.';
comment on column public.startup_taxonomy.sources is 'Per-field origin: auto | founder | evaluator; tags is a per-tag map. female_founded / first_nations may only ever be founder.';
comment on column public.startup_taxonomy.confidence is 'Per-field 0..1 from the last suggestTaxonomy() run; < 0.5 means the live column stayed unclassified / null.';
comment on column public.startup_taxonomy.suggested is 'Last full TaxonomySuggestion (lib/taxonomy/suggest.ts) — shown as "AI suggested X" next to a differing confirmed value.';
comment on column public.startup_taxonomy.confirmed_by is 'app_users.id of the confirmer; intentionally no FK (erasure-map house rule). Row cascades with the project.';

create index if not exists startup_taxonomy_industry_stage_idx
  on public.startup_taxonomy (industry, stage_key);
create index if not exists startup_taxonomy_business_model_idx
  on public.startup_taxonomy (business_model);
create index if not exists startup_taxonomy_tags_gin
  on public.startup_taxonomy using gin (tags);
create index if not exists startup_taxonomy_customer_types_gin
  on public.startup_taxonomy using gin (customer_types);
create index if not exists startup_taxonomy_unconfirmed_idx
  on public.startup_taxonomy (updated_at desc)
  where confirmed_at is null;

drop trigger if exists startup_taxonomy_set_updated_at on public.startup_taxonomy;
create trigger startup_taxonomy_set_updated_at
  before update on public.startup_taxonomy
  for each row execute function public.set_updated_at();

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────
alter table public.startup_taxonomy enable row level security;

drop policy if exists startup_taxonomy_owner_select on public.startup_taxonomy;
create policy startup_taxonomy_owner_select on public.startup_taxonomy
  for select using (
    exists (select 1 from public.projects p
             where p.id = startup_taxonomy.project_id and p.user_id = auth.uid())
    or exists (select 1 from public.evaluations e
                where e.project_id = startup_taxonomy.project_id and e.evaluator_user_id = auth.uid())
  );

drop policy if exists startup_taxonomy_owner_insert on public.startup_taxonomy;
create policy startup_taxonomy_owner_insert on public.startup_taxonomy
  for insert with check (
    exists (select 1 from public.projects p
             where p.id = startup_taxonomy.project_id and p.user_id = auth.uid())
    or exists (select 1 from public.evaluations e
                where e.project_id = startup_taxonomy.project_id and e.evaluator_user_id = auth.uid())
  );

drop policy if exists startup_taxonomy_owner_update on public.startup_taxonomy;
create policy startup_taxonomy_owner_update on public.startup_taxonomy
  for update using (
    exists (select 1 from public.projects p
             where p.id = startup_taxonomy.project_id and p.user_id = auth.uid())
    or exists (select 1 from public.evaluations e
                where e.project_id = startup_taxonomy.project_id and e.evaluator_user_id = auth.uid())
  );

drop policy if exists startup_taxonomy_service_all on public.startup_taxonomy;
create policy startup_taxonomy_service_all on public.startup_taxonomy
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;

notify pgrst, 'reload schema';
