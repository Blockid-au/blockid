# Unified billing / scoped-reanalysis source integration (not activated)

Isolated branch `g30/unified-paid-research`, base54d3eea51, worktree `/tmp/blockid-g30-unified-paid-research`. No primary merge, build, migration, live state, permit, Stripe/provider request or deployment was performed. Billing receipt creation remains opt-in OFF; scoped research has no activated reservation/worker routes. BILLING_URL remains disabled. This is a source integration milestone, not schema readiness, completed billing, live paid research or uptime evidence.

## Exact imported chain

| Original | Integrated | Change |
| --- | --- | --- |
| e9f73a84e | 35b991651 | Draft0443 receipt foundation |
| 9a23616be | 6dbcf0cad | Terminal receipt finalization |
| db27e3c5f | 444d56f9a | Draft0444 purchase fulfillment |
| 06cf47f19 | 6abec9974 | Draft0445 erasure/financial retention |
| f76fc842e | e2ecc0919 | Legacy purchase-writer exclusion |
| c0428f193 | 9f4eb77b5 | Pinned schema preflight |
| 60ccda702 | 0adce6c29 | Explicit expansion state machine |
| ddb883c60 | 447ef542b | Locked controller/rollback integration |
| d31ed3023 | 84bfe2290 | Draft0446 escrow/revisions |
| a96e9865f | 97e3a2319 | Released-attempt retry lineage |
| 4bcd9c834 | 239f15943 | Exact displayed quote consent |
| 8d08d18bb | 7232bc7c0 | Atomic stored consent + reservation |

## Conflict resolution

Primary already retained more complete source-only evidence documents; these were preserved rather than replaced with older draft claims. SOT retains both current RA2 research/synthesis progress and new RA1 consent/storage paragraphs. Two executable conflicts were combined: serving-state verification retains origin-draining refusal AND the explicit expected-schema-status probe needed by pinned expansion; authenticated status retains current origin activity fields AND receipt reader capability flags. Existing staged resource budget, capacity handling and completed-build freeze semantics were preserved. No financial policy or fee decision was made during conflict resolution.

## Critical staged-release boundary

The exact expansion allowlist remains0443,0444,0445. Controller prepare still expects pending:3 for that pinned candidate. **A build whose migration manifest also introduces0446 is intentionally NOT eligible for this transition.** The unified branch contains all four drafts for source integration; do not simply build/deploy its full migration set through the three-file controller. First construct separately pinned compatible billing baseline/recovery and the exact three-file expansion artifact using the existing manifest staging protocol; then design a separate explicit0446 expansion, capability and rollback sequence. Do not widen equality checks, strip compatibility metadata from sealed artifacts, add0446 to the old allowlist or rewrite any applied migration. A focused regression rejects a candidate manifest containing0446.

The old-origin financial writer problem remains: every live retained origin must satisfy compatible paused receipt reader/cron ownership gates before0443–0445 prepare. Quarantine or ordinary socket inactivity is not writer exclusion or quiescence. Creation OFF still understands already marked orders; irreversible financial outcomes must replay receipt authority, never fall back to an unkeyed grant. Historical ambiguous sessions require explicit reconciliation; neither automatic refund nor regrant is supplied.

## Remaining activation work

- Billing: all compatible runtime/cron owners, account-erasure map parity, schema/ledger/SQL hash pins, paused baseline/recovery, exact expansion checkpoints and compatible rollback verification. Old monetary writers and release manifests cannot be assumed safe because source merged. Actual Stripe price/tax/paid-session acceptance and provider money paths were not exercised here.
- Reanalysis: exact authenticated report/account/wallet resolver, immutable stored quote and approval endpoint, canonical revision-writer/CAS integration, worker ownership/cancellation, source-qualified result acceptance and capture/release policy. Current draft synthesis remains partial/unverified and cannot alone authorize capture.
-0446 consent/jobs/revisions need existing erasure/export/retention integration;0445 does not cover those newly introduced tables. Do not invent a new retention policy or delete immutable financial receipts. Migration0446 remains unapplied and outside current expansion admission.
- Historical integration docs retain their original scratch database evidence; this integration did not run containers or SQL and does not re-certify schema behavior. New exact combined SQL execution belongs to an explicitly isolated scratch stage before operational activation.

## Focused source verification

27 TypeScript tests passed for purchase fulfillment, reanalysis admission, quote consent and storage wrapper with Vitest cache disabled. Python checks:8 expansion state-machine cases,5 controller failure cases,14 serving-state cases,14 resource-permit cases. Serving-state fixtures now cover draining refusal after conflict resolution. These use mocks/private temporary state; no live host operation, production DB call or new dependency installation. Full TypeScript/build and SQL integration were intentionally not claimed.
