# Immutable revision writer rollout — 23 September 2026

The immutable revision writer is live on BlockID.au at source SHA `b926321b31811346b86e48bfe0642522bb28dc77`, release `bhj-k1rh8qss1xlHmf9T_`, active origin `4128`, with `4127` warm. Public and local HTTP returned 200, startup errors were zero, previous chunks remained readable, and the candidate was marked good after the founder-authorized 60-second accelerated soak. Unit, browser, extended review, and broad crawl suites remain explicitly deferred and are not reported as passes.

After a confirmed `svi_snapshots.report_v2` write, full trusted-report runs now insert a new `report_revisions` UUID and 32-character share token, read the row back, compare the JSON document, and return that immutable token to report/PDF/export callers. Re-score runs use the same writer. A missing table, write error, revoked/mismatched read-back, or invalid ReportV2 fails closed instead of returning the mutable daily snapshot token. The daily snapshot remains as a compatibility projection for existing callers.

Migration 0410 was already applied in the live database and remains empty until a real report run exercises the writer. Its source SQL is still deferred from the release because the schema-authority controller requires an expanded compatibility/rollback transition; this deploy intentionally contains no new schema digest. No production report was generated solely for this rollout, so no customer row was rewritten or backfilled. The next evidence step is a controlled real report run with revision-row/hash/permission/read-back reconciliation, followed by authority-approved migration source restoration.

DeepInfra remains the only paid inference provider and the shared report budget remains capped at US$0.50/report. O08 retains all artifacts and warm rollback; automated quiescence and detached-work coverage remain incomplete.

