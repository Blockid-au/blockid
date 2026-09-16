-- 0396 — agent_knowledge_base.status (G13-W2-R2, spec §C.2 / §F S-R2).
--
-- The live table is the 0045 shape (agent, topic, data jsonb, previous_data,
-- source_model, source_provider, created_at, updated_at); 0047's CREATE TABLE
-- IF NOT EXISTS was a no-op against it. Neither carries a `status` column,
-- and the v2 prompt builder (report-pipeline/knowledge-loader.ts) injects only
-- rows an operator has approved — so add the column with the permissive
-- default the spec asks for ('approved': every existing self-research row
-- keeps flowing into prompts until someone demotes it) plus a partial index
-- for the per-role "top 3 approved by created_at desc" read.
--
-- Idempotent. NOT auto-applied — run scripts/db/apply-migration.sh.

ALTER TABLE public.agent_knowledge_base
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_knowledge_base_status_check'
      AND conrelid = 'public.agent_knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.agent_knowledge_base
      ADD CONSTRAINT agent_knowledge_base_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'stale'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_akb_agent_status_created
  ON public.agent_knowledge_base (agent, created_at DESC)
  WHERE status = 'approved';

NOTIFY pgrst, 'reload schema';
