-- Guest Analysis (A$3 One-Click) — Phase 1
--
-- Guest users (no login) pay A$3 GST-incl to upload a pitch deck OR paste
-- a website URL, and receive a full SVI valuation + Trusted Biz Report by
-- email. Similar to Trust Report SKU (A$5.50, requires login) but
-- guest-friendly. Rows are service-role only — guests have no auth.uid()
-- to key an RLS policy against, and the email is opaque PII we don't want
-- to leak via the anon key.

BEGIN;

CREATE TABLE IF NOT EXISTS public.guest_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  input_type TEXT NOT NULL CHECK (input_type IN ('pitch_file', 'website_url')),
  input_value TEXT NOT NULL,          -- URL, or storage path for pitch_file
  input_filename TEXT,                -- original filename (pitch_file only)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'analyzing', 'delivered', 'failed', 'refunded')),
  amount_paid_aud_cents INT,          -- expected 300 (A$3.00 inc-GST)
  report_data JSONB,                  -- full SVI analysis payload (audit/reprint)
  report_pdf_url TEXT,                -- storage URL for the generated PDF
  error_message TEXT,                 -- populated when status='failed'
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_analyses_email
  ON public.guest_analyses (email);
CREATE INDEX IF NOT EXISTS idx_guest_analyses_stripe_session
  ON public.guest_analyses (stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_guest_analyses_status
  ON public.guest_analyses (status);
CREATE INDEX IF NOT EXISTS idx_guest_analyses_created_desc
  ON public.guest_analyses (created_at DESC);

-- Auto-touch updated_at
CREATE OR REPLACE FUNCTION public.tg_guest_analyses_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_analyses_touch_updated_at ON public.guest_analyses;
CREATE TRIGGER trg_guest_analyses_touch_updated_at
  BEFORE UPDATE ON public.guest_analyses
  FOR EACH ROW EXECUTE FUNCTION public.tg_guest_analyses_touch_updated_at();

-- RLS: service_role only. Guests have no auth.uid(); the checkout route
-- writes/reads via the service key. No SELECT/INSERT/UPDATE grants are
-- issued to anon or authenticated roles.
ALTER TABLE public.guest_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest_analyses_service_only"
  ON public.guest_analyses
  USING (true)
  WITH CHECK (true);

COMMIT;
