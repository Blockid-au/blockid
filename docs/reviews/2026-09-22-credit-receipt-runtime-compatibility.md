# Credit receipt runtime compatibility slice — 2026-09-22

Status: source-only stage1 preparation from primary `8cd10e5ba`. Selected purchase runtime behavior from reviewed `051030e4a`; no financial migration, privacy pointer/map, schema manifest, serving controller, environment, supervisor or live state was changed. Current 0447 account/report authority and privacy cascade metadata remain intact.

## Implemented behavior

- Checkout creation defaults to the existing unmarked flow. Explicit `G30_CREDIT_RECEIPTS=1` marks new credit-pack sessions, changes their idempotency namespace and persists the immutable order through the receipt RPC before returning success.
- Webhook and reconciliation route already marked sessions through receipt fulfillment even when creation is off. Receipt processing re-retrieves authoritative Stripe session/line items and requires the committed terminal operation+ledger receipt. Ambiguous/missing-schema/identity errors never authorize a legacy grant. Webhook returns retryable503 without claiming the legacy event first.
- The legacy web `credit_pack_purchase` grant path verifies authoritative Stripe session identity before touching balances. Marked sessions use receipts independently of the creation flag. Unmarked historical sessions are rejected for review when receipt creation is enabled; otherwise the existing pre-cutover legacy path remains available. This adds a Stripe lookup even with both flags off.
- Billing-service credit-pack grants and purchase webhooks are refused before mutation/event caching, making web the intended purchase authority. These service changes must actually be deployed or alternate service ingress excluded during the later coordinated cutover; a web binary alone does not attest the remote service process.
- Explicit `G30_CREDIT_PURCHASES_PAUSED=1` blocks credit-pack checkout, checkout recording, webhook before event claim, fulfillment, legacy grants and reconciliation before purchase lookup/grant. The pause defaults off and does not pause unrelated subscription/report products. No environment flag was enabled here.

## Truthful trusted status

`/api/status` adds `credit_receipt_capabilities` only for the existing authenticated trusted caller; the anonymous response remains unchanged. It reports actual shared-handler creation/pause flags, this process's uptime and implemented compatibility contracts. It is scoped to this process, not the fleet.

The `erased_account_no_new_grant` capability is present **only while the actual credit-pack purchase pause is on**, with `erased_account_refusal = { verified: true, mechanism: "all_purchase_paths_paused" }`. Unpaused output explicitly does not attest it. A preflight user read or migration filename cannot prove atomic legacy erasure behavior. `receipt_protocol_support` reports fail-closed receipt-RPC support separately, and `database_activation_verified` remains false.

This conditional capability is sufficient for the reviewed controller's paused-pair preparation. Before later unpaused financial admission, implement the separately reviewed RPC/catalog-backed capability check. Do not treat an unpaused pre-migration status lacking erased-account attestation as an ordinary serving outage.

## Flags and dependencies for the next operational stage

1. Build/deploy two independently pinned compatible binaries on the unchanged honest0447 manifest. Keep `G30_CREDIT_RECEIPTS=0` (or unset).
2. During the explicitly scheduled financial migration window, launch both compatible processes with `G30_CREDIT_PURCHASES_PAUSED=1`; verify trusted status, actual uptime/drain requirements, active/warm identity and nginx rollback/forward. Do not pretend a source flag changed an already running process.
3. Inventory/retire or separately exclude incompatible retained origins and alternate billing-service writers under the reviewed operational plan. Preserve recovery artifacts and legacy SVI dependencies. This slice changes none of them.
4. Only the subsequent controlled financial expansion may add/apply0443–0445, change the ledger/manifest or enroll cross-schema rollback. SQL compatibility, current catalog, receipts and erasure remain separate gates. Do not enable new receipt creation merely because the runtime compiled.
5. Receipt-compatible rollback must retain marked-session handling with creation off. Purchase unpause and creation enablement are separate later activations. No research execution or quote/storage phase is enabled by this runtime slice.

## Validation

- 279 targeted Vitest cases initially passed across policy, fulfillment, checkout, webhook, reconciliation, status and credits. Follow-up affected-file runs passed after adding reconcile-pause, checkout-enabled and receipt-recording cases; two billing-service guard cases also passed (284 distinct final tests across eight files).
- Tests cover default flags, actual paused-only status attestation, trusted/public status separation, marked receipts with creation off, pause before webhook claims/checkout/reconcile/grants, ambiguous receipt failure without fallback, exact order RPC input, explicit marked checkout creation and repeated service webhook refusal.
- Real TypeScript checking passed for fulfillment/policy and their actual imported dependencies using an isolated nonincremental configuration. The entire billing service passed `tsc --noEmit`. No full Next production build was run here; it remains the controlled deployment gate.
- No canonical migration, privacy file/pointer, schema manifest, account-status/auth source or serving controller differs from the primary base. No customer/provider/network transaction was performed by the tests.
