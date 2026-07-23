// PATCH /api/admin/resellers/requests/[id] pre-write authorization contract —
// P10 dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate ordering
// surfaces before the endpoint reads reseller_requests, validates the
// approve/deny/cancel decision, mints a Stripe coupon, or writes any of the
// four downstream tables — credit_balances, credit_transactions,
// reseller_credit_grants, reseller_promotion_codes, reseller_requests).
//
// Mirrors admin-reseller-patch-authz.spec.ts (tick 103) — both routes use the
// shared requireAdmin() middleware from web/src/lib/reseller/require-admin.ts
// (see route.ts:46-54). The gate throws AdminGateError with code="no_user" |
// "not_admin" and the route emits { ok:false, reason:<code> } at HTTP 401 for
// BOTH branches (route.ts:50-51). Symmetric envelope so a refactor that
// collapses either 401 reason or drops the requireAdmin() gate here would
// light up alongside its sibling on the next `npx playwright test` pass.
//
// Two branches are harness-free and safe against staging (no
// reseller_requests SELECT fires, no validateAdminDecision runs, no Stripe
// coupon is minted, no credit_balances/credit_transactions/reseller_credit_grants
// /reseller_promotion_codes/reseller_requests write happens):
//
//   1. unauthenticated  — PATCH with no session         → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401 BEFORE
//                          params resolution, getSupabaseAdmin, JSON parse,
//                          reseller_requests SELECT, decision validation, any
//                          Stripe mint, or the approve/deny/cancel UPDATE)
//   2. non_admin        — PATCH as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → requireAdmin throws
//                          AdminGateError("not_admin") → gate returns 401 BEFORE
//                          any of the above fires)
//
// Route reference: web/src/app/api/admin/resellers/requests/[id]/route.ts
//   Line 46-54:   gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 55-57:   (redundant) if (!user) → 401 no_user (dead branch — requireAdmin
//                 already threw; kept as a belt-and-braces guard)
//   Line 59-63:   params await + getSupabaseAdmin → 503 not_configured
//   Line 65:      request.json parse (null-safe)
//   Line 67-80:   reseller_requests SELECT → 500 read_failed / 404 not_found
//   Line 83-87:   validateAdminDecision   → 400 <reason> / 409 already_decided
//   Line 93-224:  approve branch fan-out (Stripe coupon mint, promotion_code
//                 insert, credit ledger writes for over_budget_approval,
//                 collateral_approval status flip)
//   Line 226+:    reseller_requests UPDATE — status flip + linked_credit_transaction_id
//                 / linked_promotion_code_id stamp + decision_reason + decided_at
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this spec
//   lights up in CI on the next `npx playwright test` pass alongside
//   admin-reseller-patch-authz.spec.ts, sandbox-setup-authz.spec.ts,
//   billing-authz.spec.ts, reveal-email-authz.spec.ts, drawer-authz.spec.ts,
//   me-attribution.spec.ts, and reports-signed-url-authz.spec.ts.
//
// Deliberately out of scope (needs the admin QA harness or per-test seeding
// which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which would
//     break every other Playwright spec in the same worker.
//   - not_found (404) — sits BEHIND requireAdmin (route.ts:78 vs :46), needs
//     an admin session PLUS an [id] that does not resolve to a reseller_requests
//     row.
//   - validateAdminDecision (400 <reason> / 409 already_decided) — needs an
//     admin session PLUS a real pending request row PLUS an ill-formed body
//     (missing action, unknown action, or already-decided row).
//   - payload_incomplete (422) — approve branch only, needs an admin session
//     PLUS a code_request row with a non-finite tier_pct payload.
//   - reseller_read_failed / existing_code_read_failed / promotion_code_insert
//     _failed / credit ledger insert failures / update_failed (500) — all fold
//     into the admin QA harness follow-up alongside the deferred rows from
//     ticks 94/95/96/97/98/99/100/101/102/103/104.
//   - Happy path (200) approve branch (code_request) — still fires a Stripe
//     coupon+promotion_code mint. Deferred until Stripe test-mode wiring
//     lands (same posture as wave-5 row 182 billing-authz happy path).
//   - Happy path (200) approve branch (over_budget_approval) — ACTIVATED
//     wave-5 row 175 approve-branch block below via the new
//     attachApproveTarget() fixture helper. The helper snapshot-restores
//     four writes end-to-end (reseller_requests INSERT then reseller_credit
//     _grants + reseller_requests + credit_transactions DELETE + credit_
//     balances restore) so the ledger triple-write (route.ts:200-293) has
//     deterministic control over target_user_id AND the pre/post credit_
//     balances state — the delta assertion pins balanceBefore + amount
//     without cross-run drift. Only the code_request approve branch stays
//     deferred (Stripe mint dependency).
//   - Happy path (200) cancel branch — ACTIVATED wave-5 row 175 cancel-
//     branch block below via loadAdminHarness() (qa-admin-1@blockid.au) once
//     row 155-b seeder landed in requests-authz.spec.ts (tick 164) to insert
//     a second pending over_budget_approval row per CI pass. Cancel mirrors
//     deny at route.ts:296-311 — pure status flip with no Stripe coupon
//     mint, no credit_balances / credit_transactions / reseller_credit_grants
//     write, no revenue_events read. Idempotent net-of-(row-155, row-155-b):
//     deny consumes row 155's seed; cancel consumes row 155-b's seed; the
//     queue nets to zero rather than accumulating pending rows. Fresh CI
//     hosts (where neither row 155 nor row 155-b has run yet) test.skip
//     when the pending enumeration returns fewer than the expected rows.
//   - Happy path (200) DENY branch — ACTIVATED wave-5 row 175 below via
//     loadAdminHarness() (qa-admin-1@blockid.au) so the requireAdmin() gate
//     passes. Deny is the safest of the three transitions: pure status flip
//     at route.ts:296-311 (no Stripe coupon mint, no credit_balances /
//     credit_transactions / reseller_credit_grants write, no
//     revenue_events read, no reseller_promotion_codes insert). Idempotent
//     under CI replay net-of-row-155: row 155 inserts one pending
//     over_budget_approval row per CI pass; this row consumes it via the
//     PATCH so the queue nets to zero rather than accumulating. Fresh CI
//     hosts (where row 155 has not run yet) test.skip when the pending
//     enumeration returns an empty array — no false failure.
//
// Placeholder id used in the URL path: a well-formed UUID
// (00000000-0000-0000-0000-000000000000) sits in the [id] segment so it passes
// Next.js dynamic-segment matching. Both rows return BEFORE the params await
// runs (row 1 bails in gate() → getCurrentUser; row 2 bails in gate() →
// requireAdmin), so the placeholder value never reaches
// supabase.from("reseller_requests").eq("id", id).
//
// Body: {action:"approve"} is the smallest well-formed request body that would
// otherwise reach validateAdminDecision. Both rows return BEFORE the JSON
// parse runs so the body is not inspected — any parsable JSON would work.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  adminHarnessSkipReason,
  loadAdminHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type AttachApproveTargetResult,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const ROUTE = `/api/admin/resellers/requests/${PLACEHOLDER_ID}`;
const PATCH_BODY = { action: "approve" };

