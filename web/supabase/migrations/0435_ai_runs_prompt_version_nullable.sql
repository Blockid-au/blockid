-- 0435_ai_runs_prompt_version_nullable.sql
-- G24-B — AI-run integrity (docs/plans/g24-report-readability-demo-cohort-2026-09-21.md § 2 lane B).
--
-- Root cause fixed here + in code: `prompt_versions` (0230) has never held a
-- row, so the report pipeline resolved every agent to the NIL uuid and every
-- `ai_runs` insert (0231) failed on `ai_runs_prompt_version_id_fkey` — the
-- AI-run ledger has 0 rows while the self-report log shows the violation on
-- every call. From this release the pipeline REGISTERS its code-default
-- prompt version on first use (lib/ai/prompt-registry readOrRegisterPrompt,
-- one prod row per (agent, version)); this migration covers the remaining
-- path — Supabase unavailable at resolve time, or a stale id after a manual
-- prompt_versions delete — by letting the ledger row land with
-- `prompt_version_id = NULL` rather than being dropped. call-structured.ts
-- writes NULL for the NIL placeholder and retries an FK rejection once with
-- NULL. The FK itself is unchanged (a non-NULL value must still exist).
--
-- Part 2 (same goal, lane B task 3): the `funding_round` outcome signal now
-- has a feed — a BlockID-curated CSV of PUBLIC funding announcements ingested
-- through scripts/external-signals (adapter `funding-announcements`). The
-- licence gate (0410) refuses any source without an `external_sources` row,
-- so the row is seeded here; mirrors src/lib/signals/external-sources.ts.
--
-- Idempotent: DROP NOT NULL is a no-op on a nullable column; the seed uses
-- ON CONFLICT DO NOTHING. Apply with scripts/db/apply-migration.sh.

BEGIN;

ALTER TABLE public.ai_runs
  ALTER COLUMN prompt_version_id DROP NOT NULL;

COMMENT ON COLUMN public.ai_runs.prompt_version_id IS
  'prompt_versions.id the call ran with. NULL only when no version could be resolved or registered at run time (Supabase unavailable) or the id was stale — G24-B; the pipeline registers its code-default prompt on first use so live rows carry a real id.';

-- Rows with a NULL prompt version stay findable for the cost / prompt-mix
-- readers (docs/ops/ai-runs.md).
CREATE INDEX IF NOT EXISTS ai_runs_unversioned_created_idx
  ON public.ai_runs (created_at DESC)
  WHERE prompt_version_id IS NULL;

-- Seed — mirrors EXTERNAL_SOURCE_CATALOG in web/src/lib/signals/external-sources.ts
-- (external-sources.test.ts parses this block like the 0410 seed).
insert into public.external_sources (id, name, url, licence, attribution_text, cadence, status)
values
  ('funding-announcements',
   'Australian startup funding announcements (BlockID-curated from public press releases)',
   'https://blockid.au/methodology#data-sources',
   'CC BY 4.0',
   'Funding announcement data compiled by BlockID.au (© Auschain PTY LTD) from public company press releases and media reports; every row links to its published source. Compilation licensed under Creative Commons Attribution 4.0 International.',
   'weekly',
   'active')
on conflict (id) do nothing;

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
