-- 0387_fundraise_rounds_closed_at.sql — fundraise_rounds.closed_at (live-QA suite run 1, 2026-09-13)
-- ---------------------------------------------------------------------------
-- Production's fundraise_rounds was created by 0043_missing_tables.sql, so
-- 0030's `create table if not exists` (which carries closed_at) was a no-op
-- and the column never existed. rounds-server.ts selects it → PostgREST 400 →
-- maybeSingle() null → every /api/fundraise/[roundId] route answered 404 even
-- after 0384 made inserts work. Idempotent.
ALTER TABLE public.fundraise_rounds ADD COLUMN IF NOT EXISTS closed_at timestamptz;
NOTIFY pgrst, 'reload schema';
