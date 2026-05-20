-- Referrals v2: richer tracking with status flow (pending → signed_up → converted).
-- Complements the existing referral_events table with detailed per-referral state.

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.app_users(id),
  referrer_email text NOT NULL,
  referred_email text NOT NULL,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending, signed_up, converted
  credits_awarded int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals (referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_id);
