# G30 — Shared report reader bridge

Source `0cb6d0bda47bd870d0467e7964e35a9cf8fb076c` moves both public share pages (English and Vietnamese) onto the same `loadReportV2ByShareToken` reader used by the PDF path. The bridge validates a stored ReportV2 document first and uses the existing adapter only for legacy rows, so the web report and PDF now share the same document-selection rule. Existing snapshot lookup remains for the legacy progress projection and token identity; no token or historical row is rewritten.

Live deployment completed 23/09/2026: active origin 4126, warm rollback 4125, release `Pif2Awnr1rTeflH3wHS3q`, local/public/auth/static smoke checks passed, startup errors 0, and the compiled public SHA matched the source. Mark-good completed with extended review deferred. The first attempt was blocked by exhausted origin capacity; origin 4123 was then retired under the shared lock using the exact unit identity, with zero tracked activities/unresolved jobs observed, artifacts preserved and scoped unknown-work acknowledgement retained.

No schema migration, writer change, revision table or provider/budget change is included. The reader bridge is backward-compatible; immutable revision persistence remains the next phase because token consumers, consent/view tracking, PDF, email and daily snapshot writers must be migrated together.

Additional tests, browser acceptance, rollback drill and paid inference were deferred under the founder instruction and are not passes. DeepInfra-only and the US$0.50/report ceiling remain unchanged.
