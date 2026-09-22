-- Runs after reanalysis-authority.sql in the same isolated database.
-- Execute the actual unmodified 0442 routine, with minimal representative
-- source tables. Absent unrelated tables use the routine's existing skip path.
\set ON_ERROR_STOP on
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS plan text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS discount_pct integer;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS investor_discoverable boolean;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS onboarding_completed boolean;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS google_id text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS startup_name text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS startup_stage text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS startup_goals text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS investor_firm text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS investor_url text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS custom_role text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS calendar_token text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS investor_prefs text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS dashboard_layout text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS onboarding_state text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS jurisdiction text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS jurisdiction_source text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS deletion_reason text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS deletion_cancel_token_hash text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS deletion_reauth_token_hash text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS deletion_reauth_expires_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS erased_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
ALTER TABLE app_users ADD COLUMN referred_by uuid, ADD COLUMN verified_by uuid;
ALTER TABLE analyses ADD COLUMN full_report_email text, ADD COLUMN summary_email text;
\i /erasure-migration.sql
UPDATE app_users SET email='owner@example.invalid' WHERE id='00000000-0000-0000-0000-000000000001';
INSERT INTO analyses(id,user_id,input_kind,input_text,intake,full_report_status,full_report_json) VALUES('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001','idea_text','PRIVATE ERASURE INPUT','{}','done','{"private":"report"}');
SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',true,preview_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021')->>'displayedTermsSha256');
INSERT INTO reanalysis_quotes(association_id,grant_id,requester_user_id,wallet_id,billing_owner_user_id,intent_sha256,pricing_version,credit_micro_units,displayed_terms,displayed_terms_sha256,expires_at)
SELECT association_id,id,actor_user_id,wallet_id,wallet_owner_user_id,repeat('a',64),'test-only',10000,'terms',encode(sha256(convert_to('terms','UTF8')),'hex'),now()+interval '1 minute' FROM reanalysis_wallet_grants WHERE revoked_at IS NULL;
SELECT erase_account('00000000-0000-0000-0000-000000000001',true)->>'ok';
DO $$ BEGIN
  IF (SELECT count(*) FROM reanalysis_report_associations) <> 1 OR
     (SELECT count(*) FROM reanalysis_wallet_grants) <> 1 OR
     (SELECT count(*) FROM reanalysis_quotes) <> 1 OR
     (SELECT erased_at FROM app_users WHERE id='00000000-0000-0000-0000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'dry-run changed private authority';
  END IF;
END $$;
SET ROLE service_role;
SELECT erase_account('00000000-0000-0000-0000-000000000001',false)->>'ok';
RESET ROLE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM analyses WHERE user_id='00000000-0000-0000-0000-000000000001') OR
     EXISTS(SELECT 1 FROM reanalysis_report_associations) OR
     EXISTS(SELECT 1 FROM reanalysis_wallet_grants) OR EXISTS(SELECT 1 FROM reanalysis_quotes) OR
     EXISTS(SELECT 1 FROM credit_balances WHERE user_id='00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'real erase_account left report authority or wallet';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM app_users WHERE id='00000000-0000-0000-0000-000000000001'
      AND erased_at IS NOT NULL AND deleted_at IS NOT NULL AND email LIKE 'deleted+%@erased.blockid.au') THEN
    RAISE EXCEPTION 'real erase_account failed to tombstone owner';
  END IF;
END $$;
SELECT expect_error($q$SELECT preview_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021')$q$,'authority_forbidden');
SELECT erase_account('00000000-0000-0000-0000-000000000001',false)->>'already_erased';
SELECT 'actual 0442 account erasure clears 0447 authority';
