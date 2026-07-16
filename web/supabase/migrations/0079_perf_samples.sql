CREATE TABLE IF NOT EXISTS perf_samples (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT now() NOT NULL,
  route TEXT NOT NULL,
  device TEXT NOT NULL CHECK (device IN ('mobile','desktop')),
  lh_score INT CHECK (lh_score BETWEEN 0 AND 100),
  fcp_ms INT,
  lcp_ms INT,
  tti_ms INT,
  cls NUMERIC(5,3),
  inp_ms INT,
  ttfb_ms INT,
  bundle_bytes INT,
  detail JSONB
);
CREATE INDEX IF NOT EXISTS perf_samples_route_ts_idx ON perf_samples (route, ts DESC);
CREATE INDEX IF NOT EXISTS perf_samples_score_idx ON perf_samples (lh_score, ts DESC) WHERE lh_score IS NOT NULL;

ALTER TABLE perf_samples ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'perf_samples' AND policyname = 'perf_samples_admin_read') THEN
    CREATE POLICY perf_samples_admin_read ON perf_samples FOR SELECT USING (
      auth.uid() IN (SELECT id FROM app_users WHERE role = 'admin')
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'perf_samples' AND policyname = 'perf_samples_service_insert') THEN
    CREATE POLICY perf_samples_service_insert ON perf_samples FOR INSERT WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE perf_samples IS 'Guardian v2: hourly Lighthouse CI + core web vitals samples per route/device.';
