-- Phase 2.4: Enhanced weekly reports — add dimension scores and AI summary to snapshots
ALTER TABLE svi_snapshots ADD COLUMN IF NOT EXISTS dimension_scores JSONB DEFAULT NULL;
ALTER TABLE svi_snapshots ADD COLUMN IF NOT EXISTS ai_summary TEXT DEFAULT NULL;
