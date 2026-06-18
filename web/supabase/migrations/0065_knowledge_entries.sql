-- AU Accelerator Knowledge Base (T0226, v2.12).
--
-- One row per criterion that an Australian (or global, relevant-to-AU)
-- accelerator publishes as part of their stage-progression / acceptance
-- playbook. The SVI engine matches the user's signals against these rows
-- and surfaces a heatmap on the dashboard + a checklist in the PDF.

create table if not exists knowledge_entries (
  id uuid primary key default gen_random_uuid(),

  source text not null,                    -- 'antler' | 'startmate' | 'yc' | 'techstars' | …
  source_name text not null,               -- 'Antler' (display)
  topic text not null,                     -- 'team' | 'progress' | 'invention' | 'vision' | 'product_10x' | 'governance' | …
  criterion text not null,                 -- one-line: "Team has previously built and shipped a product"
  description text,                        -- 2-3 sentence context

  stage_min integer not null default 0,    -- 0-7 SVI stage range this criterion applies to
  stage_max integer not null default 7,
  sector text default 'any',               -- 'any' | 'saas' | 'fintech' | …

  evidence_required text[] default '{}',   -- ['LinkedIn URL', 'Ship history']
  tactic text[] default '{}',              -- ['Add ex-employers', 'Recruit 2 advisors']
  valuation_lift_pct numeric default 0,    -- estimated mid-band % lift when met (capped 0-25)

  citations text[] default '{}',           -- public source URLs
  published_at date,
  last_verified_at date default current_date,

  active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ke_source_topic_idx on knowledge_entries(source, topic);
create index if not exists ke_stage_range_idx on knowledge_entries(stage_min, stage_max);
create index if not exists ke_active_idx on knowledge_entries(active);

-- updated_at touch trigger
create or replace function touch_knowledge_entries_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists knowledge_entries_touch on knowledge_entries;
create trigger knowledge_entries_touch
  before update on knowledge_entries
  for each row execute function touch_knowledge_entries_updated_at();
