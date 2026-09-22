# SVI account status authority — 2026-09-22

This phase adds a read-only BlockID authority endpoint and closes the same deleted/erased-account gap in BlockID current-user resolution. It does not authorize a wallet, associate a report, charge credits, execute research or revoke every independently issued SVI cookie.

## Contract

POST `/api/internal/svi/account-status`, `Content-Type: application/json`, exact JSON `{v:1,uid,iat,nonce}`. UID is lowercase UUID; nonce is 32 lowercase hex characters; iat is integer Unix seconds with at most 30 seconds clock difference. Body limit is 512 bytes and two seconds including chunked streams. Unknown fields and URL query strings are rejected before DB access.

Header `x-svi-signature` is lowercase hex HMAC-SHA256 using existing server-only `SVI_HANDOFF_SECRET` over this prefix followed by the **exact raw body** (shown escapes represent actual NUL characters):

`blockid-svi-account-status-v1\0https://blockid.au\0POST\0/api/internal/svi/account-status\0`

A 200 response is exact JSON `{v:1,uid,nonce,active,observedAt}`, with integer Unix seconds `observedAt`. Header `x-svi-response-signature` signs its exact raw body using prefix:

`blockid-svi-account-status-response-v1\0https://startupvalueindex.com\0`

Consumers must verify signature, UID, nonce, strict schema and freshness before treating the result as authority. Errors are generic 401 `authentication_required` or 503 `account_status_unavailable`; all responses are private/no-store. No credentials or UID are logged by the endpoint.

## Source and database evidence

Read-only live `information_schema.columns` confirms `app_users.id` is UUID and both `deleted_at` and `erased_at` exist. Endpoint reads only these three columns with a two-second DB abort signal; absent rows and either closure timestamp deny access. DB failure/missing selected fields fail unavailable. No schema migration or database writes are required.

Migration 0102 explicitly allows `anonymized_at` while an account is otherwise live. `privacy/deletion-request.ts` defines a cancellable seven-day `deletion_requested_at` grace period. Neither condition alone revokes access. Latest erasure migration stamps both closure timestamps, removes BlockID sessions, but cannot invalidate an independently signed SVI cookie; consumer integration must call this authority before privileged access.

## Replay and scope

A signed request may be replayed within its 30-second window; every replay performs a fresh read and signs a nonce-bound fresh response. This endpoint never creates a grant or effects a mutation, so a durable replay ledger is unnecessary. Consumers must generate a new cryptographically random nonce for each call and reject mismatched responses. This assertion is only current account closure status, not proof of explicit wallet permissions, report ownership, logout-everywhere state or consent to billing.

## Validation

Focused actual route tests cover signed response binding, forged/domain-confused/body-modified requests, timestamp bounds, UUID and exact schema, byte/time bounded streams, missing/deleted/erased accounts, grace/anonymization semantics, unavailable DB and key, and read-only replay after account closure. Existing auth tests additionally cover deleted/erased rejection. No production account mutation, provider request or deployment was performed by this subtask.

Validation result: 93 tests passed across the actual endpoint and existing auth suites; focused TypeScript checking of endpoint/helper/tests passed.
