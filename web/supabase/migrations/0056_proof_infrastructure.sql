-- T0064: Proof Infrastructure MVP
-- Adds tamper-evident proof anchoring for SVI score snapshots.

-- ── trust_events ────────────────────────────────────────────────────────────
-- Append-only audit log for any verifiable event in the BlockID system.

CREATE TABLE IF NOT EXISTS trust_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text        NOT NULL CHECK (entity_type IN ('score', 'document', 'cap_table')),
  entity_id    text        NOT NULL,
  event_type   text        NOT NULL CHECK (event_type IN ('created', 'updated', 'verified')),
  hash         text        NOT NULL,
  metadata     jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trust_events_entity
  ON trust_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trust_events_hash
  ON trust_events (hash);

ALTER TABLE trust_events ENABLE ROW LEVEL SECURITY;

-- Only service role may write; public can read (needed for verify page SSR)
CREATE POLICY trust_events_service_all ON trust_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY trust_events_public_read ON trust_events
  FOR SELECT TO anon USING (true);

-- ── score_proofs ─────────────────────────────────────────────────────────────
-- One row per anchored proof for a score snapshot.

CREATE TABLE IF NOT EXISTS score_proofs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id        text        NOT NULL,
  hash            text        NOT NULL UNIQUE,
  canonical_json  text        NOT NULL,
  anchored_at     timestamptz NOT NULL DEFAULT now(),
  anchor_method   text        NOT NULL DEFAULT 'local' CHECK (anchor_method IN ('local', 'blockchain')),
  verified        boolean     NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_score_proofs_score_id
  ON score_proofs (score_id, anchored_at DESC);

ALTER TABLE score_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY score_proofs_service_all ON score_proofs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY score_proofs_public_read ON score_proofs
  FOR SELECT TO anon USING (true);
