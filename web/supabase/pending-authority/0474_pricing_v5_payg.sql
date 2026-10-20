-- 0474_pricing_v5_payg.sql
--
-- G35 Pricing v5 (Pay-as-you-go, 3 tiers) — schema for docs/pricing-v5-plan.md
-- §6.3. Founder approved Pricing v5 + D25–D30 on 20/10/2026. Additive and
-- idempotent: every statement can be re-run (IF NOT EXISTS, DO-guarded
-- constraints / policies, CHECKs replaced as drop-then-add inside one DO).
--
-- EXTENDS public.report_orders (0270) — no second orders table: the webhook,
-- the generation queue (0272), refunds and the delivery route already key on
-- it, and a parallel ledger would split revenue reporting.
--
--   1. report_orders
--        + tier text            snapshot | full | verified (NULL on the two
--                               legacy SKUs; the code maps those to "full")
--        + currency text        NOT NULL DEFAULT 'aud' (lower-case ISO 4217)
--        + upgrade_of_order_id  → report_orders(id) ON DELETE SET NULL
--                               (an upgrade SKU points at the order it lifts)
--        + reviewed_by          → app_users(id) ON DELETE SET NULL (erasure:
--                               detach — see section 9)
--        + reviewed_at / delivered_at / sla_due_at  timestamptz
--        product_sku CHECK = the 2 legacy SKUs + report_snapshot, report_full,
--          report_verified, upgrade_snapshot_full, upgrade_full_verified,
--          report_funding (D25)
--        status CHECK += IN_REVIEW (Verified: PAID → GENERATING → IN_REVIEW →
--          READY; READY / IN_REVIEW → REFUNDED) — mirrors
--          web/src/lib/paywall/report-order-state.ts
--        report_orders_active_uniq (business_id, user_id) incl. READY is
--          REPLACED by report_orders_inflight_sku_uniq (business_id, user_id,
--          product_sku) over the in-flight statuses only (CHECKOUT_INITIATED,
--          PAYMENT_PENDING, PAID, GENERATING) so Snapshot → Full upgrades and
--          a second report after delivery are possible; the rage-click guard
--          per SKU stays.
--   2. assembled_reports + payg_tier (snapshot | full | verified — the tier
--        the stored report is PROJECTED at; an upgrade only changes this, the
--        document is never regenerated), reviewed boolean NOT NULL DEFAULT
--        false, reviewed_at, reviewed_by → app_users(id) ON DELETE SET NULL.
--   3. report_reviews (one Verified review per order, admin-only) +
--      report_review_claims (per-claim accept / reject decisions).
--   4. revenue_events.kind += report_snapshot, report_full, report_verified,
--        report_upgrade, report_funding (0420 list kept verbatim).
--   5. RLS on report_orders: owner SELECT, admin SELECT, service_role ALL; no
--        UPDATE policy for anon / authenticated, so only the service role
--        (webhook, worker, admin API) moves `status`. assembled_reports keeps
--        0047's RLS-on / no-policy posture ON PURPOSE: an owner SELECT policy
--        would let a Snapshot buyer read the full report_json straight from
--        PostgREST, bypassing the server-side tier projection
--        (lib/report-v2/tier-projection.ts). report_reviews /
--        report_review_claims: admin SELECT + service_role ALL only.
--      Admin predicate = the existing one (0078 / 0079):
--        auth.uid() IN (SELECT id FROM public.app_users WHERE role = 'admin').
--      App reads go through the service role + requireAdmin(); the policies
--      are defence in depth.
--   9. erase_account() re-emitted with the 153-entry erasure map: 0473's
--        150 entries + the three new reviewer FKs as `detach`
--        (web/src/lib/privacy/erasure-map.ts, pinned by erasure-map.test.ts
--        whose ERASURE_MIGRATION_FILE now points here). The function body is
--        0473's byte-for-byte except the generated erasure-map VALUES block.
--
-- ORDER: apply AFTER pending-authority/0473 — the re-emitted erase_account()
-- keeps 0473's `team_members.user_id` step, a column 0473 creates. Section 0
-- refuses to run (whole transaction rolls back) when 0473 is missing.
--
-- Apply (founder / a session with prod DB write — NOT applied by the author):
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < web/supabase/pending-authority/0474_pricing_v5_payg.sql
-- then run the read-only checks in 0474_verify_pricing_v5_payg.sql and
-- regenerate the FK fixture: node scripts/db/app-users-fk-inventory.mjs --json --fixture
-- Rollback: 0474_rollback_pricing_v5_payg.sql (refuses while v5 rows exist).
--
-- Code tolerates this file being absent: the order tier is derived from
-- product_sku (legacy SKUs → full) and assembled_reports.payg_tier is read
-- best-effort (lib/report-v2/storage.ts readAssembledReportPaygTier).

