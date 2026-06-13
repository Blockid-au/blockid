-- Investor access log for data room share pages
CREATE TABLE IF NOT EXISTS investor_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id text NOT NULL,
  investor_email text,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_hash text
);

CREATE INDEX IF NOT EXISTS idx_investor_access_score ON investor_access_log(score_id, accessed_at DESC);

ALTER TABLE investor_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY investor_access_log_service_all ON investor_access_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
