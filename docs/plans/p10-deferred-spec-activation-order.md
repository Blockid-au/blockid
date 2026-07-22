# P10 deferred spec activation — recommended burn-through order

**Status.** Design-only ordering doc. No code lands with this document.
Authored during autonomous tick 140 to close the "options list item (ii)"
carried by tick 139's `review_history` entry after Option A steps 1–4 all
shipped (ticks 136–139).

**Owner.** Track A P10_hardening. Serves as the driver for the next ~50
autonomous ticks that activate the deferred `test.skip()` rows sitting
inside `web/tests/e2e/reseller/*.spec.ts` behind
`tempResellerSkipReason(variant)` from
`web/tests/e2e/fixtures/reseller.ts`.

**Kill switch.** `RESELLER_AUTONOMOUS_LOOP=off` on the host halts the loop
that will consume this order.

## Purpose

Every `web/tests/e2e/reseller/*.spec.ts` spec that ships today covers the
harness-free pre-write authorization branches (unauthenticated / non-admin
/ non-reseller / normalise-error). The remaining "Deliberately out of
scope" blocks in each spec are the deferred rows. As of tick 139 those
rows are unlockable — the temp-reseller mint fixture cohort (7 variants ×
1 dedicated `app_users` admin per variant) is fully wired end-to-end via
`--reseller-multi-admin` / `QA_RESELLER_MULTI_ADMIN=1`.

Without an authoritative order, future autonomous ticks would either
cherry-pick low-value rows or re-scope in every tick. This doc fixes the
order once so each tick can pick "the next row" without rescoping.

## Prerequisites at activation time

Every row in the schedule below assumes both seeders have run on the
target host with the multi-admin gate on. Concretely:

```sh
QA_RESELLER_MULTI_ADMIN=1 node web/scripts/seed-test-users.mjs \
  --reseller-multi-admin
QA_RESELLER_MULTI_ADMIN=1 node web/scripts/seed-qa-reseller.mjs \
  --reseller-multi-admin
```

The first mints the seven `qa-reseller-<variant>@blockid.au` `app_users`
rows; the second mirrors each one onto its variant's `reseller_admins`
row so `scopedReseller()` resolves without hitting the PGRST116 collision
documented in `docs/plans/p10-temp-reseller-admin-scope-collision-finding.md`.

Hosts that skip the multi-admin gate keep the tick 132 back-compat
contract (single `qa-reseller-1@blockid.au` mirrored onto every variant)
so activating any downstream-reason row against them will surface
`403 no_membership` before the intended branch fires. That is the
sentinel for "seeders were not re-run with the gate."

If the seeders have not been re-run when a tick fires, the ordering
below still holds; the activated spec surfaces `test.skip` at runtime
via `tempResellerSkipReason(variant)` so the row does not false-positive
CI.

## Human-blocked exclusions (do NOT schedule)

Two categories of deferred rows STAY deferred beyond the fixture cohort
because they depend on state outside the autonomous loop's control:

- **Stripe-mint rows.** Any row whose activation requires
  `STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL` or a real Stripe promo
  code mint — blocked on P8.5 (`resolveVariantAdmin` cannot force a
  Stripe object into existence). Example: `create-startup` happy path
  with `tier > 0` needs a real `reseller_promotion_codes` row whose
  `stripe_promotion_code_id` resolves. Skip until P8.5 unblocks.
- **GST-reconciliation rows.** Any row whose oracle depends on
  Auschain's confirmed ABN + GST status — blocked on P1.5 / H.20.
  Example: `reseller_monthly_report` happy path asserting GST split on
  the InfoVision seed row. Skip until P1.5 unblocks.

The remaining ~50 rows are ALL non-Stripe-mint / non-GST and are safe
to burn through now.

## Recommended order (waves 1–5)

The waves below are grouped by **coverage payoff / activation cost**
ratio and by shared "prep work" so a single tick can knock down 2–4
related rows without re-reading the same spec twice.

### Wave 1 — variant boundary probes (highest payoff, lowest risk)

Establishes that `resolveVariantAdmin` × `loadTempReseller` × the
per-variant reseller row shape work end-to-end. Uses only the four
"one-request, one-assert" downstream-reason branches:

| tick | spec | variant | branch | expected |
| --- | --- | --- | --- | --- |
| 141 | `create-startup-authz.spec.ts` | `active_retail` | `billing_model_not_wholesale` | 400 |
| 142 | `create-startup-authz.spec.ts` | `paused` | `reseller_not_active` | 400 |
| 143 | `create-startup-authz.spec.ts` | `no_capability` | `capability_disabled` | 400 |
| 144 | `create-startup-authz.spec.ts` | `active_wholesale` | `tier_not_allowed` (tier=99 in body) | 400 |

