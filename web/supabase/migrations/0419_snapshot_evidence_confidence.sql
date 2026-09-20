-- 0419_snapshot_evidence_confidence.sql
-- ---------------------------------------------------------------------------
-- G21 P1-B (2026-09-20, docs/plans/g21-fi-upgrade-2026-09-20.md § P1-B)
-- Evidence Confidence (0–100) beside every SVI snapshot so the longitudinal
-- history carries it: the one number `lib/svi/evidence-confidence.ts`
-- computes — weighted share of evidence-ladder levels across the 8
-- dimensions × the bounded business-verification multiplier — and every
-- surface (Assessment Card on the report / workspace / dossier / PDF / DOCX)
-- shows. Written by every `svi_snapshots` writer through
-- `lib/svi/snapshot-evidence-confidence.ts` (fail-soft: a writer deployed
-- ahead of this migration retries without the column).
--
-- Idempotent. Apply by hand: scripts/db/apply-migration.sh <this file>.
-- Rollback:
--   alter table public.svi_snapshots drop column if exists evidence_confidence;

alter table public.svi_snapshots
  add column if not exists evidence_confidence numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'svi_snapshots_evidence_confidence_range'
  ) then
    alter table public.svi_snapshots
      add constraint svi_snapshots_evidence_confidence_range
      check (evidence_confidence is null or (evidence_confidence >= 0 and evidence_confidence <= 100));
  end if;
end $$;

comment on column public.svi_snapshots.evidence_confidence is
  'G21 P1-B: Evidence Confidence 0–100 (lib/svi/evidence-confidence.ts) at snapshot time; null for rows written before the column existed or without an analysis.';

notify pgrst, 'reload schema';
