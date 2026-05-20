-- Migration: Support fractional (decimal) credits
--
-- Previously all credit columns were INTEGER. With fractional pricing
-- (e.g. 0.50 credits per SVI analysis), we need NUMERIC precision.

-- credit_balances: balance, lifetime_earned, lifetime_spent
ALTER TABLE public.credit_balances
  ALTER COLUMN balance TYPE NUMERIC(10,2),
  ALTER COLUMN lifetime_earned TYPE NUMERIC(10,2),
  ALTER COLUMN lifetime_spent TYPE NUMERIC(10,2);

-- credit_transactions: amount, balance_after
ALTER TABLE public.credit_transactions
  ALTER COLUMN amount TYPE NUMERIC(10,2),
  ALTER COLUMN balance_after TYPE NUMERIC(10,2);

-- usage_logs: credits_used
ALTER TABLE public.usage_logs
  ALTER COLUMN credits_used TYPE NUMERIC(10,2);

-- svi_analysis_usage (legacy gate table): credits_remaining, total_analyses
ALTER TABLE public.svi_analysis_usage
  ALTER COLUMN credits_remaining TYPE NUMERIC(10,2),
  ALTER COLUMN total_analyses TYPE NUMERIC(10,2);
