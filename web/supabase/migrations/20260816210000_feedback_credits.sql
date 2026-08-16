-- T_FEEDBACK_0001: feedback_submissions table with RLS
-- Users submit feedback → earn credits after AI review.

BEGIN;

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid         NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  category        text         NOT NULL CHECK (category IN ('product','ux','feature','bug','other')),
  body            text         NOT NULL,
  rating          int          NOT NULL CHECK (rating BETWEEN 1 AND 5),
  ai_score        int          CHECK (ai_score BETWEEN 0 AND 100),
  ai_summary      text,
  credits_awarded int,
  status          text         NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','scored','failed')),
  created_at      timestamptz  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_submissions_user
  ON feedback_submissions(user_id);

CREATE INDEX IF NOT EXISTS idx_feedback_submissions_pending
  ON feedback_submissions(status)
  WHERE status = 'pending';

-- RLS
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY feedback_service_all ON feedback_submissions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can INSERT their own rows
CREATE POLICY feedback_insert_own ON feedback_submissions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Authenticated users can SELECT their own rows
CREATE POLICY feedback_select_own ON feedback_submissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMIT;
