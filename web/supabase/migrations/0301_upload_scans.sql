-- 0301_upload_scans.sql
-- Malware-scan audit trail for /api/upload.
--
-- Master Upgrade Plan §5.3 — every authenticated upload is scanned by clamd
-- (INSTREAM protocol, fail-CLOSED on timeout or scanner error) BEFORE the
-- bytes land on disk. This table records every scan verdict — clean,
-- infected, or scanner_error — so:
--   * infected uploads are attributable to the user who attempted them
--     (abuse pattern detection: repeat offenders, coordinated campaigns);
--   * scanner_error windows are visible to ops (a spike means clamd is down
--     and legitimate uploads are being 503'd);
--   * the fix that put us here (stored-XSS via caller-supplied filename,
--     commit 68994a3c) has a companion record proving the bytes were also
--     screened for known-bad content, not just for a safe extension.
--
-- filename_stored is the server-generated name (see route.ts generateFilename
-- — derived from validated MIME, never from user-supplied file.name). Storing
-- the caller's original name here would smuggle attacker-controlled text into
-- an admin surface for no operational benefit.
--
-- Idempotency: DDL is IF NOT EXISTS; the table has no natural unique key
-- because a user may legitimately re-scan the same bytes.
--
-- RLS: enabled defense-in-depth. All app writes go through the service-role
-- key (BYPASSRLS). No SELECT policy is defined — reads are ops-only via the
-- service role.
--
-- Reserved lane: 03xx per the header note in 0270_report_orders.sql. 0300 is
-- already taken (0300_seed_sprocketbay_journey.sql); this claims 0301.

BEGIN;

CREATE TABLE IF NOT EXISTS public.upload_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Attribution. Nullable only in the vanishingly rare case that we scan
  -- before auth (we do not today) — kept NOT NULL to enforce that ordering.
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,

  -- The server-generated filename actually written to disk (or that would
  -- have been written, on the infected/scanner_error paths). Never the
  -- attacker-supplied file.name — see header.
  filename_stored text NOT NULL,

  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  mime_type text NOT NULL,

  -- Verdict. 'clean' → bytes were written; 'infected' → 422 returned, bytes
  -- discarded; 'scanner_error' → 503 returned, bytes discarded (fail-CLOSED).
  verdict text NOT NULL
    CHECK (verdict IN ('clean','infected','scanner_error')),

  -- Populated only on 'infected'. Free-form so a future signature-name
  -- change from ClamAV upstream does not need a schema migration.
  signature text,

  -- e.g. "ClamAV 1.4.3/28078/…". Nullable — best-effort probe; missing on
  -- scanner_error means clamd was unreachable at both scan and version time.
  scanner_version text,

  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_scans_user_idx
  ON public.upload_scans (user_id);

CREATE INDEX IF NOT EXISTS upload_scans_verdict_idx
  ON public.upload_scans (verdict);

CREATE INDEX IF NOT EXISTS upload_scans_scanned_at_idx
  ON public.upload_scans (scanned_at DESC);

ALTER TABLE public.upload_scans ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.upload_scans IS
  'ClamAV scan audit trail for /api/upload. One row per scan attempt. Master Upgrade Plan §5.3.';

COMMENT ON COLUMN public.upload_scans.filename_stored IS
  'Server-generated filename (from validated MIME). Never the caller-supplied file.name — see route.ts generateFilename.';

COMMENT ON COLUMN public.upload_scans.verdict IS
  'clean = 200; infected = 422 with signature; scanner_error = 503 (fail-CLOSED on timeout or unreachable clamd).';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
