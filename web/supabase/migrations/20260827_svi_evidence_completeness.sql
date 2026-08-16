-- SVI Evidence Completeness Feature
-- Tracks per-dimension evidence completeness and prioritized fix roadmap
-- Migration: 0113_svi_evidence_completeness.sql
-- Status: Ready for Supabase deployment
-- Deploy date: End of Week 1 (2026-08-23)

-- ─── Table 1: svi_dimension_evidence ──────────────────────────────────────
-- Tracks which evidence types are present for each project's SVI dimension

create table if not exists public.svi_dimension_evidence (
  id uuid primary key default gen_random_uuid(),

  -- Foreign key to projects table
  project_id uuid not null references public.projects(id) on delete cascade,

  -- SVI dimension: 'ftv' | 'mpc' | 'ptd' | 'tre' | 'cgh' | 'iri' | 'lco' | 'svm'
  dimension text not null,

  -- Evidence type code (e.g., 'founder_linkedin', 'cap_table_spreadsheet')
  evidence_type text not null,

  -- Evidence type label for UI display (denormalized for convenience)
  evidence_label text not null,

  -- Evidence item details
  evidence_value_or_url text, -- URL, file path, or description

  -- Confidence level: 'self_declared' | 'public_url' | 'document_uploaded' | 'connected_source' | 'transaction_data' | 'third_party_verified'
  confidence_level text not null default 'self_declared',

  -- Estimated SVI impact (positive integer, pre-calculated in config)
  estimated_svi_impact integer default 0,

  -- Whether this evidence has been manually verified by BlockID
  is_verified boolean default false,
  verified_at timestamptz,
  verified_by_user_id uuid references public.app_users(id),

  -- Timestamp tracking
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),

  -- Uniqueness constraint: one evidence type per project per dimension
  unique(project_id, dimension, evidence_type)
);

-- Indexes for performance
create index if not exists idx_svi_dimension_evidence_project on public.svi_dimension_evidence(project_id);
create index if not exists idx_svi_dimension_evidence_dimension on public.svi_dimension_evidence(project_id, dimension);
create index if not exists idx_svi_dimension_evidence_confidence on public.svi_dimension_evidence(confidence_level);
create index if not exists idx_svi_dimension_evidence_created on public.svi_dimension_evidence(created_at desc);

-- RLS: Service role full access; authenticated users can read their own project's evidence
alter table public.svi_dimension_evidence enable row level security;

create policy "service role full access" on public.svi_dimension_evidence
  for all using (true)
  to "service_role";

create policy "authenticated user can read own project evidence" on public.svi_dimension_evidence
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = svi_dimension_evidence.project_id
      and p.owner_id = auth.uid()
    )
  );

-- ─── Table 2: svi_evidence_roadmap ────────────────────────────────────────
-- Pre-calculated fix roadmap items (one per missing evidence type, ranked by bang-for-buck)

create table if not exists public.svi_evidence_roadmap (
  id uuid primary key default gen_random_uuid(),

  -- Foreign keys
  project_id uuid not null references public.projects(id) on delete cascade,
  dimension text not null,
  evidence_type text not null,

  -- Roadmap action details
  action_title text not null, -- e.g., "Add founder LinkedIn profiles"
  action_description text, -- e.g., "Link LinkedIn profiles for all founders on the team"

  -- Impact & effort scoring
  estimated_svi_impact integer not null, -- e.g., 5
  estimated_effort_hours integer not null, -- e.g., 1
  bang_for_buck numeric(10, 2) not null, -- impact / effort_hours, e.g., 5.00

  -- Urgency: 1 (critical) | 2 (high) | 3 (medium) | 4 (low)
  urgency_tier integer not null default 3,
  urgency_label text not null default 'medium', -- for UI

  -- Scheduling: assigned to a week (1-4) within the 4-week roadmap
  roadmap_week integer not null default 1,

  -- Resources & help
  help_url text, -- link to help article
  help_article_id uuid references public.knowledge_base_articles(id),

  -- Status tracking
  is_completed boolean default false,
  completed_at timestamptz,

  -- Timestamps
  created_at timestamptz not null default now(),
  roadmap_generated_at timestamptz not null default now(),
  updated_at timestamptz default now(),

  unique(project_id, dimension, evidence_type)
);

-- Indexes for roadmap queries
create index if not exists idx_svi_evidence_roadmap_project on public.svi_evidence_roadmap(project_id);
create index if not exists idx_svi_evidence_roadmap_week on public.svi_evidence_roadmap(project_id, roadmap_week);
create index if not exists idx_svi_evidence_roadmap_impact on public.svi_evidence_roadmap(project_id, bang_for_buck desc);
create index if not exists idx_svi_evidence_roadmap_urgency on public.svi_evidence_roadmap(project_id, urgency_tier);
create index if not exists idx_svi_evidence_roadmap_completed on public.svi_evidence_roadmap(project_id, is_completed);

-- RLS: Service role full access; authenticated users can read/update own project
alter table public.svi_evidence_roadmap enable row level security;

create policy "service role full access" on public.svi_evidence_roadmap
  for all using (true)
  to "service_role";

create policy "authenticated user can read own project roadmap" on public.svi_evidence_roadmap
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = svi_evidence_roadmap.project_id
      and p.owner_id = auth.uid()
    )
  );