BEGIN;

-- ─── 0. dependency guard ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION '0474 requires pending-authority/0473_team_members_roster_columns.sql first (team_members.user_id missing; the re-emitted erase_account() walks it)';
  END IF;
END $$;

-- ─── 1. report_orders ───────────────────────────────────────────────────────
ALTER TABLE public.report_orders
  ADD COLUMN IF NOT EXISTS tier                text,
  ADD COLUMN IF NOT EXISTS currency            text NOT NULL DEFAULT 'aud',
  ADD COLUMN IF NOT EXISTS upgrade_of_order_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by         uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS sla_due_at          timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_orders_tier_check' AND conrelid = 'public.report_orders'::regclass) THEN
    ALTER TABLE public.report_orders
      ADD CONSTRAINT report_orders_tier_check CHECK (tier IS NULL OR tier IN ('snapshot', 'full', 'verified'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_orders_currency_check' AND conrelid = 'public.report_orders'::regclass) THEN
    ALTER TABLE public.report_orders
      ADD CONSTRAINT report_orders_currency_check CHECK (currency ~ '^[a-z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_orders_upgrade_of_order_id_fkey' AND conrelid = 'public.report_orders'::regclass) THEN
    ALTER TABLE public.report_orders
      ADD CONSTRAINT report_orders_upgrade_of_order_id_fkey
      FOREIGN KEY (upgrade_of_order_id) REFERENCES public.report_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_orders_upgrade_not_self_check' AND conrelid = 'public.report_orders'::regclass) THEN
    ALTER TABLE public.report_orders
      ADD CONSTRAINT report_orders_upgrade_not_self_check CHECK (upgrade_of_order_id IS NULL OR upgrade_of_order_id <> id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_orders_reviewed_by_fkey' AND conrelid = 'public.report_orders'::regclass) THEN
    ALTER TABLE public.report_orders
      ADD CONSTRAINT report_orders_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES public.app_users(id) ON DELETE SET NULL;
  END IF;

  -- product_sku: replace (drop + add is idempotent inside this block).
  ALTER TABLE public.report_orders DROP CONSTRAINT IF EXISTS report_orders_product_sku_check;
  ALTER TABLE public.report_orders
    ADD CONSTRAINT report_orders_product_sku_check CHECK (product_sku IN (
      'sku_trust_report_5aud', 'sku_trust_report_credits',
      'report_snapshot', 'report_full', 'report_verified',
      'upgrade_snapshot_full', 'upgrade_full_verified',
      'report_funding'
    ));

  -- status: 0270's nine + IN_REVIEW.
  ALTER TABLE public.report_orders DROP CONSTRAINT IF EXISTS report_orders_status_check;
  ALTER TABLE public.report_orders
    ADD CONSTRAINT report_orders_status_check CHECK (status IN (
      'CHECKOUT_INITIATED', 'PAYMENT_PENDING', 'PAID', 'GENERATING', 'IN_REVIEW',
      'READY', 'SHARED', 'EXPIRED', 'FAILED', 'REFUNDED'
    ));
END $$;

-- G2: one in-flight order per (business, user, SKU); READY no longer blocks.
DROP INDEX IF EXISTS public.report_orders_active_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS report_orders_inflight_sku_uniq
  ON public.report_orders (business_id, user_id, product_sku)
  WHERE status IN ('CHECKOUT_INITIATED', 'PAYMENT_PENDING', 'PAID', 'GENERATING');

CREATE INDEX IF NOT EXISTS report_orders_upgrade_of_idx
  ON public.report_orders (upgrade_of_order_id)
  WHERE upgrade_of_order_id IS NOT NULL;

-- Admin Verified queue, oldest SLA first (plan §6.6).
CREATE INDEX IF NOT EXISTS report_orders_in_review_sla_idx
  ON public.report_orders (sla_due_at)
  WHERE status = 'IN_REVIEW';

COMMENT ON COLUMN public.report_orders.tier IS
  'Pricing v5 PAYG tier bought (snapshot | full | verified). NULL on the legacy SKUs (sku_trust_report_5aud / sku_trust_report_credits), which the code treats as full. An upgrade order carries the tier it lifts TO.';
COMMENT ON COLUMN public.report_orders.currency IS
  'Lower-case ISO 4217 code of amount_aud (cents). Always aud today; stored so Stripe receipts and revenue rows agree.';
COMMENT ON COLUMN public.report_orders.upgrade_of_order_id IS
  'upgrade_snapshot_full / upgrade_full_verified: the order whose report this upgrade lifts (D28). The report is re-projected, never regenerated.';
COMMENT ON COLUMN public.report_orders.reviewed_by IS
  'Verified tier: the admin who marked the report reviewed (FK app_users, SET NULL; erasure map: detach).';
COMMENT ON COLUMN public.report_orders.sla_due_at IS
  'Verified tier: review due (2 Sydney business days + NSW holidays from PAID, lib/time/au-business-days.ts).';
COMMENT ON COLUMN public.report_orders.delivered_at IS
  'When the order reached READY (Verified: after review).';
COMMENT ON COLUMN public.report_orders.product_sku IS
  'Legacy: sku_trust_report_5aud (Stripe) / sku_trust_report_credits (credits). Pricing v5 (0474): report_snapshot, report_full, report_verified, upgrade_snapshot_full, upgrade_full_verified, report_funding (Money Finder, D25).';

-- ─── 2. assembled_reports ───────────────────────────────────────────────────
ALTER TABLE public.assembled_reports
  ADD COLUMN IF NOT EXISTS payg_tier   text,
  ADD COLUMN IF NOT EXISTS reviewed    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assembled_reports_payg_tier_check' AND conrelid = 'public.assembled_reports'::regclass) THEN
    ALTER TABLE public.assembled_reports
      ADD CONSTRAINT assembled_reports_payg_tier_check CHECK (payg_tier IS NULL OR payg_tier IN ('snapshot', 'full', 'verified'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assembled_reports_reviewed_by_fkey' AND conrelid = 'public.assembled_reports'::regclass) THEN
    ALTER TABLE public.assembled_reports
      ADD CONSTRAINT assembled_reports_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES public.app_users(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.assembled_reports.payg_tier IS
  'Pricing v5: the tier this stored report is served at (snapshot | full | verified). NULL = legacy order report (served full). An upgrade only raises this; report_json is never regenerated (plan §6.4.4).';
COMMENT ON COLUMN public.assembled_reports.reviewed IS
  'Verified tier: true once an admin marked it reviewed ("BlockID Reviewed" badge). A refunded Verified order sets it back to false.';

-- ─── 3. report_reviews + report_review_claims (admin-only) ─────────────────
CREATE TABLE IF NOT EXISTS public.report_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES public.report_orders(id) ON DELETE CASCADE,
  -- assembled_reports.id is text (0047); NULL until the order has a report.
  report_id    text REFERENCES public.assembled_reports(id) ON DELETE SET NULL,
  reviewer_id  uuid,
  notes        text,
  status       text NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_reviews_reviewer_id_fkey' AND conrelid = 'public.report_reviews'::regclass) THEN
    ALTER TABLE public.report_reviews
      ADD CONSTRAINT report_reviews_reviewer_id_fkey
      FOREIGN KEY (reviewer_id) REFERENCES public.app_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_reviews_status_check' AND conrelid = 'public.report_reviews'::regclass) THEN
    ALTER TABLE public.report_reviews
      ADD CONSTRAINT report_reviews_status_check CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_reviews_completed_at_check' AND conrelid = 'public.report_reviews'::regclass) THEN
    ALTER TABLE public.report_reviews
      ADD CONSTRAINT report_reviews_completed_at_check CHECK (status <> 'completed' OR completed_at IS NOT NULL);
  END IF;
END $$;

-- At most one live review per order.
CREATE UNIQUE INDEX IF NOT EXISTS report_reviews_order_open_uniq
  ON public.report_reviews (order_id)
  WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS report_reviews_order_idx ON public.report_reviews (order_id);
CREATE INDEX IF NOT EXISTS report_reviews_reviewer_idx ON public.report_reviews (reviewer_id) WHERE reviewer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.report_review_claims (
  review_id  uuid NOT NULL REFERENCES public.report_reviews(id) ON DELETE CASCADE,
  -- The claim under review: an evidence id ([ev:…] marker / svi_dimension_evidence id) or a claims.id.
  claim_ref  text NOT NULL,
  decision   text NOT NULL,
  note       text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, claim_ref)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_review_claims_decision_check' AND conrelid = 'public.report_review_claims'::regclass) THEN
    ALTER TABLE public.report_review_claims
      ADD CONSTRAINT report_review_claims_decision_check CHECK (decision IN ('accept', 'reject'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_review_claims_claim_ref_check' AND conrelid = 'public.report_review_claims'::regclass) THEN
    ALTER TABLE public.report_review_claims
      ADD CONSTRAINT report_review_claims_claim_ref_check CHECK (length(btrim(claim_ref)) > 0);
  END IF;
END $$;

ALTER TABLE public.report_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_review_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_reviews' AND policyname = 'report_reviews_admin_select') THEN
    CREATE POLICY report_reviews_admin_select ON public.report_reviews FOR SELECT
      USING (auth.uid() IN (SELECT id FROM public.app_users WHERE role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_reviews' AND policyname = 'report_reviews_service_all') THEN
    CREATE POLICY report_reviews_service_all ON public.report_reviews FOR ALL
      USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_review_claims' AND policyname = 'report_review_claims_admin_select') THEN
    CREATE POLICY report_review_claims_admin_select ON public.report_review_claims FOR SELECT
      USING (auth.uid() IN (SELECT id FROM public.app_users WHERE role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_review_claims' AND policyname = 'report_review_claims_service_all') THEN
    CREATE POLICY report_review_claims_service_all ON public.report_review_claims FOR ALL
      USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE public.report_reviews IS
  'Pricing v5 Verified tier (plan §6.6): one admin review per report order — notes, status, completion. Admin-only (RLS: admin SELECT, service_role ALL). Erasure: reviewer_id detach; rows cascade with the order.';
COMMENT ON TABLE public.report_review_claims IS
  'Per-claim accept / reject decisions inside a report_reviews row (claim_ref = evidence id or claims.id). Admin-only; cascades with the review.';

-- ─── 4. revenue_events.kind (0420 list + the five PAYG kinds) ──────────────
DO $$
BEGIN
  ALTER TABLE public.revenue_events DROP CONSTRAINT IF EXISTS revenue_events_kind_check;
  ALTER TABLE public.revenue_events
    ADD CONSTRAINT revenue_events_kind_check
    CHECK (kind IN (
      'trial_start','trial_convert','trial_end_no_payment',
      'subscribe','upgrade','downgrade','renewal','refund','chargeback',
      'credit_pack',
      'trust_report_5aud','guest_analysis_3aud','funding_report_3aud',
      'startup_package','cohort_pilot',
      'report_snapshot','report_full','report_verified','report_upgrade','report_funding'
    ));
END $$;

-- ─── 5. report_orders RLS (0270 enabled RLS with no policy) ────────────────
ALTER TABLE public.report_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_orders' AND policyname = 'report_orders_owner_select') THEN
    CREATE POLICY report_orders_owner_select ON public.report_orders FOR SELECT
      USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_orders' AND policyname = 'report_orders_admin_select') THEN
    CREATE POLICY report_orders_admin_select ON public.report_orders FOR SELECT
      USING (auth.uid() IN (SELECT id FROM public.app_users WHERE role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_orders' AND policyname = 'report_orders_service_all') THEN
    CREATE POLICY report_orders_service_all ON public.report_orders FOR ALL
      USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ─── 9. erase_account() re-emitted from the 153-entry erasure map ──────────
-- (0473 sections 5ff. verbatim; only the generated erasure-map VALUES block
-- differs: + report_orders.reviewed_by, assembled_reports.reviewed_by,
-- report_reviews.reviewer_id, all `detach`, order 15.)

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

-- ─── erase_account() re-emitted from the 153-entry erasure map + 28 non-FK extras ──
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
      (15::int, 'assembled_reports'::text, 'reviewed_by'::text, 'detach'::text, NULL::text, NULL::text),
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
      (15::int, 'report_orders'::text, 'reviewed_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'report_reviews'::text, 'reviewer_id'::text, 'detach'::text, NULL::text, NULL::text),
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
