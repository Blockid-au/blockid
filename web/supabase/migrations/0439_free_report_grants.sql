-- 0439_free_report_grants.sql — the free-allowance ledger (two free reports per e-mail)
-- ---------------------------------------------------------------------------
-- G25-C (2026-09-21, docs/plans/g25-remove-pilot-claude-cli-2026-09-21.md
-- lane C). Founder decision 2026-09-21 (verbatim): "cho phép phân tích 2 lần
-- đầu miễn phí, nhưng cần ghi nhận email để gởi report về và ghi nhận vào hệ
-- thống số lượng người submit và nhận report biz" — the first TWO business
-- reports per e-mail address are free, the address is REQUIRED before the
-- run so the report can be e-mailed, and the system must record how many
-- people submitted and how many received the report.
--
-- One row per free report granted. The row is RESERVED before the analysis
-- runs (delivery_status = queued, analysis_id NULL), attached to the saved
-- `analyses` row once it exists, and stamped delivered when the PDF e-mail
-- goes out (lib/reports/free-grants.ts). A run that never saved releases
-- (deletes) its reservation.
--
--   email_hash        sha256 of the NORMALISED address (lower-case, plus-tag
--                     stripped, dots stripped on gmail-style domains) — the
--                     identity the allowance is counted on
--   email             the address as given (lower-cased) — plain text, the
--                     same PII practice as analyses.full_report_email /
--                     svi_accounts.email; erased via NON_FK_EXTRAS (by email)
--   project_id        optional FK → projects (SET NULL). The guest path has
--                     no project; a signed-in run may attach one later.
--   analysis_id       the `analyses` row the report was written on (no FK —
--                     AGENTS.md: FKs to projects only)
--   ip_hash           lib/iphash.ts hashIp() — sha256 + DAILY-ROTATING salt,
--                     so the "≤ 3 free reports per IP per day" guard works
--                     and the same network looks different tomorrow
--   sequence_no       1 | 2 — which of the two free reports this is; UNIQUE
--                     with email_hash, so two concurrent submissions can never
--                     both be "the first" and a third can never be inserted
--   source            guest | account — where the address came from
--   delivery_status   queued | sent | failed
--
-- RLS: service-role only (the route and the cron write with the admin
-- client; nothing in the browser reads this ledger). Idempotent. NOT applied
-- by the lane — the merging session applies via scripts/db/apply-migration.sh
-- and commits content/reports/schema-migrations.json.
--
-- Rollback
--   DROP TABLE IF EXISTS public.free_report_grants;

CREATE TABLE IF NOT EXISTS public.free_report_grants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash       text NOT NULL,
  email            text NOT NULL,
  project_id       uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  analysis_id      uuid NULL,
  ip_hash          text NULL,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz NULL,
  delivery_status  text NOT NULL DEFAULT 'queued',
  sequence_no      smallint NOT NULL,
  source           text NOT NULL DEFAULT 'guest',
  created_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'free_report_grants_delivery_status_check') THEN
    ALTER TABLE public.free_report_grants
      ADD CONSTRAINT free_report_grants_delivery_status_check
      CHECK (delivery_status IN ('queued', 'sent', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'free_report_grants_sequence_no_check') THEN
    ALTER TABLE public.free_report_grants
      ADD CONSTRAINT free_report_grants_sequence_no_check
      CHECK (sequence_no IN (1, 2));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'free_report_grants_source_check') THEN
    ALTER TABLE public.free_report_grants
      ADD CONSTRAINT free_report_grants_source_check
      CHECK (source IN ('guest', 'account'));
  END IF;
END $$;

-- The allowance itself: one row per (address, sequence). The database is
-- the arbiter of "first" and "second"; a third insert fails.
CREATE UNIQUE INDEX IF NOT EXISTS free_report_grants_email_seq_uidx
  ON public.free_report_grants (email_hash, sequence_no);

-- markDelivered() finds the grant by the analysis it was written on.
CREATE UNIQUE INDEX IF NOT EXISTS free_report_grants_analysis_uidx
  ON public.free_report_grants (analysis_id)
  WHERE analysis_id IS NOT NULL;

-- The daily platform cap + the 7-day sparkline read by submitted_at.
CREATE INDEX IF NOT EXISTS free_report_grants_submitted_idx
  ON public.free_report_grants (submitted_at DESC);

-- The per-IP-per-day abuse guard.
CREATE INDEX IF NOT EXISTS free_report_grants_ip_day_idx
  ON public.free_report_grants (ip_hash, submitted_at DESC)
  WHERE ip_hash IS NOT NULL;

-- Erasure by address (NON_FK_EXTRAS, by: email).
CREATE INDEX IF NOT EXISTS free_report_grants_email_idx
  ON public.free_report_grants (lower(email));

COMMENT ON TABLE public.free_report_grants IS
  'G25-C: the free-allowance ledger — one row per free business report granted to an e-mail address (sequence_no 1 | 2). Reserved before the run, attached to the analyses row, stamped delivered when the PDF e-mail goes out. Service-role only. Metrics: /api/status free_reports, /admin/funnel "Free reports".';
COMMENT ON COLUMN public.free_report_grants.email_hash IS
  'sha256 of the normalised address (lower-case, plus-tag stripped, dots stripped for gmail-style domains) — the identity the two-free rule is counted on.';
COMMENT ON COLUMN public.free_report_grants.ip_hash IS
  'lib/iphash.ts hashIp(): sha256 + daily-rotating salt. Never a raw IP.';
COMMENT ON COLUMN public.free_report_grants.delivery_status IS
  'queued (reserved / report not yet e-mailed) | sent (PDF e-mail accepted by the provider) | failed (send failed; the cron retries the analyses row)';

-- ─── RLS: service-role only ───────────────────────────────────────────────

ALTER TABLE public.free_report_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS free_report_grants_service_all ON public.free_report_grants;
CREATE POLICY free_report_grants_service_all ON public.free_report_grants
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
