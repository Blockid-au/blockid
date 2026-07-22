# P10 temp-reseller mint fixture — design pass

**Status.** Design updated to reflect the seven-account cohort landed by
the Option A resolution of the `scopedReseller()` `.maybeSingle()`
collision finding (see
`docs/plans/p10-temp-reseller-admin-scope-collision-finding.md`).

- Option A step 1 (`seed-test-users.mjs` seven `app_users` rows behind
  `--reseller-multi-admin` / `QA_RESELLER_MULTI_ADMIN=1`) shipped tick 136.
- Option A step 2 (`seed-qa-reseller.mjs` per-variant `resolveVariantAdmin()`
  behind the same gate) shipped tick 137.
- Option A step 3 (`fixtures/reseller.ts` `TempResellerFixture.adminEmail`
  + `resolveVariantAdminEmail()` mirror) shipped tick 138.
- Option A step 4 (THIS design-doc update) shipped this tick.

The remaining follow-up ticks (Playwright spec activation against the
seeded cohort) are still gated on P8.5 Stripe env + P1.5 H.20 ABN/GST for
the Stripe-mint / GST-reconciliation happy paths, but the non-Stripe /
non-GST rows can begin activation any time a host runs both seeders with
the multi-admin gate ON.

**Scope owner.** Track A P10_hardening — Playwright E2E surface.

**Why this exists.** Ticks 92..126 landed 38 reseller-lens Playwright specs
covering the *safe half* of every reseller/admin route: pre-scope auth
branches (`no_user`, `not_admin`, `unauthorised`, `feature_locked`,
`insufficient_role`), pre-write body/path validators (`code_required`,
`invalid_body`, `not_found`, `invalid_email`, `company_name_required`,
`invalid_plan_tier`, `invalid_discount_tier`, `tier_not_allowed`,
`capability_disabled`, `invalid_amount`, etc.). Each spec explicitly defers
its HAPPY-PATH row(s) and its downstream error branches to a *"temp-reseller
mint fixture follow-up"*. This document specifies that fixture so the
follow-up tick has a concrete design to implement against.

The fixture must satisfy plan §J.2 constraints:

1. **No per-test row seeding.** A test that mutates a shared resellers row
   would poison every other admin-facing spec in the same worker.
2. **No harness-driven DB tampering.** Broken SELECTs / broken UPDATEs
   (`query_failed`, `update_failed`, `read_failed`) stay out of scope — a
   spec that flips a table into a bad state is worse than a missing row.
3. **No production data mutation.** Fixture rows must be structurally
   isolated from `INFOVISION`, `ACCEL_*`, and any human-seeded reseller.

## Deferred rows this fixture unblocks

Grouped by route file, quoting the *"deliberately out of scope"* section of
the tick that shipped the safe half. Row counts are the number of new
Playwright assertions the fixture would enable (not tests — several rows can
share a single test with a fixture-driven table).

### /api/reseller/create-startup (POST) — tick 94 (validation) + tick 116 (authz)

Downstream `decideCreateStartup()` reasons that need a real reseller row:

| reason | fixture requirement |
| --- | --- |
| `reseller_not_active` | reseller row with `status='paused'` or `'terminated'` |
| `capability_disabled` | reseller row with `can_create_startups=false` |
| `billing_model_not_wholesale` | reseller row with `billing_model='retail'` |
| `tier_not_allowed` | reseller row with `allowed_tiers` missing the probe tier |
| `existing_active_attribution` | reseller row + a founder row with a live `reseller_attributions` mirror already present |
| `promotion_code_missing` | reseller row with no matching `reseller_promotion_codes(tier_pct)` |

Rows: 6. Happy path (201 created) needs a 7th row with billing_model=wholesale,
capability=on, tier allowed, and a matching promotion code minted.

### /api/reseller/credits/grant (POST) — tick 93 (validation) + tick 96 (authz)

Downstream `decideGrant()` reasons that need a real reseller row + monthly
usage rollup:

| reason | fixture requirement |
| --- | --- |
| `budget_exhausted` | reseller row with `monthly_credit_budget=100`; prime `reseller_credit_grants(kind=grant, month_key=CURRENT)` with cumulative amount ≥ 100 |
| `over_budget_requires_approval` | reseller row with capability + budget prime that flips a grant into 402 |
| `capability_disabled` | reseller row with `can_grant_credits=false` |
| `target_not_in_scope` | reseller row + probe target `user_id` NOT present in `reseller_attributions` |

