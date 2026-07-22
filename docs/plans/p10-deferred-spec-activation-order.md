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
| 144 | `create-startup-authz.spec.ts` | `tier_only_zero` | `tier_not_allowed` (tier=10 in body) | 400 |

Prep cost: one shared "activate deferred row" mini-playbook per spec
(bring in the `loadTempReseller` import + one `test.beforeAll` +
`test.skip` when fixture null). Each subsequent wave-1 row is a ~15-line
paste of the same skeleton with the variant/branch swap.

**Row 144 design correction (recorded tick 146).** The row originally
paired `active_wholesale` × `tier=99` in body, which is unreachable:
`normaliseCreateStartupInput` rejects `tier=99` with
`invalid_discount_tier` (must be one of `[0,10,20,30,40]`) before
`decideCreateStartup` fires, and `active_wholesale`'s
`allowed_tiers=[0,10,20,30,40]` covers every valid tier so no valid
`discount_tier` can miss gate 4 either. The `tier_only_zero` variant
(`allowed_tiers=[0]`) with a valid non-zero body tier (`10`) is the
only fixture combination that lands on gate 4 with gates 1-3 all green.
Table row 144 above updated accordingly.

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

**Wave-5 row 175 landed (tick 163) — deny branch only.** Fourth wave-5 row.
Added a companion `test.describe("Admin reseller requests PATCH — P10
wave-5 row 175 happy path (deny)")` block to
`web/tests/e2e/reseller/admin-requests-patch-authz.spec.ts` that pins
`PATCH /api/admin/resellers/requests/[id]` with `{action:"deny",
decision_reason:"..."}` as the seeded admin → 200 with envelope shape
assertions: body.ok=true, body.request.id === targetId matches UUID_RE,
body.request.status === "denied", typeof body.request.decision_at ===
"string", body.request.decision_reason === "p10_wave5_row_175_deny_probe",
and body.request.linked_credit_transaction_id === null +
body.request.linked_promotion_code_id === null (deny branch skips the
approve fan-out so both linked_* columns stay null; a regression that
leaked an approve-branch ledger insert or coupon mint into the deny path
surfaces here). Do NOT pin body.request.decision_at value — a timestamp
string set at `now = new Date().toISOString()` in the route (assert typeof
string only). Row 175's approve and cancel branches remain DEFERRED —
approve fires a Stripe coupon+promotion_code mint (code_request) or a
credit-ledger triple-write (over_budget_approval → credit_balances UPSERT
+ credit_transactions INSERT + reseller_credit_grants INSERT) and needs
deterministic control over target_user_id + pre/post credit_balances
state; cancel is a pure status flip like deny but would race for the
same pending row per CI pass. Both deferrals documented inline in the
spec's "Deliberately out of scope" block. Skip discipline:
`loadAdminHarness()` returns null → describe-scope skip via
`adminHarnessSkipReason()`; `loginAs` throw → test-scope skip; empty
pending list (fresh CI host where row 155 has not run yet) → test-scope
skip with a pointer at wave-3 row 155. State-pollution posture: the PATCH
mutates ONE reseller_requests row (status pending → denied + decision_by
+ decision_at + decision_reason) but does NOT touch credit_balances,
credit_transactions, reseller_credit_grants, reseller_promotion_codes,
revenue_events, or Stripe. Net-of-row-155 the pending queue length is
unchanged across CI passes — row 155 inserts one pending
over_budget_approval row per CI pass; this row consumes it via the PATCH
so the queue nets to zero rather than accumulating. Row 155 was
intentionally scoped to over_budget_approval (not code_request) so the
seeded row lives outside the reseller_requests_pending_code_uniq partial
unique index; a rerun that lands a fresh pending row before this spec
fires does not 409 duplicate the seed either. Non-Stripe / non-GST
discipline: the deny branch only writes reseller_requests — no
promotion_code lookup, no credit ledger, no Stripe network call, no
revenue_events read, no InfoVision dependency. P8.5 + P1.5 remain neither
a dependency nor a consequence. Row 175 was named as next-tick option (i)
by tick 162's review_history entry — same admin-only harness posture as
rows 164 + 173 + 174; row 175's over_budget_approval-only enumeration
(filter to `request_type === "over_budget_approval"` before picking) also
avoids depleting any pending code_request row that a downstream
approve-branch tick may need. Next natural picks: (i) activate row 163
(cobranding-pill × active_wholesale attributed founder × EN + VI) —
reuses the attributed-founder harness scaffold from wave 2; (ii) land
finding-2's seed delta (edit `seed-qa-reseller.mjs` main loop to seed
attribution on `no_capability` + `no_budget`; re-run seeder against
staging) — unblocks rows 150 + 151; (iii) mint an active promo code on
the paused variant to unblock row 157; (iv) author the `attachReportRow`
helper to unblock rows 159 + 160; (v) extend row 175 to cover the cancel
branch by seeding a second over_budget_approval row (row 155-b or an
extension to row 155's seed loop) and add a second test-scope block to
this file.

**Wave-5 row 174 landed (tick 162).** Third wave-5 row. Added a companion
`test.describe("Admin reseller-requests list — P10 wave-5 row 174 happy path")`
block to `web/tests/e2e/reseller/admin-requests-list-authz.spec.ts` that
pins `GET /api/admin/resellers/requests` as the seeded admin → 200 with
envelope shape assertions: body.ok=true, Array.isArray(body.requests),
and per-row {id matches UUID_RE, reseller_id matches UUID_RE, request_type
∈ {code_request, over_budget_approval, collateral_approval}, status ∈
{pending, approved, denied, cancelled}, status === "pending" because the
default filter is pending when ?status= omitted, created_at typeof string,
decision_at is null or string, decision_reason is null or string}. Do NOT
pin body.requests.length — fresh CI hosts hold zero pending rows; hosts
where wave-3 row 155 has run in prior CI passes hold ≥1 pending
over_budget_approval row seeded against the active_wholesale variant. The
envelope loop asserts per-row shape only so both empty-array and populated-
array states green identically — the row-155-not-yet-seeded posture is not
a blocker. Per-row shape pin (each row is a plain object, not array, not
scalar) catches a regression that swapped the SELECT projection to return
scalars or wrapped rows in an intermediate envelope. Status === "pending"
pin specifically catches a regression that dropped the `.eq("status",
status)` at route.ts:46 (which would leak approved/denied rows into the
default envelope). Skip discipline: `loadAdminHarness()` returns null →
describe-scope skip via `adminHarnessSkipReason()`; `loginAs` throw →
test-scope skip (matches row 173 posture). State-pollution posture:
read-only GET — no INSERT / UPDATE / DELETE fires; the route does NOT
audit-log (admin listing of reseller_requests). Non-Stripe / non-GST
discipline: the admin GET reads reseller_requests + joins resellers only —
no promotion_code lookup, no credit ledger write, no revenue_events read,
no Stripe network call, no InfoVision dependency. P8.5 + P1.5 remain
neither a dependency nor a consequence. UUID_RE + REQUEST_TYPES + REQUEST_STATUSES
hoisted to module scope so a future wave-5 row landing in this file
reuses the constants without duplicating the regex/enum sets. Row 174 was
named as next-tick option (i) by tick 161's review_history entry — same
admin-only harness posture as rows 164 + 173, natural continuation of the
wave-5 admin-only cluster before rows 165–172 + 175 start consuming per-
variant seeded state and admin write flows. Next natural picks: (i)
activate row 175 (admin-requests-patch-authz × happy 200 approve/deny/
cancel transitions consuming wave-3 row 155's seeded rows) — same admin-
only harness, three-branch collapse per the schedule doc entry; (ii)
activate row 163 (cobranding-pill × active_wholesale attributed founder ×
EN + VI) — reuses the attributed-founder harness scaffold from wave 2;
(iii) land finding-2's seed delta (edit `seed-qa-reseller.mjs` main loop
to seed attribution on `no_capability` + `no_budget`; re-run seeder
against staging) — unblocks rows 150 + 151; (iv) mint an active promo
code on the paused variant to unblock row 157; (v) author the
`attachReportRow` helper to unblock rows 159 + 160.

**Wave-5 row 173 landed (tick 161).** Second wave-5 row. Added a companion
`test.describe("Admin reseller-loop status — P10 wave-5 row 173 happy path")`
block to `web/tests/e2e/reseller/admin-reseller-loop-status-authz.spec.ts`
that pins `GET /api/admin/reseller-loop/status` as the seeded admin → 200
with envelope shape assertions: body.ok=true, typeof body.complete ===
"boolean", body.completed_at (string when complete=true, null otherwise),
typeof body.snapshot === "string", Array.isArray(body.monitor_history),
Array.isArray(body.tick_history), and body.generated_at matches ISO_RE.
Do NOT pin monitor_history.length or tick_history.length — the on-disk
JSONL logs mutate every tick (reseller-monitor.jsonl every minute from the
cron; reseller-goal-history.jsonl every autonomous tick); fresh CI hosts
hold 0 rows; production hosts hold up to 30/40 (tailLines caps at 30 and
40 respectively). Per-row shape pin (each parsed row is a plain object,
never an array or scalar) catches a regression that swapped the tailLines
→ JSON.parse fan-out to return raw strings or wrapped rows in an
intermediate envelope. Skip discipline: `loadAdminHarness()` returns null
→ describe-scope skip via `adminHarnessSkipReason()`; `loginAs` throw →
test-scope skip. State-pollution posture: read-only GET — no INSERT /
UPDATE / DELETE fires; the route does NOT audit-log (admin console read
of on-disk loop state). Non-Stripe / non-GST discipline: the GET route
reads /tmp/blockid-reseller-monitor.txt + reseller-monitor.jsonl +
reseller-goal-history.jsonl + /tmp/blockid-reseller-goal-done via
safeRead only — no promotion_code lookup, no credit ledger write, no
revenue_events read, no Stripe network call, no InfoVision dependency.
P8.5 + P1.5 remain neither a dependency nor a consequence. ISO_RE
hoisted to module scope for the generated_at pin. Row 173 was named as
next-tick option (i) by tick 160's review_history entry — same admin-
only harness posture as row 164, natural continuation of the wave-5
admin-only cluster before rows 174+ start consuming per-variant seeded
state. Next natural picks: (i) activate row 174 (admin-requests-list ×
happy 200 consuming wave-3 row 155's seeded reseller_requests rows) —
same admin-only harness, and row 155 seeded a pending
over_budget_approval row at tick 155 that gives row 174 a non-empty
array to enumerate against; (ii) activate row 163 (cobranding-pill ×
active_wholesale attributed founder × EN + VI) — reuses the attributed-
founder harness scaffold from wave 2; (iii) land finding-2's seed delta
(edit `seed-qa-reseller.mjs` main loop to seed attribution on
`no_capability` + `no_budget`; re-run seeder against staging) —
unblocks rows 150 + 151; (iv) mint an active promo code on the paused
variant to unblock row 157; (v) author the `attachReportRow` helper to
unblock rows 159 + 160.

**Wave-5 row 164 landed (tick 160).** Opens wave 5 via `loadAdminHarness()`
(qa-admin-1@blockid.au) so the requireAdmin() gate at
`web/src/app/api/admin/resellers/route.ts:15-24` passes without needing the
per-variant reseller cohort. Added a companion `test.describe("Admin
resellers list — P10 wave-5 row 164 happy path")` block to
`web/tests/e2e/reseller/admin-resellers-list-authz.spec.ts` that pins
`GET /api/admin/resellers` as the seeded admin → 200 with `body.ok=true` +
`Array.isArray(body.resellers)` + per-row envelope shape assertions (id
matches UUID_RE, code typeof string, display_name typeof string,
billing_model ∈ {retail, wholesale}, status ∈ {active, paused, terminated}).
Do NOT pin the array length — fresh CI hosts hold zero rows; seeded hosts
hold ≥7 cohort rows from `seed-qa-reseller.mjs` (QAPROBE variants); the
InfoVision seed adds one more when P1.5 clears H.20; production hosts may
hold additional real resellers. The per-row shape pins catch a route
regression that dropped a column from the `select("*")` at route.ts:32-35
or returned a stale envelope shape (e.g. wrapping in `{ resellers: { rows:
[] } }`). Skip discipline: `loadAdminHarness()` returns null → describe-
scope skip via `adminHarnessSkipReason()`; `loginAs` throw → test-scope
skip. State-pollution posture: read-only GET — no INSERT / UPDATE / DELETE
fires from this endpoint; perfectly idempotent under CI replay; the route
does NOT audit-log (admin console read). Non-Stripe / non-GST discipline:
the GET route reads `resellers` only. No promotion_code lookup, no credit
ledger write, no revenue_events read, no Stripe network call, no
InfoVision dependency. P8.5 + P1.5 remain neither a dependency nor a
consequence — the InfoVision seed is a downstream row this endpoint would
enumerate but its absence does NOT block the happy path from returning 200
against a fresh cohort. UUID_RE + BILLING_MODELS + STATUSES hoisted to
module scope so a future wave-5 row landing in this file reuses the
constants without duplicating the regex/enum. Wave 5 is now open — the
schedule doc's rows 165 (create-authz happy 201), 166 (create-validation
five 400 rows folded into one tick), 167 (detail-authz happy 200), 168
(detail-validation code_required / not_found / happy), 169 (patch-authz
code_required / invalid_body / not_found), 170 (patch-validation 4-6
validator branches), 171 (delete-authz idempotent happy on terminated),
172 (delete-validation code_required + happy), 173 (loop-status happy),
174 (admin-requests-list happy consuming wave-3 row 155's seeded rows),
175 (admin-requests-patch approve/deny/cancel on wave-3 row 155's rows),
176-183 are all sequenced behind row 164 per the wave-5 posture. Next
natural picks: (i) activate row 173 (admin-reseller-loop-status-authz ×
happy 200) — admin-only harness with no per-variant fixture dependency,
same posture as row 164 — or row 174 (admin-requests-list happy 200
consuming wave-3 row 155's seeded reseller_requests rows) since row 155
seeded a pending `over_budget_approval` row at tick 155; (ii) activate
row 163 (cobranding-pill × active_wholesale attributed founder × EN + VI)
— reuses the attributed-founder harness from wave 2; (iii) land finding-
2's seed delta (edit `seed-qa-reseller.mjs` main loop to seed attribution
on `no_capability` + `no_budget`; re-run seeder against staging) —
unblocks rows 150 + 151; (iv) mint an active promo code on the paused
variant to unblock row 157; (v) author the `attachReportRow` helper to
unblock rows 159 + 160.

**Wave-4 row 162 landed (tick 159).** Third wave-4 row. Added a companion
`test.describe("Reseller cron HTTP method contract with harness admin —
P10 wave-4 row 162")` block to `web/tests/e2e/reseller/reseller-crons-authz
.spec.ts` that pins the two HTTP method contract halves per the schedule
doc row 162 table entry ("HTTP method contract with harness admin |
200/405"):
  (1) GET with `Authorization: Bearer ${CRON_SECRET}` → status ∈ {200, 503}
      + body.ok typeof boolean + on 503 body.reason ∈ {not_configured,
      stripe_not_configured}, on 200 body.ok=true. Iterates the same five
      routes as the existing 401 describe block so the auth-passed sentinel
      is proven across the full reseller-cron surface (reseller-clear-
      commissions, reseller-monthly-reconciliation, reseller-monthly-report,
      reseller-stripe-sync, reseller-weekly-digest). `?skip_email=1` is
      already baked into the three routes that support it so the digest /
      report / reconciliation emails stay suppressed under CI replay.
  (2) POST with the same correct Bearer → 405 Method Not Allowed. All five
      routes export ONLY `GET` (verified via
      `grep -H "export async function"` at authoring time in tick 159) so
      Next.js App Router dispatches 405 + `Allow: GET` header BEFORE any
      handler body fires. This nails the dispatch contract so a
      "manual-trigger POST" refactor that adds a POST handler surfaces
      here BEFORE it can bypass the CRON_SECRET Bearer gate.

Why bundle both halves in one describe: they share the same describe-scope
`test.skip(!cronSecret, …)` guard and iterate the same ROUTES array — a
separate describe block would double the skip check without adding
coverage. Skip discipline preserved: CRON_SECRET unset → describe-scope
skip (the routes are fail-open in that configuration so a Bearer-authed
assertion would false-fail on a legitimately-open host). No fixture null
guard because this row is admin-only per the schedule doc — no per-variant
reseller cohort applies, and no `loadTempReseller` call fires.

State-pollution posture: reseller-clear-commissions writes commission
events ONLY when the view surfaces pending rows past pending_until (fresh
CI host → cleared:0, no write); reseller-monthly-reconciliation skip_email
+ read-only query; reseller-monthly-report skip_email + read-only when the
`reseller-reports` storage bucket is unconfigured (upload branch no-ops);
reseller-stripe-sync short-circuits at 503 stripe_not_configured before
the Stripe network call in unconfigured envs; reseller-weekly-digest
skip_email + read-only aggregation. POST rejection is stateless — Next.js
dispatches 405 before any handler import. Perfectly idempotent under CI
replay.

Non-Stripe / non-GST discipline: none of the covered routes hit Stripe in
the GET-with-Bearer branch under an unconfigured-Stripe env (the sync
route short-circuits at 503 before the retrieve loop). Row 162 remains
neither a dependency nor a consequence of P8.5 (Stripe env vars) or P1.5
(InfoVision seed). "Deliberately out of scope" comment block in the spec
updated to reflect the activated row + document why the per-route body
pins stay in the route-specific specs (e.g. reports-signed-url-authz
owns reseller-monthly-report's signed-URL wire envelope; audit-anomaly-
scan owns its own happy-path harness at tick 90).

Next natural picks: (i) activate row 163 (cobranding-pill × active_
wholesale attributed founder × EN + VI) — reuses the attributed-founder
harness scaffold; (ii) land finding-2's seed delta to unblock rows 150 +
151; (iii) mint an active promo code on the paused variant to unblock
row 157; (iv) author the attachReportRow helper to unblock rows 159 +
160; (v) open wave 5 with row 164 (admin-resellers-list-authz × happy
200) — uses the pre-existing qa-admin-1@blockid.au harness so does not
need the per-variant reseller cohort at all.

**Wave-4 row 161 landed (tick 158).** Second wave-4 row. Added a companion
`test.describe("Reseller requests list — P10 wave-4 happy path")` block to
`web/tests/e2e/reseller/reseller-requests-list-authz.spec.ts` that mirrors
the wave-3 row 156 posture verbatim across the sibling spec-file surface:
GET `/api/reseller/requests` as `active_wholesale` reseller-admin → 200 with
`body.ok=true` + `Array.isArray(body.requests)` + per-row envelope shape
assertions (id matches UUID_RE, request_type ∈ {code_request,
over_budget_approval, collateral_approval}, status ∈ {pending, approved,
denied, cancelled}, created_at typeof string). Twin-row posture with row 156
is intentional — row 156 pins the SELECT wire envelope from the validation-
focused `requests-validation.spec.ts`; row 161 pins the SAME wire envelope
from the authz-focused `reseller-requests-list-authz.spec.ts` so the file
that owns the 401/403 branches also owns its own happy 200 case. UUID_RE
hoisted to module scope (same pattern as `requests-authz.spec.ts` +
`requests-validation.spec.ts` after ticks 155/156). Skip guards match row
156: fixture null → skip; adminUserId null → skip; loginAs throw → skip;
attributionExists intentionally NOT required (GET scopes by reseller_id,
not subject_user_id). State-pollution posture: read-only GET — no INSERT
/ UPDATE / DELETE; GET handler does NOT audit-log (unlike POST at
route.ts:113-126); perfectly idempotent under CI replay. Non-Stripe /
non-GST: no promotion_code lookup, no credit ledger write, no revenue_events
read, no Stripe network call, no InfoVision dependency. Next natural picks:
(i) row 162 (reseller-crons-authz × admin harness) opens the admin-only
wave-4 corner; (ii) row 163 (cobranding-pill) needs the attributed-founder
harness activation; (iii) land finding-2's seed delta to unblock rows 150 +
151; (iv) mint an active promo code on the paused variant to unblock row
157; (v) author `attachReportRow` helper to unblock rows 159 + 160.

**Wave-4 row 158 landed (tick 157).** Opens wave 4. Added a companion
`test.describe("Reseller code/validate — P10 wave-4 happy path")` block to
`web/tests/e2e/reseller/code-validate.spec.ts` that consumes the
`active_wholesale` fixture without login (the route is
public-unauthenticated per `r-01-exempt` in `route.ts:18`): POST
`/api/reseller/code/validate` with `{ code: fixture.promotionCodes[0].code }`
(the seeded `QAPROBEWHOLESALEACTIVE20` or `QAPROBEWHOLESALEACTIVE40` row
from `seed-qa-reseller.mjs::seedPromotionCodes()` line 359-388) and assert
200 with `body.ok=true` + `body.tier_pct === promo.tier_pct` +
`typeof body.promotion_code_id_present === "boolean"` + `body.reseller.code
=== fixture.code` + `body.reseller.display_name === fixture.displayName` +
`body.reseller.billing_model === "wholesale"`. Row 158 is the harness-free
happy path — no `loginAs` needed and no writes fire — so it is the shortest
possible wave-4 row and the natural pick after the wave-3-`active_wholesale`
subwave closed at tick 156. Coverage-vs-duplication call: pin
`body.reseller.code + display_name + billing_model` (the three fields the
consent modal reads at `svi-entrance.tsx:213` + onboarding StepReseller
copy) plus `body.tier_pct` (the value stamped onto
`checkout.subscription.metadata` at `stripe/checkout/route.ts:220` when
tier>0). Do NOT pin `promotion_code_id_present` value (varies with whether
the promo row has `stripe_promotion_code_id` populated — active_wholesale's
seed script fills it verbatim, but downstream CI may deactivate the Stripe
promo without dropping the row); pin its type only so a regression that
returned `undefined` or `null` still surfaces. Do NOT pin
`body.reseller.logo_url` / `primary_color` (both nullable in schema and
NULL in the QA seed script's insert). Skip guards: fixture null → skip
(SUPABASE_URL/SERVICE_ROLE unset OR resellers row missing); `fixture.
promotionCodes.length === 0` → skip (seeder ran but promo insert failed
OR promo rows were dropped) — this is the distinguishing skip from a code
regression that dropped the promo SELECT. State-pollution posture:
read-only — no INSERT / UPDATE / DELETE fires from this endpoint;
perfectly idempotent under CI replay. Non-Stripe / non-GST discipline:
the route reads `reseller_promotion_codes` + `resellers` only. No Stripe
network call, no `promotion_code_id` mint, no `revenue_events` write, no
InfoVision dependency. P8.5 + P1.5 remain neither a dependency nor a
consequence. ROUTE hoisted to module scope so both describe blocks share
it and a future route-path change is a one-line edit — mirrors the pattern
used by requests-validation.spec.ts after tick 156. Twin-row accounting
vs row 157 (paused × inactive 404, still deferred): row 158 pins the
positive-status happy path (200 + tier_pct); row 157 will pin the
paused-status inactive branch (404 reason='inactive') once the seeder mints
an active promo code on the paused variant. A regression that inverted the
status check at route.ts:72-74 would surface across both rows. Rows 159 +
160 (reports-signed-url-authz + reports-signed-url-validation) sit next in
wave-4 per the schedule doc but need one seeded `reseller_report_files` row
per month bucket (attachReportRow helper); rows 161 (reseller-requests-
list-authz happy 200) + 163 (cobranding-pill happy render) require the
same active_wholesale fixture posture as row 158 but with login. Next
natural picks: (i) activate row 161 (reseller-requests-list-authz × happy)
— reuses the wave-3 requests-authz posture verbatim; (ii) activate row
163 (cobranding-pill × active_wholesale attributed founder × EN + VI) —
reuses the attributed-founder harness from wave 2; (iii) land finding-2's
seed delta to unblock rows 150 + 151; (iv) mint an active promo code on
the paused variant to unblock row 157; (v) collapse the ~~row 153~~
struck-through entry.

**Wave-3 row 156 landed (tick 156).** Closes the wave-3-`active_wholesale`
subwave (152 / 154 / 155 / 156). Added a companion `test.describe("Reseller
requests — P10 wave-3 happy GET")` block to
`web/tests/e2e/reseller/requests-validation.spec.ts` that mirrors the row
155 posture verbatim EXCEPT it hits the sibling GET endpoint on the same
route: `GET /api/reseller/requests` as `active_wholesale` reseller-admin →
200 with `body.ok=true` + `Array.isArray(body.requests)` + per-row
envelope shape assertions (id matches UUID_RE, request_type ∈ {code_
request, over_budget_approval, collateral_approval}, status ∈ {pending,
approved, denied, cancelled}, created_at typeof string). Assertion budget
is deliberately generous (six per-row expects + three envelope expects)
because the loop iterates over an unknown number of rows — every field
in the SELECT list (route.ts:170-173) needs a shape pin so a stale
migration cannot mask a dropped column with `undefined`. Do NOT pin the
array length (fresh hosts have zero rows; hosts where row 155 has run
in prior CI passes have ≥1 pending rows accumulated). Do NOT pin
decision_at / decision_reason (both nullable in schema; null for
pending rows). Twin-row accounting vs row 155: row 155 pins the INSERT
envelope (body.request.id + request_type + status); row 156 pins the
SELECT envelope (body.requests[].id + request_type + status +
created_at). A regression that mis-echoed request_type or swapped
status defaults between INSERT and SELECT would surface across both
rows. State-pollution posture: read-only GET — no INSERT / UPDATE /
DELETE fires; GET handler does NOT audit-log (unlike the POST handler
at route.ts:113-126); perfectly idempotent under CI replay. Skip
guards: fixture null → skip; adminUserId null → skip (scopedReseller
would 403 no_membership before SELECT); loginAs throw → skip.
attributionExists is intentionally NOT required — the GET route scopes
by reseller_id (route.ts:174), not by subject_user_id, so a partial-
seed host with attributedUserId populated but attributionExists=false
still exercises the happy GET correctly. UUID_RE + ROUTE hoisted to
module scope so both describe blocks share them and future wave-4/
wave-5 rows landing in this file reuse the constants. Wave 3 is now
CLOSED except rows 150 + 151 (still runtime-blocked on finding-2's
seed + fixture delta) and the ~~row 153~~ struck-through entry (whose
removal is now unblocked). Next natural picks: row 157 (code-validate
× paused × inactive 404) opens wave 4 via the harness-free
unauthenticated lookup, or land finding-2's seed delta to unblock rows
150 + 151.

**Wave-3 row 155 landed (tick 155).** Third wave-3 row landed. Added a
companion `test.describe("Reseller requests — P10 wave-3 happy path")` block
to `web/tests/e2e/reseller/requests-authz.spec.ts` that mirrors the wave-3
row 152 / 154 posture verbatim: POST as `active_wholesale` reseller-admin
against `/api/reseller/requests` with `{ request_type:
"over_budget_approval", payload: { target_user_id: fixture.attributedUserId,
requested_amount: 1, reason: "p10_wave3_row_155_happy_probe" } }` and assert
201 (the schedule doc's "200" is a slip — see `requests/route.ts:144`) with
`body.ok=true` + `typeof body.request.id === "string"` matching UUID shape +
`body.request.request_type === "over_budget_approval"` + `body.request.status
=== "pending"`. Payload choice — `over_budget_approval` (not `code_request`):
the `reseller_requests_pending_code_uniq` partial unique index on `(reseller_
id, ((payload->>'tier_pct')::int))` where `request_type='code_request' AND
status='pending'` (`0095:71-73`) forbids more than one pending `code_request`
per (reseller, tier). A rerun of this spec on the same host would 409
`duplicate_pending_code_request` until an admin approved / denied the prior
row. `over_budget_approval` has no such constraint so this row stays
idempotent under CI replay without wave-5 row 175 having to fire first. Row
156 (`requests-validation.spec.ts` happy GET) will enumerate the pending row
this spec inserts; wave-5 row 175 (`admin-requests-patch-authz.spec.ts`)
will exercise the approve/deny/cancel transitions on the same row. Skip
guards match row 152 verbatim except `attributionExists` is intentionally
NOT required — `validateOverBudgetApproval` only enforces `isUuid(target_
user_id)` (see `web/src/lib/reseller/requests.ts:125-172`) so the route does
NOT hit `scopedReseller().allowedCustomerIds()` and a partial-seed host with
`attributedUserId` populated but `attributionExists=false` still exercises
the happy path correctly. Rows 150 + 151 remain runtime-blocked on
finding-2's seed + fixture delta per tick 152's preflight; row 156 sits
next in the wave-3-`active_wholesale` subwave.

**Wave-3 row 152 landed (tick 154).** Second wave-3 row landed. Added a
companion `test.describe("Reseller credit-grant — P10 wave-3 happy path")`
block to `web/tests/e2e/reseller/credit-grant-validation.spec.ts` that
mirrors the wave-2 row 148/149 posture verbatim: POST as `active_wholesale`
reseller-admin against `/api/reseller/credits/grant` with
`{ target_user_id: fixture.attributedUserId, amount: 1, reason:
"p10_wave3_row_152_happy_probe" }` and assert 200 with `body.ok=true` +
`typeof body.credit_transaction_id === "string"` matching UUID shape +
`body.over_budget === false`. Row 152 is the shortest remaining wave-3 row
per tick 153's next-tick recommendation — no `trackProjectForCleanup`
wiring needed because credit_transactions rows are cheap and self-scoped
(the founder's credit_balances bump by 1 per CI run, well within
QAPROBEWHOLESALEACTIVE's seeded monthly_credit_budget). The
`over_budget=false` assertion pins the twin of row 151 (no_budget →
over_budget=true / 402): when the reseller IS within budget the mirror row
is inserted with over_budget=false per `credits/grant/route.ts:215`. Same
attribution / adminUserId / attributionExists skip guards as row 148/149 —
partial-seed hosts skip cleanly rather than false-fail as a code
regression. Runaway spend surfaces as a 402 with helpful body carrying
already_granted_this_month + remaining_budget, which is the sentinel for
"reset the QA reseller budget on staging." Rows 155 (requests-authz happy
POST) and 156 (requests-validation happy GET) sit next in the wave-3-
`active_wholesale` subwave. Rows 150 + 151 remain runtime-blocked on
finding-2's seed + fixture delta per tick 152's preflight.

**Wave-3 row 154 landed (tick 153).** Opens wave 3. Added a companion
`test.describe("Reseller sandbox-setup — P10 wave-3 happy path")` block to
`web/tests/e2e/reseller/sandbox-setup-authz.spec.ts` that mirrors the
wave-2 row 146/148 posture verbatim: POST as `active_wholesale`
reseller-admin against `/api/reseller/sandbox/setup` and assert 200 with
`body.ok=true` + `typeof body.project_id === "string"` matching UUID shape.
Fresh-insert branch (`already_existed:false`) additionally pins the full
slug + name envelope per plan §U.4; idempotent-replay branch
(`already_existed:true`) drops slug/name per `route.ts:67-74` so the
row stays idempotent under replay without false-failing on a dirty host.
`fixture.trackProjectForCleanup(body.project_id)` registers the freshly
provisioned sandbox for afterEach cleanup so the next run always re-enters
the fresh-insert branch. Attribution is intentionally NOT required
(`sandbox-setup` does not consult `reseller_attributions` — the sandbox is
per-reseller, not per-customer) which is why this row sat inside the
wave-3-`active_wholesale` subwave (152 / 154 / 155 / 156) that tick 152's
preflight flagged as activation-ready without any seed/fixture delta.
Assertion budget: five expects (200 + body.ok + typeof + UUID + branch on
already_existed with conditional slug/name) — sits at the "2-3 assertions
per row + one branch guard" ceiling the wave-3 prep-cost note calls for.
The audit-log write side-effect is captured by wave-5 row 179
(audit-log-writes.spec.ts) so row 154 keeps its focus on the wire envelope
— a broken audit-log write would surface here via body.ok=false through
the 500 audit_failed branch rather than as a missing audit row that only
row 179 could detect. Rows 155 (requests-authz happy POST) and 156
(requests-validation happy GET) sit next in the wave-3-`active_wholesale`
subwave; row 152 (credit-grant-validation happy 200) also sits inside the
subwave and reuses the same fixture posture. Rows 150 + 151 remain
runtime-blocked on finding-2's seed + fixture delta per tick 152's
preflight.

**Wave-3 preflight landed (tick 152).** Three design-time findings recorded
in `docs/plans/p10-wave3-preflight-finding.md` before wave-3 activation
starts. (1) Row 150 status code inline-fixed: `capability_disabled` returns
403 from the route (`credits/grant/route.ts:128-134`), not 402 as originally
scheduled — table row 150 updated above (401 → 403; row 151 unchanged at
402 because `over_budget_requires_approval` correctly returns 402). (2)
Rows 150 + 151 still runtime-blocked on a seed + fixture delta —
`seed-qa-reseller.mjs` only plants `reseller_attributions` on the
`active_wholesale` variant, so `no_capability` + `no_budget` sessions land
`403 not_in_scope` from `decideReveal` before the intended `capability_
disabled` / `over_budget_requires_approval` branch fires. Fix: extend the
seeder's main loop to also seed attribution on those two variants + widen
`loadTempReseller()`'s `attributedUserId` variant gate; deferred to
follow-up tick per U.13 sign-off cadence. (3) Row 153 struck out
above because `sandbox-setup/route.ts` has no `sandbox_disabled` branch
(no reseller-column capability flag consulted by the route) — row 154
already covers the wave-3 sandbox surface with the happy 200 assertion.
Recommend next tick activates row 154 (`sandbox-setup-authz.spec.ts` ×
`active_wholesale` × happy 200) — that subwave sits inside the wave-3-
`active_wholesale` cluster (152 / 154 / 155 / 156) which is
activation-ready today without any seed/fixture delta.

**Wave-2 row 149 landed (tick 151).** Closes wave 2 in full. Added a
companion `test.describe("Reseller reveal-email — P10 wave-2 uuid_in_scope
happy")` block to `web/tests/e2e/reseller/reveal-email-validation.spec.ts`
that mirrors the row 147 posture across the sibling POST reveal-email route:
same `active_wholesale` + `fixture.attributedUserId` combination as row 148,
but this row partners with the existing `invalid_id` / `not_in_scope`
branches sitting above and pins the sound-chokepoint contract (a
well-formed UUID that IS in `allowedCustomerIds()` returns 200 rather than
403 not_in_scope). Row 148 owns the plaintext-vs-mask contract at the wire
(contains '@' + NOT '*'); row 149 keeps its assertion budget to three
(200 + body.ok true + `typeof body.email === "string"` + contains '@') —
enough to catch a regression in `allowedCustomerIds().includes()` from the
POSITIVE direction, and enough to prove the chain (app_users SELECT +
audit-log write) completes without a 5xx leaking through. The '*' assertion
is not duplicated here — row 148 owns that contract at the wire so a
future plaintext-vs-mask change stays a one-spec edit. Wave 2 (rows 145 →
149) fully lands the scope-boundary readback surface: `me-attribution`
(145), `drawer-authz` (146) + `drawer-validation` (147) partner across the
GET drawer route; `reveal-email-authz` (148) + `reveal-email-validation`
(149) partner across the POST reveal-email route. Wave 3 (rows 150-156 —
capability + budget gates) is now the frontier.

**Wave-2 row 148 landed (tick 150).** Added a companion
`test.describe("Reseller reveal-email — P10 wave-2 happy path")` block to
`web/tests/e2e/reseller/reveal-email-authz.spec.ts` that reuses the
`attributionExists` guard (tick 148) unchanged: POST as `active_wholesale`
reseller-admin against `/api/reseller/customers/[fixture.attributedUserId]/
reveal-email` and assert 200 with `body.ok=true` + `body.email` is a
plaintext string containing `@` and NOT containing `*`. Row 148 partners
with row 146 (drawer-authz) since both routes share the getCurrentUser →
scopedReseller → decideReveal → app_users lookup → audit-log write chain
but differ in HTTP verb (POST vs GET), response field (`email` vs
`overview`), and mask-vs-plaintext contract (drawer masks the email in
overview; reveal-email returns raw). The audit-log write side-effect is
captured by wave-5 row 179 (audit-log-writes.spec.ts) so row 148 keeps its
assertion budget at three (200 + body.ok=true + email plaintext) — enough
to catch an accidental mask leak or a mid-route swallow of the 500
audit_failed branch. Row 149 (reveal-email-validation.spec.ts × happy
path) sits next in the wave-2 queue and reuses the same guards over the
POST reveal-email surface.

**Wave-2 row 147 landed (tick 149).** Added a companion
`test.describe("Reseller customer-drawer — P10 wave-2 uuid_in_scope happy")`
block to `web/tests/e2e/reseller/drawer-validation.spec.ts` that
partners with the existing `invalid_id` / `not_in_scope` branches:
same `active_wholesale` + `fixture.attributedUserId` combination as row
146, but this row asserts that `decideReveal`'s POSITIVE branch fires
(a UUID that IS in `allowedCustomerIds()` returns 200 rather than 403
not_in_scope). Row 146 owns the full envelope shape at the wire
(overview.masked_email / signup_at / credits_balance + progression[0].
kind === "signup" + svi_curve/reports arrays); row 147 keeps its
assertion budget to three (200 + body.ok true + overview defined +
progression non-empty array) — enough to catch a regression in the
chain (app_users SELECT + Promise.all fan-out + audit-log write)
without duplicating row 146. The `attributionExists` guard added tick
148 transfers into this spec unchanged. Rows 148 (reveal-email-authz)
and 149 (reveal-email-validation) sit in different files so cannot be
collapsed per the batching heuristic.

**Wave-2 row 146 landed (tick 148).** Extended
`TempResellerFixture` with `attributionExists: boolean` — true only when
`loadTempReseller("active_wholesale")` confirmed the seeder also planted a
`reseller_attributions` row (not just the founder's `app_users` row). Row
146 (`drawer-authz.spec.ts`) skips when this flag is false because the
drawer route calls `scopedReseller().allowedCustomerIds()` which reads
from `reseller_attributions` — without the row, `decideReveal` returns
403 `not_in_scope`, which would false-fail as a code regression rather
than surface the seeder gap. Row 146 assertions cover the four-key
envelope (`overview`, `progression`, `svi_curve`, `reports`) plus the
signup event that the drawer always synthesises from `app_users.created_at`.
Rows 147–149 sit in different files (drawer-validation, reveal-email-authz,
reveal-email-validation) so cannot be collapsed per the batching heuristic
but reuse the same `attributionExists` guard.

**Wave-2 helper landed (tick 147).** Row 145 was activated in the same
tick that added the helper to `web/tests/e2e/fixtures/reseller.ts`:
`TempResellerFixture.attachAttributedCustomer()` stamps the cache column
`app_users.attribution_reseller_id = fixture.resellerId` on the seeded
`qa-founder-attributed-1@blockid.au` row (the seed script only writes
`reseller_attributions`, not the cache column, so /me returned `reseller:null`
before). `cleanup()` restores the previous cache value in `afterEach` so
cross-spec state does not leak. Rows 146–149 now consume the same helper
without additional prep — each row is a 2–3 assertion paste of the same
skeleton (loadTempReseller → attachAttributedCustomer → loginAs → GET
route → assert body → fixture.cleanup()).

### Wave 3 — capability + budget gates (credit grants + sandbox)

Exercises `decideGrant` / `decideSandboxSpend` / `computeMonthlyUsage`
against live per-variant `resellers` state. Each row uses a different
variant so the four capability failure modes surface distinctly.

| tick | spec | variant | branch | expected |
| --- | --- | --- | --- | --- |
| 150 | `credit-grant-authz.spec.ts` | `no_capability` | `capability_disabled` | 403 |
| 151 | `credit-grant-authz.spec.ts` | `no_budget` | `over_budget_requires_approval` | 402 |
| 152 | `credit-grant-validation.spec.ts` | `active_wholesale` | happy 200 with credit_transaction_id | 200 |
| ~~153~~ | ~~`sandbox-setup-authz.spec.ts`~~ | ~~`no_capability`~~ | ~~`sandbox_disabled`~~ | ~~402~~ |
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
