-- Phase 8: Growth Journal enhancements + revaluation support
-- Adds missing columns to growth_journal table (created in 0030)

-- Add entry_date column for explicit date tracking
ALTER TABLE growth_journal ADD COLUMN IF NOT EXISTS entry_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Add metadata JSONB column for flexible data
ALTER TABLE growth_journal ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add index for date-based queries
CREATE INDEX IF NOT EXISTS idx_journal_email ON growth_journal(email);
CREATE INDEX IF NOT EXISTS idx_journal_date ON growth_journal(email, entry_date DESC);

-- Add ai_reflection type to support monthly AI reflections & revaluations
-- (entry_type values: note, decision, pivot, milestone, learning, metric, ai_reflection, revaluation)