Rows: 4. Happy path: reseller row with capability on + budget headroom +
target in scope → 201 + credit_balances/credit_transactions/mirror writes.

### /api/reseller/sandbox/setup (POST) — tick 97 (authz only)

The route already has an authz spec but no validation twin because the
route emits `insufficient_role` from `canProvisionSandbox()`. Under the
fixture:

| reason | fixture requirement |
| --- | --- |
| `insufficient_role` | reseller row + reseller_admin row with `role='member'` (not `admin`/`owner`) |
| Happy path (201) | reseller row + reseller_admin row with `role='admin'` + `projects` row absence for `slug='reseller-sandbox-<code>'` |
| Idempotency (200 same slug) | second call after happy path returns the existing sandbox project id |

Rows: 3.

### /api/reseller/customers/[id]/reveal-email (POST) — tick 117 (validation) + tick 100 (authz)

Deferred rows all need `allowedCustomerIds` to contain the probe `id`:

| reason | fixture requirement |
| --- | --- |
| Happy path (200, `email` returned) | reseller row + attributed founder row + `reseller_audit_log(action='reveal_email', fields=['email'])` written before response |
| `out_of_scope` (403) | reseller row + a probe `user_id` NOT in `reseller_attributions` |

Rows: 2.

### /api/reseller/customers/[id]/drawer (GET) — tick 118 (validation) + tick 101 (authz)

| reason | fixture requirement |
| --- | --- |
| Happy path (200 with `overview`/`progression`/`reports` payload) | reseller row + attributed founder + optional `svi_analyses` rows |
| `out_of_scope` (403) | reseller row + probe `user_id` NOT in `reseller_attributions` |

Rows: 2. Audit-log side-effect assertion (action=`view_customer_drawer`)
folds into the happy path.

### /api/reseller/reports/[month]/signed-url (GET) — tick 119 (validation) + tick 102 (authz)

| reason | fixture requirement |
| --- | --- |
| `not_exposed` (403 outside 12-month window) | reseller row + `reseller_report_files(month_key=<13mo ago>)` upsert |
| `not_found` (404) | reseller row + no `reseller_report_files` row for `month_key` |
| Happy path (200 signed URL, TTL 86400s) | reseller row + `reseller_report_files` row + private storage object under `reseller-reports/<reseller_id>/<month_key>.csv` |

Rows: 3. Audit-log assertion (action=`download_report`) folds into happy path.

### /api/reseller/requests (POST) — tick 92 (validation) + tick 116 (authz)

| reason | fixture requirement |
| --- | --- |
| Duplicate code_request (409) | reseller row + an existing `reseller_requests(status='pending', request_type='code_request', tier_pct=<probe>)` |
| Happy path (201) | reseller row with capability on, no existing pending code_request for the same tier |
| `tier_not_allowed` — folded from `allowed_tiers` mismatch |
| `capability_disabled` — reseller row with `can_grant_credits=false` for over_budget_approval type |

Rows: 4.

### /api/reseller/requests (GET list) — reseller-requests-list-authz.spec.ts

Happy path (200 with per-reseller filter): reseller row + at least one
`reseller_requests` row scoped by `scopedReseller`. Row: 1.

### /api/admin/resellers/[code] (GET/PATCH/DELETE) — ticks 103/104/123/125/126

| verb | happy-path fixture requirement |
| --- | --- |
| GET (200) | reseller row + optional `reseller_promotion_codes` + `reseller_admins` + attributions/commissions summary rows |
| PATCH (200 + row update) | reseller row + valid patch body (`display_name` change), then assert `updated_at` advanced |
| DELETE (200 soft delete → `status='terminated'`) | reseller row that starts `status='active'` |

Rows: 3 (one per verb). `validateAdminResellerPatch` reasons (`empty_patch`,
`unknown_field`, `display_name_required`, `invalid_tier`,
`invalid_billing_model`, `wholesale_requires_gst`, `wholesale_requires_abn`,
`invalid_abn_format`, `invalid_hex_color`, `invalid_commission_share`,
`negative_budget`) can then be exercised against the same seeded row without
mutating it (each PATCH is expected to reject before the UPDATE fires). Rows:
+11.

