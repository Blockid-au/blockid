# P10 temp-reseller mint fixture — scopedReseller collision finding

**Status.** Design-only finding. No code lands with this document.
Discovered during autonomous tick 135 while scoping the first deferred spec
activation (see `docs/plans/reseller-module-goal.md` tick 134's "options"
list, item (ii)).

**Owner.** Track A P10_hardening. Blocks the ~50 deferred HAPPY-PATH /
downstream-reason rows across ~13 spec files that consume
`loadTempReseller(variant)` from `web/tests/e2e/fixtures/reseller.ts`.

**Kill switch.** `RESELLER_AUTONOMOUS_LOOP=off` on the host halts the loop
that surfaced this finding; the finding itself is a real design conflict
that will bite the first spec that boots even when the loop is off.

## Summary

The temp-reseller mint fixture design as shipped in ticks 128 (§1 mint
script), 132 (§5 QA account seeder delta), and 134 (§3 Playwright fixture
wiring) all mirror the SAME `qa-reseller-1@blockid.au` `app_users.id` onto
`reseller_admins` on ALL SEVEN variant resellers. That mirroring is called
out in `docs/plans/p10-temp-reseller-mint-fixture-design.md:211-212`
verbatim:

> `reseller_admins(user_id=<QA_RESELLER_ADMIN_EMAIL user id>, role='admin')`
> on every variant so `scopedReseller()` resolves.

But `scopedReseller()` at `web/src/lib/reseller/scope.ts:44-52` uses
`.maybeSingle()` on the `reseller_admins` lookup for `.eq("user_id",
user.id).eq("status", "active")`:

```ts
const { data: membership, error } = await supabase
  .from("reseller_admins")
  .select("reseller_id, role, status")
  .eq("user_id", user.id)
  .eq("status", "active")
  .maybeSingle();

if (error || !membership) {
  throw new ResellerScopeError("user is not a reseller admin", "no_membership");
}
```

PostgREST + supabase-js `.maybeSingle()` semantics: returns the row when
exactly ZERO or ONE match, returns `error` (PGRST116) when MORE THAN ONE
match. So if `qa-reseller-1@blockid.au` is a member of seven variants, the
first `/api/reseller/*` request that logs in as that user throws
`no_membership` — the very error the fixture is trying to avoid — and every
spec that consumes `loadTempReseller(variant)` fails at the scope gate
BEFORE ever exercising its target branch.

The fixture's own `loadTempReseller()` implementation acknowledges the
per-variant mirror by scoping its `reseller_admins` lookup with
`.eq("reseller_id", resellerId).eq("user_id", adminUser.id)` (line
314-319) — the read side works fine. It's the runtime `scopedReseller()`
that trips on the multi-row set.

## Blast radius

Every deferred HAPPY-PATH / downstream-reason row that ticks 92..126 (38
spec files) declared out of scope pending this fixture. Concretely: the
first `POST /api/reseller/create-startup` request against the
`active_retail` variant to probe `billing_model_not_wholesale` returns:

- HTTP `403` (not the expected `400`)
- Body: `{ ok: false, reason: "no_membership" }` (not `"billing_model_not_wholesale"`)

The spec fails, no coverage of the intended branch, wasted CI minute.

## Resolution options

### Option A — one admin app_user per variant (recommended)

Mirror production semantics: a given `app_users` row is a member of at
most ONE reseller. The fixture mints seven admin accounts:

| variant | admin email |
| --- | --- |
| `active_wholesale` | `qa-reseller-wholesale-active@blockid.au` |
| `active_retail` | `qa-reseller-retail-active@blockid.au` |
| `paused` | `qa-reseller-paused@blockid.au` |
| `terminated` | `qa-reseller-terminated@blockid.au` |
| `no_capability` | `qa-reseller-no-cap@blockid.au` |
| `tier_only_zero` | `qa-reseller-tier-zero@blockid.au` |
| `no_budget` | `qa-reseller-no-budget@blockid.au` |

Changes required:

