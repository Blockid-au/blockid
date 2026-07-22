# P10 wave-1 preflight — findings before row 141 activation

**Status.** Findings-only, no spec activation lands with this document.
Authored during autonomous tick 141 as the UNDERSTAND-stage output for
row 141 of `docs/plans/p10-deferred-spec-activation-order.md`.

**Owner.** Track A P10_hardening. Consumed by the follow-up tick that
finally activates wave-1 rows 141–144 against a multi-admin-seeded host.

**Kill switch.** `RESELLER_AUTONOMOUS_LOOP=off` on the host halts the
loop that will consume this finding.

## Purpose

Two data-shape mismatches block the wave-1 rows scheduled in
`docs/plans/p10-deferred-spec-activation-order.md`. Both surfaced during
UNDERSTAND for row 141 (`create-startup-authz.spec.ts × active_retail →
billing_model_not_wholesale → 400`). Neither fires at CI runtime — they
fire at *design* time when the row's oracle is checked against the actual
gate order in `web/src/lib/reseller/create-startup.ts`.

The tick that activates rows 141–144 needs to resolve **both** findings
before any assertion can turn green. This doc records the analysis so
that tick can apply the fix instead of re-deriving it.

## Finding 1 — `active_retail` seed misses `can_create_startups=true`

### Symptom (before tick 141 fix)

Row 141's oracle is `body.reason === "billing_model_not_wholesale"` with
HTTP 400. The `decideCreateStartup()` gate order (create-startup.ts:207)
runs `status → can_create_startups → billing_model → allowed_tiers → …`.
For a variant with `billing_model="retail"` and `can_create_startups=
false`, the second gate fires and the response body carries
`reason:"capability_disabled"` — the third gate (billing_model) is never
reached, so the assertion fails.

That collapses the variant onto the `no_capability` variant's oracle
(row 143 — `no_capability × capability_disabled → 400`) and leaves the
`billing_model_not_wholesale` branch uncovered by any variant.

### Fix (landed this tick)

`web/scripts/seed-qa-reseller.mjs` variant `active_retail` flipped from
`can_create_startups: false` to `can_create_startups: true`. Comment
added in-file cross-referencing this doc so a future edit does not
silently revert it.

The variant now isolates the retail-vs-wholesale decision:

- `status="active"` → passes gate 1.
- `can_create_startups=true` → passes gate 2.
- `billing_model="retail"` → **fires gate 3 → "billing_model_not_wholesale"**.

`no_capability` (still `can_create_startups=false`) remains the sole
carrier for row 143's `capability_disabled` oracle. No collision.

`can_grant_credits` stays `false` for `active_retail` — retail resellers
do not grant sandbox credits in production semantics, and the
`credit-grant-authz.spec.ts` rows in wave 3 use `no_capability` and
`no_budget` for that surface (rows 150–151), not `active_retail`.

### Impact

Non-breaking for any currently-shipped code path. The seeder is only
consumed by `web/tests/e2e/fixtures/reseller.ts::loadTempReseller()` and
`docs/plans/p10-temp-reseller-mint-fixture-design.md`; no production or
CI surface currently reads the row.

## Finding 2 — no plan seed grants `reseller.create_startup`

### Symptom (blocks rows 141–144 at runtime today)

`POST /api/reseller/create-startup` calls
`gateRequireFeature("reseller.create_startup")` at
`web/src/app/api/reseller/create-startup/route.ts:459` before any
`scopedReseller()` or `decideCreateStartup()` decision runs. The gate
resolves the user's plan via `getEntitlements(user.plan)` in
`web/src/lib/entitlements.ts:197`, which reads `plans.feature_flags`
via `getPlanCached()` and falls back to `LEGACY_FEATURE_FALLBACK` when
the DB read misses.

The declared `Feature` union in `entitlements.ts:71` contains
`reseller.console`, `reseller.create_startup`, `reseller.grant_credits`.
But:

- `LEGACY_FEATURE_FALLBACK` (entitlements.ts:108) has entries for
  `founder_free`, `founder_starter`, `founder_growth`, `founder_scale`,
  `founder_enterprise` — **none contain any `reseller.*` feature**.
- `web/supabase/migrations/0074_plans_matrix_and_gst.sql` seeds the
  `plans` table without any `reseller.*` entry in its `feature_flags`
  (grep-verified — `grep -in "reseller" 0074_plans_matrix_and_gst.sql`
  returns zero matches).
- `web/content/plans.csv` does not exist on this host.
- No other migration or seed script writes a `reseller_*` plan row.

Every reseller-admin QA account seeded by
`web/scripts/seed-test-users.mjs::upsertResellerFixtureUser()` starts
with `plan: "free"` (mapped to `founder_free`). Their entitlements list
is `["svi.run.limited"]` — `reseller.create_startup` is not included.