### /api/admin/resellers (POST create) — tick 122 (validation) + tick 105 (authz)

Happy path (201 + row insert): body with unique code + display_name +
retail billing → assert new row appears in `resellers` list. `code_taken`
(409): body reusing the fixture reseller's code. Row: 2.

### /api/admin/resellers/requests/[id] (PATCH) — tick 103 (authz)

| reason | fixture requirement |
| --- | --- |
| `not_found` (404) | probe UUID that does not match any `reseller_requests.id` (safe — no seed needed; can ship without fixture) |
| `already_decided` (409) | seed a `reseller_requests` row with `status='approved'` then attempt to re-approve |
| `invalid_action` (400) | seed a `reseller_requests(status='pending')` row + PATCH `{action: 'garbage'}` |
| `payload_incomplete` (422 code_request path) | seed a `reseller_requests(request_type='code_request', payload={tier_pct: 'not-a-number'})` |
| Happy path — approve code_request → mint Stripe coupon + promotion_code | reseller row + `reseller_requests(request_type='code_request', payload={tier_pct: 20, suggested_suffix: null})` + Stripe test-mode account (P8.5 dependency for real Stripe calls; can be mocked with `nock`-style intercept for isolation) |
| Happy path — approve over_budget_approval → bump credit_balances | reseller row + attributed founder + `reseller_requests(request_type='over_budget_approval', payload={target_user_id, requested_amount})` |

Rows: 6.

### /api/showcase-reviews (POST + GET) — tick 121 (validation) + authz

Happy path (POST 201 + comment_hash stamp): access-token row keyed to a
`data_rooms` row → `showcase_reviews` upsert on `(project_id,
reviewer_email)`. Rows: 2 (POST happy + GET founder-scoped).

### Attribution timing — tick 83 scaffolded, rows deferred

`attribution-timing.spec.ts` has `test.skip()` rows waiting on a
DB-inspection helper that reads `reseller_attributions` after
`createProject()` fires. Fixture needs to expose a
`readAttributionByProjectId(projectId)` helper for the two skipped rows to
land.

## Fixture surface — what the follow-up tick has to build

### 1. Node-side mint script

**File.** `web/scripts/seed-qa-reseller.mjs` (mirrors
`seed-test-users.mjs` shape: `#!/usr/bin/env node`, ESM, direct
`@supabase/supabase-js` client via `SUPABASE_SERVICE_ROLE_KEY`).

**Flags.**
```
--dry-run            Print SQL, do not touch DB
--reset              Delete every row prefixed QA-PROBE-* first
--variant <name>     Seed only the named variant (see table)
```

**Variants.** One resellers row per variant so specs pick the row that
matches their target branch without polluting a shared row. Codes are
prefixed `QA-PROBE-` (stripped by `normaliseResellerCode` to `QAPROBE...`),
so a route that hits the fixture cannot collide with `INFOVISION`,
`ACCEL_*`, or any real reseller.

| variant | code | billing_model | can_create_startups | can_grant_credits | status | allowed_tiers | budget |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `active_wholesale` | `QA-PROBE-WHOLESALE-ACTIVE` | wholesale | true | true | active | [0,10,20,30,40] | 20000 |
| `active_retail` | `QA-PROBE-RETAIL-ACTIVE` | retail | false | false | active | [0,10,20,30,40] | 0 |
| `paused` | `QA-PROBE-PAUSED` | wholesale | true | true | paused | [0,10,20,30,40] | 20000 |
| `terminated` | `QA-PROBE-TERMINATED` | wholesale | true | true | terminated | [0,10,20,30,40] | 20000 |
| `no_capability` | `QA-PROBE-NO-CAP` | wholesale | false | false | active | [0,10,20,30,40] | 20000 |
| `tier_only_zero` | `QA-PROBE-TIER-ONLY-0` | wholesale | true | true | active | [0] | 20000 |
| `no_budget` | `QA-PROBE-NO-BUDGET` | wholesale | true | true | active | [0,10,20,30,40] | 100 |

**Downstream inserts per variant.**

