-- Track user actions taken from SVI recommendations
CREATE TABLE IF NOT EXISTS user_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES svi_accounts(id),
  email TEXT NOT NULL,
  action_type TEXT NOT NULL,           -- 'tool_used', 'evidence_uploaded', 'guide_visited', 'external_completed'
  action_label TEXT NOT NULL,          -- Human-readable description
  dimension TEXT,                      -- Which SVI dimension this affects (ftv, mpc, ptd, etc.)
  source_gap TEXT,                     -- Which evidence gap this addresses
  tool_slug TEXT,                      -- Which tool was used (if applicable)
  evidence_id UUID,                    -- Link to svi_evidence if evidence was uploaded
  metadata JSONB DEFAULT '{}',         -- Extra data (tool results, URLs visited, etc.)
  svi_impact_estimate INT DEFAULT 0,   -- Estimated SVI point improvement
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_actions_account ON user_actions(account_id);
CREATE INDEX idx_user_actions_email ON user_actions(email);
