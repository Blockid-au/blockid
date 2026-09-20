-- 0417_claims_evidence_records.sql
-- ---------------------------------------------------------------------------
-- G21 P1-A (2026-09-20, docs/plans/g21-fi-upgrade-2026-09-20.md § P1-A)
-- The explicit Claim ≠ Evidence model — layer L2 "Evidence Graph".
--
-- Why
--   Until now a founder's statement ("A$12k MRR", "we have a cap table") and
--   the thing that proves it were the same row: `svi_dimension_evidence`
--   carried a confidence_level but no separate notion of what was CLAIMED,
--   and the report's per-dimension "evidence" lines were prose the engine
--   read out of the founder's own text. Evaluators could not tell a claim
--   from a proof. This migration separates the two:
--
--   claims            one row per (project, claim_key) — WHAT the founder /
--                     the analysis asserts, with the founder's own value,
--                     the value the analysis extracted and a normalised
--                     value the contradiction check compares. assessment_
--                     status is DERIVED (lib/evidence/claims.ts
--                     deriveAssessmentStatus) from the linked records:
--                       claimed          no evidence record at all
--                       unverified       only L1 self-declared records
--                       evidence_backed  any L2–L5 record
--                       verified         any L6 record or a verified_by
--                       conflicting      contradiction_status = conflicting
--   evidence_records  one row per PROOF — a hub upload, a public URL, a
--                     connector pull, a transaction feed, a reviewer's
--                     signature. evidence_type is the L1–L6 ladder that
--                     mirrors lib/evidence/confidence-cap.ts
--                     (self_declared … third_party_verified). hash = sha256
--                     of the canonical payload so a re-sync is idempotent
--                     (same hash → skipped; a newer payload from the same
--                     source supersedes the older row, never deletes it).
--                     expires_at + status let the daily evidence-expiry cron
--                     retire stale proof (`expired`) and re-derive the claim.
--                     visibility / consent_scope are what every evaluator
--                     read honours (private → owner only; evaluators →
--                     entitled evaluators; public → anyone the project is
--                     shared with).
--   claim_versions    append-only history of founder corrections
--                     (PATCH /api/claims/[id]): the claim row is updated,
--                     the previous state is snapshotted here first. Never
--                     overwritten silently (§3 data rule 3).
--
-- FKs: project_id → projects (CASCADE — projects-only rule); created_by /
-- submitted_by / verified_by / changed_by → app_users (SET NULL — erasure-
-- map mode `detach`, four new entries, FKs 135–138; the map is re-emitted
-- in § 5 below and ERASURE_MIGRATION_FILE now points here).
--
-- RLS: owner (projects.user_id = auth.uid()) SELECT on all three tables;
-- service_role ALL. Every app read goes through getSupabaseAdmin() and the
-- viewer scope is applied in code (lib/evidence/records.ts
-- listEvidenceRecords / lib/evidence/claims-access.ts) — evaluators never
-- read these tables with the anon key.
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS / OR REPLACE). NOT
-- applied by the lane — the merging session applies via
-- scripts/db/apply-migration.sh and commits content/reports/schema-migrations.json,
-- then runs `node scripts/evidence/backfill-claims.mjs --all --write --report`.
--
-- Rollback
--   DROP TABLE IF EXISTS public.claim_versions;
--   DROP TABLE IF EXISTS public.evidence_records;
--   DROP TABLE IF EXISTS public.claims;
--   (then re-apply 0406 §4 for the 134-entry erase_account())
--
-- Apply: scripts/db/apply-migration.sh web/supabase/migrations/0417_claims_evidence_records.sql
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- ─── 1. claims ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.claims (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  svi_dimension          text NOT NULL CHECK (svi_dimension IN ('ftv', 'mpc', 'ptd', 'tre', 'cgh', 'iri', 'lco', 'svm')),
  category               text NULL CHECK (category IS NULL OR length(category) <= 64),
  claim_key              text NULL CHECK (claim_key IS NULL OR claim_key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  statement              text NOT NULL CHECK (length(statement) BETWEEN 1 AND 2000),
  founder_claimed_value  jsonb NULL,
  extracted_value        jsonb NULL,
  normalized_value       jsonb NULL,
  confidence             numeric(5,2) NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),
  contradiction_status   text NOT NULL DEFAULT 'none'
                         CHECK (contradiction_status IN ('none', 'conflicting', 'resolved')),
  assessment_status      text NOT NULL DEFAULT 'claimed'
                         CHECK (assessment_status IN ('claimed', 'evidence_backed', 'verified', 'unverified', 'conflicting')),
  source_report_id       text NULL CHECK (source_report_id IS NULL OR length(source_report_id) <= 128),
  created_by             uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS claims_project_claim_key_uidx
  ON public.claims (project_id, claim_key)
  WHERE claim_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS claims_project_dimension_idx
  ON public.claims (project_id, svi_dimension);

CREATE INDEX IF NOT EXISTS claims_project_status_idx
  ON public.claims (project_id, assessment_status);

DROP TRIGGER IF EXISTS claims_set_updated_at ON public.claims;
CREATE TRIGGER claims_set_updated_at
  BEFORE UPDATE ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.claims IS
  'G21 P1-A: what a founder / the analysis asserts about a project, one row per (project_id, claim_key). assessment_status is derived from the linked evidence_records (lib/evidence/claims.ts); contradiction_status from divergent normalized values. project_id FKs projects (CASCADE); created_by FKs app_users (SET NULL, erasure detach).';
COMMENT ON COLUMN public.claims.claim_key IS
  'Stable dotted key for dedupe + contradiction detection, e.g. traction.mrr_aud. Unique per project when set.';
COMMENT ON COLUMN public.claims.normalized_value IS
  'The comparable form of the value (number in AUD / lower-cased string / boolean) the contradiction check reads — {"kind":"number","value":12000} etc.';

-- ─── 2. evidence_records ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.evidence_records (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  claim_id               uuid NULL REFERENCES public.claims(id) ON DELETE SET NULL,
  svi_dimension          text NULL CHECK (svi_dimension IS NULL OR svi_dimension IN ('ftv', 'mpc', 'ptd', 'tre', 'cgh', 'iri', 'lco', 'svm')),
  evidence_type          text NOT NULL
                         CHECK (evidence_type IN ('L1_self_declared', 'L2_public_url', 'L3_uploaded_document', 'L4_connected_source', 'L5_transaction_data', 'L6_third_party_verified')),
  source_type            text NULL CHECK (source_type IS NULL OR length(source_type) <= 64),
  source_uri             text NULL CHECK (source_uri IS NULL OR length(source_uri) <= 2048),
  source_name            text NULL CHECK (source_name IS NULL OR length(source_name) <= 300),
  submitted_by           uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  observed_at            timestamptz NULL,
  confidence             numeric(5,2) NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),
  verification_level     text NULL CHECK (verification_level IS NULL OR length(verification_level) <= 64),
  verified_by            uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  verified_at            timestamptz NULL,
  expires_at             timestamptz NULL,
  hash                   text NULL CHECK (hash IS NULL OR hash ~ '^[0-9a-f]{64}$'),
  observed_value         jsonb NULL,
  visibility             text NOT NULL DEFAULT 'private'
                         CHECK (visibility IN ('private', 'evaluators', 'public')),
  consent_scope          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'expired', 'superseded', 'withdrawn')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_records_project_dimension_idx
  ON public.evidence_records (project_id, svi_dimension);

