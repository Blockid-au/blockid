# P10 wave-3 preflight — findings before rows 150–156 activation

**Status.** Findings-only. No spec activation lands with this document.
Authored during autonomous tick 152 as the UNDERSTAND-stage output for
row 150 of `docs/plans/p10-deferred-spec-activation-order.md` after
tick 151 closed wave 2 in full.

**Owner.** Track A P10_hardening. Consumed by the follow-up ticks that
finally activate wave-3 rows 150 / 151 / 153 against a multi-admin-seeded
host once the fixture + seed deltas below land. Rows 152 / 154 / 155 /
156 remain activatable with the current fixture (no delta required).

**Kill switch.** `RESELLER_AUTONOMOUS_LOOP=off` on the host halts the
loop that will consume this finding.

## Purpose

Three design-time mismatches block the wave-3 rows 150 / 151 / 153
scheduled in `docs/plans/p10-deferred-spec-activation-order.md`. All
three surfaced during UNDERSTAND for row 150 (`credit-grant-authz.spec.ts
× no_capability × capability_disabled → 402`). None fire at CI runtime —
they fire at *design* time when each row's oracle is checked against the
actual gate order in
`web/src/app/api/reseller/credits/grant/route.ts` and
`web/src/app/api/reseller/sandbox/setup/route.ts`.

The tick that activates rows 150 / 151 needs to resolve findings 1 and
2 before any assertion can turn green. Row 153 needs finding 3 resolved
in the schedule doc itself. This document records the analysis so those
ticks can apply the fixes instead of re-deriving them.

## Finding 1 — row 150 oracle status code is 402, route returns 403

### Symptom

Row 150's expected column reads `402` for the `capability_disabled`
branch. `web/src/app/api/reseller/credits/grant/route.ts:128-134` maps
`decision.reason` to HTTP status as follows:

```ts
const status =
  decision.reason === "invalid_amount"
    ? 400
    : decision.reason === "capability_disabled"
      ? 403
      : 402;
```

