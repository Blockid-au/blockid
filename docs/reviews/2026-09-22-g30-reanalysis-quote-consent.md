# RA1 exact displayed quote consent — 2026-09-22

Isolated `g30-reanalysis-consent` from `fa4d068bf`. No route, provider call, SQL apply, payment activation, primary edit or shared cache write.

## Existing coverage and the actual missing gate

`request-contract.ts::prepareReanalysisRequest` already validates actor, authenticated site, business/account, revision/input hash, normalized criterion/question scope, research mode/policy/cutoff, wallet authority, stored quote intent and expiry. Reimplementing these checks would create a competing admission engine, so the new helper delegates to it.

The existing request carries acceptedQuoteId, but not the digest of the terms actually displayed. If a server quote record reused an ID while its price/version/expiry changed after display, the old request could pass base admission with the newly stored terms. This is a source-level gap, not evidence that a live customer was mischarged. An explicit report record/base snapshot and report-specific revision permission also were not part of a displayed approval contract.

## Implemented reusable helper

`quote-consent.ts` builds one canonical displayed projection from fresh server quote/auth/report context and verifies explicit approval against its SHA-256. The projection binds actor, site, business, account, report ID, base revision, input hash, immutable snapshot-reference digest, normalized scopes/version, research mode/policy/cutoff, wallet/payer, quote ID/pricing version, exact microcredits, displayed decimal credits and expiry. It includes that a saved successful scoped result is required for charging and scores may decrease or remain unchanged.

Report-level read/create-revision permission is mandatory, not inferred from business access. Stored reference text is not exposed in the display; its digest binds the immutable reference. Amounts incompatible with0443/0446's .01-credit precision reject rather than rounding. Same-ID repricing, expiry extension, actor/report/site reuse or source-policy changes require a new display and approval. Expired quote/stale revision fail through existing admission before any side effect.

The client approval is an explicit echo of displayed terms, not a signature or proof a human read the page. The future authenticated server route must obtain fresh authoritative state, perform normal request/session protections, call this helper, and persist its audit receipt immutably. Repeated approval of the same terms has a stable receipt ID; first acceptedAt must be preserved on durable replay. The helper returns `executionAllowed=false` and a required persistence/storage integration step. It never reserves, charges, starts research, replaces a report or invokes the0446 adapter.

##0446 integration prerequisites, still open

The existing draft0446 checks quote expiry and CAS revision/input/snapshot at reservation; its TS adapter already demands fresh authorization/quote validation. Add the consent receipt check/persistence to that actual boundary before routing new paid behavior. Resolve report ID to the same authorized immutable snapshot and retain that relationship; do not let browser paths or mutable latest pointers act as snapshot evidence.

Do **not** inject the entire receipt (including acceptedAt/actor-specific audit data) into the current scope fingerprint.0446 derives scope identity from intent fields except a known excluded list; adding volatile receipt fields there would bypass deduplication and released-attempt lineage. Persist audit data separately with explicit stable report/scope binding, or deliberately evolve the fingerprint contract with focused concurrency cases. Existing payer/business/scope deduplication and requester ownership protection must remain intact. No migration was changed or applied in this task.

Authoritative quote immutability, report resolver/ACL policy for both sites, consent storage and0446 consumption are necessary before activation. A shared authenticated UID does not authorize a shared wallet. User-observed historic credit behavior remains unresolved until actual receipt evidence; this pure helper makes no claim to reconcile it.

## Focused verification

15 tests passed (7 consent cases plus8 existing admission cases), standalone `/tmp/g30-consent-vitest.config.mjs`, private `/tmp/g30-consent-private-cache/vite`, cache disabled. Includes same-ID price/version/expiry changes, cross-site/actor/report replay, stale input/revision, report permission, research/scope/snapshot changes, repeated scope/receipt identity, explicit approval and exact ledger precision. Targeted lint passed. No broad TS/build or deployment.
