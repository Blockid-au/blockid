# G30 B02 receipt foundation — isolated database evidence

Scope: additive draft migration `0443_credit_operation_receipts.sql` and a real PostgreSQL integration harness. No production migration, application caller cutover, payment/provider request, environment edit, deployment or external message was performed. This is not closure of B02/B03 or Stripe fulfillment.

## Implemented contract

`apply_credit_operation(namespace, operation_key, user_id, kind, amount, reason, context)` is a service-role-only SECURITY DEFINER RPC. `kind` is grant or spend. A canonical JSONB fingerprint binds the user, kind, exact amount, purpose and complete context, including required business identity and price version. JSON key ordering is immaterial; changed economic fields conflict. The caller must select a stable server-owned namespace/key and validated purpose/context; this function does not validate a Stripe payment, ownership claim, price catalogue or authenticated HTTP caller.

A unique namespace/key claim locks the operation before any balance mutation. A matching completed or rejected operation returns the **exact original terminal response**, including its original `balance_after`. There is deliberately no newly generated `replayed` response that could be mistaken for a new financial result. The UI must obtain current balance separately. A conflicting request gets only `identity_conflict`, without another user's receipt. Insufficient funds are durably rejected; a top-up cannot reinterpret that old operation. An intentional new attempt requires a new operation key.

Grants use database arithmetic and ledger insertion in one transaction. Spends call the actual unchanged `spend_credits_atomic(uuid,numeric,text,jsonb)` function from migration 0324. A server-generated operation UUID in metadata binds its newly inserted ledger and usage rows; strict single-row updates assign nullable, unique operation IDs. Missing or ambiguous rows abort the transaction. No legacy signature, financial row or data is dropped. Old unkeyed callers remain unprotected against duplicate requests.

Amounts are checked as unbounded NUMERIC before touching existing NUMERIC(10,2) columns: finite, positive, at most 99,999,999.99, and exactly representable to two decimal places. `1.250` is accepted as mathematically equal to `1.25`; `0.001` is rejected rather than rounded. Lifetime/balance overflow aborts the transaction. Existing zero-cost/free paths should not invoke this new mutation RPC.

The new receipt table has RLS enabled and no client policies; anon/authenticated/PUBLIC cannot execute the RPC or read receipts. service_role receives SELECT only on receipts and EXECUTE on the RPC, with Supabase's BYPASSRLS role property required for direct server receipt lookup. Receipt mutations run as the migration function owner. User FKs reference `public.app_users`; the new receipt FK restricts deletion rather than cascading financial evidence. Account erasure/retention handling must be explicitly coordinated before caller cutover. Existing service-role access to older balance/ledger tables still exists; this migration does not secure or migrate those bypass writers.

## Real isolated test results

Command: `python3 web/scripts/db/tests/credit-operation-receipts.py`.

12 unittest cases passed in 23.522 seconds using the already installed `supabase/postgres:15.8.1.085` image. The harness refuses to start when another container with its test prefix exists and refuses image pulls. Each run creates a unique container with network `none`, no published ports, no host binds, and a tmpfs database. It executes schema definitions from 0013/0015 and the exact existing spend function from 0324; unrelated legacy tables are not copied or guessed. Synthetic app-user UUIDs only. Migration 0443 is applied twice inside transactions to check additive reapplication. The container is removed after completion; no production PostgreSQL/container command was executed.

Coverage:

1. Eight concurrent distinct grants preserve all arithmetic and eight ledger receipts.
2. Eight concurrent same-key grants return one identical receipt; retry after a discarded committed response returns the stored spend receipt without a second debit, even after a later grant.
3. Same key with changed user, amount, kind, purpose, business identity or price version conflicts without mutation.
4. Rejected spend replay remains rejected after top-up; a new operation can succeed.
5. Concurrent grants and existing unkeyed atomic spends preserve totals. The old function definition hash remains unchanged; legacy rows retain null operation IDs.
6. Forced ledger and usage insertion failures roll back balances, lifetime totals, operation claim and dependent rows; retry succeeds once after the injected fault is removed.
7. Invalid fractional/nonfinite/out-of-range amounts and missing/invalid economic context make no operation rows.
8. anon/authenticated execution and receipt reads are denied; service-role RPC/receipt reads work but direct receipt deletion is denied; nonexistent app users fail FK checks.
9. Explicit transaction rollback and numeric balance overflow leave no partial operation.
10. Eight concurrent same-key spends debit once. Eight distinct spends competing for the remainder produce exactly three successes and five durable rejections, never a negative balance.
11. Forced final receipt UPDATE failures roll back both grant and spend arithmetic, lifetime totals and ledger/usage rows; same-key retry succeeds after removing the failure.
12. A BEFORE UPDATE trigger returning NULL silently suppresses finalization. This regression failed against the initial draft: it returned success without a terminal receipt. Finalization now requires UPDATE RETURNING id INTO STRICT. Suppressed finalization aborts grant, successful spend and rejected spend, leaving no new operation or balance/ledger/usage changes. Same-key retries succeed and replay once after the trigger is removed. Grant ledger insertion already requires RETURNING INTO STRICT; spend ledger/usage linking also requires exactly one row.

The lost-response test discards a committed result and retries; it does not kill a real network connection. Parallel worker processes execute real independent PostgreSQL sessions; this is database concurrency evidence, not HTTP gateway timeout/retry evidence. No financial revenue/outbox/lease tests are claimed.

## Release gates and remaining work

- This file is a **draft additive migration**, not proof of a deployed RPC or production schema parity. Apply only through the documented migration/ledger workflow after backup and compatibility gates; do not auto-apply on deploy or edit production schema manifests to pretend completion.
- Inventory/route every intended writer, including three direct balance writers identified in the runtime inventory and the presently disabled billing service. Missing new RPC must fail closed for new keyed paths; an uncertain remote outcome must resolve the same key, never fall back to an unkeyed debit.
- Stripe purchase identity, authoritative paid state and price/owner validation, fulfillment receipt plus revenue/outbox transaction, webhook lease/retry state, reconciliation and historical quarantine remain unimplemented. A generic grant receipt is **not** an immutable verified Stripe purchase receipt.
- Reseller/sandbox accounting and research quote/reserve/capture/release/refund are outside this RPC. Do not emulate reservation with a spend and ad-hoc refund.
- After cutover, rollback requires a release that respects the same financial operation identities. Leaving additive schema intact is necessary but does not make an old unkeyed grant implementation a compatible financial rollback target.
