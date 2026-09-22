# Draft 0443: atomic account closure refusal

Scope: financial draft only; no live SQL, runtime flags, canonical manifest or expansion allowlist changes. This file supersedes the 0443 and 0444 checksums in earlier draft evidence; 0445–0450 SQL is unchanged.

## Contract

`apply_credit_operation` locks `app_users` with `FOR NO KEY UPDATE`, reads both `deleted_at` and `erased_at`, and refuses a new grant or spend when either is set. The receipt claim and refusal occur in one transaction, so refusal leaves no pending operation, balance, ledger or usage row. The unchanged 0444 purchase RPC calls this primitive inside its order/receipt/revenue transaction: a closed account cannot receive its first grant or a later grant.

The immutable fingerprint conflict and exact terminal receipt replay remain before the closure refusal. Completed grants and rejected spends replay their original response even after closure and balance deletion. Replay does not reopen the account or recreate its wallet. An already-paid purchase received after closure still needs separate payment reconciliation; this change does not refund Stripe automatically.

Account closure and purchase serialize on the account row. If closure commits first, the waiting purchase observes the committed closed state and rolls back. If purchase commits first, its receipt remains authoritative and subsequent closure can proceed. The existing lock strength still allows legacy spend FK key-share checks; this change does not modify or make the legacy spend primitive closure-safe.

## 0445 lifecycle review and remaining boundaries

Actual 0445 `erase_account` locks the account `FOR UPDATE`, deletes `credit_balances`, retains financial receipt/order/transaction rows as pseudonymous audit records, and marks both closure timestamps. Actual-erasure tests execute this function, rather than a substitute. Its retained completed purchase receipt replays after erasure; an unpaid/pending order cannot recreate the wallet.

0445 predates the 0446 research job tables and does not define their full privacy cleanup/hold settlement lifecycle. Existing 0446 `release_reanalysis` routes an erased account with a held reservation to `reconciliation_required`; it does not recreate the erased balance. For a merely soft-deleted account it can still restore an existing balance as a hold release, and raises if the balance is missing. This draft does not silently change that settlement policy or reinterpret a reservation release as a new purchase. Before research activation, explicitly define closed-account hold settlement, job/consent privacy retention, and operator reconciliation; preserve the newer primary account-authority privacy rules when integrating 0445. An erased-account reconciliation state is not evidence that customer refunds have occurred.

0444 order recording now locks the account and rejects both closure timestamps before recording any order. Its existing refusal of order-recording calls after closure is preserved; exact terminal *fulfillment* receipt replay remains available. Default legacy purchase writers do not call this RPC: deploying runtime compatibility with receipt creation off does not gain schema-backed atomic closure protection from this draft.

## Validation

Isolated PostgreSQL fixtures use a scratch container, no network/host ports or mounts, existing image only. Receipt tests cover both timestamps before first grant/spend, exact completed/rejected replay with deleted balance, immutable conflicts and existing transaction/concurrency failure cases. Actual purchase tests exercise concurrent soft deletion in both lock orders, rejected pending order with no ledger/revenue mutation, exact replay, and actual 0445 erasure. Shared authority fixture adds `deleted_at` idempotently to remain compatible with the base account fixture.

Passed: 14 receipt tests, 8 purchase tests, and the focused authority closed-account test (23 total). Concurrency fixtures confirm the second transaction is actually waiting on a PostgreSQL lock before the first commits. `git diff --check` passed. No production database access was needed.

## Exact SHA-256 change

- 0443 before: `4d4e3eb2ff77865688d6152613e901958a3c53002aeb1b58121cca00a7e4c6c6`
- 0443 after: `002a1b403b4539c9120098413f90ef8bed90330d44d5c5841785a7dbc5a92ad7`
- 0444 before: `8c8027020b16bdd6059c6df2e5c7dd129763a55aaa9c6743a1bd1ae302f659cf`
- 0444 after: `e830e6202f7b45738c345a01f3efed5d0f8dcaef4c4f7f06ff8acff5f74e7d12`
- 0445 unchanged: `52217836c9c8f01abeb42b89adaf2ab7ae0e26c564150640faf0e4e30261ef55`
- 0446 unchanged: `7d39354468805bb6f07f000967be2f844832f3968ef3a760a6be6be85a2804a1`

These are draft checksums, not a claim that any migration has been applied or enrolled in a release pair.