- `reseller_admins(user_id=<per-variant admin user id>, role='admin')` on
  every variant so `scopedReseller()` resolves. The user id is resolved by
  `resolveVariantAdmin(variantName)` in `seed-qa-reseller.mjs`, which:
    1. When the multi-admin gate is ON
       (`--reseller-multi-admin` or `QA_RESELLER_MULTI_ADMIN=1`), looks up
       the per-variant email from an override env var
       (`QA_RESELLER_ADMIN_EMAIL_<VARIANT>`, upper-snake), falling back to
       the hard-coded `MULTI_ADMIN_EMAILS` slot in the table below.
    2. When the multi-admin gate is OFF, falls back to `QA_ADMIN_EMAIL` so
       every variant collapses to a single admin — matching the tick 132
       single-account cohort semantics.

  Multi-admin cohort (default under `--reseller-multi-admin`):

  | variant | admin email (default) | env override slot |
  | --- | --- | --- |
  | `active_wholesale` | `qa-reseller-wholesale-active@blockid.au` | `QA_RESELLER_ADMIN_EMAIL_ACTIVE_WHOLESALE` |
  | `active_retail` | `qa-reseller-retail-active@blockid.au` | `QA_RESELLER_ADMIN_EMAIL_ACTIVE_RETAIL` |
  | `paused` | `qa-reseller-paused@blockid.au` | `QA_RESELLER_ADMIN_EMAIL_PAUSED` |
  | `terminated` | `qa-reseller-terminated@blockid.au` | `QA_RESELLER_ADMIN_EMAIL_TERMINATED` |
  | `no_capability` | `qa-reseller-no-cap@blockid.au` | `QA_RESELLER_ADMIN_EMAIL_NO_CAPABILITY` |
  | `tier_only_zero` | `qa-reseller-tier-zero@blockid.au` | `QA_RESELLER_ADMIN_EMAIL_TIER_ONLY_ZERO` |
  | `no_budget` | `qa-reseller-no-budget@blockid.au` | `QA_RESELLER_ADMIN_EMAIL_NO_BUDGET` |

  The multi-admin cohort mirrors production semantics: any given
  `app_users` row is a member of at most ONE reseller, so
  `scopedReseller()`'s `.maybeSingle()` invariant on the
  `reseller_admins` lookup does not collide (see
  `docs/plans/p10-temp-reseller-admin-scope-collision-finding.md`).
- `reseller_promotion_codes(reseller_id, tier_pct, code=<code>_T<tier>,
  active=true)` on `active_wholesale` for tiers 20 + 40 so the happy path
  can drive a real coupon.
- `reseller_attributions(reseller_id, user_id=<QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL user id>,
  project_id=<seeded project id>)` on `active_wholesale` only.
- `reseller_report_files(reseller_id, month_key=<current>, storage_path=<qa-probe/{month}.csv>)`
  on `active_wholesale` only. Upload a `Content-Type: text/csv` blob to the
  `reseller-reports` bucket at the same path so signed-URL happy path can
  return a real URL.
- No `reseller_requests` inserts here — those live in a companion
  `seed-qa-reseller-requests.mjs` (Section 2) so the requests inbox specs
  can burn through their happy-path rows without touching the shared
  resellers rows.

**Idempotency.** Each insert uses `ON CONFLICT (...) DO NOTHING` or a
lookup-first pattern; re-run is a no-op on unchanged state and a bump-fields
UPSERT on drift.

**Cleanup.** `--reset` deletes:
```sql
DELETE FROM reseller_report_files WHERE reseller_id IN (SELECT id FROM resellers WHERE code LIKE 'QAPROBE%');
DELETE FROM reseller_attributions  WHERE reseller_id IN (SELECT id FROM resellers WHERE code LIKE 'QAPROBE%');
DELETE FROM reseller_promotion_codes WHERE reseller_id IN (SELECT id FROM resellers WHERE code LIKE 'QAPROBE%');
DELETE FROM reseller_admins        WHERE reseller_id IN (SELECT id FROM resellers WHERE code LIKE 'QAPROBE%');
DELETE FROM reseller_requests      WHERE reseller_id IN (SELECT id FROM resellers WHERE code LIKE 'QAPROBE%');
DELETE FROM reseller_credit_grants WHERE reseller_id IN (SELECT id FROM resellers WHERE code LIKE 'QAPROBE%');
DELETE FROM reseller_audit_log     WHERE actor_user_id IN (SELECT user_id FROM reseller_admins WHERE reseller_id IN (SELECT id FROM resellers WHERE code LIKE 'QAPROBE%'));
DELETE FROM resellers              WHERE code LIKE 'QAPROBE%';
```
Storage bucket objects are deleted via `supabase.storage.from('reseller-reports').remove([...paths])`.

