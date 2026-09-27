-- 0473_team_members_roster_columns.sql
--
-- P1 (27/09/2026): `/workspace/team` is always empty and the team AI-fill
-- always sees an empty team.
--
-- `public.team_members` was created by 0023_equity_members.sql (the cap
-- table: id, project_id, name, email, role, equity_pct, vesting_*, is_active
-- — read and written by src/lib/equity.ts). 0304_founder_core_features.sql
-- declared a different shape under the same name (the org-chart roster:
-- user_id, role_title, role_category, full_name, salary_aud, start_date,
-- status, reports_to, notes — read and written by src/lib/founder-features.ts,
-- /api/founder/team and /api/founder/team/ai-fill) with CREATE TABLE IF NOT
-- EXISTS, so it changed nothing. Every roster read fails with
-- "column team_members.user_id does not exist" (42703) and was swallowed
-- into []. Waived as an OPEN ISSUE in scripts/db/parity-exceptions.json.
--
-- Reconciliation, additive and idempotent (both code paths keep working on
-- ONE table; no column is dropped, renamed or retyped):
--   1. The 0304 roster columns are added (nullable, or with the 0304
--      defaults), plus `source` ('equity' | 'roster') recording which flow
--      created a row. `user_id` references public.app_users(id) (never
--      auth.users), ON DELETE CASCADE like every 0304 table.
--   2. Backfill (existing rows are all cap-table rows — live 27/09: 1 row):
--      user_id = the project owner, role_title / role_category from `role`,
--      full_name = name, status 'filled' for an active holder.
--   3. A BEFORE INSERT OR UPDATE trigger keeps both shapes valid:
--        * user_id defaults to the project owner (lib/equity.ts never sets it);
--        * a roster insert (role_title set, name NULL) gets name = full_name
--          or role_title (name is NOT NULL since 0023), source 'roster',
--          role from role_category, and is_active = false — a planned or
--          open role, or an unvalidated equity figure, never lands on the
--          cap table (lib/equity.ts lists is_active rows and validates the
--          100 % total on its own inserts only);
--        * a cap-table insert (role_title NULL) gets role_title /
--          role_category / full_name derived from name + role and status
--          'filled';
--        * equity_pct NULL (the roster form's empty field) becomes 0 (NOT NULL
--          since 0023); an edited full_name / name is mirrored to the other.
--   4. The updated_at trigger 0304 intended (0304's loop never attached it
--      to this table live) and the two 0304 indexes.
--   5. erase_account() is re-emitted with the 150-entry erasure map (the new
--      team_members.user_id FK → delete, also covered by the projects
--      cascade). The function body below the marked section is 0467
--      byte-for-byte except its "149-entry" comment line (now 150) and the
--      generated erasure-map VALUES block,
--      rendered from web/src/lib/privacy/erasure-map.ts and pinned by
--      erasure-map.test.ts. It lives in THIS file because the new map entry
--      names a column this file creates: applying one without the other
--      would break erasure.
--
-- Not applied by the author — founder review first; apply the whole file in
-- one psql transaction per pending-authority/README.md (NOTIFY pgrst is at
-- the end), then regenerate the FK fixture (`node
-- scripts/db/app-users-fk-inventory.mjs --json --fixture`). Code reading
-- the new columns (listTeamMembers, founder CRUD, ai-fill) keeps returning an
-- empty roster until this is applied, but now logs
-- `[blockid:founder-features:team-members]` with the Postgres code.

BEGIN;

