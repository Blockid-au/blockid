-- 0431_benchmark_segments_index_scale.sql
-- G21 P3 post-ship (2026-09-21): the SVI is the uncapped index (baseline 100,
-- "Exceptional" ≥ 300; live max 183), not a 0–100 score. 0428's CHECKs
-- (median / p25 / p75 ≤ 100) made the nightly benchmark-segments cron fail
-- on its first run. Keep the lower bound only.
ALTER TABLE public.benchmark_segments DROP CONSTRAINT IF EXISTS benchmark_segments_median_check;
ALTER TABLE public.benchmark_segments DROP CONSTRAINT IF EXISTS benchmark_segments_p25_check;
ALTER TABLE public.benchmark_segments DROP CONSTRAINT IF EXISTS benchmark_segments_p75_check;
ALTER TABLE public.benchmark_segments ADD CONSTRAINT benchmark_segments_median_check CHECK (median IS NULL OR median >= 0);
ALTER TABLE public.benchmark_segments ADD CONSTRAINT benchmark_segments_p25_check CHECK (p25 IS NULL OR p25 >= 0);
ALTER TABLE public.benchmark_segments ADD CONSTRAINT benchmark_segments_p75_check CHECK (p75 IS NULL OR p75 >= 0);
NOTIFY pgrst, 'reload schema';