The `LIKE 'QAPROBE%'` guard is the fixture invariant: **no real reseller
code starts with `QAPROBE`**. If InfoVision or a future partner ever adopts
a `QAPROBE`-prefixed code, this fixture must migrate its prefix.

### 2. Reseller requests companion seeder

**File.** `web/scripts/seed-qa-reseller-requests.mjs`.

**Why separate.** The requests inbox specs need to mutate `status` fields
(approve/deny) which is a *terminal* transition (`ck_credit_link`,
`ck_promo_link`, `ck_status_transition`). Once a row is approved it cannot
go back to pending, so the seeder mints a *fresh row per spec run* keyed by
a random UUID + a per-run `qa_run_id` in metadata for correlation.

**Variants.**

| variant | request_type | status | payload |
| --- | --- | --- | --- |
| `code_request_pending_tier20` | code_request | pending | `{tier_pct: 20, suggested_suffix: null}` |
| `code_request_pending_tier0` | code_request | pending | `{tier_pct: 0}` |
| `code_request_incomplete` | code_request | pending | `{tier_pct: "not-a-number"}` |
| `over_budget_pending` | over_budget_approval | pending | `{target_user_id: <fixture attributed user_id>, requested_amount: 500, reason: "QA probe"}` |
| `already_approved` | code_request | approved | `{tier_pct: 20}` + `linked_promotion_code_id: <existing>` |
| `already_denied` | code_request | denied | `{tier_pct: 20}` + `decision_reason: "QA probe"` |

**Cleanup.** Same `LIKE 'QAPROBE%'` scope + optional `--reset-metadata
qa_run_id=<id>` for per-CI-run cleanup so parallel workers do not stomp
each other.

### 3. Playwright fixture wiring

**File.** `web/tests/e2e/fixtures/reseller.ts` — extended with:

```ts
export interface TempResellerFixture {
  variant: ResellerVariant;
  resellerId: string;
  code: string;
  adminUserId: string;
  attributedUserId: string | null;
  attributedProjectId: string | null;
  promotionCodes: ReadonlyArray<{tier_pct: number; code: string; id: string}>;
  cleanup(): Promise<void>;
}

export type ResellerVariant =
  | "active_wholesale"
  | "active_retail"
  | "paused"
  | "terminated"
  | "no_capability"
  | "tier_only_zero"
  | "no_budget";

export async function loadTempReseller(
  variant: ResellerVariant,
): Promise<TempResellerFixture | null>;
```

