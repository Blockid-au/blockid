-- Track free analysis usage per email (server-side gate)
CREATE TABLE IF NOT EXISTS svi_analysis_usage (
  email TEXT PRIMARY KEY,
  free_used BOOLEAN DEFAULT FALSE,
  total_analyses INT DEFAULT 0,
  credits_remaining INT DEFAULT 0,
  last_analysis_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
