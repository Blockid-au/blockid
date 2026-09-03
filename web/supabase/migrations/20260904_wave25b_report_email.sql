-- Wave 25 Phase B: idempotency guard for the auto-emailed Trusted Business
-- Report. When the SSE `dimensions/stream` finishes and criteria synthesis
-- succeeds, the server fires a fire-and-forget email to the founder with the
-- executive summary + share link + PDF attachment. `report_email_sent_at`
-- records the send timestamp so repeat runs on the same snapshot do NOT
-- duplicate the delivery. NULL = never sent.

ALTER TABLE public.svi_snapshots
  ADD COLUMN IF NOT EXISTS report_email_sent_at TIMESTAMPTZ;

-- No index needed — the column is read/written only on the specific snapshot
-- row being emailed (already looked up by id / share_token which are indexed).
