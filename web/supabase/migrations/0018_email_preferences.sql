-- Email subscription preferences per user
CREATE TABLE IF NOT EXISTS public.email_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.app_users(id) ON DELETE CASCADE,
  email text NOT NULL,
  -- Subscription categories
  weekly_reports boolean NOT NULL DEFAULT true,
  product_updates boolean NOT NULL DEFAULT true,
  promotions boolean NOT NULL DEFAULT true,
  svi_alerts boolean NOT NULL DEFAULT true,
  payment_receipts boolean NOT NULL DEFAULT true,  -- cannot unsubscribe (transactional)
  -- Global unsubscribe
  unsubscribed_all boolean NOT NULL DEFAULT false,
  -- Unsubscribe token (for one-click unsubscribe from email)
  unsubscribe_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_email_prefs_email ON public.email_preferences(email);
CREATE INDEX IF NOT EXISTS idx_email_prefs_token ON public.email_preferences(unsubscribe_token);
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
