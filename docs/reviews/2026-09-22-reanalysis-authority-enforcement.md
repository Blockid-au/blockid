# Draft scoped research authority enforcement — 2026-09-22

Status: isolated implementation, not live admission or customer execution. This change extends the existing 0446 reservation/consent/worker functions through draft migration 0448. It depends on the reviewed 0443/0446 financial drafts and the exact 0447 authority schema from `faad81cfe4371a163b5c3e604f8fe5e9c80fde56`. No byte of 0447 was changed, no migration was applied to production, and no applied-manifest entry was added.

## Enforcement

- Existing `enqueue_consented_reanalysis` resolves the real stored quote and its association/grant rather than accepting caller-invented wallet permission. The exact existing consent JSON bytes must equal immutable stored quote terms. Its existing terms digest, report binding, amount, expiry, scope, audit insertion and retry checks remain intact.
- The real actor must equal the personal account, payer, wallet owner and granting user. Both account `deleted_at` and `erased_at` must be null. Association and grant must be valid now, unrevoked and bound to the exact wallet, site, report, business, revision, input hash and immutable snapshot reference.
- Quote ID also remains part of the stored job intent. Its immutable foreign-key associations bind the job to association and grant; no caller-provided association IDs or grants are trusted. Stored requester, payer, wallet, pricing version, exact microcredit amount, request hash, terms bytes/digest and expiry are checked transactionally.
- The request-hash SQL mirrors the existing application array encoding with sorted/deduplicated scope IDs; tests compare compact JSON hashes, including spaces, escaping and non-ASCII text. The supported application scope registry currently uses ASCII identifiers.
- Only current BlockID personal reports are supported. A real `analyses` row is locked and re-read. Its current input and full report are rehashed using the unchanged 0447 producer format, and the entire sealed payload must match. Initial `reanalysis_heads` adoption uses the authoritative association, not the caller's supplied baseline.
- Claim and finalization repeat account/report/grant/quote validation and require the existing immutable job consent to match the stored quote. A stale or revoked scope cannot claim new provider work, publish a draft revision or capture credits. Failed validation raises before mutation; the held balance remains available to the existing cancellation/release or erasure reconciliation path.
- New helper functions and bare enqueue have no service-role execution privilege. Existing public entry points remain server-only; no feature flag, customer route, quote producer, association creator or browser mutation privilege is added.

## Locking and expiry

Personal actor=payer account locks come first using `FOR NO KEY UPDATE`, compatible with legacy spend FK checks and the prior receipt deadlock correction. Current analysis and wallet are locked before association/grant/quote and before job/head finalization. This is consistent with the actual owned-report connection producer; account serialization prevents inversions with revoke. Current analysis writers block while the transaction validates and records its result.

Conservatively, quote, association and grant must still be valid at worker claim and finalization. Expiry never silently captures a hold. Future quote production must choose a clear expiry policy/TTL; this draft does not extend expired quotes or manufacture authorization. Existing completed-result replay can also be denied after authority expiry/revocation; separate read authorization and status/reconciliation remain future application responsibilities.

## Validation and limitations

The isolated PostgreSQL harness loads unchanged 0447 from its exact Git object, applies 0448 twice, and uses owner-seeded synthetic quotes explicitly because no quote producer exists. It runs with no network, host ports or mounts, existing image only, bounded CPU/memory, tmpfs data and exact per-run cleanup. The shared receipt fixture now creates UTF8 databases so canonical text tests exercise valid production-style Unicode rather than SQL_ASCII conversion failures.

**14 isolated PostgreSQL tests passed**, including migration reapplication. No full application build or production provider test was run for this SQL-only phase.

Covered cases: valid concurrent duplicate approval/capture; actor, wallet, site, snapshot and revision mismatch; forged consent/scope; stored pricing/amount/hash mismatch; changed live report; deleted/erased account; revoked worker/finalization; expired quote/association/grant; deterministic revoke-before-reserve locking; refund after revocation; report-erasure cascade and retained hold reconciliation; forbidden helper/bare enqueue and quote insertion privileges.

Missing producers and lifecycle contracts remain explicit blockers to activation:

1. Trusted immutable quote production is absent; service_role cannot INSERT into quotes. No amount, entitlement, price version or human approval was fabricated here.
2. SVI signed-creator association production and filesystem/database publication protocol are absent. `startupvalueindex.com` authority is rejected by this draft helper until those contracts are implemented.
3. The existing finalizer stores the scoped revision/head/receipt transaction; it does not yet publish a new `analyses.full_report_json` or SVI report artifact. A complete result publication protocol, report-writer integration, provider worker and budget settlement are still required.
4. Durable research result/consent erasure and hold reconciliation require their separate lifecycle phase. This change does not bypass immutable audit triggers, delete holds or silently charge revoked/erased accounts.

Keep 0443–0446 and 0448 deferred outside the canonical production migration directory until the controlled financial cutover. Independent 0447 deployment does not imply paid research is enabled.