Prep cost: one shared "activate deferred row" mini-playbook per spec
(bring in the `loadTempReseller` import + one `test.beforeAll` +
`test.skip` when fixture null). Each subsequent wave-1 row is a ~15-line
paste of the same skeleton with the variant/branch swap.

### Wave 2 — scope-boundary readbacks (attribution + drawer)

Depends on wave 1 having proven the fixture end-to-end. Reads live
`app_users` / `reseller_attributions` state so any drift in the
attribution wiring surfaces here first.

| tick | spec | variant | branch | expected |
| --- | --- | --- | --- | --- |
| 145 | `me-attribution.spec.ts` | `active_wholesale` | happy (returns display_name) | 200 |
| 146 | `drawer-authz.spec.ts` | `active_wholesale` | happy 200 with overview/progression/svi_curve/reports | 200 |
| 147 | `drawer-validation.spec.ts` | `active_wholesale` | uuid_in_scope + happy | 200 |
| 148 | `reveal-email-authz.spec.ts` | `active_wholesale` | happy 200 with plaintext email + audit-log side effect | 200 |
| 149 | `reveal-email-validation.spec.ts` | `active_wholesale` | happy path with attributed customer id | 200 |

Prep cost: one tick to author the attributed-customer helper
(`attachAttributedCustomer(variant)`) — reuses the existing
`app_users` upsert path in the fixture — then rows 145–149 each add
2–3 assertions.

### Wave 3 — capability + budget gates (credit grants + sandbox)

Exercises `decideGrant` / `decideSandboxSpend` / `computeMonthlyUsage`
against live per-variant `resellers` state. Each row uses a different
variant so the four capability failure modes surface distinctly.

| tick | spec | variant | branch | expected |
| --- | --- | --- | --- | --- |
| 150 | `credit-grant-authz.spec.ts` | `no_capability` | `capability_disabled` | 402 |
| 151 | `credit-grant-authz.spec.ts` | `no_budget` | `over_budget_requires_approval` | 402 |
| 152 | `credit-grant-validation.spec.ts` | `active_wholesale` | happy 200 with credit_transaction_id | 200 |
| 153 | `sandbox-setup-authz.spec.ts` | `no_capability` | `sandbox_disabled` | 402 |
| 154 | `sandbox-setup-authz.spec.ts` | `active_wholesale` | happy 200 with project_id + slug | 200 |
| 155 | `requests-authz.spec.ts` | `active_wholesale` | happy POST 200 (over_budget code_request) | 200 |
| 156 | `requests-validation.spec.ts` | `active_wholesale` | happy GET 200 (returns pending list) | 200 |

Prep cost: rows 150–151 share a pattern (probe → assert 402 body.reason);
rows 152 / 154 / 155 / 156 each need one extra "seeded customer" arg via
the wave-2 helper.

### Wave 4 — reports + reveals + code validate + reseller-facing lists

Covers the read-mostly surface where the deferred branches are the
happy paths.

| tick | spec | variant | branch | expected |
| --- | --- | --- | --- | --- |
| 157 | `code-validate.spec.ts` | `paused` | inactive (404) | 404 |
| 158 | `code-validate.spec.ts` | `active_wholesale` | happy 200 with tier_pct | 200 |
| 159 | `reports-signed-url-authz.spec.ts` | `active_wholesale` | happy 200 with signed URL + audit log | 200 |
| 160 | `reports-signed-url-validation.spec.ts` | `active_wholesale` | in-window month vs expired month | 200 vs 403 |
| 161 | `reseller-requests-list-authz.spec.ts` | `active_wholesale` | happy 200 with request rows | 200 |
| 162 | `reseller-crons-authz.spec.ts` | (n/a — admin only) | HTTP method contract with harness admin | 200/405 |
| 163 | `cobranding-pill.spec.ts` | `active_wholesale` | attributed founder session → pill renders EN + VI | render |

Prep cost: rows 159–160 need one seeded `reseller_report_files` row per
month bucket the assertion covers; wave-2 helper's month-bucket variant
(`attachReportRow(variant, month_key)`) is the reusable shim.

### Wave 5 — admin surface (the /admin/resellers/* deferred rows)

