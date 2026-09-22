# G30 B02/B03 — atomic credits and purchase fulfillment contract

2026-09-22. Source-only preparation; no production database/Stripe inspection, migration, payment, external message or source modification. SQL below defines a proposed contract, not a migration to execute. Runtime schema/caller parity remains a release gate.

## Existing behavior and what to preserve

| Source | Evidence and implication |
|---|---|
| `web/src/lib/credits.ts:877` `grantCredits` | Reads balance/lifetime earned, computes in JS, upserts absolute totals, then inserts ledger separately. Parallel grants can overwrite each other; ledger failure still returns `ok:true`. No purchase-level uniqueness. |
| `web/src/lib/credits.ts:34,624` | Remote billing request times out after 5s; null or `ok:false` falls back to a new local debit. A committed remote debit with lost response can therefore be charged again. Business rejection is also conflated with service unavailability. |
| `web/src/lib/credits.ts:715–792` and migration `0324_spend_credits_rpc.sql` | **Preserve existing atomic debit.** SQL subtracts balance under `WHERE balance >= cost` and inserts transaction + usage within one transaction. It solves competing balance updates, but has no operation key, so replay of the same business request still debits again. Missing-RPC fallback deliberately re-enters legacy behavior and must not be used for new mandatory atomic money paths. |
| `web/src/lib/stripe/verify.ts:50` | Event insert uniqueness is treated as duplicate regardless of prior failure. Database failure is fail-open. `markWebhookEventProcessed` stamps `processed_at` even on error, without checking write success. |
| `web/src/app/api/stripe/webhook/route.ts:35–148,310–354` | Signature verification exists. Grant returning false silently exits the credit-pack handler, and outer processing marks event successful. Thrown failures return500, but a retry sees duplicate event and is acknowledged without reprocessing. Credit-pack branch lacks an explicit `payment_status === paid` gate in the inspected checkout handler. |
| `web/src/app/api/cron/stripe-reconcile/route.ts:86,247` | Checks revenue row for session, then separately grants and inserts revenue with synthetic event ID. Webhook and cron can both miss the check, or credit grant can commit while revenue write fails. Revenue presence is not a transaction receipt. |
| `services/billing/src/lib/credits.ts:223–270` | Separate billing service still reads/upserts absolute debit totals and inserts ledger separately. Web local atomicity is not system-wide atomicity if this remote writer is enabled. |
| `services/billing/src/routes/webhook.ts:26,210` | Process-local Set event deduplication and another credit-pack grant path. Restarts/multiple instances defeat this guard. Runtime activation/destination was not verified; audit it before claiming closure. |

Schema source: `0013_credits_usage.sql` defines balances unique by user and ledger/usage; `0015` changes amounts to NUMERIC(10,2). `0075_entitlements_trial_and_webhook_state.sql` defines event ID PK with `processed_at/error`, and revenue uniqueness by `stripe_event_id` only. Different Stripe events or synthetic reconciliation IDs can reference the same purchase. User FKs target `public.app_users(id)`.

## Stable identity and immutable economic inputs

One credit-pack fulfillment identity is `(provider='stripe', account_scope, livemode, checkout_session_id, purpose='credit_pack')`. It is **not** event ID, email, current plan, random retry UUID or user+session: excluding user from uniqueness prevents the same paid session being credited to two different users. Store originating event IDs as linked observations, not separate entitlement identities. PaymentIntent ID is an additional cross-check; it does not replace the canonical Checkout Session identity for this flow. Invoice-cycle grants use invoice ID + grant purpose; promotional/manual grants require an explicit issuer-issued grant ID. Different purposes must be enumerated server-side, never arbitrary client strings.

At checkout creation, persist a purchase/order record with user ID, selected Stripe price ID, quantity, promised credit amount, expected currency/amount, catalogue version and session ID. On fulfillment validate signed event plus authoritative payment state against that record and approved price mapping. Do not trust `parseInt(metadata.blockid_credits)` as the economic authority. Historical checkout compatibility needs a validated legacy-price mapping and recorded session metadata; unknown SKUs or conflicting user/amount/currency go to quarantine without grant. Handle delayed payments via a paid confirmation event/reconciliation; checkout completion alone can be unpaid.

For every mutation, bind an immutable canonical request fingerprint covering operation kind, user, amount, feature/purpose, purchase/job identity and price version. Exclude volatile delivery/event timestamps. Reusing a key with a different fingerprint returns `identity_conflict`, never succeeds by replaying a receipt for another amount/user.

## Expand-only database objects

Proposed `credit_operations` table: UUID primary key; unique `(namespace, operation_key)`; nonnull user FK; kind `grant|spend|refund|reserve|capture|release` (initial rollout implements grant/spend only); numeric amount; canonical fingerprint; status `pending|completed|rejected`; resulting balance; ledger ID; optional revenue ID/purchase ID; created/completed timestamps. Restrict writes/RPC execution to service role. Keep public/anonymous execution revoked, explicit schema qualification and fixed search_path. User-facing reads expose only authorized account receipts, not Stripe secrets or other users' identities.