Implementation reads the pre-seeded resellers row (mint script must run
before the Playwright suite; not per-test) and resolves the tuple. Returns
`null` when `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset so specs
`test.skip()` gracefully.

`cleanup()` is a **no-op** by default — the shared seed lives across the
whole suite. Specs that need to mutate row state (approve a request, insert
a credit_transactions row, etc.) do so against the *requests* seeder's
per-run rows, not the shared reseller row. The one exception is
`sandbox_setup happy path` which inserts a `projects` row — that spec
opts-in to `cleanup()` which deletes the seeded `projects` row after the
test.

### 4. Storage bucket seeder

**File.** `web/scripts/seed-qa-reseller-storage.mjs`.

**Purpose.** The signed-URL happy path needs a real object under
`reseller-reports/<reseller_id>/<month_key>.csv`. Node-side upload:
```js
const csv = "reseller_id,month_key,report_row\nQA-PROBE-WHOLESALE-ACTIVE,2026-07,fixture-row";
await supabase.storage.from("reseller-reports").upload(
  `${resellerId}/2026-07.csv`,
  csv,
  { contentType: "text/csv", upsert: true },
);
```

**Cleanup.** `supabase.storage.from("reseller-reports").remove([<path>])` on
`--reset`.

### 5. QA account seeder delta

**File.** `web/scripts/seed-test-users.mjs` — appended with a
`reseller_admin` segment. Two cohort modes gated by the same flag as
`seed-qa-reseller.mjs`:

- **Single-admin cohort (default).** `qa-reseller-1@blockid.au` gets an
  `app_users.role='founder'` (regular user) AND is available to be mirrored
  onto every variant's `reseller_admins` row via `QA_ADMIN_EMAIL`. Preserved
  for backwards compatibility with the tick 132 seeder contract; usable
  only when the fixture consumer is a spec that logs into a single variant
  per test-run (specs that switch variants across a run trip the
  `scopedReseller()` `.maybeSingle()` collision).

- **Multi-admin cohort (`--reseller-multi-admin` or
  `QA_RESELLER_MULTI_ADMIN=1`).** Mints SEVEN `app_users` rows — one per
  variant email in the table above — each with `role='founder'`.
  `seed-qa-reseller.mjs` then mirrors each variant's admin row onto that
  variant's app_user id via `resolveVariantAdmin(variantName)`. This is
  the cohort required to activate the ~50 deferred HAPPY-PATH /
  downstream-reason rows because it aligns with production semantics
  (any `app_users` row is a member of at most ONE reseller) so
  `scopedReseller()` never trips PGRST116.

Additionally, one attributed founder (`qa-founder-attributed-1@blockid.au`)
gains an `app_users.attribution_reseller_id=<QA-PROBE-WHOLESALE-ACTIVE>`
stamp so the co-branding pill spec keeps working with the fixture instead
of a hand-seeded reseller.

The Playwright fixture at `web/tests/e2e/fixtures/reseller.ts` exposes the
resolved per-variant admin email as `TempResellerFixture.adminEmail` via
`resolveVariantAdminEmail(variant)`, which mirrors
`resolveVariantAdmin()` dispatch order verbatim. Specs
`loginAs(page, fixture.adminEmail)` per variant so each variant hits a
DISTINCT `app_users` row.

## Env-var contract

The follow-up tick documents these in `web/tests/e2e/README.md` and in
`web/tests/e2e/fixtures/reseller.ts` skip messages:

```
# Gate flags
QA_TEMP_RESELLER_ENABLED           = "1"  # gates all fixture-driven specs
QA_RESELLER_MULTI_ADMIN            = "1"  # gates the per-variant admin cohort in
                                          #   seed-test-users.mjs + seed-qa-reseller.mjs
                                          #   + fixtures/reseller.ts (required to
                                          #   activate deferred HAPPY-PATH rows).

# Attribution + display
QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL = qa-founder-attributed-1@blockid.au
QA_RESELLER_ATTRIBUTED_CUSTOMER_ID = <resolved after seed>
QA_RESELLER_ATTRIBUTED_PROJECT_ID  = <resolved after seed>
QA_RESELLER_DISPLAY_NAME           = "QA Probe Wholesale (Active)"
QA_RESELLER_CODE                   = QAPROBEWHOLESALEACTIVE20

# Single-admin cohort fallback (multi-admin gate OFF)
QA_ADMIN_EMAIL                     = qa-admin-1@blockid.au
QA_RESELLER_ADMIN_EMAIL            = qa-reseller-1@blockid.au