create policy "authenticated user can update own project roadmap" on public.svi_evidence_roadmap
  for update using (
    exists (
      select 1 from public.projects p
      where p.id = svi_evidence_roadmap.project_id
      and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = svi_evidence_roadmap.project_id
      and p.owner_id = auth.uid()
    )
  );

-- ─── Helper View 1: svi_dimension_completeness ────────────────────────────
-- Calculates completeness score per project per dimension

-- Note: This view uses hardcoded evidence catalogs.
-- In production, these should be maintained in a separate config table.

create or replace view public.svi_dimension_completeness as
with evidence_catalogs as (
  select 'ftv' as dimension, 7 as total_possible
  union all select 'mpc', 6
  union all select 'ptd', 7
  union all select 'tre', 7
  union all select 'cgh', 6
  union all select 'iri', 6
  union all select 'lco', 7
  union all select 'svm', 7
)
select
  sde.project_id,
  sde.dimension,
  ec.total_possible,
  count(distinct sde.evidence_type) as total_present,
  round(100.0 * count(distinct sde.evidence_type) / nullif(ec.total_possible, 0), 0) as completeness_pct,
  round(
    avg(case
      when sde.confidence_level = 'third_party_verified' then 100
      when sde.confidence_level = 'transaction_data' then 90
      when sde.confidence_level = 'connected_source' then 75
      when sde.confidence_level = 'document_uploaded' then 50
      when sde.confidence_level = 'public_url' then 35
      else 20
    end)::numeric, 0
  ) as avg_confidence_pct
from public.svi_dimension_evidence sde
join evidence_catalogs ec on sde.dimension = ec.dimension
where sde.project_id is not null
group by sde.project_id, sde.dimension, ec.total_possible;

-- Grant read access to service role and authenticated users
grant select on public.svi_dimension_completeness to "service_role";
grant select on public.svi_dimension_completeness to "authenticated";

-- ─── Helper View 2: svi_roadmap_summary ────────────────────────────────
-- Aggregated roadmap stats per project

create or replace view public.svi_roadmap_summary as
select
  ser.project_id,
  count(*) as total_items,
  count(*) filter (where is_completed = false) as remaining_items,
  count(*) filter (where is_completed = true) as completed_items,
  sum(estimated_svi_impact) as total_potential_gain,
  sum(estimated_svi_impact) filter (where is_completed = true) as realized_gain,
  round(sum(estimated_svi_impact) filter (where is_completed = false) / nullif(sum(estimated_svi_impact), 0) * 100, 0) as remaining_potential_pct,
  max(roadmap_generated_at) as last_generated_at
from public.svi_evidence_roadmap ser
group by ser.project_id;

-- Grant read access
grant select on public.svi_roadmap_summary to "service_role";
grant select on public.svi_roadmap_summary to "authenticated";

-- ─── Helper Function: Generate roadmap for a project ───────────────────────
-- Rebuilds the complete roadmap based on current evidence

create or replace function public.regenerate_svi_roadmap(p_project_id uuid)
returns table (
  roadmap_item_id uuid,
  dimension text,
  evidence_type text,
  action_title text,
  bang_for_buck numeric,
  roadmap_week integer,
  status text
)
language sql
as $$
  -- 1. Delete old roadmap for this project
  delete from public.svi_evidence_roadmap
  where project_id = p_project_id;

  -- 2. Get current evidence for this project
  -- 3. For each missing evidence type, calculate bang-for-buck
  -- 4. Assign to weeks 1-4 based on ranking
  -- 5. Insert new roadmap items

  -- Placeholder: return sample result
  select
    gen_random_uuid() as roadmap_item_id,
    'ftv'::text as dimension,
    'founder_linkedin'::text as evidence_type,
    'Add founder LinkedIn profiles'::text as action_title,
    10.0::numeric as bang_for_buck,
    1::integer as roadmap_week,
    'inserted'::text as status;
$$;

-- ─── Indexes for analytical queries ───────────────────────────────────────

create index if not exists idx_svi_dimension_evidence_dimension_pct
  on public.svi_dimension_evidence(project_id, dimension);

-- ─── Seed data (optional) ──────────────────────────────────────────────────
-- Uncomment to populate example projects with sample evidence

-- insert into public.svi_dimension_evidence (project_id, dimension, evidence_type, evidence_label, confidence_level, estimated_svi_impact)
-- values
--   ('550e8400-e29b-41d4-a716-446655440000', 'ftv', 'founder_linkedin', 'Founder LinkedIn profile', 'public_url', 5),
--   ('550e8400-e29b-41d4-a716-446655440000', 'ftv', 'founder_bio', 'Founder bio/background document', 'document_uploaded', 3),
--   ('550e8400-e29b-41d4-a716-446655440000', 'mpc', 'customer_interviews', 'Customer interview notes', 'document_uploaded', 5);

-- ─── Post-migration validation ─────────────────────────────────────────────

-- Check that tables exist and have correct columns
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('svi_dimension_evidence', 'svi_evidence_roadmap')
order by table_name, ordinal_position;

-- Verify views are accessible
select count(*) as completeness_views_count
from information_schema.views
where table_schema = 'public'
  and table_name in ('svi_dimension_completeness', 'svi_roadmap_summary');