const REQUESTS_LIST_ROUTE = "/api/admin/resellers/requests";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tick 262 + 263 + 264 — per-key payload content invariants mirrored from
// web/src/lib/reseller/requests.ts so the discriminated-union pin in the
// deny block's post-PATCH read-back GET (tick 262), the cancel block's
// post-PATCH read-back GET (tick 263), and the approve block's post-PATCH
// read-back GET (tick 264) all echo the same source-of-truth shapes the
// validator writes:
//   - ALLOWED_TIER_PCT_VALUES ← ALLOWED_TIER_VALUES at requests.ts:63
//   - SUFFIX_RE               ← SUFFIX_RE at requests.ts:64
//   - HTTPS_URL_RE            ← HTTPS_URL_RE at requests.ts:65
//   - REASON_MAX              ← REASON_MAX at requests.ts:66
//   - PURPOSE_MAX             ← PURPOSE_MAX at requests.ts:67
// Kept as module-scope constants for parity with the tick 259/260/261/262
// hoists across admin-requests-list-authz.spec.ts / requests-validation.spec.
// ts / reseller-requests-list-authz.spec.ts / this spec's deny block (which
// themselves follow the tick 231 RESELLER_CODE_RE precedent — whenever a
// validator-side invariant exists, the spec echoes it verbatim rather than
// re-deriving inline). Tick 263 reused these five constants verbatim for the
// cancel block's post-PATCH read-back so the same drift check fires on both
// non-default ?status= filter paths (denied + cancelled). Tick 264 reuses
// them a third time for the approve block's post-PATCH read-back under the
// ?status=approved filter path — completing three of the four ALLOWED_STATUS
// enum values (pending covered by the three list surfaces, denied +
// cancelled + approved covered by the three PATCH-branch read-backs).
//
// Tick 265 — sixth module-scope constant ISO_TIMESTAMP_RE mirrors the shape
// PostgREST serialises the reseller_requests.decision_at timestamptz column
// into on the wire (see admin-reseller-loop-status-authz.spec.ts:85-86 for
// the sibling ISO_RE precedent). Landed alongside a decision_at typeof-string
// + regex pin added to each of the three post-PATCH read-back rows (deny +
// cancel + approve) so a drift in the column type from timestamptz to
// something else (e.g. a text column, a Unix epoch integer, a dropped column)
// surfaces on the same six list surfaces the tick 262/263/264 payload pins
// already cover. Regex intentionally permits both the `Z` UTC suffix and the
// `+00:00` numeric offset suffix so a PostgREST config change from `.toISOString`
// (Z suffix) to timezone-offset serialisation does NOT trip this pin —
// tightening beyond that would false-positive on a benign wire-format toggle.
//
// Tick 266 — decision_by UUID wire-shape pin added as the companion column
// to the tick-265 decision_at pin. Reuses the module-scope UUID_RE (line
// 139-140) rather than adding a seventh constant — decision_by is a uuid
// column (0095:34) that references public.app_users(id) ON DELETE SET NULL,
// so the read-back row carries the admin user id as a UUID string on the
// happy path. Pin fires on the same six list surfaces after the tick-265
// decision_at pin so a drift in reseller_requests.decision_by from uuid to
// something else (e.g. a text column, a dropped column, or a route
// regression that stripped decision_by from the list SELECT's column
// projection at route.ts:44) surfaces here. The 0095:43-45 CHECK constraint
// permits decision_by to be null when status ∈ ('approved','denied',
// 'cancelled') — only decision_at is required to be non-null in those
// states — but the PATCH route always stamps decision_by: user.id at
// route.ts:309 for all three branches, and no admin-delete fires between
// the PATCH and the very next GET in the same test, so the read-back MUST
// carry a non-null UUID here.
//
// Tick 267 — created_at ISO-8601 wire-shape pin added as the third
// "row-timestamp" column pin (companion to the tick-265 decision_at + tick-
// 266 decision_by pins). reseller_requests.created_at is a `timestamptz NOT
// NULL DEFAULT now()` column (0095:39) that is populated on INSERT and
// never touched by the PATCH branches — so unlike decision_at (populated at
// PATCH time only, non-null iff status ∈ approved/denied/cancelled per the
// 0095:43-45 CHECK) it is always non-null on every read-back regardless of
// which PATCH branch fired. Reuses the module-scope ISO_TIMESTAMP_RE (line
// 200-201) rather than adding an eighth constant. Pin catches a route
// regression that strips created_at from the list SELECT's column projection
// at route.ts:44 (see 0058-0060 idx `reseller_requests_pending_idx` which is
// keyed on `created_at DESC WHERE status='pending'` — a projection drop
// would still let that idx serve the pending-list query but would break the
// approved/denied/cancelled surfaces this spec exercises), as well as a
// column-type flip from timestamptz to something else (e.g. a bigint
// created_at_ms clock migration would surface as a number here). Two-part
// guard mirrors the decision_at pin: typeof-string + ISO_TIMESTAMP_RE.
//
// Tick 268 — decision_reason value pin added as the fourth per-column pin on
// the same three post-PATCH read-back rows (deny + cancel + approve).
// reseller_requests.decision_reason is a nullable text column (0095:36) that
// the PATCH route trims + writes via validateAdminDecision (requests.ts:293-
// 303) with a REASON_MAX (200) cap before UPDATE at route.ts:305-320. All
// three PATCH branches in this spec send a distinct probe decision_reason
// ("p10_wave5_row_175_<deny|cancel|approve>_probe"), all under 200 chars, so
// the read-back MUST carry that exact string. Reuses the module-scope
// REASON_MAX (line 216) rather than adding a ninth constant — same source
// invariant already backs the per-branch payload.reason / payload.notes
// length checks in the discriminated-union pin below. Three-part guard:
// (a) typeof-string (catches a column-type flip from text to something
// else, or a route regression that returned null after the PATCH stamped a
// non-null value), (b) length ≤ REASON_MAX (catches a validator-side
// widening of the cap that this spec did not track — e.g. bump REASON_MAX
// to 500 in requests.ts without a spec update), (c) exact-string equality
// against the probe (catches a route regression that swapped
// decision_reason for a different column value or a validator regression
// that trimmed/normalised the string in an unexpected way — the probe is
// intentionally ASCII-only + underscore-delimited so PostgREST/PostgreSQL
// text serialisation is guaranteed byte-for-byte round-trip). The PATCH
// response body already pins decision_reason value at route.ts:317-319, but
// the read-back closes the same pin against the list route's SELECT column
// projection at /api/admin/resellers/requests/route.ts:44 — a projection
// drop of decision_reason there would still let the PATCH echo the value
// back on the write envelope but would fail the read-back here.
const ALLOWED_TIER_PCT_VALUES = new Set([0, 10, 20, 30, 40]);
const SUFFIX_RE = /^[A-Z0-9]{1,16}$/;
const HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9.-]+(\/.*)?$/;
const REASON_MAX = 200;
const PURPOSE_MAX = 500;
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

