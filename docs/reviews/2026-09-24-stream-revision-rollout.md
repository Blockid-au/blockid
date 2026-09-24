# Stream immutable revision rollout — 24 September 2026

The legacy stream report pipeline now writes the same immutable `report_revisions` artifact as full and rescore runs. After the daily `svi_snapshots.report_v2` projection is confirmed, `defaultPersistSnapshot` inserts/read-backs the revision; the stream marks its save status as `save_failed` when the immutable write is not confirmed. Custom dependency seams remain backward compatible for callers that do not provide the optional revision flag.

This phase is live at SHA `a0b6f6f7d008002cfbc362928a93a3cec082c477`, release `UWb-4fqM84OsmXgqVWEU5`, active origin `4130`, warm `4129`. Public/local HTTP returned 200, startup errors were zero, previous chunks remained readable, and mark-good completed after the accelerated 60-second soak. Unit, browser, extended review, and broad crawl suites remain deferred and are not counted as passes.

Origin `4124` was retired before admission because the six-origin cap was full. Its exact unit/SHA was checked, tracked activities and unresolved jobs were zero, the artifact remains retained, and detached-work coverage remains explicitly unknown. Migration 0410 was unchanged; DeepInfra-only and the US$0.50/report budget remain unchanged.

