-- Add Stripe customer ID to app_users for subscription management.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_app_users_stripe_customer ON app_users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