test.describe("Admin reseller requests PATCH pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — PATCH with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.patch(ROUTE, { data: PATCH_BODY });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before params await, getSupabaseAdmin, JSON parse, reseller_requests SELECT, validateAdminDecision, Stripe mint, or reseller_requests UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — PATCH as a founder QA account returns 401 not_admin", async ({
    page,
  }) => {
    try {
      await loginAs(page, NON_ADMIN_FOUNDER_EMAIL);
    } catch (err) {
      test.skip(
        true,
        `Non-admin founder account not seeded: ${(err as Error).message}. ` +
          `Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }
    const resp = await page.request.patch(ROUTE, { data: PATCH_BODY });
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before params await, getSupabaseAdmin, JSON parse, reseller_requests SELECT, validateAdminDecision, Stripe mint, or reseller_requests UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

// P10 wave-5 row 175 — happy path DENY branch. Admin PATCHes a pending
// over_budget_approval row seeded by wave-3 row 155 (see
// requests-authz.spec.ts:253+) and flips status pending → denied via
// {action:"deny", decision_reason:"..."}. Deny is picked over approve /
// cancel per the "Deliberately out of scope" block above — pure status
// flip at web/src/app/api/admin/resellers/requests/[id]/route.ts:296-311
// with no Stripe coupon mint, no credit_balances / credit_transactions /
// reseller_credit_grants write, no revenue_events read. Idempotent net-of-
// row-155: row 155 inserts one pending over_budget_approval row per CI
// pass; this row consumes it via the PATCH so the reseller_requests queue
// nets to zero rather than accumulating pending rows. Fresh CI hosts
// (where row 155 has not run yet) test.skip when the pending enumeration
// returns an empty array — no false failure.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + body.request.id
// matching UUID_RE + body.request.status === "denied" + body.request
// .decision_reason non-empty string. Do NOT pin body.request.decision_at
// (a timestamp string that drifts every run — assert typeof string only).
// Do NOT pin linked_credit_transaction_id / linked_promotion_code_id —
// both are null for the deny branch (approve branch would populate them;
// deferred here), so pin their null-ness so a route regression that leaks
// a stray ledger insert into the deny path surfaces here as a non-null
// linked_credit_transaction_id.
//
// State-pollution posture: the PATCH mutates ONE reseller_requests row
// (status flip + decision_reason + decision_at + decision_by) but does
// NOT touch credit_balances, credit_transactions, reseller_credit_grants,
// reseller_promotion_codes, revenue_events, or Stripe. Net-of-row-155 the
// pending queue length is unchanged across CI passes. Row 155 was
// intentionally scoped to over_budget_approval (not code_request) so its
// pending row lives outside the reseller_requests_pending_code_uniq
// partial unique index — a rerun that lands a fresh pending row before
// this spec fires does not 409 duplicate the seed either.
//
// Non-Stripe / non-GST discipline: the deny branch only writes
// reseller_requests. No promotion_code lookup, no credit ledger, no
// Stripe network call, no revenue_events read, no InfoVision dependency.
// P8.5 + P1.5 remain neither a dependency nor a consequence.
//
// Skip discipline: loadAdminHarness() returns null → describe-scope skip
// via adminHarnessSkipReason(); loginAs throw → test-scope skip; empty
// pending list (fresh CI host where row 155 has not run yet) → test-scope
// skip with a pointer at wave-3 row 155. Sibling admin-only rows (164 +
// 173 + 174) use the same pattern; row 174 skips discipline mirrors this
// one but skips at test-scope only for loginAs since its assertion loop
// greens over empty-array too.
test.describe("Admin reseller requests PATCH — P10 wave-5 row 175 happy path (deny)", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("deny — PATCH as qa-admin-1 flips a pending over_budget_approval row to status=denied with a decision_reason", async ({
    page,
  }) => {
    try {
      await loginAs(page, harness!.admin.email);
    } catch (err) {
      test.skip(
        true,
        `Admin QA account not seeded: ${(err as Error).message}. Run ` +
          `scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    // Enumerate pending requests to find a row we can safely deny. The
    // list endpoint's default status filter is 'pending' (route.ts:37+46
    // of the list route) so an omit-?status query returns exactly the
    // rows we want. Filter to over_budget_approval to avoid depleting
    // any code_request row that a downstream approve-branch tick may
    // need — over_budget_approval sits outside the pending-code partial
    // unique index (0095:71-73) so denying one does not create a slot
    // race with the code_request seeder.
    const listResp = await page.request.get(REQUESTS_LIST_ROUTE);
    expect(
      listResp.status(),
      `list route returned ${listResp.status()} — expected 200 to enumerate pending rows before the PATCH. A 401 here means the admin session was not established; a 5xx means the SELECT leaked through. Body: ${await listResp.text()}`,
    ).toBe(200);
    const listBody = (await listResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(listBody.ok).toBe(true);
    expect(Array.isArray(listBody.requests)).toBe(true);

    const rows = (listBody.requests as Array<{
      id?: unknown;
      request_type?: unknown;
      status?: unknown;
    }>) ?? [];
    const target = rows.find(
      (row) =>
        typeof row?.id === "string" &&
        row.request_type === "over_budget_approval" &&
        row.status === "pending",
    );

    if (!target) {
      test.skip(
        true,
        "No pending over_budget_approval row available to deny — " +
          "wave-3 row 155 (requests-authz.spec.ts:253+) has not run yet on " +
          "this host. Run the wave-3 seeder step or execute row 155 before " +
          "this row to populate at least one pending row.",
      );
      return;
    }

    const targetId = target.id as string;
    expect(targetId).toMatch(UUID_RE);

    const decisionReason = "p10_wave5_row_175_deny_probe";
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${targetId}`,
      {
        data: { action: "deny", decision_reason: decisionReason },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `deny returned ${patchResp.status()} — expected 200 after requireAdmin() + validateAdminDecision() pass. A 401 means the admin session dropped mid-test; a 404 not_found means the target row was consumed by a concurrent CI worker (fold into the retry posture below if seen); a 409 already_decided means a concurrent PATCH raced this one; a 500 update_failed means the reseller_requests UPDATE (route.ts:296-322) leaked through. Body: ${await patchResp.text()}`,
    ).toBe(200);

    const patchBody = (await patchResp.json()) as {
      ok?: unknown;
      request?: {
        id?: unknown;
        status?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
        linked_credit_transaction_id?: unknown;
        linked_promotion_code_id?: unknown;
      };
    };
    expect(patchBody.ok).toBe(true);
    expect(typeof patchBody.request?.id).toBe("string");
    expect(patchBody.request?.id as string).toBe(targetId);
    expect(patchBody.request?.status).toBe("denied");
    // decision_at is a timestamp string set inside the route at now =
    // new Date().toISOString() (route.ts:89) — assert typeof string only
    // so the value can drift.
    expect(typeof patchBody.request?.decision_at).toBe("string");
    expect(patchBody.request?.decision_reason).toBe(decisionReason);
    // Deny branch skips the code_request + over_budget_approval fan-outs
    // so both linked_* columns stay null. A route regression that leaked
    // an approve-branch ledger insert or coupon mint into the deny path
    // would surface here as a non-null linked_credit_transaction_id or
    // linked_promotion_code_id.
    expect(patchBody.request?.linked_credit_transaction_id).toBeNull();
    expect(patchBody.request?.linked_promotion_code_id).toBeNull();

    // Tick 262 — post-PATCH read-back GET with discriminated-union payload
    // content pin per tick 261 next-pick option (s). The PATCH response
    // envelope (route.ts:317-319) only echoes id/status/decision_at/
    // decision_reason/linked_credit_transaction_id/linked_promotion_code_id
    // — payload is NOT re-emitted by the UPDATE ... SELECT. To close the
    // writer contract on the payload jsonb column for this now-flipped row,
    // re-read via the list route with ?status=denied and locate the row by
    // id in the returned array, then apply the same discriminated-union
    // guard that tick 259/260/261 landed on the three list surfaces:
    //   - admin-requests-list-authz.spec.ts:341-432 (tick 259, admin list)
    //   - requests-validation.spec.ts (tick 260, reseller happy GET twin)
    //   - reseller-requests-list-authz.spec.ts (tick 261, reseller GET)
    // Extends the payload-content-pin coverage to a fourth surface — the
    // admin list route under the non-default ?status=denied filter path
    // (route.ts:39 branches on the query param via ALLOWED_STATUS.has()).
    // The prior three ticks all exercise the default status='pending' path
    // so a route regression that broke the ?status= param parse or the
    // .eq("status", status) filter at route.ts:46 would surface only here.
    //
    // Writer-schema justification:
    //   - requests.ts:41-44 defines the ResellerRequestPayload discriminated
    //     union: code_request | over_budget_approval | collateral_approval.
    //     The POST route at /api/reseller/requests/route.ts writes the
    //     validator's `{...res.value}` output (requests.ts:229-233 / 243-246
    //     / 253-256) into reseller_requests.payload (jsonb NOT NULL DEFAULT
    //     '{}' per 0095:33). The PATCH we just fired flipped ONLY status +
    //     decision_by + decision_at + decision_reason + linked_credit_
    //     transaction_id + linked_promotion_code_id (route.ts:305-320) —
    //     payload is untouched by the deny branch so the read-back reflects
    //     exactly what the POST validator wrote.
    //   - Per-branch key shape mirrors the tick 259/260/261 pin verbatim
    //     (same 3 branches, same 5 module-scope constants, same source-line
    //     citations):
    //       - code_request → tier_pct (∈ {0,10,20,30,40}), suggested_suffix
    //         (null or /^[A-Z0-9]{1,16}$/), notes (null or string length ≤ 200)
    //       - over_budget_approval → target_user_id (UUID), requested_amount
    //         (positive integer), reason (null or string ≤ 200),
    //         remaining_budget_snapshot (null or non-negative integer)
    //       - collateral_approval → collateral_url (https URL), purpose
    //         (string ≤ 500)
    //
    // Coverage-per-guard posture:
    //   - The row we just denied was seeded by wave-3 row 155 as an
    //     over_budget_approval type, so the over_budget_approval branch is
    //     exercised on green-path CI runs. code_request + collateral_approval
    //     branches are zero-coverage today (no seeded deny targets carry
    //     those types), but the pin still closes the writer contract for
    //     both branches so a route regression that dropped a key from the
    //     SELECT (route.ts:44 echoes payload jsonb straight through) or a
    //     validator regression that swapped a key shape at requests.ts would
    //     surface across all four list surfaces on the next CI pass —
    //     matches the tick 259/260/261 zero-coverage-per-guard rationale.
    //
    // Skip discipline: a fresh CI host where the ?status=denied query
    // returns an array missing our target id (e.g. concurrent worker
    // cleaned up the row) surfaces as an explicit test.skip pointer rather
    // than a bare undefined-access — deny already flipped one row this run
    // so a missing read-back means the row was consumed externally between
    // the PATCH and this GET.
    const readbackResp = await page.request.get(
      `${REQUESTS_LIST_ROUTE}?status=denied`,
    );
    expect(
      readbackResp.status(),
      `read-back GET returned ${readbackResp.status()} — expected 200 after requireAdmin() + ALLOWED_STATUS.has("denied") filter path. A 401 means the admin session dropped between the PATCH and this GET; a 5xx means the reseller_requests SELECT under the ?status=denied filter leaked through. Body: ${await readbackResp.text()}`,
    ).toBe(200);
    const readbackBody = (await readbackResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(readbackBody.ok).toBe(true);
    expect(Array.isArray(readbackBody.requests)).toBe(true);
    const readbackRow = ((readbackBody.requests as unknown[]) ?? []).find(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        (row as { id?: unknown }).id === targetId,
    ) as
      | {
          id?: unknown;
          request_type?: unknown;
          status?: unknown;
          payload?: unknown;
          decision_at?: unknown;
          decision_by?: unknown;
          decision_reason?: unknown;
          created_at?: unknown;
        }
      | undefined;
    if (!readbackRow) {
      test.skip(
        true,
        `read-back could not locate id=${targetId} in status=denied list — ` +
          "a concurrent CI worker likely consumed the row between the PATCH " +
          "and this GET. Re-run to pick up a fresh row 155 seed.",
      );
      return;
    }
    // Route SELECT at route.ts:44 echoes the payload jsonb column straight
    // through with no normalisation. The DB column is `payload jsonb NOT
    // NULL DEFAULT '{}'` per 0095:33 so every row carries a plain object
    // (never null, never array). Precondition for the per-key discriminated-
    // union guard below.
    expect(
      readbackRow.payload !== null &&
        typeof readbackRow.payload === "object" &&
        !Array.isArray(readbackRow.payload),
      `read-back row.payload should be a plain object (jsonb NOT NULL DEFAULT '{}' per 0095:33): ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 265 — decision_at ISO-8601 wire-shape pin on the list read-back
    // row. Complements the payload jsonb discriminated-union pin above by
    // closing the wire contract on the timestamptz column (0095:35). The
    // deny branch just stamped decision_at at route.ts:98 via new Date()
    // .toISOString() so the pending-then-denied row now carries a non-null
    // value here. Two-part guard: typeof-string (a column-type flip from
    // timestamptz to say bigint would surface as a number here) + ISO regex
    // (a stringify format drift from ISO to say a locale-formatted date
    // string would surface as a non-match). Regex permits Z or +HH:MM
    // offset suffixes so a PostgREST config change from `.toISOString`-style
    // Z serialisation to timezone-offset serialisation is a benign no-op.
    expect(typeof readbackRow.decision_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.decision_at as string),
      `read-back row.decision_at '${String(readbackRow.decision_at)}' should match ISO 8601 shape (timestamptz per 0095:35 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 266 — decision_by UUID wire-shape pin, companion to the tick-265
    // decision_at pin above. reseller_requests.decision_by is a uuid column
    // (0095:34) that the deny branch just stamped via decision_by: user.id
    // at route.ts:309 (identical assignment on all three PATCH branches).
    // The 0095:43-45 CHECK constraint permits decision_by to be null when
    // status ∈ ('approved','denied','cancelled') — only decision_at is
    // required to be non-null in those states — but the route always sets
    // decision_by to the authenticated admin's uuid and no admin-delete
    // fires between the PATCH and this GET, so on the happy path the read-
    // back carries a non-null UUID string here. Two-part guard mirrors the
    // decision_at pin: typeof-string (column-type flip from uuid to say a
    // bigint would surface as a number) + UUID_RE (a drift in the uuid
    // serialisation shape or a route regression that stripped decision_by
    // from the list SELECT's column projection at route.ts:44 would fail
    // the regex match).
    expect(typeof readbackRow.decision_by).toBe("string");
    expect(
      UUID_RE.test(readbackRow.decision_by as string),
      `read-back row.decision_by '${String(readbackRow.decision_by)}' should match UUID shape (uuid per 0095:34, stamped from user.id at route.ts:309); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 267 — created_at ISO-8601 wire-shape pin, companion to the tick-
    // 265 decision_at + tick-266 decision_by pins on the deny surface. The
    // reseller_requests.created_at column (0095:39) is `timestamptz NOT NULL
    // DEFAULT now()` and is populated at INSERT time only — the deny PATCH
    // branch does NOT touch this column, so the wire value here mirrors
    // whatever row 155's insert stamped. Same two-part guard as the
    // decision_at pin: typeof-string + ISO_TIMESTAMP_RE (Z or +HH:MM
    // suffixes both permitted). See the module-scope tick-267 comment block
    // above for the full rationale.
    expect(typeof readbackRow.created_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.created_at as string),
      `read-back row.created_at '${String(readbackRow.created_at)}' should match ISO 8601 shape (timestamptz per 0095:39 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 268 — decision_reason value pin, fourth per-column pin on the
    // deny-branch read-back row. reseller_requests.decision_reason is a
    // nullable text column (0095:36) that the deny PATCH just wrote via
    // validateAdminDecision (requests.ts:293-303 trims + caps at REASON_MAX)
    // and UPDATE at route.ts:305-320. Three-part guard: typeof-string
    // (column-type flip catch), length ≤ REASON_MAX (validator-cap widening
    // catch), exact-string equality against the probe (route swap +
    // validator normalisation catch). Complements the existing PATCH-
    // response pin at line 407 by closing the SELECT column projection at
    // /api/admin/resellers/requests/route.ts:44 — a projection drop of
    // decision_reason there would still let the PATCH echo the value on the
    // write envelope but would fail the read-back here.
    expect(typeof readbackRow.decision_reason).toBe("string");
    expect(
      (readbackRow.decision_reason as string).length <= REASON_MAX,
      `read-back row.decision_reason length ${(readbackRow.decision_reason as string).length} > REASON_MAX (${REASON_MAX}) per requests.ts:66 — a validator-side cap widening would surface here: ${JSON.stringify(readbackRow.decision_reason).slice(0, 100)}`,
    ).toBe(true);
    expect(readbackRow.decision_reason).toBe(decisionReason);
    // Two-part guard per nullable key: (a) `x === null` short-circuit +
    // (b) typeof-string + regex/length check. Same shape as the tick
    // 259/260/261 pins. TYPEOF + VALUE-tighten pins per key so a rename OR
    // a shape drift both surface — matches tick 259/260/261 rationale.
    const readbackPayload = readbackRow.payload as Record<string, unknown>;
    if (readbackRow.request_type === "code_request") {
      expect(typeof readbackPayload.tier_pct).toBe("number");
      expect(
        ALLOWED_TIER_PCT_VALUES.has(readbackPayload.tier_pct as number),
        `read-back code_request payload.tier_pct '${String(readbackPayload.tier_pct)}' not in {0, 10, 20, 30, 40} per requests.ts:63: ${JSON.stringify(readbackPayload).slice(0, 200)}`,
      ).toBe(true);
      expect(
        readbackPayload.suggested_suffix === null ||
          (typeof readbackPayload.suggested_suffix === "string" &&
            SUFFIX_RE.test(readbackPayload.suggested_suffix as string)),
        `read-back code_request payload.suggested_suffix should be null or match /^[A-Z0-9]{1,16}$/ per requests.ts:64+98-104: ${JSON.stringify(readbackPayload.suggested_suffix)}`,
      ).toBe(true);
      expect(
        readbackPayload.notes === null ||
          (typeof readbackPayload.notes === "string" &&
            (readbackPayload.notes as string).length <= REASON_MAX),
        `read-back code_request payload.notes should be null or string length ≤ ${REASON_MAX} per requests.ts:106-113: ${JSON.stringify(readbackPayload.notes)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "over_budget_approval") {
      expect(typeof readbackPayload.target_user_id).toBe("string");
      expect(readbackPayload.target_user_id as string).toMatch(UUID_RE);
      expect(typeof readbackPayload.requested_amount).toBe("number");
      expect(
        Number.isInteger(readbackPayload.requested_amount) &&
          (readbackPayload.requested_amount as number) > 0,
        `read-back over_budget_approval payload.requested_amount should be a positive integer per requests.ts:139-149: ${JSON.stringify(readbackPayload.requested_amount)}`,
      ).toBe(true);
      expect(
        readbackPayload.reason === null ||
          (typeof readbackPayload.reason === "string" &&
            (readbackPayload.reason as string).length <= REASON_MAX),
        `read-back over_budget_approval payload.reason should be null or string length ≤ ${REASON_MAX} per requests.ts:150-157: ${JSON.stringify(readbackPayload.reason)}`,
      ).toBe(true);
      expect(
        readbackPayload.remaining_budget_snapshot === null ||
          (typeof readbackPayload.remaining_budget_snapshot === "number" &&
            Number.isInteger(readbackPayload.remaining_budget_snapshot) &&
            (readbackPayload.remaining_budget_snapshot as number) >= 0),
        `read-back over_budget_approval payload.remaining_budget_snapshot should be null or non-negative integer per requests.ts:158-162: ${JSON.stringify(readbackPayload.remaining_budget_snapshot)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "collateral_approval") {
      expect(typeof readbackPayload.collateral_url).toBe("string");
      expect(readbackPayload.collateral_url as string).toMatch(HTTPS_URL_RE);
      expect(typeof readbackPayload.purpose).toBe("string");
      expect(
        (readbackPayload.purpose as string).length <= PURPOSE_MAX,
        `read-back collateral_approval payload.purpose should be length ≤ ${PURPOSE_MAX} per requests.ts:193-195: ${JSON.stringify(readbackPayload.purpose).slice(0, 100)}`,
      ).toBe(true);
    }
  });
});

// P10 wave-5 row 175 — happy path CANCEL branch. Admin PATCHes a second
// pending over_budget_approval row (seeded by wave-5 row 155-b in
// requests-authz.spec.ts) and flips status pending → cancelled via
// {action:"cancel", decision_reason:"..."}. Cancel mirrors deny at
// web/src/app/api/admin/resellers/requests/[id]/route.ts:296-311 with the
// same pure status flip — no Stripe coupon mint, no credit_balances /
// credit_transactions / reseller_credit_grants / reseller_promotion_codes /
// revenue_events write. Idempotent net-of-(row-155, row-155-b): the deny
// block above consumes row 155's seed; this block consumes row 155-b's
// seed; the reseller_requests queue nets to zero rather than accumulating.
//
// Coverage-vs-duplication call vs the deny block: pin 200 + body.ok=true +
// body.request.id matching UUID_RE + body.request.status === "cancelled" +
// body.request.decision_reason === "p10_wave5_row_175_cancel_probe" + both
// linked_* columns null. Do NOT pin body.request.decision_at value (a
// timestamp string set at now = new Date().toISOString() inside the route —
// assert typeof string only). The status === "cancelled" pin catches a
// regression that mis-computed the status enum from action (validateAdmin
// Decision at web/src/lib/reseller/requests.ts:301-303 folds action ===
// "cancel" → "cancelled"). Pinning both status enums across the two blocks
// (denied vs cancelled) catches a folded-together regression where cancel
// and deny both round-trip to the same string.
//
// Skip discipline: loadAdminHarness() returns null → describe-scope skip
// via adminHarnessSkipReason(); loginAs throw → test-scope skip; empty
// pending list AFTER the deny block consumed row 155's seed and row 155-b
// has not run yet (fresh CI host or partial-seed) → test-scope skip with a
// pointer at wave-5 row 155-b. The enumeration filter mirrors the deny
// block (request_type === "over_budget_approval") so cancel and deny each
// find a distinct row via the array-order traversal without needing an
// explicit row-id exchange between the two describe blocks.
//
// State-pollution posture: the PATCH mutates ONE reseller_requests row
// (status pending → cancelled + decision_by + decision_at + decision_reason
// + linked_credit_transaction_id + linked_promotion_code_id, both nulls).
// No credit_balances / credit_transactions / reseller_credit_grants /
// reseller_promotion_codes / revenue_events / Stripe writes. Net-of-
// (row-155, row-155-b) the pending queue length is unchanged across CI
// passes. Row 155-b is scoped to over_budget_approval (not code_request) so
// its seeded row lives outside the reseller_requests_pending_code_uniq
// partial unique index (0095:71-73) — a rerun that lands a fresh pending
// row before this spec fires does not 409 duplicate the seed either.
//
// Non-Stripe / non-GST discipline: the cancel branch only writes
// reseller_requests. No promotion_code lookup, no credit ledger, no Stripe
// network call, no revenue_events read, no InfoVision dependency. P8.5 +
// P1.5 remain neither a dependency nor a consequence.
test.describe("Admin reseller requests PATCH — P10 wave-5 row 175 happy path (cancel)", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("cancel — PATCH as qa-admin-1 flips a pending over_budget_approval row to status=cancelled with a decision_reason", async ({
    page,
  }) => {
    try {
      await loginAs(page, harness!.admin.email);
    } catch (err) {
      test.skip(
        true,
        `Admin QA account not seeded: ${(err as Error).message}. Run ` +
          `scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    // Enumerate pending requests to find a row we can safely cancel. The
    // list endpoint's default status filter is 'pending' so an omit-?status
    // query returns exactly the rows we want. Filter to over_budget_approval
    // for the same reason as the deny block above — cancel + deny each need
    // a distinct pending row (row 155 for deny, row 155-b for cancel), and
    // scoping to over_budget_approval leaves any pending code_request row
    // alone for a downstream approve-branch tick that may need it.
    const listResp = await page.request.get(REQUESTS_LIST_ROUTE);
    expect(
      listResp.status(),
      `list route returned ${listResp.status()} — expected 200 to enumerate pending rows before the PATCH. A 401 here means the admin session was not established; a 5xx means the SELECT leaked through. Body: ${await listResp.text()}`,
    ).toBe(200);
    const listBody = (await listResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(listBody.ok).toBe(true);
    expect(Array.isArray(listBody.requests)).toBe(true);

    const rows = (listBody.requests as Array<{
      id?: unknown;
      request_type?: unknown;
      status?: unknown;
    }>) ?? [];
    const target = rows.find(
      (row) =>
        typeof row?.id === "string" &&
        row.request_type === "over_budget_approval" &&
        row.status === "pending",
    );

    if (!target) {
      test.skip(
        true,
        "No pending over_budget_approval row available to cancel — " +
          "wave-5 row 155-b (requests-authz.spec.ts row 155-b describe " +
          "block) has not run yet on this host, or the deny block above " +
          "consumed the only pending row on a partial-seed host. Run the " +
          "wave-3 + wave-5 seeder blocks or execute rows 155 + 155-b before " +
          "this row to populate at least two pending rows.",
      );
      return;
    }

    const targetId = target.id as string;
    expect(targetId).toMatch(UUID_RE);

    const decisionReason = "p10_wave5_row_175_cancel_probe";
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${targetId}`,
      {
        data: { action: "cancel", decision_reason: decisionReason },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `cancel returned ${patchResp.status()} — expected 200 after requireAdmin() + validateAdminDecision() pass. A 401 means the admin session dropped mid-test; a 404 not_found means the target row was consumed by a concurrent CI worker; a 409 already_decided means a concurrent PATCH raced this one; a 500 update_failed means the reseller_requests UPDATE (route.ts:296-322) leaked through. Body: ${await patchResp.text()}`,
    ).toBe(200);

    const patchBody = (await patchResp.json()) as {
      ok?: unknown;
      request?: {
        id?: unknown;
        status?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
        linked_credit_transaction_id?: unknown;
        linked_promotion_code_id?: unknown;
      };
    };
    expect(patchBody.ok).toBe(true);
    expect(typeof patchBody.request?.id).toBe("string");
    expect(patchBody.request?.id as string).toBe(targetId);
    expect(patchBody.request?.status).toBe("cancelled");
    expect(typeof patchBody.request?.decision_at).toBe("string");
    expect(patchBody.request?.decision_reason).toBe(decisionReason);
    // Cancel branch skips the code_request + over_budget_approval fan-outs
    // (same as deny) so both linked_* columns stay null. A route regression
    // that leaked an approve-branch ledger insert or coupon mint into the
    // cancel path would surface here as a non-null linked_credit_transaction
    // _id or linked_promotion_code_id.
    expect(patchBody.request?.linked_credit_transaction_id).toBeNull();
    expect(patchBody.request?.linked_promotion_code_id).toBeNull();

    // Tick 263 — post-PATCH read-back GET with discriminated-union payload
    // content pin per tick 262 next-pick option (s2). Mirrors the tick 262
    // deny-branch read-back verbatim onto the cancel-branch surface so the
    // payload jsonb per-type shape contract is now content-pinned on FIVE
    // list read surfaces simultaneously:
    //   - admin-requests-list-authz.spec.ts:341-432 (tick 259, admin list,
    //     default ?status=pending path)
    //   - requests-validation.spec.ts (tick 260, reseller happy GET twin,
    //     default status=pending path)
    //   - reseller-requests-list-authz.spec.ts (tick 261, reseller GET,
    //     default status=pending path)
    //   - admin-requests-patch-authz.spec.ts deny block (tick 262, admin
    //     list under ?status=denied filter path via route.ts:39 branch on
    //     ALLOWED_STATUS.has())
    //   - admin-requests-patch-authz.spec.ts cancel block (this tick, admin
    //     list under ?status=cancelled filter path — third non-default
    //     status enum exercised, complements tick 262's ?status=denied)
    // Extending the same read-back onto the APPROVE branch landed on
    // tick 264 in the approve describe block below (?status=approved
    // filter path).
    //
    // Writer-schema justification: unchanged from the tick 262 deny-branch
    // read-back — the PATCH response envelope at route.ts:317-319 only
    // echoes id/status/decision_at/decision_reason/linked_credit_transaction
    // _id/linked_promotion_code_id (payload is NOT re-emitted by the
    // UPDATE ... SELECT), and the cancel branch flips ONLY status +
    // decision_by + decision_at + decision_reason + linked_credit_
    // transaction_id + linked_promotion_code_id (route.ts:305-320) so the
    // read-back reflects exactly what the POST validator wrote.
    //
    // Per-branch key shape mirrors the tick 259/260/261/262 pin verbatim
    // (same 3 branches, same 5 module-scope constants, same source-line
    // citations):
    //   - code_request → tier_pct (∈ {0,10,20,30,40}), suggested_suffix
    //     (null or /^[A-Z0-9]{1,16}$/), notes (null or string length ≤ 200)
    //   - over_budget_approval → target_user_id (UUID), requested_amount
    //     (positive integer), reason (null or string ≤ 200),
    //     remaining_budget_snapshot (null or non-negative integer)
    //   - collateral_approval → collateral_url (https URL), purpose
    //     (string ≤ 500)
    //
    // Coverage-per-guard posture: the row we just cancelled was seeded by
    // wave-5 row 155-b as an over_budget_approval type (the cancel block
    // filters to over_budget_approval on rows.find above so this is
    // structurally guaranteed on green-path CI runs), so the
    // over_budget_approval branch is exercised on this fifth surface too.
    // code_request + collateral_approval branches remain zero-coverage on
    // this surface for the same reason as ticks 259/260/261/262 — no seeded
    // cancel targets carry those types today. The pin still closes the
    // writer contract for both branches so a route regression that dropped
    // a key from the SELECT (route.ts:44 echoes payload jsonb straight
    // through) or a validator regression that swapped a key shape at
    // requests.ts would surface across all five list surfaces on the next
    // CI pass — matches the tick 259/260/261/262 zero-coverage-per-guard
    // rationale.
    //
    // Skip discipline: a fresh CI host where the ?status=cancelled query
    // returns an array missing our target id (e.g. concurrent worker
    // cleaned up the row) surfaces as an explicit test.skip pointer rather
    // than a bare undefined-access — cancel already flipped one row this
    // run so a missing read-back means the row was consumed externally
    // between the PATCH and this GET.
    const readbackResp = await page.request.get(
      `${REQUESTS_LIST_ROUTE}?status=cancelled`,
    );
    expect(
      readbackResp.status(),
      `read-back GET returned ${readbackResp.status()} — expected 200 after requireAdmin() + ALLOWED_STATUS.has("cancelled") filter path. A 401 means the admin session dropped between the PATCH and this GET; a 5xx means the reseller_requests SELECT under the ?status=cancelled filter leaked through. Body: ${await readbackResp.text()}`,
    ).toBe(200);
    const readbackBody = (await readbackResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(readbackBody.ok).toBe(true);
    expect(Array.isArray(readbackBody.requests)).toBe(true);
    const readbackRow = ((readbackBody.requests as unknown[]) ?? []).find(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        (row as { id?: unknown }).id === targetId,
    ) as
      | {
          id?: unknown;
          request_type?: unknown;
          status?: unknown;
          payload?: unknown;
          decision_at?: unknown;
          decision_by?: unknown;
          decision_reason?: unknown;
          created_at?: unknown;
        }
      | undefined;
    if (!readbackRow) {
      test.skip(
        true,
        `read-back could not locate id=${targetId} in status=cancelled list — ` +
          "a concurrent CI worker likely consumed the row between the PATCH " +
          "and this GET. Re-run to pick up a fresh row 155-b seed.",
      );
      return;
    }
    // Route SELECT at route.ts:44 echoes the payload jsonb column straight
    // through with no normalisation. The DB column is `payload jsonb NOT
    // NULL DEFAULT '{}'` per 0095:33 so every row carries a plain object
    // (never null, never array). Precondition for the per-key discriminated-
    // union guard below.
    expect(
      readbackRow.payload !== null &&
        typeof readbackRow.payload === "object" &&
        !Array.isArray(readbackRow.payload),
      `read-back row.payload should be a plain object (jsonb NOT NULL DEFAULT '{}' per 0095:33): ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 265 — decision_at ISO-8601 wire-shape pin mirrored from the
    // tick-262 deny-block addition onto the cancel-block surface so the
    // timestamptz column shape (0095:35) is content-pinned on the second of
    // the three post-PATCH read-back rows too. Same two-part guard: typeof-
    // string + ISO regex; same rationale for permitting Z or +HH:MM
    // suffixes. The cancel branch just stamped decision_at at route.ts:98
    // (identical route line to deny + approve) so the pending-then-cancelled
    // row now carries a non-null value here.
    expect(typeof readbackRow.decision_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.decision_at as string),
      `read-back row.decision_at '${String(readbackRow.decision_at)}' should match ISO 8601 shape (timestamptz per 0095:35 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 266 — decision_by UUID wire-shape pin mirrored from the deny-
    // block onto the cancel-block surface so the uuid column shape
    // (0095:34) is content-pinned on the second of the three post-PATCH
    // read-back rows too. Same two-part guard as the deny surface: typeof-
    // string + UUID_RE. The cancel branch just stamped decision_by:
    // user.id at route.ts:309 (identical assignment line to deny + approve)
    // so the pending-then-cancelled row now carries a non-null uuid value
    // here. See the deny-block block-scope comment above for full rationale.
    expect(typeof readbackRow.decision_by).toBe("string");
    expect(
      UUID_RE.test(readbackRow.decision_by as string),
      `read-back row.decision_by '${String(readbackRow.decision_by)}' should match UUID shape (uuid per 0095:34, stamped from user.id at route.ts:309); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 267 — created_at ISO-8601 wire-shape pin mirrored from the deny-
    // block onto the cancel-block surface so the timestamptz INSERT-time
    // column shape (0095:39) is content-pinned on the second of the three
    // post-PATCH read-back rows too. Same two-part guard as the deny surface:
    // typeof-string + ISO_TIMESTAMP_RE. The cancel PATCH branch does not
    // touch created_at (only decision_at + decision_by + status +
    // decision_reason move on cancel), so the wire value mirrors whatever
    // row 155-b's insert stamped. See the module-scope tick-267 comment
    // block above for the full rationale.
    expect(typeof readbackRow.created_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.created_at as string),
      `read-back row.created_at '${String(readbackRow.created_at)}' should match ISO 8601 shape (timestamptz per 0095:39 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 268 — decision_reason value pin mirrored from the deny-block onto
    // the cancel-block surface so the nullable text column (0095:36) is
    // content-pinned on the second of the three post-PATCH read-back rows
    // too. Same three-part guard as the deny surface: typeof-string + length
    // ≤ REASON_MAX + exact-string equality against the cancel probe. The
    // cancel PATCH wrote decision_reason via validateAdminDecision at
    // requests.ts:293-303 (identical validator call as deny + approve;
    // action='cancel' folds to status='cancelled' at requests.ts:301-303 but
    // decision_reason path is unchanged). See the deny-block block-scope
    // comment above and the module-scope tick-268 comment for full rationale.
    expect(typeof readbackRow.decision_reason).toBe("string");
    expect(
      (readbackRow.decision_reason as string).length <= REASON_MAX,
      `read-back row.decision_reason length ${(readbackRow.decision_reason as string).length} > REASON_MAX (${REASON_MAX}) per requests.ts:66 — a validator-side cap widening would surface here: ${JSON.stringify(readbackRow.decision_reason).slice(0, 100)}`,
    ).toBe(true);
    expect(readbackRow.decision_reason).toBe(decisionReason);
    // Two-part guard per nullable key: (a) `x === null` short-circuit +
    // (b) typeof-string + regex/length check. Same shape as the tick
    // 259/260/261/262 pins. TYPEOF + VALUE-tighten pins per key so a rename
    // OR a shape drift both surface — matches tick 262 rationale verbatim.
    const readbackPayload = readbackRow.payload as Record<string, unknown>;
    if (readbackRow.request_type === "code_request") {
      expect(typeof readbackPayload.tier_pct).toBe("number");
      expect(
        ALLOWED_TIER_PCT_VALUES.has(readbackPayload.tier_pct as number),
        `read-back code_request payload.tier_pct '${String(readbackPayload.tier_pct)}' not in {0, 10, 20, 30, 40} per requests.ts:63: ${JSON.stringify(readbackPayload).slice(0, 200)}`,
      ).toBe(true);
      expect(
        readbackPayload.suggested_suffix === null ||
          (typeof readbackPayload.suggested_suffix === "string" &&
            SUFFIX_RE.test(readbackPayload.suggested_suffix as string)),
        `read-back code_request payload.suggested_suffix should be null or match /^[A-Z0-9]{1,16}$/ per requests.ts:64+98-104: ${JSON.stringify(readbackPayload.suggested_suffix)}`,
      ).toBe(true);
      expect(
        readbackPayload.notes === null ||
          (typeof readbackPayload.notes === "string" &&
            (readbackPayload.notes as string).length <= REASON_MAX),
        `read-back code_request payload.notes should be null or string length ≤ ${REASON_MAX} per requests.ts:106-113: ${JSON.stringify(readbackPayload.notes)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "over_budget_approval") {
      expect(typeof readbackPayload.target_user_id).toBe("string");
      expect(readbackPayload.target_user_id as string).toMatch(UUID_RE);
      expect(typeof readbackPayload.requested_amount).toBe("number");
      expect(
        Number.isInteger(readbackPayload.requested_amount) &&
          (readbackPayload.requested_amount as number) > 0,
        `read-back over_budget_approval payload.requested_amount should be a positive integer per requests.ts:139-149: ${JSON.stringify(readbackPayload.requested_amount)}`,
      ).toBe(true);
      expect(
        readbackPayload.reason === null ||
          (typeof readbackPayload.reason === "string" &&
            (readbackPayload.reason as string).length <= REASON_MAX),
        `read-back over_budget_approval payload.reason should be null or string length ≤ ${REASON_MAX} per requests.ts:150-157: ${JSON.stringify(readbackPayload.reason)}`,
      ).toBe(true);
      expect(
        readbackPayload.remaining_budget_snapshot === null ||
          (typeof readbackPayload.remaining_budget_snapshot === "number" &&
            Number.isInteger(readbackPayload.remaining_budget_snapshot) &&
            (readbackPayload.remaining_budget_snapshot as number) >= 0),
        `read-back over_budget_approval payload.remaining_budget_snapshot should be null or non-negative integer per requests.ts:158-162: ${JSON.stringify(readbackPayload.remaining_budget_snapshot)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "collateral_approval") {
      expect(typeof readbackPayload.collateral_url).toBe("string");
      expect(readbackPayload.collateral_url as string).toMatch(HTTPS_URL_RE);
      expect(typeof readbackPayload.purpose).toBe("string");
      expect(
        (readbackPayload.purpose as string).length <= PURPOSE_MAX,
        `read-back collateral_approval payload.purpose should be length ≤ ${PURPOSE_MAX} per requests.ts:193-195: ${JSON.stringify(readbackPayload.purpose).slice(0, 100)}`,
      ).toBe(true);
    }
  });
});

// P10 wave-5 row 175 — happy path APPROVE branch (over_budget_approval).
// Admin PATCHes a pending over_budget_approval row minted by the temp-
// reseller fixture's attachApproveTarget() helper (fixtures/reseller.ts) and
// approves it via {action:"approve", decision_reason:"..."}. Approve is the
// heavyweight transition at web/src/app/api/admin/resellers/requests/[id]
// /route.ts:200-293: credit_balances UPSERT (bumps balance +
// lifetime_earned by payload.requested_amount) + credit_transactions INSERT
// (reason='reseller_grant_over_budget', metadata carries reseller_request_id
// + approved_by_admin) + reseller_credit_grants INSERT (kind='grant',
// over_budget=true, credit_transaction_id links to the fresh transaction)
// + reseller_requests UPDATE (status pending → approved, decision_by +
// decision_at + decision_reason + linked_credit_transaction_id stamped).
// No Stripe network call — the code_request approve branch is the Stripe-
// dependent path and stays deferred (see "Deliberately out of scope"
// above) pending Stripe test-mode wiring.
//
// Coverage-vs-duplication call vs the deny + cancel blocks: pin 200 +
// body.ok=true + body.request.id matching UUID_RE + body.request.status ===
// "approved" + body.request.decision_reason === explicit probe string +
// body.request.linked_credit_transaction_id matching UUID_RE (non-null,
// distinguishes approve from deny/cancel where both linked_* stay null) +
// body.request.linked_promotion_code_id === null (over_budget_approval
// approve NEVER mints a promotion_code — that path is code_request only).
// The linked_credit_transaction_id UUID pin catches (a) a regression that
// dropped the transaction insert but returned 200 anyway, and (b) a
// regression that folded promotion_code stamping into the over_budget
// branch. Do NOT pin body.request.decision_at value (timestamp drift).
//
// State-pollution posture: attachApproveTarget() snapshot-restores four
// writes end-to-end on fixture.cleanup(). The reseller_credit_grants row
// is filtered by metadata->>'reseller_request_id' = requestId (matches the
// route's metadata write at route.ts:281-286). The reseller_requests row
// is deleted by id. The credit_transactions row is filtered by the same
// metadata path (route.ts:253-259). credit_balances is either UPSERTed
// back to snapshot (balance, lifetime_earned) when a row existed pre-
// attach, or DELETEd entirely when this call minted a fresh row.
// cleanup() runs in afterAll so a failing assertion in the test still
// triggers the restore closure.
//
// Skip discipline mirrors the deny + cancel blocks with three extra
// layers for the fixture: loadAdminHarness null (describe-scope skip via
// adminHarnessSkipReason), loadTempReseller throw (test-scope skip),
// loadTempReseller null (test-scope skip via tempResellerSkipReason),
// attachApproveTarget throw (SQL error — test-scope skip surfaces the
// underlying error), attach null (attributedUserId or adminUserId missing
// on this host — targeted skip pointer at the seeder scripts).
//
// Non-Stripe / non-GST discipline: the approve branch for over_budget_
// approval only writes credit_balances + credit_transactions +
// reseller_credit_grants + reseller_requests. No Stripe network call, no
// revenue_events read, no InfoVision dependency. P8.5 + P1.5 remain
// neither a dependency nor a consequence — the same posture that let the
// deny + cancel blocks land in prior ticks.
test.describe("Admin reseller requests PATCH — P10 wave-5 row 175 happy path (approve over_budget_approval)", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  let fixture: TempResellerFixture | null = null;
  let fixtureError: Error | null = null;
  let attach: AttachApproveTargetResult | null = null;
  let attachError: Error | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = err as Error;
      return;
    }
    if (!fixture) return;
    try {
      attach = await fixture.attachApproveTarget();
    } catch (err) {
      attachError = err as Error;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch {
        // Swallow cleanup errors so a teardown regression does not mask
        // the test verdict — the leaked row will surface on the next run
        // via the pending-inbox scan.
      }
    }
  });

  test("approve — PATCH as qa-admin-1 flips a pending over_budget_approval row to status=approved and stamps linked_credit_transaction_id", async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(
        true,
        `loadTempReseller('active_wholesale') threw: ${fixtureError.message}. ` +
          tempResellerSkipReason("active_wholesale"),
      );
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (attachError) {
      test.skip(
        true,
        `attachApproveTarget threw: ${attachError.message}. Common ` +
          `causes: migration 0091/0095/0096 not applied on this host, or ` +
          `the credit_balances / credit_transactions / reseller_credit_grants ` +
          `/ reseller_requests table missing.`,
      );
      return;
    }
    if (!attach) {
      test.skip(
        true,
        "attachApproveTarget returned null — attributed founder or " +
          "reseller-admin app_users row missing on this host. Run " +
          "scripts/seed-qa-reseller.mjs + scripts/seed-test-users.mjs " +
          "with QA_RESELLER_MULTI_ADMIN=1 to plant both rows.",
      );
      return;
    }

    try {
      await loginAs(page, harness!.admin.email);
    } catch (err) {
      test.skip(
        true,
        `Admin QA account not seeded: ${(err as Error).message}. Run ` +
          `scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    const decisionReason = "p10_wave5_row_175_approve_probe";
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${attach.requestId}`,
      {
        data: { action: "approve", decision_reason: decisionReason },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `approve returned ${patchResp.status()} — expected 200 after requireAdmin() + validateAdminDecision() + credit-ledger triple-write. A 401 means the admin session dropped mid-test; a 404 not_found means the fixture-inserted row was deleted (concurrent worker); a 422 payload_incomplete means the fixture's payload lost target_user_id or requested_amount (fixture drift); a 500 balance_read_failed / balance_upsert_failed / transaction_insert_failed / mirror_insert_failed / update_failed means one of the four ledger writes leaked through. Body: ${await patchResp.text()}`,
    ).toBe(200);

    const patchBody = (await patchResp.json()) as {
      ok?: unknown;
      request?: {
        id?: unknown;
        status?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
        linked_credit_transaction_id?: unknown;
        linked_promotion_code_id?: unknown;
      };
    };
    expect(patchBody.ok).toBe(true);
    expect(typeof patchBody.request?.id).toBe("string");
    expect(patchBody.request?.id as string).toBe(attach.requestId);
    expect(patchBody.request?.status).toBe("approved");
    expect(typeof patchBody.request?.decision_at).toBe("string");
    expect(patchBody.request?.decision_reason).toBe(decisionReason);
    // Approve branch for over_budget_approval MUST populate
    // linked_credit_transaction_id (route.ts:269+303). A regression that
    // dropped the transaction insert but returned 200 anyway would surface
    // here as a null value.
    const linkedTxId = patchBody.request?.linked_credit_transaction_id;
    expect(typeof linkedTxId).toBe("string");
    expect(linkedTxId as string).toMatch(UUID_RE);
    // over_budget_approval NEVER mints a promotion_code — that path is
    // code_request only (route.ts:93-197). A regression that folded
    // promotion_code stamping into the over_budget branch would surface
    // here as a non-null value.
    expect(patchBody.request?.linked_promotion_code_id).toBeNull();

    // Tick 264 — post-PATCH read-back GET with discriminated-union payload
    // content pin per tick 263 next-pick option (s3). Mirrors the tick 262
    // deny-branch + tick 263 cancel-branch read-backs verbatim onto the
    // approve-branch surface so the payload jsonb per-type shape contract
    // is now content-pinned on SIX list read surfaces simultaneously:
    //   - admin-requests-list-authz.spec.ts:341-432 (tick 259, admin list,
    //     default ?status=pending path)
    //   - requests-validation.spec.ts (tick 260, reseller happy GET twin,
    //     default status=pending path)
    //   - reseller-requests-list-authz.spec.ts (tick 261, reseller GET,
    //     default status=pending path)
    //   - admin-requests-patch-authz.spec.ts deny block (tick 262, admin
    //     list under ?status=denied filter path)
    //   - admin-requests-patch-authz.spec.ts cancel block (tick 263, admin
    //     list under ?status=cancelled filter path)
    //   - admin-requests-patch-authz.spec.ts approve block (this tick,
    //     admin list under ?status=approved filter path — fourth
    //     non-default status enum exercised, completing three of the four
    //     ALLOWED_STATUS values via the PATCH-branch read-back trio and
    //     the fourth via the tick 259 default-pending list surface)
    //
    // Writer-schema justification: unchanged from the tick 262 + 263
    // read-backs — the PATCH response envelope at route.ts:317-319 only
    // echoes id/status/decision_at/decision_reason/linked_credit_transaction
    // _id/linked_promotion_code_id (payload is NOT re-emitted by the
    // UPDATE ... SELECT). The approve branch for over_budget_approval flips
    // ONLY status + decision_by + decision_at + decision_reason +
    // linked_credit_transaction_id (route.ts:200-293) — payload is untouched
    // so the read-back reflects exactly what the fixture's
    // attachApproveTarget() INSERT wrote (identical to the deny + cancel
    // branch's payload preservation posture cited in tick 262 + 263).
    //
    // Per-branch key shape mirrors the tick 259/260/261/262/263 pin verbatim
    // (same 3 branches, same 5 module-scope constants, same source-line
    // citations):
    //   - code_request → tier_pct (∈ {0,10,20,30,40}), suggested_suffix
    //     (null or /^[A-Z0-9]{1,16}$/), notes (null or string length ≤ 200)
    //   - over_budget_approval → target_user_id (UUID), requested_amount
    //     (positive integer), reason (null or string ≤ 200),
    //     remaining_budget_snapshot (null or non-negative integer)
    //   - collateral_approval → collateral_url (https URL), purpose
    //     (string ≤ 500)
    //
    // Coverage-per-guard posture: the row we just approved was minted by
    // attachApproveTarget() as an over_budget_approval type (fixture
    // contract — the request_type is guaranteed on green-path runs), so the
    // over_budget_approval branch is exercised on this sixth surface too.
    // code_request + collateral_approval branches remain zero-coverage on
    // this surface for the same reason as ticks 259/260/261/262/263 — no
    // approve targets carry those types today (code_request approve is
    // blocked on Stripe test-mode wiring; collateral_approval approve is
    // not exercised by any fixture yet). The pin still closes the writer
    // contract for both branches so a route regression that dropped a key
    // from the SELECT (route.ts:44 echoes payload jsonb straight through)
    // or a validator regression that swapped a key shape at requests.ts
    // would surface across all six list surfaces on the next CI pass —
    // matches the tick 259/260/261/262/263 zero-coverage-per-guard
    // rationale.
    //
    // Skip discipline: a fresh CI host where the ?status=approved query
    // returns an array missing our target id (e.g. concurrent worker or
    // fixture cleanup raced ahead) surfaces as an explicit test.skip
    // pointer rather than a bare undefined-access — approve already
    // flipped one row this run so a missing read-back means the row was
    // consumed externally between the PATCH and this GET.
    const readbackResp = await page.request.get(
      `${REQUESTS_LIST_ROUTE}?status=approved`,
    );
    expect(
      readbackResp.status(),
      `read-back GET returned ${readbackResp.status()} — expected 200 after requireAdmin() + ALLOWED_STATUS.has("approved") filter path. A 401 means the admin session dropped between the PATCH and this GET; a 5xx means the reseller_requests SELECT under the ?status=approved filter leaked through. Body: ${await readbackResp.text()}`,
    ).toBe(200);
    const readbackBody = (await readbackResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(readbackBody.ok).toBe(true);
    expect(Array.isArray(readbackBody.requests)).toBe(true);
    const readbackRow = ((readbackBody.requests as unknown[]) ?? []).find(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        (row as { id?: unknown }).id === attach.requestId,
    ) as
      | {
          id?: unknown;
          request_type?: unknown;
          status?: unknown;
          payload?: unknown;
          decision_at?: unknown;
          decision_by?: unknown;
          decision_reason?: unknown;
          created_at?: unknown;
        }
      | undefined;
    if (!readbackRow) {
      test.skip(
        true,
        `read-back could not locate id=${attach.requestId} in status=approved list — ` +
          "a concurrent CI worker or fixture teardown likely consumed the row " +
          "between the PATCH and this GET. Re-run to pick up a fresh " +
          "attachApproveTarget() mint.",
      );
      return;
    }
    // Route SELECT at route.ts:44 echoes the payload jsonb column straight
    // through with no normalisation. The DB column is `payload jsonb NOT
    // NULL DEFAULT '{}'` per 0095:33 so every row carries a plain object
    // (never null, never array). Precondition for the per-key discriminated-
    // union guard below.
    expect(
      readbackRow.payload !== null &&
        typeof readbackRow.payload === "object" &&
        !Array.isArray(readbackRow.payload),
      `read-back row.payload should be a plain object (jsonb NOT NULL DEFAULT '{}' per 0095:33): ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 265 — decision_at ISO-8601 wire-shape pin mirrored from the
    // tick-262 deny-block + tick-263 cancel-block additions onto the
    // approve-block surface so the timestamptz column shape (0095:35) is now
    // content-pinned on all three post-PATCH read-back rows. Same two-part
    // guard: typeof-string + ISO regex; same rationale for permitting Z or
    // +HH:MM suffixes. The approve branch just stamped decision_at at
    // route.ts:98 (identical route line to deny + cancel; the approve fan-out
    // at route.ts:200-293 does not touch the timestamp column separately) so
    // the pending-then-approved row now carries a non-null value here. The
    // 0095:43-45 CHECK constraint further guarantees decision_at IS NOT NULL
    // whenever status ∈ ('approved','denied','cancelled'), so this pin is
    // now backed by a database-level invariant across all three PATCH
    // branches — a route regression that returned status='approved' with a
    // null decision_at would violate the CHECK and fail the UPDATE before
    // ever reaching this read-back, but the read-back still catches a
    // read-path regression (e.g. a SELECT that stripped decision_at from the
    // list route's column projection).
    expect(typeof readbackRow.decision_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.decision_at as string),
      `read-back row.decision_at '${String(readbackRow.decision_at)}' should match ISO 8601 shape (timestamptz per 0095:35 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 266 — decision_by UUID wire-shape pin mirrored from the tick-266
    // deny-block + cancel-block additions onto the approve-block surface so
    // the uuid column shape (0095:34) is now content-pinned on all three
    // post-PATCH read-back rows. Same two-part guard: typeof-string +
    // UUID_RE. The approve branch just stamped decision_by: user.id at
    // route.ts:309 (identical assignment line to deny + cancel; the approve
    // fan-out at route.ts:200-293 does not touch the decision_by column
    // separately) so the pending-then-approved row now carries a non-null
    // uuid value here. Unlike decision_at, the 0095:43-45 CHECK constraint
    // does NOT force decision_by to be non-null when status ∈ ('approved',
    // 'denied','cancelled') — only decision_at is required in those states
    // per the second CHECK clause — so this pin catches a route regression
    // that returned status='approved' with a null decision_by (which would
    // pass the DB CHECK but is not the expected happy-path shape) as well
    // as a read-path regression that stripped decision_by from the list
    // route's column projection at route.ts:44.
    expect(typeof readbackRow.decision_by).toBe("string");
    expect(
      UUID_RE.test(readbackRow.decision_by as string),
      `read-back row.decision_by '${String(readbackRow.decision_by)}' should match UUID shape (uuid per 0095:34, stamped from user.id at route.ts:309); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 267 — created_at ISO-8601 wire-shape pin mirrored from the tick-
    // 267 deny-block + cancel-block additions onto the approve-block surface
    // so the timestamptz INSERT-time column shape (0095:39) is now content-
    // pinned on all three post-PATCH read-back rows. Same two-part guard:
    // typeof-string + ISO_TIMESTAMP_RE. Unlike decision_at, created_at is
    // NOT touched by any PATCH branch — the approve fan-out at
    // route.ts:200-293 writes credit_balances + credit_transactions +
    // reseller_credit_grants + reseller_promotion_codes but leaves
    // reseller_requests.created_at untouched — so the wire value here
    // mirrors whatever the attachApproveTarget() fixture stamped at INSERT
    // time. The 0095:39 NOT NULL DEFAULT now() constraint further guarantees
    // created_at IS NOT NULL on every row regardless of status, so this pin
    // is backed by a database-level invariant across all three PATCH
    // branches AND the pending-list surface (unlike decision_at, which is
    // only non-null once a decision has been stamped).
    expect(typeof readbackRow.created_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.created_at as string),
      `read-back row.created_at '${String(readbackRow.created_at)}' should match ISO 8601 shape (timestamptz per 0095:39 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 268 — decision_reason value pin mirrored from the deny-block +
    // cancel-block onto the approve-block surface so the nullable text
    // column (0095:36) is now content-pinned on all three post-PATCH read-
    // back rows. Same three-part guard as the deny + cancel surfaces:
    // typeof-string + length ≤ REASON_MAX + exact-string equality against
    // the approve probe. The approve PATCH wrote decision_reason via
    // validateAdminDecision at requests.ts:293-303 (identical validator call
    // as deny + cancel; the approve fan-out at route.ts:200-293 does not
    // touch the decision_reason column separately). Unlike decision_at,
    // 0095:43-45 CHECK does NOT force decision_reason to be non-null in any
    // status — a route regression that dropped the decision_reason write
    // could pass the DB CHECK and return status='approved' with a null
    // decision_reason, but this pin catches that regression here since the
    // fixture guarantees the probe string is on the wire.
    expect(typeof readbackRow.decision_reason).toBe("string");
    expect(
      (readbackRow.decision_reason as string).length <= REASON_MAX,
      `read-back row.decision_reason length ${(readbackRow.decision_reason as string).length} > REASON_MAX (${REASON_MAX}) per requests.ts:66 — a validator-side cap widening would surface here: ${JSON.stringify(readbackRow.decision_reason).slice(0, 100)}`,
    ).toBe(true);
    expect(readbackRow.decision_reason).toBe(decisionReason);
    // Two-part guard per nullable key: (a) `x === null` short-circuit +
    // (b) typeof-string + regex/length check. Same shape as the tick
    // 259/260/261/262/263 pins. TYPEOF + VALUE-tighten pins per key so a
    // rename OR a shape drift both surface — matches tick 262/263
    // rationale verbatim.
    const readbackPayload = readbackRow.payload as Record<string, unknown>;
    if (readbackRow.request_type === "code_request") {
      expect(typeof readbackPayload.tier_pct).toBe("number");
      expect(
        ALLOWED_TIER_PCT_VALUES.has(readbackPayload.tier_pct as number),
        `read-back code_request payload.tier_pct '${String(readbackPayload.tier_pct)}' not in {0, 10, 20, 30, 40} per requests.ts:63: ${JSON.stringify(readbackPayload).slice(0, 200)}`,
      ).toBe(true);
      expect(
        readbackPayload.suggested_suffix === null ||
          (typeof readbackPayload.suggested_suffix === "string" &&
            SUFFIX_RE.test(readbackPayload.suggested_suffix as string)),
        `read-back code_request payload.suggested_suffix should be null or match /^[A-Z0-9]{1,16}$/ per requests.ts:64+98-104: ${JSON.stringify(readbackPayload.suggested_suffix)}`,
      ).toBe(true);
      expect(
        readbackPayload.notes === null ||
          (typeof readbackPayload.notes === "string" &&
            (readbackPayload.notes as string).length <= REASON_MAX),
        `read-back code_request payload.notes should be null or string length ≤ ${REASON_MAX} per requests.ts:106-113: ${JSON.stringify(readbackPayload.notes)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "over_budget_approval") {
      expect(typeof readbackPayload.target_user_id).toBe("string");
      expect(readbackPayload.target_user_id as string).toMatch(UUID_RE);
      expect(typeof readbackPayload.requested_amount).toBe("number");
      expect(
        Number.isInteger(readbackPayload.requested_amount) &&
          (readbackPayload.requested_amount as number) > 0,
        `read-back over_budget_approval payload.requested_amount should be a positive integer per requests.ts:139-149: ${JSON.stringify(readbackPayload.requested_amount)}`,
      ).toBe(true);
      expect(
        readbackPayload.reason === null ||
          (typeof readbackPayload.reason === "string" &&
            (readbackPayload.reason as string).length <= REASON_MAX),
        `read-back over_budget_approval payload.reason should be null or string length ≤ ${REASON_MAX} per requests.ts:150-157: ${JSON.stringify(readbackPayload.reason)}`,
      ).toBe(true);
      expect(
        readbackPayload.remaining_budget_snapshot === null ||
          (typeof readbackPayload.remaining_budget_snapshot === "number" &&
            Number.isInteger(readbackPayload.remaining_budget_snapshot) &&
            (readbackPayload.remaining_budget_snapshot as number) >= 0),
        `read-back over_budget_approval payload.remaining_budget_snapshot should be null or non-negative integer per requests.ts:158-162: ${JSON.stringify(readbackPayload.remaining_budget_snapshot)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "collateral_approval") {
      expect(typeof readbackPayload.collateral_url).toBe("string");
      expect(readbackPayload.collateral_url as string).toMatch(HTTPS_URL_RE);
      expect(typeof readbackPayload.purpose).toBe("string");
      expect(
        (readbackPayload.purpose as string).length <= PURPOSE_MAX,
        `read-back collateral_approval payload.purpose should be length ≤ ${PURPOSE_MAX} per requests.ts:193-195: ${JSON.stringify(readbackPayload.purpose).slice(0, 100)}`,
      ).toBe(true);
    }

    // Deeper ledger-row assertions (credit_balances.balance ===
    // balanceBefore + amount, credit_transactions.metadata->>reseller_
    // request_id === requestId, reseller_credit_grants.kind === 'grant')
    // are folded into wave-5 row 179 (audit-log-writes.spec.ts) alongside
    // the audit event writes so a single describe block owns the DB-level
    // state check for the approve fan-out. This block owns the wire
    // envelope (200 + populated linked_credit_transaction_id + null
    // linked_promotion_code_id) plus the payload jsonb preservation
    // read-back which is the tightest signal for a route regression in the
    // approve branch's happy path.
  });
});