Result: `gateRequireFeature("reseller.create_startup")` returns 402
`{ ok: false, error: "feature_locked", feature: "reseller.create_startup" }`
for every reseller-admin QA account, regardless of variant. The
`decideCreateStartup()` branch under test is never reached.

This is not specific to `create-startup`. The same issue blocks:

- `credit-grant-authz.spec.ts` — needs `reseller.grant_credits`.
- `sandbox-setup-authz.spec.ts` — needs `reseller.grant_credits`
  (feature-gates.manifest.ts:75).
- Any wave-3 row (rows 150–156).

### Recommended fix (defer to follow-up tick)

Three options, listed in ascending order of surface area:

**Option A — extend `LEGACY_FEATURE_FALLBACK` with a `reseller_admin`
bundle.** One edit in `web/src/lib/entitlements.ts:108`. Adds:

```ts
reseller_admin: [
  "reseller.console",
  "reseller.create_startup",
  "reseller.grant_credits",
],
```

Then extend `upsertResellerFixtureUser()` in
`web/scripts/seed-test-users.mjs` to write `plan: "reseller_admin"`
instead of `plan: "free"` for the seven `qa-reseller-<variant>@blockid.au`
rows. No plans table row required — the fallback path catches every
lookup. Smallest surface; keeps the fix inside the fixture harness so
production behaviour is unchanged.

Downside: The `reseller_admin` plan never lands in the plans table, so
the `/pricing` funnel does not surface it. But the reseller module
never sold `reseller.*` features via `/pricing` — resellers sign a
separate agreement and get provisioned by admin, so this is the
correct posture.

**Option B — add a `reseller_admin` row to migration 0091 (or a new
migration) seeded into the `plans` table.** Larger surface (migration
+ DB apply + NOTIFY pgrst reload) but persists across `getPlanCached`
lookups without needing the fallback path.

**Option C — extend the `resolveSegment()` path in feature-gate.ts to
also read `reseller_admins` and short-circuit the entitlement check
when the user is a reseller admin.** Larger surface + couples the gate
helper to the reseller module + creates a segment-vs-plan skew that
could hide bugs in the reseller.console gate. Not recommended.

Recommend Option A. Follow-up tick lands:

1. `web/src/lib/entitlements.ts` — new `reseller_admin` fallback entry.
2. `web/scripts/seed-test-users.mjs::upsertResellerFixtureUser()` —
   write `plan: "reseller_admin"` for the seven per-variant rows +
   the shared `qa-reseller-1@blockid.au` back-compat row.
3. `web/src/lib/entitlements.test.ts` (or new file) — one vitest case
   proving the `reseller_admin` plan grants all three `reseller.*`
   features and no others.
4. `docs/plans/reseller-module-plan.md` § U.14 note — persist the
   Option A decision + rationale so a future audit does not question
   the seed shortcut.

Rows 141–144 then activate in the tick following that seed fix. Each
row is a ~15-line paste of the create-startup-authz.spec.ts skeleton
already used by the existing two-row spec, plus a
`loadTempReseller(variant)` + `test.skip(fixture === null)` pattern.

## What this document is NOT

- Not a plan-delta. The plan file's §U.14 / §J.2 language remains
  authoritative — this doc records how the fixture harness has to bind
  to that language.
- Not a migration. No SQL is authored or applied here.
- Not a spec activation. Rows 141–144 stay `test.skip()` at runtime
  behind `tempResellerSkipReason(variant)` until the plan-entitlement
  seed lands.

## Related documents

- `docs/plans/p10-deferred-spec-activation-order.md` — the schedule
  this finding blocks. Row 141 remains scheduled but cannot activate
  until Option A lands.
- `docs/plans/p10-temp-reseller-mint-fixture-design.md` — the fixture
  design. Section 5 (QA account seeder delta) already documents the
  seven-account cohort; the Option A follow-up tick extends section 5
  to also cover the plan-entitlement stamp.
- `docs/plans/p10-temp-reseller-admin-scope-collision-finding.md` — the
  earlier finding that produced the multi-admin cohort. This doc is the
  wave-1-scoped sibling.
- `docs/plans/reseller-module-goal.md` — canonical goal file. Tick 141
  entry records both findings + the seed-flip fix.
- `web/src/lib/entitlements.ts` — the fallback map that will pick up
  the Option A `reseller_admin` bundle.
- `web/scripts/seed-test-users.mjs` — the seeder that will stamp the
  `reseller_admin` plan onto the seven per-variant admin rows.
- `web/scripts/seed-qa-reseller.mjs` — the seeder whose `active_retail`
  variant just gained `can_create_startups=true` in this tick.
