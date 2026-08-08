-- Migration 0303: Growth Phase Gates
-- G8-P2 — add gate evaluation columns to startup_phase_progress.
--
-- unlocked_features  — list of feature slugs unlocked at the current phase
-- gate_evaluated_at  — when the nightly cron last ran computePhaseGate() for this row
-- blockers           — top-N PhaseBlocker objects serialised as JSON (code/subject/detail)

ALTER TABLE startup_phase_progress
  ADD COLUMN IF NOT EXISTS unlocked_features text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gate_evaluated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS blockers           jsonb       NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN startup_phase_progress.unlocked_features IS
  'Feature slugs unlocked for the founder at their current phase (written by the growth-gate-eval cron).';

COMMENT ON COLUMN startup_phase_progress.gate_evaluated_at IS
  'Timestamp of the last growth-gate-eval nightly cron run for this row.';

COMMENT ON COLUMN startup_phase_progress.blockers IS
  'Top PhaseBlocker objects (code, subject, detail) from the last computePhaseGate() call.';
