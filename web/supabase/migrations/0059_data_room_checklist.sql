-- Data Room Checklist — per-user fundraising checklist surface
-- Powers Fundraising Readiness Report v2 "Fundraising Checklist" section.
--
-- Each row is one document/artefact the founder needs ready for a raise
-- (e.g. "Pitch Deck", "Cap Table", "Customer Contracts"). Status drives the
-- completion percentage on the PDF.

CREATE TABLE IF NOT EXISTS data_room_checklist (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        text        NOT NULL,
  category     text        NOT NULL DEFAULT 'general',
  status       text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'complete', 'not_applicable')),
  priority     text        NOT NULL DEFAULT 'P1'
                            CHECK (priority IN ('P0', 'P1', 'P2')),
  notes        text,
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_room_checklist_user
  ON data_room_checklist(user_id, status);

ALTER TABLE data_room_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_room_checklist_service_all ON data_room_checklist
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY data_room_checklist_owner_select ON data_room_checklist
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY data_room_checklist_owner_insert ON data_room_checklist
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY data_room_checklist_owner_update ON data_room_checklist
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY data_room_checklist_owner_delete ON data_room_checklist
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
