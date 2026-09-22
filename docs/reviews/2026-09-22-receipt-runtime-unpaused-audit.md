# Unpaused compatibility runtime audit and legacy retry correction

Read-only production audit on2026-09-22, followed by an isolated source fix. No live environment, process, deployment, customer credit, Stripe checkout or migration was changed.

## Concrete production evidence

Active BlockID was4110, PID2831655, compiled SHA `0ddc1d7dddaa605e18e08f284bad895dba36d1e6`. Both purchase flags were absent from the process's initial environment and its release `.env`. `BILLING_URL` was absent in both; no build-time override was found. Live Stripe credentials/webhook configuration and all five credit-pack price mappings were present. Only presence/mode booleans were printed, never secrets or price/account/session identifiers.

No local4011 listener, billing container, billing process, or billing4011 nginx reference was found. This supports leaving remote billing unused for the current web runtime release; it is not proof that an externally configured Stripe webhook destination cannot exist. No remote billing deployment is claimed. The repository's billing-service guard changes remain source only unless separately deployed/excluded in the later writer audit.

SELECT-only database inspection found0447 applied;0443–0446 absent, and `credit_operations`/`credit_checkout_orders` absent. The aggregate credit-pack ledger contained one purchase, with a session reference and a standard pack amount. One read-only Stripe session GET for that existing ledger-linked purchase returned200 and confirmed complete/paid payment mode, matching account and canonical credit metadata, AUD/live and no receipt marker. No response body, user identifier, session identifier or credential was persisted or emitted. This verifies the actual legacy metadata convention and active key's retrieval access for the sampled purchase, not every historical session.

## Regression corrected before unpaused deployment

`claimWebhookEvent` is insert-only. A row marked failed is still duplicate-ACKed on retry. The initial runtime slice introduced authoritative Stripe retrieval inside `grantCredits`, after this event claim; a transient lookup could therefore consume the event without granting credits.

The webhook now performs authoritative legacy-purchase verification **before** claiming the event. A failed retrieval returns503 with no claim or grant, so the same event can retry. If the authoritative session is receipt-marked despite an old unmarked event payload, it goes through receipt fulfillment before any legacy claim.

For a valid unmarked legacy session, preflight creates an opaque, request-local single-use proof held in a private WeakMap. It binds exact session, account and credit amount. The actual `grantCredits` guard consumes this proof and rechecks local pause/creation policy without a second Stripe network lookup. Forged, reused or differently bound objects are rejected; the proof cannot be reconstructed from JSON or persisted. Other grant callers without a proof still perform authoritative retrieval. This is not a bypass flag or an externally accepted token.

Existing legacy database-failure/idempotency limitations remain; this focused fix does not pretend to make old unkeyed grants atomic or automatically replay prior failed events. The later financial receipt migration addresses that separately.

## Release settings and remaining gates

The runtime-only release should keep **`G30_CREDIT_RECEIPTS=0` and `G30_CREDIT_PURCHASES_PAUSED=0`**, or preserve their currently unset equivalent, and leave `BILLING_URL` absent. Current unmarked credit purchases continue using the existing grant path after successful pre-claim verification; the new runtime does not request unavailable receipt tables for them. Missing-schema marked sessions fail closed, and new receipt creation must remain off.

Do not apply0443–0445, enable receipt creation or schedule the migration pause as part of this ordinary release. The compatible paused pair, alternate writer retirement/exclusion, exact financial controller/catalog/ledger gates, honest manifest and later unpaused erasure attestation are still separate stages. Current0447 authority is preserved.

Validation:98 tests passed across webhook, credits and fulfillment; actual fulfillment/policy TypeScript checking passed. The focused transient-retrieval test sends the same event twice: first503 with zero claims/grants; second200 with one claim and one grant, and exactly two total Stripe lookups (failed preflight plus successful preflight), with no post-claim lookup. Additional tests reject forged/reused/cross-account proof and detect authoritative receipt markers. All test Stripe/DB effects are mocked; the production audit made only the single read-only Stripe GET described above. Full production build remains the root deployment gate.
