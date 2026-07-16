CREATE TABLE IF NOT EXISTS deploy_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ DEFAULT now() NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deploy','rollback','auto_fix','downtime','perf_regress','security')),
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','alert','critical')),
  task_id TEXT,
  git_sha TEXT,
  duration_ms INT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS deploy_incidents_ts_idx ON deploy_incidents (ts DESC);
CREATE INDEX IF NOT EXISTS deploy_incidents_severity_idx ON deploy_incidents (severity, ts DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS deploy_incidents_kind_ts_idx ON deploy_incidents (kind, ts DESC);

ALTER TABLE deploy_incidents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deploy_incidents' AND policyname = 'deploy_incidents_admin_read') THEN
    CREATE POLICY deploy_incidents_admin_read ON deploy_incidents FOR SELECT USING (
      auth.uid() IN (SELECT id FROM app_users WHERE role = 'admin')
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deploy_incidents' AND policyname = 'deploy_incidents_service_insert') THEN
    CREATE POLICY deploy_incidents_service_insert ON deploy_incidents FOR INSERT WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE deploy_incidents IS 'Guardian v2: deploy/rollback/auto-fix/downtime/perf/security incident log. Append-only for audit trail.';