CREATE INDEX IF NOT EXISTS evidence_records_claim_idx
  ON public.evidence_records (claim_id);

CREATE INDEX IF NOT EXISTS evidence_records_expires_active_idx
  ON public.evidence_records (expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS evidence_records_project_hash_idx
  ON public.evidence_records (project_id, hash)
  WHERE hash IS NOT NULL;

DROP TRIGGER IF EXISTS evidence_records_set_updated_at ON public.evidence_records;
CREATE TRIGGER evidence_records_set_updated_at
  BEFORE UPDATE ON public.evidence_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.evidence_records IS
  'G21 P1-A: one proof per row (hub upload, public URL, connector pull, transaction feed, reviewer signature) linked to a claim. evidence_type = L1–L6 ladder aligned with lib/evidence/confidence-cap.ts; hash = sha256 of the canonical payload (idempotent re-sync); status active → expired (cron evidence-expiry) | superseded (newer payload from the same source) | withdrawn. visibility + consent_scope gate every evaluator read in code.';
COMMENT ON COLUMN public.evidence_records.observed_value IS
  'The value this proof carries for its claim in the same normalised shape as claims.normalized_value (a Stripe pull''s MRR, a register''s ABN status) — detectContradictions compares it with the founder''s and the analysis'' values. NULL for a document that proves existence only.';
COMMENT ON COLUMN public.evidence_records.consent_scope IS
  'Founder-controlled disclosure beyond visibility: {"allowed_viewers":[<app_users.id>…]} widens a private record to named viewers; {"deny":["evaluators"]} narrows. Read by lib/evidence/records.ts listEvidenceRecords.';

-- ─── 3. claim_versions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.claim_versions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id               uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  version                integer NOT NULL CHECK (version > 0),
  snapshot               jsonb NOT NULL,
  note                   text NULL CHECK (note IS NULL OR length(note) <= 1000),
  changed_by             uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  changed_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, version)
);

