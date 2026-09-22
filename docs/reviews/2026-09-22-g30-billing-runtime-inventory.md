# B01/B02 runtime writer inventory — 2026-09-22

Read-only inspection against docs/reviews/2026-09-22-g30-credit-atomicity-contract.md. Active web process was selected from g30-serving-state and its PID/startTicks verified before reading only required configuration in memory. No env values, customer/payment IDs or row bodies were exported. No payment, grant, debit, refund, job retry, source edit or deployment was performed.

## Runtime topology

- Active web BILLING_URL is unset; BILLING_SECRET is present. Therefore `web/src/lib/credits.ts` billingFetch returns null before HTTP and the remote billing spend/check branch is disabled in this running process. This conclusion comes from source guard + attested runtime environment, not absence of port4011.
- No running Node process matching services/billing and no matching billing systemd unit/container was found. External services and other hosts are not exhaustively inventoried.
- Attested web Stripe secret and webhook verification secret are present. All five credit pack price environment settings (5/10/25/50/100) are present; this does not verify actual price amounts, currency, livemode or entitlement parity.
- Read-only Stripe GET webhook_endpoints, using active configuration, returned HTTP200, 2 endpoints, has_more=false: one enabled live endpoint at blockid.au/api/stripe/webhook, one disabled live other destination. No enabled billing-style /webhook endpoint was found for this account. Endpoint IDs, secret values and other destination URLs were not printed. This does not cover other Stripe accounts, Connect account destinations or external event-forwarding infrastructure.
- Current active commit versions of credits.ts, /api/credits and /api/stripe/webhook match primary source. The active checkout source still contains the old direct-grant fallback if Stripe/pack configuration is absent. Current pack configuration is populated; the prepared B02 refusal guard is not established live by this audit.

## Production database catalog (read-only transaction)

Present: credit_balances, credit_transactions, usage_logs, stripe_webhook_events, revenue_events.
Absent under proposed names: credit_operations, credit_purchase_receipts, purchase_receipts. No conclusion about every possible differently named receipt table.

`public.spend_credits_atomic(uuid,numeric,text,jsonb)` exists, SECURITY DEFINER, service_role has EXECUTE. Catalog body checks confirm balance guard and ledger/usage writes. No grant_credits_atomic, fulfill_credit_purchase or apply_credit_operation functions with those exact names were found. Existing spend must be preserved and extended through a new idempotent operation contract rather than duplicated.

credit_transactions contains id/user_id, numeric amount/balance_after, reason, metadata, created_at, project_id, granted_by_reseller_id, sandbox. It has only its ID primary-key unique index among inspected indexes; no operation/purchase identity column or unique business receipt key was present.

credit_balances has ID PK, unique user_id, balance/lifetime_earned/lifetime_spent and updated_at. stripe_webhook_events has ID PK, type/received_at/processed_at/payload_hash/idempotency_key/error; no status/attempt/lease columns. Its idempotency_key has no unique index. revenue_events uniqueness is stripe_event_id only, not the checkout purchase identity. All these are runtime catalog facts; no production RPC was invoked.

## Enabled source entrypoints and remaining bypasses

Main spend: /api/svi/dimensions/stream and other product routes call web spendCredits, currently taking local spend_credits_atomic for ordinary paid features. Current function exists, but source still permits legacy missing-RPC fallback and has no operation replay key. Zero-cost/entitlement-specific branches are separate.

Grants: /api/stripe/webhook (credit packs, plan grants, package seed), /api/cron/stripe-reconcile (plan/pack repairs), /api/cron/credit-reset (monthly), authenticated admin grant routes, feedback rewards and product refund routes call the non-atomic grantCredits. User cron actively schedules stripe-reconcile at45min every6hours and credit-reset at02:15 onday1. Presence of a route is not proof a specific customer invoked it.

Direct monetary writers outside grantCredits/spendCredits were confirmed in source:
- /api/reports/redeem: computes absolute balance/lifetime_spent in JavaScript, then guarded UPDATE. A balance>=cost predicate does not serialize stale absolute totals into arithmetic debit. It also contains a compensation path.
- /api/admin/affiliate/provision: direct balance upsert + transaction insert.
- /api/admin/resellers/requests/[id]: direct grant balance upsert after reading totals.
These require an explicit scope decision for the atomic rollout; fixing grantCredits alone does not cover all balance writers. The route list is bounded, not a complete repository-wide money-writer proof.

Remote services/billing remains an alternate source implementation with /credits/spend, /credits/grant and /webhook grants, non-atomic balance handling and process-local webhook deduplication. It is not activated by this web process or the observed enabled Stripe endpoint. Keep it disabled until compatible with the new operation contract; do not silently re-enable BILLING_URL during rollout.

## Implementation implications

Prioritize purchase receipt + atomic grant/idempotent fulfillment, webhook failed-event retry and reconciliation using the SAME purchase key. Preserve local atomic spend while adding operation identity; unknown remote outcomes must not create a second debit if remote routing is later enabled. Expand schema first, verify receipt/ledger consistency with safe fixtures, then route every included writer through it. Historical event rows with processed_at cannot alone prove successful fulfillment.

Before claiming billing complete: inventory remaining direct balance writers, test concurrency/duplicates/rollback and request-timeout ambiguity against a safe integration database, verify Stripe pack amounts and currencies, and coordinate rollback compatibility. This audit establishes topology/catalog prerequisites, not successful transaction correctness or safe refund eligibility.