Add nullable `operation_id` to `credit_transactions`, `usage_logs` and `revenue_events`, with unique indexes appropriate to one grant/debit receipt and one usage/revenue record. Old rows remain valid with null IDs. Add purchase uniqueness in a new fulfillment table or the operation key, not a destructive replacement of existing `stripe_event_id`. Existing account balances and stored reports stay in place. Use numeric decimal values/validated strings with at most two decimals, bounded positive amounts, no NaN/infinity, no silent rounding; preserve fractional-credit support.

Expand webhook event state with `status`, `attempt_count`, `lease_owner`, `lease_expires_at`, `request_fingerprint`, `last_error`, `completed_at`. Keep old columns for older readers. Existing `processed_at` with nonempty error is **not** completion. Historical null-error rows also cannot prove credit-pack delivery because grant=false was swallowed; validate by purchase-level reconciliation, never mass-regrant.

## Transaction algorithm — grant and paid purchase

All following statements run inside one database RPC transaction, using actual validated parameters. A new proposed RPC can return `{ outcome: completed|replayed|rejected|identity_conflict, operation_id, ledger_id, balance_after }`; infrastructure failure raises and rolls everything back. No success without a durable receipt.

1. `INSERT INTO credit_operations (...) VALUES (...,'pending') ON CONFLICT (namespace,operation_key) DO NOTHING`.
2. `SELECT ... FOR UPDATE` the operation by its unique key. Concurrent identical attempts block, then see committed state. Verify fingerprint and user/amount. If completed, return stored receipt without another balance change. If conflicting, reject. Acquire locks consistently: operation → balance → dependent financial rows.
3. Ensure account row exists with zero balance: `INSERT INTO credit_balances(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING`.
4. Atomic arithmetic: `UPDATE credit_balances SET balance=balance+p_amount, lifetime_earned=lifetime_earned+p_amount, updated_at=now() WHERE user_id=p_user_id RETURNING balance`. Missing affected row is failure, not success.
5. Insert `credit_transactions` with amount, exact resulting balance, reason, operation ID and minimal provenance. Constraint/write failure aborts the transaction, including balance mutation.
6. For paid credit packs, insert financial revenue record and purchase fulfillment receipt within this transaction, using the same purchase identity and operation ID. Validated gross/currency and the existing approved tax computation feed it; do not invent a new GST formula here. Existing revenue schemas named `_aud_cents` need an explicit non-AUD policy rather than mislabeling currency.
7. Persist a unique outbox job for confirmation/analytics if required; sending email/network requests occurs after commit, outside the transaction. Replays do not create duplicate outbox jobs. No email failure rolls back or repeats the credit grant.
8. Mark operation completed with exact receipt and commit. For this specific credit-pack handler, mark the event completed in the same transaction if it has no other mandatory effects, or after verifying the durable operation receipt. Never claim the whole general webhook handler is atomic merely because credit fulfillment is.

A ledger insert failure must leave balance, lifetime totals, operation receipt and revenue unchanged. The transaction's original `balance_after` is the replay receipt; separately query current balance for UI because later purchases/spends may have changed it.

## Spend: wrap the existing atomic primitive, do not rebuild it

Add an idempotent spend wrapper RPC which claims the same operation key/fingerprint, then calls existing `spend_credits_atomic` **within that transaction** and persists the receipt. Replays return original result. If balance insufficient, persist a rejected attempt (or documented terminal outcome); a new deliberately retried user action after top-up receives a new request key. Never silently re-execute an old rejected operation because balance changed. Keep sandbox/reseller debit routing: identify that route explicitly and implement equivalent receipts there before calling its retries safe.

Existing function and old signatures remain available during expansion; no blanket rename or removal. Migrate callsites progressively but label coverage accurately: direct callers of the old primitive still lack replay protection. Stop new money-path writes if the required new RPC is absent; do not fall back to the old read/upsert grant/debit. Original function's historical missing-RPC fallback can only remain on documented legacy paths until cutover is complete.

Deep-research reserve/capture/refund is B03 follow-on. Bind job ID + report version + criterion + approved quote version to a reservation. Do not implement reservation as immediate spend plus ad-hoc refund, and do not claim this initial grant/spend RPC already supports job settlement.

## Webhook retry ownership

Claim event via a database transaction/atomic update, not insert-only deduplication. New event → leased processing; completed event → acknowledged replay; failed event or expired lease → claimable again; active lease → retryable/busy response unless durable queued ownership guarantees eventual processing. Missing database or failed claim returns503, not permission to grant without deduplication. Verify raw-body signature before claim, store only necessary fingerprint/provenance.