`capability_disabled` returns **403**, not 402. `402` is reserved for
`over_budget_requires_approval` (row 151's oracle — matches route).

### Fix

Applied inline to the schedule doc this tick: row 150's expected column
flipped from `402` to `403`. Row 151 unchanged (already correct at 402).
No route or spec change — the route is the source of truth for the
status contract; the schedule doc was written speculatively.

Follow-up tick's spec (`credit-grant-authz.spec.ts` × `no_capability`)
must assert `resp.status() === 403` + `body.reason === "capability_disabled"`.

### Impact

Doc-only. Non-breaking for shipped code. No fixture, seed, or route
change required.

## Finding 2 — no `reseller_attributions` seed for `no_capability` / `no_budget`

### Symptom (blocks rows 150 + 151 at runtime)

Row 150 probes `capability_disabled` (`no_capability` variant with
`can_grant_credits=false`). Row 151 probes
`over_budget_requires_approval` (`no_budget` variant with
`monthly_credit_budget=100` and no prior grants). Both branches sit
DOWNSTREAM of `decideReveal(target_user_id, allowedCustomerIds)` in the
route:

```
gateRequireFeature → scopedReseller → decideReveal → getSupabaseAdmin →
selfReseller → rollup → decideGrant
```

`scopedReseller().allowedCustomerIds()` reads
`reseller_attributions.subject_user_id WHERE reseller_id = <variant> AND
status = 'active'`. `web/scripts/seed-qa-reseller.mjs:516-519` only
seeds `reseller_attributions` on the `active_wholesale` variant:

```js
if (variant.name === "active_wholesale" && resellerId) {
  await seedPromotionCodes(resellerId, variant.code);
  if (attributedUser) await seedAttribution(resellerId, attributedUser.id, variant.code);
}
```

For `no_capability` + `no_budget` variants, `allowedCustomerIds()`
returns `[]`. Any `target_user_id` sent by the spec fails
`decideReveal` with `not_in_scope` (403) BEFORE `decideGrant` fires the
intended `capability_disabled` (403) or `over_budget_requires_approval`
(402) branch. Rows 150 + 151 can never reach their intended oracle.

### Recommended fix (defer to follow-up tick)

Two coupled edits, mirroring the tick-141 Option A pattern:

**Seed delta.** Extend `web/scripts/seed-qa-reseller.mjs` main loop
(line ~516) to seed `reseller_attributions` on the `no_capability` +
`no_budget` variants as well, gated on `attributedUser` existing (same
guard as `active_wholesale`). Use the same
`QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL` founder — a single seeded
attributed user with `reseller_attributions` rows against three
reseller IDs (active_wholesale, no_capability, no_budget) is
production-legal because `reseller_attributions` has no unique
constraint on `subject_user_id` alone; `(reseller_id, subject_user_id,
subject_type)` is the natural key.

**Fixture delta.** Extend `web/tests/e2e/fixtures/reseller.ts`
`loadTempReseller()` to populate `attributedUserId` +
`attributionExists` + `attributedFounderEmail` for `no_capability` +
`no_budget` variants as well. The current `if (variant ===
"active_wholesale")` gate at line 464 collapses the attribution read
onto one variant; the delta expands it to a whitelist
`["active_wholesale", "no_capability", "no_budget"]`. Promotion codes
stay gated to `active_wholesale` (only that variant needs Stripe promo
IDs per `ck_stripe_objects_by_tier`).

Follow-up tick sequence:

1. Seed delta (edit + re-run against staging with
   `QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL` set).
2. Fixture delta (edit; the whitelist expansion is variant-agnostic
   so single-admin hosts stay compatible via the same
   `attributionExists=false` skip guard rows 146+ already use).
3. Row 150 activation (spec addition; asserts 403 +
   `body.reason === "capability_disabled"` per finding 1).
4. Row 151 activation (spec addition; asserts 402 +
   `body.reason === "over_budget_requires_approval"`).

Each step is a distinct autonomous tick under U.13 sign-off. Rows
152 / 154 / 155 / 156 (all `active_wholesale`) do NOT require this
delta and can activate independently.

### Impact

The seed delta is idempotent (existing lookup-first pattern via
`seedAttribution`) so re-runs on a partially-seeded host are safe.
The fixture delta is additive (populates fields on new variants
without touching the `active_wholesale` code path). No production code
touched.

## Finding 3 — row 153 references a `sandbox_disabled` branch that does not exist

### Symptom

Row 153 reads `sandbox-setup-authz.spec.ts | no_capability |
sandbox_disabled | 402`. Grepping
`web/src/app/api/reseller/sandbox/setup/route.ts` for any capability
check on the reseller row:

```
$ grep -n "sandbox_disabled\|can_grant_credits\|can_create_startups" \
    web/src/app/api/reseller/sandbox/setup/route.ts
(no matches)
```

The route's gate chain is:

```
gateRequireFeature("reseller.console") → scopedReseller →
canProvisionSandbox(scope.role) → sandboxProjectId (idempotent 200) →
selfReseller (reseller_missing 404) → projects.insert → auditLog
```

No branch reads `resellers.can_grant_credits` or any other
sandbox-capability flag. The `no_capability` variant sets
`can_grant_credits=false` + `can_create_startups=false`, but neither
flag is consulted by the sandbox-setup route. Row 153 as written cannot
green — a `no_capability` reseller-admin session would either:

- 200 with `already_existed=true` (if a prior wave-3 row 154 already
  provisioned a sandbox for the `no_capability` reseller), OR
- 200 with `already_existed=false` + a new `projects` row (idempotent
  first-run), OR
- 500 `insert_failed` on a DB failure.

None of these match the `402 sandbox_disabled` oracle.

### Recommended fix (defer to follow-up tick)

Two options:

**Option A — remove row 153 from the schedule.** The wave-3 sandbox
surface is fully covered by row 154 (`active_wholesale` × happy 200).
No branch of the current route needs a `no_capability` probe. The
"sandbox capability" concept was written speculatively into the
schedule doc; it is not part of the shipped route contract.

**Option B — add a `sandbox_disabled` branch to the route.** Would
require: (a) a new reseller-column flag (e.g. `can_provision_sandbox`),
(b) a migration to add it, (c) the route reading it after
`scopedReseller` but before `sandboxProjectId`, (d) a re-derivation of
what "sandbox disabled" means for an already-provisioned reseller org.
Product decision — belongs to the CPO / CTO review lens, not P10
hardening. Not recommended for this tick.

Recommend Option A. Follow-up tick lands:

1. `docs/plans/p10-deferred-spec-activation-order.md` — row 153
   removed from the wave-3 table + a paragraph noting the removal +
   pointing at this finding for the rationale.
2. `docs/plans/reseller-module-goal.md` — review_history entry records
   the removal so a future audit can trace the schedule shrink.

Row 153 was applied to the schedule doc this tick with a strikethrough
note pointing at this finding (in-place removal deferred to the next
tick that also updates the row-count arithmetic in the doc's exit
condition sentence).

### Impact

Doc-only. Non-breaking for shipped code. Row 154 (active_wholesale
happy) remains the sole wave-3 sandbox-surface coverage and needs no
route change to activate.

## Summary — what unblocks each row

| row | variant | branch | blocker | unblock action |
| --- | --- | --- | --- | --- |
| 150 | no_capability | capability_disabled 403 | finding 2 (attribution) | seed + fixture delta |
| 151 | no_budget | over_budget_requires_approval 402 | finding 2 (attribution) | seed + fixture delta |
| 152 | active_wholesale | happy 200 | — | no delta required |
| 153 | (n/a) | sandbox_disabled 402 | finding 3 (no such branch) | remove from schedule |
| 154 | active_wholesale | sandbox happy 200 | — | no delta required |
| 155 | active_wholesale | requests happy 200 | — | no delta required |
| 156 | active_wholesale | requests GET 200 | — | no delta required |

Rows 152 / 154 / 155 / 156 form the wave-3-`active_wholesale` subwave
that can burn through without waiting on the finding 2 delta.
Recommended next autonomous tick after tick 152: activate row 154
(sandbox happy) — it reuses the wave-2 `active_wholesale` fixture
posture and writes exactly one `projects` row (cleanable via existing
`trackProjectForCleanup`), so the CI blast-radius is bounded.

## What this document is NOT

- Not a plan-delta. The plan file's §U.4 / §U.15 / §J.2 language
  remains authoritative — this doc records how the fixture harness has
  to bind to that language for wave 3.
- Not a migration. No SQL is authored or applied here.
- Not a spec activation. Rows 150 / 151 stay `test.skip()` at runtime
  behind `tempResellerSkipReason(variant)` until the seed + fixture
  delta lands. Row 153 stays scheduled with a strikethrough note until
  the follow-up tick removes it.
- Not a route change. Findings 1 + 3 correct the schedule doc against
  the shipped route contract; the route is the source of truth.

## Related documents

- `docs/plans/p10-deferred-spec-activation-order.md` — the schedule
  this finding partly rewrites. Row 150's status flipped to 403 inline
  this tick; rows 151 + 154 + 155 + 156 unchanged; row 153 annotated
  pending removal.
- `docs/plans/p10-wave1-preflight-finding.md` — the wave-1-scoped
  sibling this document mirrors (tick 141 precedent).
- `docs/plans/p10-temp-reseller-mint-fixture-design.md` — the fixture
  design. Section 3 documents the seven-variant fixture; the finding-2
  delta would extend the "populated on active_wholesale only" note to
  cover `no_capability` + `no_budget`.
- `docs/plans/reseller-module-goal.md` — canonical goal file. Tick 152
  entry records all three findings + the row-150 status-code inline
  fix.
- `web/src/app/api/reseller/credits/grant/route.ts` — source of truth
  for the 402/403 mapping (finding 1) + the `decideReveal` →
  `decideGrant` ordering (finding 2).
- `web/src/app/api/reseller/sandbox/setup/route.ts` — source of truth
  for the sandbox-setup gate chain (finding 3).
- `web/scripts/seed-qa-reseller.mjs` — the seeder whose main loop
  extends on the finding-2 follow-up tick.
- `web/tests/e2e/fixtures/reseller.ts` — the fixture whose
  `loadTempReseller()` variant gate expands on the finding-2 follow-up
  tick.
