\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.app_users(id uuid PRIMARY KEY, deleted_at timestamptz, erased_at timestamptz);
CREATE TABLE public.credit_balances(id uuid PRIMARY KEY,user_id uuid UNIQUE REFERENCES public.app_users(id));
CREATE TABLE public.analyses(id uuid PRIMARY KEY,user_id uuid REFERENCES public.app_users(id),input_kind text,input_text text,input_truncated boolean DEFAULT false,intake jsonb,context jsonb,svi jsonb,full_report_status text,full_report_json jsonb);
\i /migration.sql
\i /migration.sql
INSERT INTO app_users VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO credit_balances VALUES('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001');
INSERT INTO analyses(id,user_id,input_kind,input_text,intake,full_report_status,full_report_json) VALUES('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001','idea_text','real input','{}','done','{"quality":"complete"}');
CREATE FUNCTION expect_error(q text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
    IF position(expected in SQLERRM) = 0 THEN RAISE EXCEPTION 'wrong error: %', SQLERRM; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error: %', expected;
END $$;
SELECT expect_error($q$SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',false,NULL)$q$,'explicit_connection_required');
SELECT expect_error($q$SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000021',true,(preview_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021')->>'displayedTermsSha256'))$q$,'authority_forbidden');
SELECT preview_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM reanalysis_report_associations) OR EXISTS(SELECT 1 FROM reanalysis_wallet_grants) THEN RAISE EXCEPTION 'preview mutated authority'; END IF; END $$;
SET ROLE service_role;
SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',true,(preview_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021')->>'displayedTermsSha256')) AS result \gset
SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',true,(preview_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021')->>'displayedTermsSha256'));
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM reanalysis_wallet_grants) <> 1 THEN RAISE EXCEPTION 'non-idempotent'; END IF;
 IF has_table_privilege('service_role','reanalysis_report_associations','INSERT') OR
    has_function_privilege('anon','connect_owned_analysis_wallet(uuid,uuid,boolean,text)','EXECUTE') OR
    has_function_privilege('service_role','connect_personal_reanalysis_wallet(uuid,uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'unsafe privileges'; END IF;
 IF (SELECT wallet_id FROM reanalysis_wallet_grants) <> '00000000-0000-0000-0000-000000000011'::uuid THEN RAISE EXCEPTION 'wrong wallet'; END IF;
END $$;
SELECT expect_error($q$UPDATE reanalysis_report_associations SET revision='forged'$q$,'authority_record_immutable');
SELECT expect_error($q$UPDATE reanalysis_wallet_grants SET wallet_id='00000000-0000-0000-0000-000000000012'$q$,'authority_record_immutable');
UPDATE app_users SET deleted_at=now() WHERE id='00000000-0000-0000-0000-000000000001';
SELECT expect_error($q$SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',true,'invalid')$q$,'authority_forbidden');
UPDATE app_users SET deleted_at=NULL,erased_at=now() WHERE id='00000000-0000-0000-0000-000000000001';
SELECT expect_error($q$SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',true,'invalid')$q$,'authority_forbidden');
SELECT revoke_personal_reanalysis_wallet('00000000-0000-0000-0000-000000000001',(:'result'::jsonb->>'associationId')::uuid);
SELECT expect_error($q$UPDATE reanalysis_wallet_grants SET revoked_at=NULL$q$,'authority_record_immutable');
UPDATE app_users SET erased_at=NULL WHERE id='00000000-0000-0000-0000-000000000001';
UPDATE analyses SET input_truncated=true;
SELECT expect_error($q$SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',true,(preview_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021')->>'displayedTermsSha256'))$q$,'authority_unavailable');
UPDATE analyses SET input_truncated=false,full_report_json='{"quality":"changed"}';
SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',true,(preview_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021')->>'displayedTermsSha256'));
DO $$ BEGIN IF (SELECT count(*) FROM reanalysis_report_associations) <> 2 THEN RAISE EXCEPTION 'changed report reused revision'; END IF; END $$;
SELECT expect_error($q$SELECT connect_owned_analysis_wallet('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',true,repeat('0',64))$q$,'authority_snapshot_changed');
SELECT expect_error($q$SELECT revoke_owned_analysis_wallet('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011')$q$,'authority_forbidden');
INSERT INTO reanalysis_quotes(association_id,grant_id,requester_user_id,wallet_id,billing_owner_user_id,intent_sha256,pricing_version,credit_micro_units,displayed_terms,displayed_terms_sha256,expires_at)
SELECT association_id,id,actor_user_id,wallet_id,wallet_owner_user_id,repeat('a',64),'test-only',10000,'terms',encode(sha256(convert_to('terms','UTF8')),'hex'),now()+interval '1 minute' FROM reanalysis_wallet_grants WHERE revoked_at IS NULL;
SELECT expect_error($q$UPDATE reanalysis_quotes SET credit_micro_units=20000$q$,'authority_record_immutable');
SELECT expect_error($q$DELETE FROM reanalysis_quotes$q$,'authority_record_immutable');
DELETE FROM analyses WHERE id='00000000-0000-0000-0000-000000000021';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM reanalysis_report_associations) OR EXISTS(SELECT 1 FROM reanalysis_wallet_grants) OR EXISTS(SELECT 1 FROM reanalysis_quotes) THEN RAISE EXCEPTION 'erasure left research payload'; END IF; END $$;
SELECT 'authority tests passed';
