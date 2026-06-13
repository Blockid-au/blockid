-- Custom branding for Growth plan users
-- Stores per-user logo, brand colours, and report customisation.

CREATE TABLE IF NOT EXISTS brand_settings (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#2563eb',
  accent_color text NOT NULL DEFAULT '#f59e0b',
  report_header text NOT NULL DEFAULT '',
  footer_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brand_settings ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own brand settings
CREATE POLICY brand_settings_owner ON brand_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role has full access
CREATE POLICY brand_settings_service ON brand_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
