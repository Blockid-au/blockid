-- Wave 27B: Sector-specific cohort benchmarks for the Cohort Compare table.
--
-- Replaces the hardcoded AU seed medians in business-report-client.tsx with
-- real per-sector percentiles computed nightly from anonymised svi_snapshots
-- data. The cron `refresh-sector-benchmarks` groups snapshots by their
-- industry, maps industry → sector (see web/src/lib/svi/sector-map.ts), and
-- UPSERTs 25th / 50th / 75th percentile per dimension.
--
-- Sectors: saas, marketplace, fintech, healthtech, climatetech, hardware,
-- consumer, deeptech, default. `default` is the fallback and is always
-- seeded on migrate so the API never returns 404 before the first cron run.

CREATE TABLE IF NOT EXISTS public.svi_sector_benchmarks (
  sector             TEXT PRIMARY KEY,
  dim_medians        JSONB NOT NULL DEFAULT '{}'::jsonb,
  dim_top_quartile   JSONB NOT NULL DEFAULT '{}'::jsonb,
  dim_bottom_quartile JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_size        INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed each sector with the pre-Wave-27 hardcoded numbers so the /api/svi/
-- benchmarks endpoint never returns empty rows before the first cron pass.
-- Numbers below match the fallback used inline in business-report-client.tsx
-- (which is kept as a client-side safety net).
INSERT INTO public.svi_sector_benchmarks
  (sector, dim_medians, dim_top_quartile, dim_bottom_quartile, sample_size, updated_at)
VALUES
  ('default',
    '{"ftv":58,"mpc":52,"ptd":55,"tre":42,"cgh":48,"iri":45,"lco":50,"svm":47}'::jsonb,
    '{"ftv":75,"mpc":70,"ptd":72,"tre":65,"cgh":68,"iri":64,"lco":68,"svm":68}'::jsonb,
    '{"ftv":40,"mpc":35,"ptd":38,"tre":25,"cgh":30,"iri":28,"lco":32,"svm":30}'::jsonb,
    0, now()),
  ('saas',
    '{"ftv":60,"mpc":55,"ptd":60,"tre":45,"cgh":50,"iri":48,"lco":52,"svm":50}'::jsonb,
    '{"ftv":78,"mpc":72,"ptd":75,"tre":68,"cgh":70,"iri":66,"lco":70,"svm":70}'::jsonb,
    '{"ftv":42,"mpc":38,"ptd":42,"tre":28,"cgh":32,"iri":30,"lco":34,"svm":32}'::jsonb,
    0, now()),
  ('marketplace',
    '{"ftv":58,"mpc":54,"ptd":52,"tre":48,"cgh":48,"iri":46,"lco":50,"svm":50}'::jsonb,
    '{"ftv":75,"mpc":72,"ptd":70,"tre":68,"cgh":68,"iri":64,"lco":68,"svm":70}'::jsonb,
    '{"ftv":40,"mpc":36,"ptd":34,"tre":30,"cgh":30,"iri":28,"lco":32,"svm":32}'::jsonb,
    0, now()),
  ('fintech',
    '{"ftv":60,"mpc":54,"ptd":58,"tre":44,"cgh":52,"iri":48,"lco":58,"svm":48}'::jsonb,
    '{"ftv":78,"mpc":72,"ptd":74,"tre":66,"cgh":72,"iri":66,"lco":76,"svm":68}'::jsonb,
    '{"ftv":42,"mpc":36,"ptd":40,"tre":26,"cgh":34,"iri":30,"lco":40,"svm":30}'::jsonb,
    0, now()),
  ('healthtech',
    '{"ftv":60,"mpc":56,"ptd":58,"tre":38,"cgh":50,"iri":46,"lco":58,"svm":50}'::jsonb,
    '{"ftv":78,"mpc":74,"ptd":76,"tre":62,"cgh":70,"iri":64,"lco":76,"svm":70}'::jsonb,
    '{"ftv":42,"mpc":38,"ptd":40,"tre":22,"cgh":32,"iri":28,"lco":40,"svm":32}'::jsonb,
    0, now()),
  ('climatetech',
    '{"ftv":58,"mpc":54,"ptd":56,"tre":36,"cgh":48,"iri":46,"lco":52,"svm":54}'::jsonb,
    '{"ftv":76,"mpc":72,"ptd":74,"tre":60,"cgh":68,"iri":64,"lco":70,"svm":74}'::jsonb,
    '{"ftv":40,"mpc":36,"ptd":38,"tre":20,"cgh":30,"iri":28,"lco":34,"svm":36}'::jsonb,
    0, now()),
  ('hardware',
    '{"ftv":58,"mpc":52,"ptd":60,"tre":36,"cgh":48,"iri":44,"lco":52,"svm":50}'::jsonb,
    '{"ftv":76,"mpc":70,"ptd":76,"tre":60,"cgh":68,"iri":62,"lco":70,"svm":70}'::jsonb,
    '{"ftv":40,"mpc":34,"ptd":42,"tre":20,"cgh":30,"iri":26,"lco":34,"svm":32}'::jsonb,
    0, now()),
  ('consumer',
    '{"ftv":56,"mpc":54,"ptd":50,"tre":46,"cgh":46,"iri":44,"lco":48,"svm":46}'::jsonb,
    '{"ftv":74,"mpc":72,"ptd":68,"tre":68,"cgh":66,"iri":62,"lco":66,"svm":66}'::jsonb,
    '{"ftv":38,"mpc":36,"ptd":32,"tre":28,"cgh":28,"iri":26,"lco":30,"svm":28}'::jsonb,
    0, now()),
  ('deeptech',
    '{"ftv":62,"mpc":54,"ptd":64,"tre":34,"cgh":48,"iri":44,"lco":52,"svm":56}'::jsonb,
    '{"ftv":80,"mpc":72,"ptd":80,"tre":58,"cgh":68,"iri":62,"lco":70,"svm":76}'::jsonb,
    '{"ftv":44,"mpc":36,"ptd":46,"tre":18,"cgh":30,"iri":26,"lco":34,"svm":38}'::jsonb,
    0, now())
ON CONFLICT (sector) DO NOTHING;