Lease completion requires owner/generation compare-and-set so an old worker cannot complete a newer retry. Financial operation uniqueness remains the ultimate guard if workers overlap after lease expiry. A handler/grant/storage error marks failure and returns retryable5xx; failure never writes a successful completion timestamp. Success acknowledgement means committed completion or safely replayed completion, not “handler returned without throwing.”

Different successful event IDs for the same paid session, cron reconciliation and billing-service webhook all invoke the **same purchase RPC/key**. Reconciliation reads fulfillment receipts and payment status, repairs missing projections from receipts, and never uses a missing revenue row alone as permission to add credits. Conflicting or ambiguous historical evidence is quarantined for investigation, not automatically credited twice.

## Remote billing and timeout recovery

Distinguish `not_attempted`, `rejected`, `completed`, and `outcome_unknown`. Before initiating a spend, select one authority and create/pass the stable operation ID to it. Both billing-service and web local paths must call the same receipt-backed database operation (or have a formally single-authority lookup contract). After timeout, lookup/retry **the same key**; do not execute an unkeyed local debit. A remote business rejection is final for that operation and must not fall through to another authority. If lookup is unavailable, surface pending/retry status and preserve the job/input; no second charge.

During migration, audit whether remote mutations are actually enabled and who calls the billing service webhook. Either migrate both writers, or explicitly route all new mutation traffic to one verified authority and disable the other mutation routes reversibly. Do not infer remote service is unused from absence of a host port; it may run in a container or external host.

## Required tests beyond current mocks

Existing spend tests in `credits.test.ts` cover RPC arguments/missing-RPC fallback, not database concurrency or exactly-once execution. `verify.test.ts` and webhook route tests cover duplicate event short-circuit, which must distinguish completed vs failed. Reconcile tests explicitly use revenue presence as deduplication and mock grants. Replace those unsafe expectations with receipt-driven behavior alongside code.

Minimum isolated PostgreSQL integration suite (scratch database only, no live writes):

1. Two concurrent distinct grants to one account: both amounts preserved and two ledger receipts; grant concurrent with existing atomic spend preserves all arithmetic.
2. Same paid purchase from webhook and cron concurrently: one balance addition, one financial ledger/fulfillment/outbox job; both receive same operation receipt.
3. Same key with different user, amount or price fingerprint: conflict, no mutation.
4. Forced ledger/revenue insert failure: no balance/lifetime/receipt drift; retry succeeds once after failure removed.
5. Commit succeeds but transport response is lost: same-key retry/lookup returns committed receipt and no second debit/grant.
6. Failed event redelivery succeeds; completed redelivery no-ops; lease expiry permits recovery; stale lease owner cannot complete; unavailable DB fails closed.
7. Checkout complete but unpaid grants nothing; paid delayed-event grants once; unknown SKU and mismatched ownership rejected.
8. Fractional credits exact to two decimals; negative/nonfinite/excess precision rejected; insufficient balance no debit; operation replay after top-up does not reinterpret old rejection.
9. Legacy app remains compatible with expanded schema; new code refuses absent RPC; rolling back app code does not drop ledger/receipts or reopen unprotected writer routes.
10. Historical revenue-without-ledger and ledger-without-revenue cases produce review/repair without duplicate grant; retain an audit of reconciliation decisions.

## Safe rollout order and rollback limits

1. B01/P01/O05 prerequisites: protected release and automation ownership; authoritative catalogue/purchase identities; read-only runtime schema + active-writer inventory. Reconcile historical inconsistencies into a review list. B02 foundation can proceed before final pricing economics, without changing customer prices.
2. Add schema/RPC in an idempotent, expand-only migration; use `scripts/db/apply-migration.sh` and the migration ledger per `web/AGENTS.md` after isolated integration tests and backup checks. No migration is auto-applied by deploy. Audit grants, RLS and existing column types before applying.
3. Deploy a compatibility release that understands receipts and fail-closed required RPC availability, with new mutation route disabled until schema parity confirmed. Verify both web and billing-service writer ownership. Do not run old and new purchase writers concurrently without the shared idempotency key.
4. Enable receipt-backed credit-pack fulfillment + reconciliation together, test a permitted sandbox/non-money fixture end-to-end, then monitor actual receipts and grant/ledger parity. Purchase economics and historical packs remain unchanged.
5. Migrate retry-sensitive spend callers and remote timeout handling to keyed operations. Then implement approved B03 quote/reservation/job settlement on this foundation.
6. Rollback traffic to a compatible known-good release; leave additive schema/data intact. **An old release that can unkeyed-grant the same paid session is not a safe financial rollback target after cutover.** Retain the compatibility release as LKG, or pause mutation entrypoints while keeping site/read access online until a compatible authority recovers. Never rollback financial correctness by deleting receipts, resetting balances or replaying purchases.

Closure requires the concurrency/failure tests and runtime writer coverage, not a successful build alone. This contract does not establish that production migrations are present or that any live purchase was tested.