# Multi-admin cohort per-variant overrides (multi-admin gate ON)
QA_RESELLER_ADMIN_EMAIL_ACTIVE_WHOLESALE = qa-reseller-wholesale-active@blockid.au
QA_RESELLER_ADMIN_EMAIL_ACTIVE_RETAIL    = qa-reseller-retail-active@blockid.au
QA_RESELLER_ADMIN_EMAIL_PAUSED           = qa-reseller-paused@blockid.au
QA_RESELLER_ADMIN_EMAIL_TERMINATED       = qa-reseller-terminated@blockid.au
QA_RESELLER_ADMIN_EMAIL_NO_CAPABILITY    = qa-reseller-no-cap@blockid.au
QA_RESELLER_ADMIN_EMAIL_TIER_ONLY_ZERO   = qa-reseller-tier-zero@blockid.au
QA_RESELLER_ADMIN_EMAIL_NO_BUDGET        = qa-reseller-no-budget@blockid.au
```

Each per-variant override slot is optional; when unset the seeders and
fixture fall back to the hard-coded default in the §1 table so a host that
enables the multi-admin gate without setting any override still gets a
correctly wired seven-account cohort.

The follow-up tick's `seed-qa-reseller.mjs` prints the resolved
`QA_RESELLER_ATTRIBUTED_CUSTOMER_ID` + `QA_RESELLER_ATTRIBUTED_PROJECT_ID`
to stdout (and to `/tmp/blockid-qa-reseller.env`) so CI can `source` them
before invoking `npx playwright test`.

## Risks and open questions

1. **Stripe test-mode dependency.** The `code_request` happy path needs a
   real Stripe coupon mint (or a nock/msw intercept). The stub-vs-real
   decision folds into the P8.5 unblock — until Stripe env vars are minted,
   the happy-path row for that branch stays `test.skip()` with a comment
   pointing at P8.5.
2. **Parallel-worker collision.** Playwright default workers = number of CPUs.
   The seeder must guarantee that (a) shared rows are read-only after mint;
   (b) mutation-heavy specs (requests-approve, credit-grant) target
   per-run rows keyed by `qa_run_id`. Default posture: `workers: 1` for the
   reseller suite until a worker-safe fan-out is designed.
3. **Cleanup vs cache.** `reseller_audit_log` is append-only via mutation
   trigger (migration 0093). The fixture cleanup deletes these rows via
   service-role which bypasses the trigger; verify the trigger allows
   service-role DELETE or add a `--drop-audit-first` flag that suspends the
   trigger for the cleanup window (safer: leave audit rows behind, they
   are metadata not PII).
4. **RLS.** All reseller_* tables default-deny (migration 0091 + 0096 +
   0093 + 0094 + 0095 + 0097 + 0100). Fixture inserts use the service-role
   client which bypasses RLS; verified against the pattern already in
   `seed-showcase-blockid.ts` and `seed-test-users.mjs`.
5. **P1.5 InfoVision blocker.** This fixture is *independent* of P1.5 — it
   mints its own `QA-PROBE-*` resellers rather than reusing the InfoVision
   seed. So the fixture can land before H.20 clears, and InfoVision-specific
   assertions (e.g. GST reconciliation) fold into a separate follow-up once
   H.20 confirms the real ABN.

## Rows unblocked, summary

Total deferred rows this fixture activates: **~50** across
`create-startup` (7), `credits/grant` (4), `sandbox/setup` (3),
`reveal-email` (2), `drawer` (2), `reports/signed-url` (3), `requests`
POST (4) + GET (1), `admin/resellers/[code]` GET/PATCH/DELETE (14),
`admin/resellers` POST (2), `admin/resellers/requests/[id]` PATCH (6),
`showcase-reviews` (2), attribution-timing DB-inspection (2). Numbers are
approximate — the follow-up tick's scope table is authoritative.

## What this document is NOT

- **Not a plan-delta.** Nothing here alters `docs/plans/reseller-module-plan.md`
  or the module goal file's phase status. P10_hardening remains `blocked_by
  [P1..P9]` until P8.5 clears.
- **Not an implementation.** No `.mjs` / `.ts` / `.sql` / `.spec.ts` files
  land with this document. The follow-up implementation tick reads this
  design and ships all five artefacts (Sections 1–5) in one tick plus
  begins picking up the deferred row activation in subsequent ticks.
- **Not a schema change.** All fixture tables already exist per migrations
  0091 / 0093 / 0094 / 0095 / 0096 / 0097 / 0100. The fixture reads and
  writes them via the service-role client only.

## Next steps

1. Human review of the variant matrix (Section 1) — confirm the 7 variants
   cover every deferred reason without redundancy.
2. Decide Stripe test-mode posture — real coupon mint against Stripe test
   mode (needs P8.5 unblock) versus msw-style intercept (ships now, drops
   `stripe_mint_failed` from coverage until P8.5).
3. Sequence the follow-up tick: implementation is estimated at 1 tick for
   the mint scripts + 1 tick for the fixture wiring + N ticks (~1 per
   route) to activate the deferred rows. Prefer landing all five artefacts
   in a single tick so the shared row is immediately usable by the first
   activation tick.
