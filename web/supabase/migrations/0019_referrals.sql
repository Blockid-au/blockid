-- Referral tracking
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.app_users(id);
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS referral_credits_earned integer NOT NULL DEFAULT 0;

-- Generate referral codes for existing users
UPDATE public.app_users SET referral_code = substr(md5(id::text || created_at::text), 1, 8) WHERE referral_code IS NULL;

-- Referral events log
CREATE TABLE IF NOT EXISTS public.referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.app_users(id),
  referred_id uuid NOT NULL REFERENCES public.app_users(id),
  credits_awarded integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(referred_id)  -- each user can only be referred once
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON public.referral_events(referrer_id);
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;
