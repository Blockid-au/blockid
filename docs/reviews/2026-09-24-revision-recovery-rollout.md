# Revision unknown-commit recovery rollout — 24 September 2026

The report revision writer recovery guard is live on BlockID.au at SHA `619631e0f94023ca8f77a71e333e96ba28a0ea1a`, release `AwniAGMMkLOAYnxAihzSt`, active origin `4129`, with `4128` warm. Public/local HTTP returned 200, startup errors were zero, previous chunks remained readable, and mark-good completed after the accelerated 60-second soak. Unit, browser, extended review, and broad crawl suites remain deferred and are not counted as passes.

`insertImmutableReportRevision` now canonicalizes the ReportV2 JSON, computes a SHA-256 document hash, and looks up an existing non-revoked revision for the same snapshot/hash before inserting. If a prior PostgREST commit succeeded but its response was lost, retry reuses the existing revision ID/token instead of creating a duplicate public revision. New inserts still require exact JSON read-back; missing schema, errors, or mismatches fail closed.

No schema migration was added in this phase. Migration 0410 remains applied in production, with source restoration deferred to the schema-authority compatibility/rollback transition. No customer report was generated solely for deployment validation, so controlled real-run reconciliation of duplicate recovery, permissions, and revision history remains the next evidence gate. DeepInfra-only and the US$0.50/report shared text+vision budget remain unchanged.

