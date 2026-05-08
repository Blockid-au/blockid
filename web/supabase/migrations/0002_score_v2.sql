-- =============================================================================
-- BlockID — Score v2 metadata
--
-- Adds explainability fields to existing Investor-Ready Scores without
-- replacing the v1 rows. Existing rows remain valid; new rows write v2 data.
-- =============================================================================

alter table public.scores
  add column if not exists score_version text not null default '1.0.0',
  add column if not exists confidence_score int check (
    confidence_score is null or confidence_score between 0 and 100
  ),
  add column if not exists missing_inputs jsonb not null default '[]'::jsonb,
  add column if not exists action_plan jsonb not null default '[]'::jsonb,
  add column if not exists benchmark jsonb;

create index if not exists scores_score_version_idx
  on public.scores (score_version);

create index if not exists scores_confidence_score_idx
  on public.scores (confidence_score);
