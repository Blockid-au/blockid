# Billing and scoped research draft integration — 2026-09-22

Status: integrated source only. No live migration, provider request, customer transaction, permission grant, deployment or execution activation occurred in this task.

## Source reconciliation

Base is primary `63adabee3`; reviewed draft is exactly `2098631d24f384b74085849ace97c5007b8cc91a` from `/data/blockid-g30-reservation-consent`. Only billing/consent source, its tests and migrations 0443–0446 were transferred. Current account-status/auth, Brave budgeting, research discovery and wallet-admission modules remain unchanged. The obsolete support email in the draft portal route was not transferred. The existing unified plan was not overwritten by the draft plan.

Includes atomic credit receipts; recorded Stripe checkout economics and receipt fulfillment; legacy purchase writer exclusion; erasure mapping for minimal financial records; scoped job reservations, retry lineage and revision comparison; immutable consent inserted atomically with reservation; application-side binding of the exact consent, report, quote, wallet, amount and input identity. The existing `enqueue_consented_reanalysis` remains the intended entry point. No parallel consent table or association grant is introduced.

0445 matches current 0442 erasure implementation apart from the header and two generated receipt-map rows. In particular, current guest-report erasure remains intact. The fixture explicitly labels receipt FKs as draft/source additions, not a new production schema inventory.

## Defect found and corrected during integration

The original draft failed its actual PostgreSQL concurrent legacy-spend test: `apply_credit_operation` held an account `FOR UPDATE` lock and waited on the wallet while the existing spender held the wallet and waited for an account FK `KEY SHARE` lock. PostgreSQL detected a deadlock.

Account-row locks in 0443, 0444 and 0446 now use `FOR NO KEY UPDATE`. These operations never change the account primary key. The lock still serializes with account updates and erasure, while permitting FK key-share checks by existing spenders. Wallet, job, checkout and report-head locking remains unchanged. The old `spend_credits_atomic` function is unchanged, checked by the SQL fixture. Subsequent authority migration account locks must preserve this compatibility and deterministic actor/payer ordering.

The scoped SQL harness now resolves the receipt fixture beside itself, removing dependence on an external worktree environment variable.

## Validation

- Real isolated PostgreSQL: 12 credit receipt, 4 checkout/actual erasure, 10 scoped job, 17 consent cases passed (43 total). Includes concurrent grants/spends/replays, failed audit insertion rollback, cancelled-hold refund, retry lineage, immutable audit, erased accounts and denied bare-enqueue permissions.
- Vitest: 70 tests across storage, quote consent, request contract, wallet admission, receipt fulfillment and erasure mapping passed.
- Existing credits and affected checkout/webhook/reconcile tests: 144 passed (214 Vitest tests across 10 files total).
- Full-tree nonincremental `tsc --noEmit` produced no diagnostics but exceeded 4 GiB RSS; its exact isolated process was stopped before completion to avoid unnecessary server pressure. No full typecheck/build pass is claimed; the controlled production build remains a rollout gate.
- Scratch PostgreSQL used the existing `supabase/postgres:15.8.1.085` image, network none, no host mounts/ports, tmpfs data, bounded memory/CPU and per-run cleanup. Nothing was run against production.

## Selective integration before financial activation

Root may deploy independent authority schema first. Keep 0443–0446 in this reviewed draft worktree, outside the primary canonical migration directory, until their controlled financial activation; do not update the applied manifest for them. Do not cherry-pick this entire integration commit as if it were an application-only no-op phase.

Storage/request/quote source can be staged separately while no customer route invokes reservation. Keep the privacy map, fixture and `ERASURE_MIGRATION_FILE` pointer together with the deferred 0445 migration: importing only the source pointer would reference a nonexistent canonical migration and misstate erasure coverage. Defer the web and billing-service purchase changes as a coherent compatibility cutover, unless the source behavior described below is explicitly desired and deployment dependencies are met.

`G30_CREDIT_RECEIPTS` enables new receipt checkout creation only when exactly `1` (unset/other values mean false). `G30_CREDIT_PURCHASES_PAUSED` also defaults false and pauses purchases only when exactly `1`. Neither setting disables processing of an already receipt-marked session. The legacy-grant authoritative Stripe lookup and billing-service rejection have no default-off flag; those are meaningful runtime changes even with both settings unset.

## Required rollout dependencies

1. Reinspect schema/ledger and numbered migration availability, then apply reviewed migrations only via `scripts/db/apply-migration.sh`; regenerate and commit the real schema manifest after application. No migration was falsely marked applied here.
2. `G30_CREDIT_RECEIPTS` defaults off. Receipt-marked historical checkouts are always routed through receipt fulfillment, even if creation is later disabled. Do not roll back to a reader/writer that cannot respect those markers and persisted economic receipts.
3. Legacy grant defense performs an authoritative Stripe session lookup even before receipt cutover. Billing service now refuses credit-pack grants/webhooks, making web the sole purchase authority. This is a real compatibility change: coordinate service/runtime routing, exclude old purchase writers and retain a receipt-compatible rollback origin before activating new receipt purchases. The staged `G30_CREDIT_PURCHASES_PAUSED` gate is available for a controlled transition, not enabled by this source integration.
4. Research storage is unused by a customer execution route. Authoritative report associations, own-wallet grants and stored quotes must be added by the next authority phase; enforce both `deleted_at` and `erased_at`, revocation/revision checks at reservation, worker and publication boundaries. Current 0446 erased-only checks and caller-supplied baseline are insufficient activation authority.
5. Finish research-content lifecycle and immutable-consent erasure policy before activation. 0445 covers financial purchase receipts, not the later research/authority content lifecycle.
6. Complete provider budget reservation, worker orchestration and cross-store publication/reconciliation before enabling paid research. No UI click, login or report read may infer consent or wallet access.

The unified goal remains in progress. Passing draft transaction tests is not production billing or paid research activation.
