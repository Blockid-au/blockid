-- 0050_enable_rls_defense_in_depth.sql
--
-- Enable Row-Level Security on the user-data tables that were missing it.
--
-- The application accesses Postgres EXCLUSIVELY via the Supabase service-role
-- key, and the `service_role` Postgres role has BYPASSRLS — so enabling RLS
-- here does NOT change application behaviour. It is pure defense-in-depth:
-- with RLS enabled and no policies, the `anon` / `authenticated` roles get
-- default-deny, so a leaked anon key or direct PostgREST/:5432 access cannot
-- read these tables. All legitimate access remains server-side (service role).
--
-- Idempotent: only enables RLS where the table exists and RLS is not already on.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'agent_knowledge_base','agent_kpi_snapshots','agent_report_tasks',
    'ai_equity_recommendations','api_rate_limits','assembled_reports',
    'blockchain_sync_config','blockchain_sync_queue','data_room_views','data_rooms',
    'dividend_payouts','evaluation_criteria','evidence_items','financial_projections',
    'fundraise_rounds','onchain_documents','pending_transfer_reviews','report_sections',
    'share_structure','svi_analysis_usage','transfer_whitelist','user_actions',
    'user_feedback','user_insights','vesting_schedules'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
        AND c.relrowsecurity = false
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      RAISE NOTICE 'RLS enabled on public.%', t;
    END IF;
  END LOOP;
END $$;

-- Reload the PostgREST schema cache so the change takes effect immediately.
NOTIFY pgrst, 'reload schema';