Uses the pre-existing `qa-admin-1@blockid.au` account (already seeded
by tick 130's admin harness delta) — NOT the reseller-admin cohort.
Sequenced last because each row writes real `resellers` state and
`test.afterAll` cleanup must undo it before the next row runs.

| tick | spec | variant | branch | expected |
| --- | --- | --- | --- | --- |
| 164 | `admin-resellers-list-authz.spec.ts` | (n/a) | happy 200 listing seven cohort resellers | 200 |
| 165 | `admin-resellers-create-authz.spec.ts` | (n/a) | happy 201 with new reseller row | 201 |
| 166 | `admin-resellers-create-validation.spec.ts` | (n/a) | duplicate_code / wholesale_requires_gst / wholesale_requires_abn / invalid_abn_format / invalid_hex_color | 400 (5 rows folded into one tick) |
| 167 | `admin-reseller-detail-authz.spec.ts` | `active_wholesale` | happy 200 with detail payload | 200 |
| 168 | `admin-reseller-detail-validation.spec.ts` | `active_wholesale` | code_required / not_found / happy | 400 / 404 / 200 |
| 169 | `admin-reseller-patch-authz.spec.ts` | `active_wholesale` | code_required / invalid_body / not_found | 400 / 400 / 404 |
| 170 | `admin-reseller-patch-validation.spec.ts` | `active_wholesale` | 4–6 validator branches (empty_patch / unknown_field / display_name_required / invalid_tier / invalid_billing_model / wholesale_requires_gst) folded into one tick | 400 × 6 |
| 171 | `admin-reseller-delete-authz.spec.ts` | `terminated` | happy 200 (already terminated → idempotent) | 200 |
| 172 | `admin-reseller-delete-validation.spec.ts` | `active_wholesale` | code_required / happy 200 | 400 / 200 |
| 173 | `admin-reseller-loop-status-authz.spec.ts` | (n/a) | happy 200 with loop kpi payload | 200 |
| 174 | `admin-requests-list-authz.spec.ts` | (n/a) | happy 200 with reseller_requests rows (seeded by wave-3 row 155) | 200 |
| 175 | `admin-requests-patch-authz.spec.ts` | (n/a) | happy 200 approve / deny / cancel transitions on the request seeded in row 155 | 200 × 3 |
| 176 | `showcase-reviews-authz.spec.ts` | `active_wholesale` | founder-scoped GET happy 200 | 200 |
| 177 | `showcase-reviews-validation.spec.ts` | `active_wholesale` | reviewer-flow POST with valid access token → 200 | 200 |
| 178 | `attribution-timing.spec.ts` | (n/a) | signup → attribution stamp within jitter window | 200 |
| 179 | `audit-log-writes.spec.ts` | `active_wholesale` | audit row emitted after row 148's reveal-email call | 1 row |
| 180 | `audit-anomaly-scan.spec.ts` | (n/a) | admin cron happy 200 with anomaly summary | 200 |
| 181 | `scope-boundary.spec.ts` | `active_wholesale` | reseller cannot fetch /api/svi/*, /api/dataroom/*, /api/cap-table/* for attributed customer → 403 (P10 exit criterion §420) | 403 × 3 |
| 182 | `billing-authz.spec.ts` | `active_wholesale` | happy 200 with SetupIntent client_secret (only Stripe-independent branches) | 200 |
| 183 | `billing-validation.spec.ts` | `active_wholesale` | invalid_json / other non-Stripe validator branches | 400 |

## Batching heuristic

Each tick above lists exactly ONE spec file. When two adjacent rows sit
in the same file with the same variant (e.g. rows 145 / 146 both under
`active_wholesale`), the autonomous loop MAY collapse them into one tick
if the prep cost is trivial (< 20 lines added). Do NOT collapse across
files.

## Failure protocol

Any tick that returns:

- `403 no_membership` → seeders were not re-run with
  `QA_RESELLER_MULTI_ADMIN=1`. Post a review_history entry with
  `blocker: multi_admin_seeders_not_run` and do NOT flip the row to
  activated; leave the `test.skip` in place until the seeders are
  refreshed.
- `test.skip` at runtime → fixture returned null because the variant's
  admin row is missing from `app_users`. Same escalation as above.
- Any 5xx from the tested route → normal U.13 stage-4 refute. Loop
  re-enters stage 2 (DESIGN) with the failure signal per plan §434.

## Exit condition

When all 43 rows in waves 1–5 land as green Playwright assertions in CI,
the "temp-reseller mint fixture follow-up" phrase that appears in every
current spec's "Deliberately out of scope" block is retired. P10's
Playwright coverage criteria (§412 exit_criteria) then converge on the
remaining human-blocked items (P8.5 Stripe env vars for the addon
purchase E2E; P1.5 InfoVision seed for the GST reconciliation E2E).

## Related documents

- `docs/plans/p10-temp-reseller-mint-fixture-design.md` — fixture design
  updated tick 139 with the seven-account cohort.
- `docs/plans/p10-temp-reseller-admin-scope-collision-finding.md` — the
  finding that produced the Option A resolution consumed by ticks 136–139.
- `docs/plans/reseller-module-goal.md` — canonical goal file whose
  `review_history` records each activated row.
- `web/tests/e2e/fixtures/reseller.ts` — `loadTempReseller(variant)` +
  `TempResellerFixture.adminEmail` consumed by every row above.
