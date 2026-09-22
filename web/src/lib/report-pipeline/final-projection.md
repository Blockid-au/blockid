# Final report projection (F02)

New canonical runs project dimension markdown, scores, insights and criterion cards from the validated final ReportV2 after auditing and consistency gates. Those projections replace the earlier streaming copies before snapshot/deck-cache persistence. A `final_projection` event follows the awaited save attempt and precedes `done`; save failure retains generated final content with the existing `save_failed` contract. The client replaces the affected sections, uses the canonical cover SVI for full runs, persists this display projection locally, and resets the completion callback guard for retries. Legacy streams without this event retain their existing rendering path.

Partial runs project only the requested dimensions and their criterion cards. Untouched UI dimensions/cards remain, and no new full-report canonical SVI is claimed; the existing weighted partial total remains the fallback. This does not create a durable saved full-report revision for a partial retry.

Deck caches keep the existing array-shaped `dim_results` column. The first array entry includes the final display projection and valuation chapter; old readers ignore these extra keys. New readers require this metadata and the updated cache version, replay canonical projected fields rather than old preview copies, and validate the monetary display shape. Hashes now include the resolved project, tier and locale in addition to deck content; owner scoping remains on the query. Pre-change preview-only cache entries are misses. Cache replay has no durable snapshot receipt and reports `saveStatus=not_requested`.

Remaining limitations:

- Snapshot/projection and ReportV2 writes remain separate operations; this does not provide atomic multi-store persistence, immutable revisions or authenticated cache provenance.
- `reportId` identifies the generated document, not proof that it was saved. Snapshot identity still travels in the existing terminal server event; this change does not redesign report-link resolution.
- F03 now scopes browser results to the authenticated user and resolved project plus full received deck and effective report tier/locale, using SHA-256. Old project-only keys are ignored without deletion. Stored-project runs without a supplied deck still lack an immutable backend input revision; browser storage is a convenience cache, not a save receipt or access-control decision.
- Dimension audit revisions that only set audit flags without rewriting structured source fields remain an upstream issue. This patch makes displays agree with the final canonical document; it cannot certify that every audit finding was actually resolved.
- Executive structured-versus-narrative reconciliation and all legacy independent report readers remain separate work. Historical reports are not rewritten.

Tests exercise actual consistency-gate removal of unsupported TRE revenue, corrected scores/verdicts across persistence and final SSE, delayed save ordering, cache replay despite differing preview fields, scoped cache keys, legacy-cache rejection, client replacement/partial merge, malformed restore data and canonical zero total. No live APIs, AI inference, DB migrations or deployment are used.
