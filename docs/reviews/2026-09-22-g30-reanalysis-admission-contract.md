# G30 RA0/RA1 admission contract — implementation evidence

Branch based on BlockID `c0ac5d9ce`; SVI source inventory remains sibling HEAD `f172362d6f31bc40c6c27ba367a3e09e9f170953`. No live requests, SQL, AI/search calls, payment operations or changes to the SVI checkout/repository.

## Scope and identity

`web/src/lib/reanalysis/scope.ts` exposes13 existing criterion scopes,52 content-hashed guiding-question scopes and21 SVI native field mappings. SVI fields were compared with its actual per-field registry: no unmapped field. Mapping states `related_not_equivalent`; it is an implementation dependency map, not proof that16 SVI questions equal52 BlockID questions. IDs depend on question content rather than array position; catalogue hash versions mappings. Unknown/cross-site scopes fail and duplicate scopes normalize deterministically.

`request-contract.ts` validates strict request fields and binds site/business/account/base revision/input hash/canonical scopes/mode/research policy+cutoff. Cost, user ID or permissions injected into request JSON are rejected. Server-resolved context separates authenticated requester, resource owner and billing owner. It requires read+new-revision permission, current immutable base/input and explicit wallet account/site/spend authorization. Public slug or signed UID alone does not establish any of these permissions.

## Source-confirmed wallet/auth contracts

- BlockID `web/src/lib/credits.ts:451` reads `credit_balances` by `user_id`; affordability may delegate through `billingFetch`, and spend uses user-based atomic/legacy paths. Current wallet is not automatically an organization/account wallet.
- `web/src/app/api/svi/dimensions/stream/route.ts:83` uses `projectScopeOrDenyFor` from `project-members/http.ts`; caller wallet and project owner differ in the existing route. Viewer versus writer distinction must be resolved by the future request adapter.
- BlockID `security/svi-handoff.ts` transfers UID+expiry/nonce; SVI `auth/svi-session.ts` verifies/mints its UID+expiry cookie. It carries no billing-account mapping.
- SVI `auth/session.ts` separately forwards available cookies to BlockID `/api/auth/me`; its returned `orgId`/`orgName` are null in inspected source. The existence of both session helpers is not proof they are wired equivalently on the field API or identify a wallet.

No shared-wallet inference is made. Future adapters must establish the explicit `authorizedSite`/account/payer mapping before using this contract. The wallet-provider tag `blockid_user_credits` describes the existing user-keyed ledger; it does not activate SVI access to it.

## Quote and duplicate binding

A server-owned approved quote must match requester, canonical intent hash, payer/wallet, pricing version, credit amount and expiry. Amount uses integer microcredits (one credit represented as one million units in the future settlement adapter), with no new prices configured here. Missing quote/pricing/wallet fails closed. Changing mode, input, base revision or research cutoff invalidates the quote; a fresh research window is therefore a distinct intent rather than permanently deduplicating all future refreshes.

Operation identity includes site/business/account/base/input/scopes/mode/research policy/cutoff plus payer wallet and price/version. Duplicate scope entries and order do not create duplicate identities or multiply cost. This key is not a durable idempotency constraint: the next phase must enforce uniqueness and reservations atomically in storage.

A successful result is `validated_intent`, **always `executionAllowed:false`**, requiring `durable_reservation_and_revision_transaction`. No HTTP route imports it yet. It is a shared server contract usable by both site adapters, not proof that authentication, billing or reanalysis is fixed live. No fees have been activated.

## Focused checks and next integration

Eight focused tests cover authenticated resource/payer separation, wrong account/business, stale revision/input, missing auth/wallet/quote/pricing, permission, expired or scope-mismatched quote, duplicate scope/order, cross-site wallet refusal, injected costs and13/52/21 mapping. Targeted ESLint only; no broad TypeScript run.

Next: verified per-site auth/resource/wallet adapters; stored quote and explicit consent; atomic reserve/capture/refund and immutable revision job with CAS/unique operation; only then enable paid scope execution. Actual user-observed credit deductions remain unresolved until receipt/request/ledger trace, as documented in§6.7; this contract does not retroactively reconcile them.
