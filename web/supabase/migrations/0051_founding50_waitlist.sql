-- Founding 50 membership waitlist
-- Collects early adopters who want lifetime access to BlockID tools
-- RLS enforced: insert-only for anonymous/authenticated users, read-only for admin

CREATE TABLE IF NOT EXISTS founding50_waitlist (
  email text PRIMARY KEY,
  name text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_founding50_joined_at ON founding50_waitlist(joined_at DESC);

-- Row-level security: anonymous users can insert (waitlist signup), but cannot read
ALTER TABLE founding50_waitlist ENABLE ROW LEVEL SECURITY;

-- Anon/authenticated: insert-only (users sign up)
CREATE POLICY founding50_waitlist_insert_anon
  ON founding50_waitlist FOR INSERT
  WITH CHECK (true);

-- Service role: full access (admin reads, exports)
-- (no explicit policy needed; service role bypasses RLS by default)

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