-- ─── 1. Roster columns (0304 shape) + provenance ──────────────────────────
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.app_users(id) ON DELETE CASCADE;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS role_title text;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS role_category text;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS salary_aud numeric;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planned';
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES public.team_members(id) ON DELETE SET NULL;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'equity';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_status_check' AND conrelid = 'public.team_members'::regclass) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_status_check CHECK (status IN ('filled', 'open', 'planned'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_source_check' AND conrelid = 'public.team_members'::regclass) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_source_check CHECK (source IN ('equity', 'roster'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.team_members.source IS
  'Which flow created the row: equity (cap table, lib/equity.ts) or roster (org chart, /api/founder/team). Roster rows start is_active = false so they never join the cap table.';

-- ─── 2. Backfill the existing cap-table rows (idempotent: role_title IS NULL only) ──
UPDATE public.team_members tm
SET
  user_id       = coalesce(tm.user_id, p.user_id),
  role_title    = CASE lower(tm.role)
                    WHEN 'founder'   THEN 'Founder'
                    WHEN 'cofounder' THEN 'Co-founder'
                    WHEN 'advisor'   THEN 'Advisor'
                    WHEN 'employee'  THEN 'Employee'
                    WHEN 'investor'  THEN 'Investor'
                    ELSE coalesce(nullif(initcap(btrim(tm.role)), ''), 'Team member')
                  END,
  role_category = coalesce(tm.role_category, CASE lower(tm.role)
                    WHEN 'founder'   THEN 'founder'
                    WHEN 'cofounder' THEN 'founder'
                    WHEN 'advisor'   THEN 'advisor'
                    WHEN 'employee'  THEN 'hire'
                    ELSE NULL
                  END),
  full_name     = coalesce(tm.full_name, tm.name),
  status        = CASE WHEN tm.is_active THEN 'filled' ELSE tm.status END,
  source        = 'equity'
FROM public.projects p
WHERE p.id = tm.project_id
  AND tm.role_title IS NULL;

-- ─── 3. Keep both shapes valid on every write ─────────────────────────────
CREATE OR REPLACE FUNCTION public.team_members_reconcile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- The roster is keyed on the project OWNER (founder-crud / founder-features).
  IF NEW.user_id IS NULL THEN
    SELECT p.user_id INTO NEW.user_id FROM public.projects p WHERE p.id = NEW.project_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.name IS NULL AND NEW.role_title IS NOT NULL THEN
      -- Roster path (/api/founder/team): an org-chart slot, not a cap-table holder.
      NEW.source    := 'roster';
      NEW.is_active := false;
      NEW.role      := CASE NEW.role_category
                         WHEN 'founder' THEN 'founder'
                         WHEN 'advisor' THEN 'advisor'
                         ELSE 'employee'
                       END;
    ELSIF NEW.role_title IS NULL THEN
      -- Cap-table path (lib/equity.ts addTeamMember): a person holding equity.
      NEW.source        := 'equity';
      NEW.role_title    := CASE lower(coalesce(NEW.role, ''))
                             WHEN 'founder'   THEN 'Founder'
                             WHEN 'cofounder' THEN 'Co-founder'
                             WHEN 'advisor'   THEN 'Advisor'
                             WHEN 'employee'  THEN 'Employee'
                             WHEN 'investor'  THEN 'Investor'
                             ELSE coalesce(nullif(initcap(btrim(NEW.role)), ''), 'Team member')
                           END;
      NEW.role_category := coalesce(NEW.role_category, CASE lower(coalesce(NEW.role, ''))
                             WHEN 'founder'   THEN 'founder'
                             WHEN 'cofounder' THEN 'founder'
                             WHEN 'advisor'   THEN 'advisor'
                             WHEN 'employee'  THEN 'hire'
                             ELSE NULL
                           END);
      NEW.full_name     := coalesce(NEW.full_name, NEW.name);
      NEW.status        := 'filled';
    END IF;
  ELSE
    -- One edit, both name columns: the roster edits full_name, the cap table edits name.
    IF NEW.full_name IS DISTINCT FROM OLD.full_name AND NEW.name IS NOT DISTINCT FROM OLD.name THEN
      NEW.name := coalesce(nullif(btrim(NEW.full_name), ''), NEW.role_title, OLD.name);
    ELSIF NEW.name IS DISTINCT FROM OLD.name AND NEW.full_name IS NOT DISTINCT FROM OLD.full_name THEN
      NEW.full_name := NEW.name;
    END IF;
  END IF;

  NEW.name       := coalesce(nullif(btrim(NEW.name), ''), nullif(btrim(NEW.full_name), ''), NEW.role_title, 'Team member');
  NEW.equity_pct := coalesce(NEW.equity_pct, 0);
  NEW.role       := coalesce(NEW.role, 'founder');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS team_members_reconcile ON public.team_members;
CREATE TRIGGER team_members_reconcile
  BEFORE INSERT OR UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.team_members_reconcile();

-- ─── 4. The updated_at trigger + indexes 0304 intended ────────────────────
DROP TRIGGER IF EXISTS team_members_set_updated_at ON public.team_members;
CREATE TRIGGER team_members_set_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS team_members_user_idx ON public.team_members (user_id);
CREATE INDEX IF NOT EXISTS team_members_reports_to_idx ON public.team_members (reports_to);

-- ─── 5. erase_account() re-emitted with the 150-entry map (0467 body) ─────


CREATE OR REPLACE FUNCTION public.free_report_email_hash(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_clean  text := lower(btrim(coalesce(p_email, '')));
  v_at     int;
  v_local  text;
  v_domain text;
  v_plus   int;
BEGIN
  IF v_clean = '' THEN RETURN NULL; END IF;
  v_at := length(v_clean) - position('@' IN reverse(v_clean)) + 1;
  IF position('@' IN v_clean) = 0 THEN RETURN NULL; END IF;
  v_local  := substr(v_clean, 1, v_at - 1);
  v_domain := substr(v_clean, v_at + 1);
  v_plus := position('+' IN v_local);
  IF v_plus > 1 THEN v_local := substr(v_local, 1, v_plus - 1); END IF;
  IF v_domain IN ('gmail.com', 'googlemail.com') THEN v_local := replace(v_local, '.', ''); END IF;
  IF v_local = '' THEN RETURN NULL; END IF;
  RETURN encode(sha256(convert_to('free-report:' || v_local || '@' || v_domain, 'UTF8')), 'hex');
END;
$fn$;

-- ─── erase_account() re-emitted from the 150-entry erasure map + 28 non-FK extras ──
-- G25-C (2026-09-21): 0439 added free_report_grants (email, email_hash,
-- ip_hash — the free-allowance ledger). It has no app_users FK, so it joins
-- the non-FK extras keyed by the pre-erasure e-mail and its rows are
-- deleted. Body = 0429 byte-for-byte except the generated VALUES blocks
-- (rendered from web/src/lib/privacy/erasure-map.ts, pinned by
-- erasure-map.test.ts whose ERASURE_MIGRATION_FILE now points here).
--
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS deletion_requested_at       timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reason             text,
  ADD COLUMN IF NOT EXISTS deletion_cancel_token_hash  text,
  ADD COLUMN IF NOT EXISTS deletion_reauth_token_hash  text,
  ADD COLUMN IF NOT EXISTS deletion_reauth_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS erased_at                   timestamptz;

CREATE INDEX IF NOT EXISTS app_users_deletion_due_idx
  ON public.app_users (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL AND erased_at IS NULL;

COMMENT ON COLUMN public.app_users.deletion_requested_at IS
  'Self-service deletion requested at (7-day grace; cron account-erasure executes after). NULL = no pending request.';
COMMENT ON COLUMN public.app_users.erased_at IS
  'Set by erase_account(): the row is a pseudonymous tombstone kept only so NOT NULL ledger FKs (credit_transactions, usage_logs, app_user_audit_log, …) stay valid for the 7-year financial period.';

CREATE OR REPLACE FUNCTION public.erase_account(p_user_id uuid, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_role        text;
  v_email       text;
  v_erased_at   timestamptz;
  v_stripe      text;
  v_hash        text;
  v_anon_email  text;
  v_anon_lit    text;
  v_step        record;
  v_n           bigint;
  v_where       text;
  v_set         text;
  v_steps       jsonb := '[]'::jsonb;
  v_paths       jsonb := '[]'::jsonb;
  v_skipped     int := 0;
  v_tables      int := 0;
  v_t_delete    bigint := 0;
  v_t_anon      bigint := 0;
  v_t_detach    bigint := 0;
  v_t_pdetach   bigint := 0;
  v_t_extras    bigint := 0;
BEGIN
  -- ── guard: service_role (PostgREST) or direct SQL only ─────────────────
  v_role := current_setting('request.jwt.claim.role', true);
  IF v_role IS NULL OR v_role = '' THEN
    BEGIN
      v_role := (nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      v_role := NULL;
    END;
  END IF;
  IF coalesce(v_role, '') NOT IN ('', 'service_role') THEN
    RAISE EXCEPTION 'erase_account: service_role only' USING ERRCODE = '42501';
  END IF;

  SELECT email, erased_at, stripe_customer_id
    INTO v_email, v_erased_at, v_stripe
    FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'erase_account: user % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  v_hash := left(encode(sha256(convert_to(p_user_id::text, 'UTF8')), 'hex'), 24);
  v_anon_email := 'deleted+' || v_hash || '@erased.blockid.au';
  v_anon_lit := quote_literal(v_anon_email);

  -- storage objects the caller purges after COMMIT (bucket "dataroom")
  IF to_regclass('public.dataroom_files') IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(storage_path), '[]'::jsonb) INTO v_paths
      FROM public.dataroom_files
     WHERE user_id = p_user_id AND storage_path IS NOT NULL AND storage_path <> '';
  END IF;

  -- ── 0 · NO ACTION / RESTRICT children of the user's projects (and of the
  --        legacy svi_accounts rows that cascade from them) ──────────────
  FOR v_step IN
    SELECT * FROM (VALUES
-- BEGIN project-detaches (generated from src/lib/privacy/erasure-map.ts)
      ('reseller_attributions'::text, 'subject_project_id'::text, 'projects'::text),
      ('credit_transactions'::text, 'project_id'::text, 'projects'::text),
      ('usage_logs'::text, 'project_id'::text, 'projects'::text),
      ('ai_runs'::text, 'business_id'::text, 'projects'::text),
      ('reseller_credit_grants'::text, 'sandbox_project_id'::text, 'projects'::text),
      ('advisor_client_roster'::text, 'project_id'::text, 'projects'::text),
      ('data_rooms'::text, 'project_id'::text, 'projects'::text),
      ('funding_reports'::text, 'project_id'::text, 'projects'::text),
      ('pitchdeck_analyses'::text, 'project_id'::text, 'projects'::text),
      ('user_actions'::text, 'account_id'::text, 'svi_accounts'::text),
      ('cohort_members'::text, 'svi_account_id'::text, 'svi_accounts'::text)
-- END project-detaches
    ) AS t(tbl, col, parent)
  LOOP
    IF to_regclass('public.' || quote_ident(v_step.tbl)) IS NULL THEN CONTINUE; END IF;
    IF v_step.parent = 'svi_accounts' THEN
      IF to_regclass('public.svi_accounts') IS NULL THEN CONTINUE; END IF;
      v_where := format('%I IN (SELECT id FROM public.svi_accounts WHERE lower(email) = %L OR project_id IN (SELECT id FROM public.projects WHERE user_id = %L))',
                        v_step.col, lower(v_email), p_user_id);
    ELSE
      v_where := format('%I IN (SELECT id FROM public.projects WHERE user_id = %L)', v_step.col, p_user_id);
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', v_step.tbl, v_where) INTO v_n;
    IF NOT p_dry_run AND v_n > 0 THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %s', v_step.tbl, v_step.col, v_where);
    END IF;
    v_t_pdetach := v_t_pdetach + v_n;
    v_steps := v_steps || jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', 'detach_project', 'rows', v_n);
  END LOOP;

  -- ── 1 · every FK to app_users, in dependency order ─────────────────────
  FOR v_step IN
    SELECT * FROM (VALUES
-- BEGIN erasure-map (generated from src/lib/privacy/erasure-map.ts — do not edit by hand)
      (10::int, 'api_keys'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'oauth2_tokens'::text, 'subject_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'password_reset_tokens'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'sessions'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'svi_api_keys'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'webhook_endpoints'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (15::int, 'app_users'::text, 'referred_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'app_users'::text, 'verified_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'assessment_overrides'::text, 'reviewer_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'claim_versions'::text, 'changed_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'claims'::text, 'created_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'cohort_snapshots'::text, 'created_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'corrections'::text, 'resolved_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'corrections'::text, 'submitted_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'equity_requests'::text, 'reviewer_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'evaluation_batch_items'::text, 'reviewer_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'evaluation_batch_members'::text, 'invited_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'evaluations'::text, 'founder_user_id'::text, 'detach'::text, NULL::text, 'founder_email = NULL'::text),
      (15::int, 'evidence_records'::text, 'submitted_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'evidence_records'::text, 'verified_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'evidence_versions'::text, 'created_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'fundraise_commitments'::text, 'created_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'mentor_access_grants'::text, 'founder_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'project_members'::text, 'invited_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'reseller_credit_grants'::text, 'granted_by_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'reseller_customers'::text, 'stage_set_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'reseller_notes'::text, 'author_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'reseller_requests'::text, 'decision_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'revocations'::text, 'revoked_by_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'secondary_offers'::text, 'reviewed_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'sector_multiples_overrides'::text, 'approved_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'startup_outcomes'::text, 'confirmed_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'startup_outcomes'::text, 'recorded_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'svi_dimension_evidence'::text, 'verified_by_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (20::int, 'compliance_s708_certs'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (20::int, 'dataroom_files'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (20::int, 'founder_packs'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (20::int, 'valuation_certificates'::text, 'user_id'::text, 'anonymise'::text, NULL::text, 'score_history_id = NULL'::text),
      (30::int, 'ab_assignments'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_client_roster'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_clients'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_clients'::text, 'client_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_invites'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_notes'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_portal'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'analyses'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'analysis_refreshes'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'assembled_reports'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'brand_settings'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'competitors'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_esic_assessments'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_gst_status'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_modern_slavery_status'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_rd_registrations'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_tax_invoice_checks'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_wgea_status'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'connector_snapshots'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'contact_unlock_requests'::text, 'investor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'credit_balances'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'email_preferences'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'entitlements'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'eoi_book'::text, 'investor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'equity_splits'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evaluation_batch_members'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evaluation_batches'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evaluation_reports'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evaluations'::text, 'evaluator_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evaluator_progress_sends'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evidence_items'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'feedback_submissions'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'first_principles_sessions'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'founder_feedback_letters'::text, 'founder_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'founder_profiles'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'funding_matches'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'funding_plans'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'funding_reports'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'fundraise_rounds'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'grant_application_drafts'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'gtm_strategies'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'idea_evaluations'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'intake_templates'::text, 'owner_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_links'::text, 'founder_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_mandates'::text, 'owner_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_organisation_members'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_organisations'::text, 'owner_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_portfolio'::text, 'investor_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'lifecycle_state'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'mentor_check_ins'::text, 'founder_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'mentor_engagement_snapshots'::text, 'founder_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'mentor_notes'::text, 'founder_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'notifications'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'nurture_email_queue'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'pitchdeck_analyses'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'positioning_statements'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'pricing_tiers'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'program_intakes'::text, 'owner_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'project_members'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'published_analyses'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'reseller_customers'::text, 'customer_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'roadmap_milestones'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'secondary_offers'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'secondary_sim_orders'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'startup_listings'::text, 'startup_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'startup_package_interview'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'startup_score_history'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'subscription_trial_state'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'svi_readiness_snapshots'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'team_members'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'tech_analyses'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'transfer_whitelist'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'user_source_folders'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'watchlist'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'watchlist_digest'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (40::int, 'data_rooms'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (40::int, 'evidence'::text, 'owner_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (40::int, 'projects'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (50::int, 'ai_runs'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'analytics_events'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'app_user_audit_log'::text, 'user_id'::text, 'anonymise'::text, 'immutable'::text, NULL::text),
      (50::int, 'checkout_session_reseller_commissions'::text, 'founder_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'churn_events'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'consent_events'::text, 'user_id'::text, 'anonymise'::text, NULL::text, 'ip_address = NULL, user_agent = NULL'::text),
      (50::int, 'consents'::text, 'grantor_user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'conversion_events'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'coupon_redemptions'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'credit_transactions'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'equity_requests'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'guest_analyses'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, 'email = {anon_email}'::text),
      (50::int, 'mentor_access_grants'::text, 'granted_by'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'mentor_check_ins'::text, 'mentor_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'mentor_notes'::text, 'mentor_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'onchain_documents'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'pilot_orders'::text, 'user_id'::text, 'anonymise'::text, NULL::text, 'buyer_email = {anon_email}'::text),
      (50::int, 'pricing_experiment_events'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'referral_events'::text, 'referred_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'referral_events'::text, 'referrer_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'referrals'::text, 'referrer_id'::text, 'anonymise'::text, NULL::text, 'referrer_email = {anon_email}'::text),
      (50::int, 'report_orders'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'reseller_admins'::text, 'user_id'::text, 'anonymise'::text, NULL::text, 'status = ''revoked'', revoked_at = coalesce(revoked_at, now())'::text),
      (50::int, 'reseller_attributions'::text, 'subject_user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'reseller_audit_log'::text, 'actor_user_id'::text, 'anonymise'::text, 'immutable'::text, NULL::text),
      (50::int, 'reseller_audit_log'::text, 'subject_user_id'::text, 'anonymise'::text, 'immutable'::text, NULL::text),
      (50::int, 'reseller_credit_grants'::text, 'target_user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'reseller_requests'::text, 'requested_by'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'revenue_events'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'share_packages'::text, 'owner_user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'startup_package_purchases'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'upload_scans'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'usage_logs'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'user_feedback'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, 'email = NULL'::text)
-- END erasure-map
    ) AS t(ord, tbl, col, mode, opts, scrub)
    ORDER BY ord, tbl, col
  LOOP
    IF to_regclass('public.' || quote_ident(v_step.tbl)) IS NULL THEN
      v_skipped := v_skipped + 1;
      v_steps := v_steps || jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', v_step.mode, 'rows', 0, 'skipped', 'table_missing');
      CONTINUE;
    END IF;

    v_where := format('%I = %L', v_step.col, p_user_id);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', v_step.tbl, v_where) INTO v_n;

    IF NOT p_dry_run AND v_n > 0 THEN
      v_set := CASE WHEN v_step.scrub IS NULL THEN NULL ELSE replace(v_step.scrub, '{anon_email}', v_anon_lit) END;
      IF v_step.mode = 'delete' THEN
        EXECUTE format('DELETE FROM public.%I WHERE %s', v_step.tbl, v_where);
      ELSIF v_step.mode = 'detach' THEN
        EXECUTE format('UPDATE public.%I SET %I = NULL%s WHERE %s',
                       v_step.tbl, v_step.col, coalesce(', ' || v_set, ''), v_where);
      ELSIF v_step.mode = 'anonymise' THEN
        IF v_step.opts = 'immutable' THEN
          NULL; -- append-only ledger: counted, never written
        ELSIF v_step.opts = 'nullref' THEN
          EXECUTE format('UPDATE public.%I SET %I = NULL%s WHERE %s',
                         v_step.tbl, v_step.col, coalesce(', ' || v_set, ''), v_where);
        ELSIF v_set IS NOT NULL THEN
          EXECUTE format('UPDATE public.%I SET %s WHERE %s', v_step.tbl, v_set, v_where);
        END IF; -- keep-ref without scrub: nothing to write, the tombstone is the pseudonym
      ELSE
        RAISE EXCEPTION 'erase_account: unknown mode % for %.%', v_step.mode, v_step.tbl, v_step.col;
      END IF;
    END IF;

    IF v_n > 0 THEN v_tables := v_tables + 1; END IF;
    IF v_step.mode = 'delete' THEN v_t_delete := v_t_delete + v_n;
    ELSIF v_step.mode = 'detach' THEN v_t_detach := v_t_detach + v_n;
    ELSE v_t_anon := v_t_anon + v_n;
    END IF;
    v_steps := v_steps || (jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', v_step.mode, 'rows', v_n)
               || CASE WHEN v_step.opts IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('opts', v_step.opts) END);
  END LOOP;

  -- ── 2 · tables without an FK (keyed by email or unconstrained user_id) ─
  FOR v_step IN
    SELECT * FROM (VALUES
-- BEGIN non-fk-extras (generated from src/lib/privacy/erasure-map.ts)
      ('magic_links'::text, 'email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('email_drips'::text, 'email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('oauth_connections'::text, 'user_email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('oauth_connections_v2'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('founder_notifications'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('founder_digest_sends'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('svi_action_plans'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('analyzer_runs'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('financial_models'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('equity_plans'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('investor_pack_shares'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('report_sections'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('svi_deck_cache'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('svi_signals'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('dividend_records'::text, 'account_id'::text, 'account'::text, 'delete'::text, NULL::text),
      ('share_transactions'::text, 'account_id'::text, 'account'::text, 'delete'::text, NULL::text),
      ('shareholders'::text, 'account_id'::text, 'account'::text, 'delete'::text, NULL::text),
      ('share_classes'::text, 'account_id'::text, 'account'::text, 'delete'::text, NULL::text),
      ('user_insights'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('data_room_checklist'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('term_sheet_analyses'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('nps_responses'::text, 'email'::text, 'email'::text, 'anonymise'::text, 'email = NULL, user_email = NULL, user_id = NULL'::text),
      ('leads'::text, 'email'::text, 'email'::text, 'anonymise'::text, 'email = {anon_email}'::text),
      ('intake_submissions'::text, 'founder_email'::text, 'email'::text, 'anonymise'::text, 'founder_email = {anon_email}, founder_name = NULL'::text),
      ('user_actions'::text, 'email'::text, 'email'::text, 'anonymise'::text, 'email = {anon_email}'::text),
      ('svi_accounts'::text, 'email'::text, 'email'::text, 'anonymise'::text, 'email = {anon_email}'::text),
      ('free_report_grants'::text, 'email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('free_report_grants'::text, 'email_hash'::text, 'email_hash'::text, 'delete'::text, NULL::text),
      ('analyses'::text, 'full_report_email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('analyses'::text, 'summary_email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('email_preferences'::text, 'email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('email_sends'::text, 'recipient_hash'::text, 'email_sha256'::text, 'delete'::text, NULL::text),
      ('svi_notifications'::text, 'email'::text, 'email'::text, 'delete'::text, NULL::text)
-- END non-fk-extras
    ) AS t(tbl, col, keyed, mode, scrub)
  LOOP
    IF to_regclass('public.' || quote_ident(v_step.tbl)) IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = v_step.tbl AND column_name = v_step.col) THEN
      v_skipped := v_skipped + 1;
      v_steps := v_steps || jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', v_step.mode, 'rows', 0, 'skipped', 'table_or_column_missing', 'extra', true);
      CONTINUE;
    END IF;
    v_where := CASE WHEN v_step.keyed = 'email'
                    THEN format('lower(%I) = %L', v_step.col, lower(v_email))
                    WHEN v_step.keyed = 'email_hash'
                    THEN format('%I = public.free_report_email_hash(%L)', v_step.col, v_email)
                    WHEN v_step.keyed = 'email_sha256'
                    THEN format('%I = encode(sha256(convert_to(%L, ''UTF8'')), ''hex'')', v_step.col, lower(btrim(v_email)))
                    WHEN v_step.keyed = 'account'
                    -- legacy account_id columns hold EITHER the app_users id OR a
                    -- svi_accounts id (cap table / dividend register, 2026-06 era)
                    -- cast: the legacy columns are uuid on some tables and text on others
                    THEN format('(%I::text = %L OR %I::text IN (SELECT id::text FROM public.svi_accounts WHERE lower(email) = %L OR project_id IN (SELECT id FROM public.projects WHERE user_id = %L)))',
                                v_step.col, p_user_id::text, v_step.col, lower(v_email), p_user_id)
                    ELSE format('%I = %L', v_step.col, p_user_id) END;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', v_step.tbl, v_where) INTO v_n;
    IF NOT p_dry_run AND v_n > 0 THEN
      IF v_step.mode = 'delete' THEN
        EXECUTE format('DELETE FROM public.%I WHERE %s', v_step.tbl, v_where);
      ELSE
        EXECUTE format('UPDATE public.%I SET %s WHERE %s', v_step.tbl, replace(v_step.scrub, '{anon_email}', v_anon_lit), v_where);
      END IF;
    END IF;
    IF v_n > 0 THEN v_tables := v_tables + 1; END IF;
    v_t_extras := v_t_extras + v_n;
    v_steps := v_steps || jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', v_step.mode, 'rows', v_n, 'extra', true);
  END LOOP;

  -- ── 3 · tombstone ──────────────────────────────────────────────────────
  IF NOT p_dry_run THEN
    UPDATE public.app_users SET
      email                      = v_anon_email,
      display_name               = 'Deleted user',
      role                       = 'user',
      plan                       = 'free',
      discount_pct               = 0,
      permissions                = '[]'::jsonb,
      investor_discoverable      = false,
      onboarding_completed       = false,
      google_id                  = NULL,
      avatar_url                 = NULL,
      stripe_customer_id         = NULL,
      password_hash              = NULL,
      coupon_code                = NULL,
      cancel_reason              = NULL,
      referral_code              = NULL,
      startup_name               = NULL,
      startup_stage              = NULL,
      industry                   = NULL,
      startup_goals              = NULL,
      investor_firm              = NULL,
      investor_url               = NULL,
      custom_role                = NULL,
      calendar_token             = NULL,
      investor_prefs             = NULL,
      dashboard_layout           = NULL,
      onboarding_state           = NULL,
      jurisdiction               = NULL,
      jurisdiction_source        = NULL,
      segment                    = NULL,
      deletion_reason            = NULL,
      deletion_cancel_token_hash = NULL,
      deletion_reauth_token_hash = NULL,
      deletion_reauth_expires_at = NULL,
      deletion_requested_at      = NULL,
      erased_at                  = now(),
      deleted_at                 = now(),
      anonymized_at              = now()
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'user_id', p_user_id,
    'anon_email', v_anon_email,
    'already_erased', v_erased_at IS NOT NULL,
    'erased_at', CASE WHEN p_dry_run THEN v_erased_at ELSE now() END,
    'stripe_customer_id', v_stripe,
    'storage_paths', jsonb_build_object('dataroom', v_paths),
    'steps', v_steps,
    'totals', jsonb_build_object(
      'delete', v_t_delete, 'anonymise', v_t_anon, 'detach', v_t_detach,
      'detach_project', v_t_pdetach, 'extras', v_t_extras),
    'tables_touched', v_tables,
    'skipped', v_skipped
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.erase_account(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erase_account(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_account(uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.erase_account(uuid, boolean) IS
  'Privacy erasure (S24-B): walks src/lib/privacy/erasure-map.ts in one transaction and tombstones the app_users row. service_role / direct SQL only. p_dry_run=true reports counts and writes nothing.';

COMMIT;

NOTIFY pgrst, 'reload schema';
