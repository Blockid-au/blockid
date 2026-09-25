# Stripe source boundary and index readers — source follow-up

This follows the live release recorded in `2026-09-24-cfo-production-deployment.md`.
These changes are source implementation, not a new production receipt or official valuation admission.

## Stripe

Modern OAuth initiation seals a random challenge with caller, project and owner;
the callback consumes and verifies it after checking current admin permission and
before exchanging the code. Account ID and live-mode grant metadata bind later
pulls. Callback, manual Sync and v2 background resync now use the same strict
native-AUD recurring-contract collector. Missing project ownership in background
resync cannot fall back to the linking user.

The collector pins Stripe API 2025-04-30.basil, verifies account/live balance,
fully paginates subscriptions and their items, validates customer/price bindings,
and rejects unsupported or incomplete contracts. It bounds requests, objects,
response bytes and elapsed time. Monthly/yearly licensed, fixed, native-AUD,
exclusive-tax contracts are calculated with exact rational cents and one final
rounding. Explicit zero is distinguishable from missing data. Discounts, mixed
currency, ambiguous tax, metered/tiered schedules and other unsupported terms
are rejected, not estimated. This narrow subset can refuse otherwise legitimate
accounts; no production account canary has been performed.

Observations carry source digests, page hashes, completeness and a non-atomic
observation window. They explicitly remain `eligibleForValuation:false`.
Snapshots store the labelled observation without legacy top-level monetary
fields; snapshot readers and the evidence emitter refuse to promote it to
revenue, paying customers, L5 evidence, valuation or scoring. All three modern
entry points require successful snapshot persistence before successful sync.
Manual pulls use the existing `resync` source enum; no DB migration is needed.

Legacy unbound collectors remain outside this producer-admission slice. There is
no legal-entity attestation, independent financial calibration, approved source
registry entry or durable nonce ledger added here. Cookie consumption and the
provider's authorization-code semantics must not be described as a durable
application replay ledger.

API contracts checked against primary documentation:
- [Subscription pagination](https://docs.stripe.com/api/subscriptions/list?api-version=2025-04-30.basil)
- [Subscription item pagination](https://docs.stripe.com/api/subscription_items/list?api-version=2025-04-30.basil)
- [Balance live mode](https://docs.stripe.com/api/balance/balance_object?api-version=2025-04-30.basil)
- [Customer attributes](https://docs.stripe.com/api/customers/object?api-version=2025-04-30.basil)

Focused validation: seven Stripe suites, 87 tests passed. Includes account/mode
and scope mismatch, pagination, transport/partial failures, exact rounding,
explicit zero, failed persistence and non-promotion. No external Stripe or paid
model calls were made for these tests.

## SV1 reader slice

Saved investor views and cohort URL ranges now preserve nonnegative safe integer
SVI values above 100. Confidence, traction dimensions and `min_fit` remain
percentages. Three index/filter suites, 58 tests passed, including URL roundtrip
and actual filtering above 100. Full SV1 remains open: mandate storage still has
a 0–100 database constraint, associated form/readers need coordinated migration,
and version-aware score history and other index consumers require completion.