CREATE INDEX IF NOT EXISTS claim_versions_claim_changed_idx
  ON public.claim_versions (claim_id, changed_at DESC);

COMMENT ON TABLE public.claim_versions IS
  'G21 P1-A: append-only history of founder corrections to a claim (PATCH /api/claims/[id]). snapshot = the claim row BEFORE the change plus the patch applied; the claim itself is updated, never overwritten silently. changed_by FKs app_users (SET NULL, erasure detach).';

-- ─── 4. RLS: owner read; every write is service-role ─────────────────────────

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_owner_select ON public.claims;
CREATE POLICY claims_owner_select ON public.claims
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = claims.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS claims_service_all ON public.claims;
CREATE POLICY claims_service_all ON public.claims
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS evidence_records_owner_select ON public.evidence_records;
CREATE POLICY evidence_records_owner_select ON public.evidence_records
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = evidence_records.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS evidence_records_service_all ON public.evidence_records;
CREATE POLICY evidence_records_service_all ON public.evidence_records
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS claim_versions_owner_select ON public.claim_versions;
CREATE POLICY claim_versions_owner_select ON public.claim_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.projects p ON p.id = c.project_id
      WHERE c.id = claim_versions.claim_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS claim_versions_service_all ON public.claim_versions;
CREATE POLICY claim_versions_service_all ON public.claim_versions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─── 5. erase_account() re-emitted from the 138-entry erasure map ───────────
-- Four new app_users FKs (claims.created_by, evidence_records.submitted_by,
-- evidence_records.verified_by, claim_versions.changed_by — all SET NULL,
-- mode detach, order 15). The function body below is 0406 §4's
-- byte-for-byte except the generated VALUES blocks (rendered from
-- web/src/lib/privacy/erasure-map.ts and pinned by erasure-map.test.ts,
-- whose ERASURE_MIGRATION_FILE now points here). The loop skips tables that
-- do not exist yet, so the map is safe on an install where this file has
-- not created them.
--
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
      (15::int, 'claim_versions'::text, 'changed_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'claims'::text, 'created_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'equity_requests'::text, 'reviewer_id'::text, 'detach'::text, NULL::text, NULL::text),
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
      ('svi_accounts'::text, 'email'::text, 'email'::text, 'anonymise'::text, 'email = {anon_email}'::text)
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