1. `web/scripts/seed-test-users.mjs` — extend the reseller-fixture block
   from tick 132 to mint SEVEN `app_users` rows (one per variant email)
   instead of the current single `qa-reseller-1@blockid.au` row. Preserve
   the existing single-account default via an env override (`QA_RESELLER_
   MULTI_ADMIN=1` gates the new behaviour) so the tick 132 contract
   stays backwards-compatible until the fixture flips.

2. `web/scripts/seed-qa-reseller.mjs` — replace `QA_RESELLER_ADMIN_EMAIL`
   (single) with a per-variant lookup keyed off the variant name. Each
   variant's `reseller_admins` insert uses that variant's email's
   `app_users.id`. Preserve the single-email fallback so hosts that only
   have `qa-reseller-1@blockid.au` fall through to today's behaviour
   (with a warning about the scopedReseller collision).

3. `web/tests/e2e/fixtures/reseller.ts` — extend `TempResellerFixture`
   with an `adminEmail: string` field (in addition to `adminUserId`).
   `loadTempReseller(variant)` reads the per-variant email from an env
   map with hard-coded defaults matching the table above. Specs
   `loginAs(page, fixture.adminEmail)` instead of hard-coding
   `harness.admin.email`.

4. `docs/plans/p10-temp-reseller-mint-fixture-design.md` — update §5 to
   describe the seven-account cohort and update §1 to describe the
   per-variant admin mirror. Update the env-var contract table (§347+)
   with the seven new `QA_RESELLER_ADMIN_EMAIL_<VARIANT>` slots.

Cost: one focused implementation tick per artefact (roughly the same
tick-cost as §1/§2/§3/§4/§5 shipping was). Idempotent per row so re-runs
against staging are safe.

### Option B — scoped session env override

Extend `scopedReseller()` to accept an override env var
(`QA_RESELLER_SCOPE_RESELLER_ID`) that pins the reseller_id when the
lookup finds multiple memberships. Loud warning logged on the
production path if the env var is ever set outside a QA host.

Cost: one small production-code change + the fixture passes the env var
per spec.

Trade-off: introduces test scaffolding into production code. Rejected
absent a stronger signal that Option A is too expensive.

### Option C — drop non-happy-path variants

Only mint `active_wholesale` in the fixture. Deferred downstream-reason
rows stay deferred until a per-branch harness is scoped.

Cost: near-zero (deletion). But leaves the 5 downstream-reason rows
(`reseller_not_active`, `capability_disabled`,
`billing_model_not_wholesale`, `tier_not_allowed`, `no_budget`)
permanently uncovered.

Trade-off: worst coverage outcome. Rejected unless human review deems
the coverage debt acceptable.

## Recommendation

Option A. Aligned with production semantics (a user IS scoped to at
most one reseller), zero production-code surface change, additive to
the four §-artefacts already shipped.

## Next steps

1. Human sign-off on Option A vs B vs C.
2. Implementation tick lands the seed-test-users delta (Option A step 1).
3. Implementation tick lands the seed-qa-reseller delta (Option A step 2).
4. Implementation tick lands the fixture delta (Option A step 3).
5. Implementation tick lands the design doc update (Option A step 4).
6. First deferred spec-activation tick can now boot: pick
   `create-startup billing_model_not_wholesale` against
   `active_retail` as the smoke test.

Until then, the fixture cannot be used to activate any deferred spec row
that logs in as the reseller admin — the scopedReseller gate fails
first. Specs remain `test.skip()` behind
`tempResellerSkipReason(variant)` as designed.

## Files touched by this finding

None. Design-only artefact.

## Design source

- `docs/plans/p10-temp-reseller-mint-fixture-design.md` §§1, 3, 5
- `docs/plans/reseller-module-goal.md` tick 134 "options" list, item (ii)
- `web/src/lib/reseller/scope.ts:37-52` scopedReseller() with
  `.maybeSingle()` invariant
- `web/scripts/seed-qa-reseller.mjs:270-294` mirrorAdmin() invoked per
  variant
- `web/scripts/seed-test-users.mjs` reseller-fixture block from tick 132
- `web/tests/e2e/fixtures/reseller.ts:286-396` loadTempReseller()
