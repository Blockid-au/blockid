-- Add project_id to ALL per-startup tables for multi-project data isolation.
-- Each startup project gets independent: evidence, cap table, vesting,
-- metrics, blockchain config, Google Drive folder, etc.

-- Evidence & Scoring
ALTER TABLE public.svi_evidence ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.svi_snapshots ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.svi_milestones ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.evidence_analyses ADD COLUMN IF NOT EXISTS project_id UUID;

-- Cap Table & Equity
ALTER TABLE public.share_classes ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.shareholders ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.share_transactions ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.esop_pool ADD COLUMN IF NOT EXISTS project_id UUID;

-- Vesting & Share Structure
ALTER TABLE public.vesting_schedules ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.share_structure ADD COLUMN IF NOT EXISTS project_id UUID;

-- Metrics & Financials
ALTER TABLE public.startup_metrics ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.dividend_records ADD COLUMN IF NOT EXISTS project_id UUID;

-- Blockchain
ALTER TABLE public.blockchain_sync_config ADD COLUMN IF NOT EXISTS project_id UUID;
