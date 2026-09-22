# G30 — creator-bound question research scope

Candidate00e869e implements the next scoped integration after legacy writer containment. GET `/api/research/intent` accepts only one exact run ID and one of the16 supported question IDs. It resolves the authenticated creator and both current report hashes exactly once, derives `svi:field:<questionId>` on the server and returns private/no-store with Cookie variance. Caller-supplied business, owner, revision, hash, price or scope is rejected. Shared login is not treated as wallet authority.

Each question now has a distinct versioned research brief: specific investigation dimensions, preferred primary-source types, counter-evidence to seek and expected answer sections. Competition targets3–5 sourced alternatives where available; valuation distinguishes enterprise/equity values, dates and scenarios; monitoring requires comparable periods and metric definitions. Missing business context remains explicit. Existing report metadata is labelled unverified, and raw deck text, financial records and previous generated answers are not copied into query drafts. Draft queries are never executed or sent externally; disclosure requires review/consent. These briefs are instructions for future research, not research findings or proof of claim accuracy.

The endpoint remains explicitly unavailable for execution: no job, quote, reservation, provider request, credit charge, publication or score change. It does not make the disabled legacy route available again. Existing report reading and public rollback containment remain unchanged.

Ten focused tests passed across per-question coverage, missing context, private-field exclusion, output isolation, exact query/owner/revision checks and the actual route with signed/forged/expired cookie fixtures. Full build and live acceptance are recorded below after completion. Tests use synthetic data and do not call providers.

The candidate port range extends by one to4211 while retaining existing memory, CPU, disk and process checks. Previous origins remain running; no BlockID capacity setting changes. Build uses an isolated release checkout and the shared deployment lock.

Next: verified account/wallet mapping and lifecycle, actual market discovery with retained sources and semantic review, then exact quote/consent/reservation/durable job/publication/capture. Customer research and qualified score/valuation updates remain gated. The user-visible saved findings have not been enriched by this planning endpoint alone; G30 is still in progress.

## Next admission work refined by source review

BlockID auth resolves sessions.user_id to app_users.id; its SVI handoff signs that exact user ID, and credit balances are keyed by user ID. This establishes an identity join, not a spend grant or report account membership. Existing request-contract.ts requires explicit resource/account/site/wallet authorization and stored quote/intent expiry. A future adapter must read authoritative records and return unavailable when an association is missing, never manufacture wallet or account IDs.

The SVI handoff and session formats currently share a key and lack token-purpose separation and consumed handoff nonce. Session verification does not consult current BlockID account revocation/erasure. Prioritize purpose/audience separation and replay/lifecycle handling before paid activation; preserve existing signed creator records through a deliberate key migration policy. BlockID erasure-map.ts does not yet coordinate SVI filesystem records. Per-report export/revocation is not account-wide erasure, and large accepted histories still require export pagination. These are concrete next implementation items, not completed features.

## Live acceptance —22 September 2026,15:13 UTC

Compiled `00e869e9619a591dae9137ec34a7c57d1bc70ab2`, BUILD `PbCedZvrDkDcj7G-3nWvR`, serves4211; previous1a68b9a/4210 remains warm. Full production build/type gate passed in1m42s with1.9 GiB peak memory. Promotion, actual rollback4211→4210 and forward passed; legacy public analysis remained503/private-no-store during rollback. Six static assets and81 unchanged pre-existing raw report hashes passed. Direct/public `/live` and `/vi/live` returned200; direct/public unauthenticated intent returned401/private-no-store. Monitor remained active and the new unit is boot-enabled. Non-SVI nginx and BlockID robots stayed identical. No providers, customer writes, paid admission or credit charges were used.

Logs: `/tmp/svi-g30-intent-{tests,build-final,launch,static,promote,rollback,rollback-guard,forward,finish}.log`. One initial preparation stopped on an invalid temporary rollout SHA before artifact creation; its pin was corrected before the accepted build. No existing origin was stopped. BlockID remains3.33.0/cc229ad49 at4108. This live endpoint does not yet add customer-facing research results; execution remains disabled.
