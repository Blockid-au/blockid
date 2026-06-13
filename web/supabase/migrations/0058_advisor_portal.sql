-- Advisor portal: advisors/accountants managing multiple startup clients

CREATE TABLE IF NOT EXISTS advisor_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  advisor_email text NOT NULL,
  invited_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending, accepted, declined
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(advisor_id, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_advisor_invites_advisor ON advisor_invites(advisor_id);
CREATE INDEX IF NOT EXISTS idx_advisor_invites_email ON advisor_invites(invited_email);

CREATE TABLE IF NOT EXISTS advisor_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',  -- active, revoked
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(advisor_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_advisor_clients_advisor ON advisor_clients(advisor_id);
CREATE INDEX IF NOT EXISTS idx_advisor_clients_client ON advisor_clients(client_id);

ALTER TABLE advisor_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_clients ENABLE ROW LEVEL SECURITY;

-- Advisors can manage their own invites and see their client relationships
CREATE POLICY advisor_invites_own ON advisor_invites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY advisor_clients_own ON advisor_clients
  FOR ALL TO service_role USING (true) WITH CHECK (true);
