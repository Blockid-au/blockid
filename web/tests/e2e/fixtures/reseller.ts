// Playwright reseller harness — P10 dry-run scaffolding.
//
// Resolves the (reseller admin QA account, one attributed customer id) tuple
// that the reseller-scope E2E specs need. Returns null when either half is
// unprovisioned so specs can test.skip() while P1.5_infovision_seed
// (H.20 ABN + GST) and P8.5_env_and_playwright (STRIPE_PRICE_ADDON_*) remain
// human-blocked. Once those clear, set QA_RESELLER_ADMIN_EMAIL +
// QA_RESELLER_ATTRIBUTED_CUSTOMER_ID (or QA_RESELLER_ATTRIBUTED_PROJECT_ID)
// to activate the specs against staging.
//
// P10 Option A step 3 (docs/plans/p10-temp-reseller-admin-scope-
// collision-finding.md §Resolution options → A): loadTempReseller() now
// exposes a per-variant `adminEmail` so specs `loginAs(page,
// fixture.adminEmail)` and each variant hits a DISTINCT app_users row,
// avoiding the scopedReseller() .maybeSingle() PGRST116 collision that
// fires when one user is mirrored onto more than one variant. Multi-admin
// gate: `QA_RESELLER_MULTI_ADMIN=1` (matches the seeders in
// web/scripts/seed-test-users.mjs + web/scripts/seed-qa-reseller.mjs).

import { randomUUID } from "node:crypto";

import { getAccount, type QaAccount } from "./accounts";
import { loadSupabaseAdmin } from "./supabase-admin";

export interface ResellerHarness {
  admin: QaAccount;
  attributedCustomerId: string;
  attributedProjectId: string | null;
}

export interface AttributedFounderHarness {
  founder: QaAccount;
  resellerDisplayName: string;
  nonAttributedFounder: QaAccount | null;
}

export interface AttributionTimingHarness {
  founder: QaAccount;
  resellerCode: string;
  resellerDisplayName: string;
}

const DEFAULT_RESELLER_EMAIL = "qa-reseller-1@blockid.au";
const DEFAULT_ATTRIBUTED_FOUNDER_EMAIL = "qa-founder-attributed-1@blockid.au";
const DEFAULT_UNATTRIBUTED_FOUNDER_EMAIL = "qa-founder-1@blockid.au";
const DEFAULT_TIMING_FOUNDER_EMAIL = "qa-founder-fresh-1@blockid.au";

export function loadResellerHarness(): ResellerHarness | null {
  const email = process.env.QA_RESELLER_ADMIN_EMAIL ?? DEFAULT_RESELLER_EMAIL;
  const customerId = process.env.QA_RESELLER_ATTRIBUTED_CUSTOMER_ID;
  const projectId = process.env.QA_RESELLER_ATTRIBUTED_PROJECT_ID ?? null;
  if (!customerId) return null;
  try {
    const admin = getAccount(email);
    return { admin, attributedCustomerId: customerId, attributedProjectId: projectId };
  } catch {
    return null;
  }
}

export function harnessSkipReason(): string {
  return (
    "Reseller QA harness not provisioned — set QA_RESELLER_ADMIN_EMAIL " +
    "(default qa-reseller-1@blockid.au) + QA_RESELLER_ATTRIBUTED_CUSTOMER_ID " +
    "(and optionally QA_RESELLER_ATTRIBUTED_PROJECT_ID) once P1.5 (H.20) + " +
    "P8.5 (STRIPE_PRICE_ADDON_*) clear."
  );
}

/**
 * Resolves the (attributed-founder QA account, reseller display name,
 * non-attributed comparison account) tuple that the co-branding pill spec
 * needs. Distinct from loadResellerHarness() — that one models the reseller
 * admin session probing the scope boundary. This one models the customer
 * side: a founder whose app_users.attribution_reseller_id points at a live
 * reseller, so <ResellerPill /> should render in the workspace topbar.
 *
 * Returns null when either the founder account or the reseller display
 * name env var is unset; specs test.skip() with attributedFounderSkipReason()
 * until the human seeds the row.
 */
export function loadAttributedFounderHarness(): AttributedFounderHarness | null {
  const founderEmail =
    process.env.QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL ?? DEFAULT_ATTRIBUTED_FOUNDER_EMAIL;
  const displayName = process.env.QA_RESELLER_DISPLAY_NAME;
  if (!displayName) return null;
  try {
    const founder = getAccount(founderEmail);
    let nonAttributed: QaAccount | null = null;
    const comparisonEmail =
      process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? DEFAULT_UNATTRIBUTED_FOUNDER_EMAIL;
    try {
      nonAttributed = getAccount(comparisonEmail);
    } catch {
      nonAttributed = null;
    }
    return { founder, resellerDisplayName: displayName, nonAttributedFounder: nonAttributed };
  } catch {
    return null;
  }
}

export function attributedFounderSkipReason(): string {
  return (
    "Attributed-founder harness not provisioned — set QA_RESELLER_DISPLAY_NAME " +
    "(the reseller.display_name that will appear in the pill) and seed a " +
    "founder account keyed by QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL (default " +
    "qa-founder-attributed-1@blockid.au) whose app_users.attribution_reseller_id " +
    "points at that reseller. Optionally set QA_UNATTRIBUTED_FOUNDER_EMAIL for " +
    "the negative-case assertion (default qa-founder-1@blockid.au)."
  );
}

/**
 * Resolves the (fresh founder QA account, ?via= code, reseller display name)
 * tuple that the attribution-timing spec needs. Distinct from
 * loadAttributedFounderHarness() — that one models an already-attributed
 * founder to prove the pill renders. This one models the *capture* half:
 * a fresh account whose app_users.attribution_reseller_id starts NULL so
 * the spec can seed a blockid_via cookie, sign in, and observe that the
 * cache column flips to the reseller (P2.5 stamp-on-signup) — the follow-up
 * assertion that reseller_attributions carries no row until createProject()
 * fires (U.6 per-workspace attribution) needs a DB-inspection helper that
 * does not exist yet, so those spec rows stay test.skip() with tracking
 * comments per the tick 83 posture.
 *
 * Returns null when either QA_RESELLER_CODE (the ?via= code, e.g.
 * INFOVISION20) or QA_RESELLER_DISPLAY_NAME is unset; specs test.skip()
 * with attributionTimingSkipReason() until the human seeds the row.
 */
export function loadAttributionTimingHarness(): AttributionTimingHarness | null {
  const founderEmail =
    process.env.QA_RESELLER_FRESH_FOUNDER_EMAIL ?? DEFAULT_TIMING_FOUNDER_EMAIL;
  const resellerCode = process.env.QA_RESELLER_CODE;
  const resellerDisplayName = process.env.QA_RESELLER_DISPLAY_NAME;
  if (!resellerCode || !resellerDisplayName) return null;
  try {
    const founder = getAccount(founderEmail);
    return { founder, resellerCode, resellerDisplayName };
  } catch {
    return null;
  }
}

export function attributionTimingSkipReason(): string {
  return (
    "Attribution-timing harness not provisioned — set QA_RESELLER_CODE " +
    "(the ?via= code, e.g. INFOVISION20) + QA_RESELLER_DISPLAY_NAME " +
    "(reseller.display_name returned by /api/reseller/me) and seed a fresh " +
    "founder QA account whose app_users.attribution_reseller_id starts NULL, " +
    "keyed by QA_RESELLER_FRESH_FOUNDER_EMAIL (default " +
    "qa-founder-fresh-1@blockid.au)."
  );
}

export interface AdminHarness {
  admin: QaAccount;
}

const DEFAULT_ADMIN_EMAIL = "qa-admin-1@blockid.au";

/**
 * Resolves the admin QA account that the /api/admin/** validation specs
 * need to exercise post-requireAdmin() branches. Distinct from
 * loadResellerHarness() — that one models a reseller-admin session probing
 * scopedReseller(); this one models a BlockID staff session probing
 * requireAdmin() (see web/src/lib/reseller/require-admin.ts).
 *
 * Returns null when QA_ADMIN_EMAIL (default qa-admin-1@blockid.au) is not
 * present in /tmp/blockid-qa-accounts.txt AND ADMIN_EMAIL is not overridden
 * to match a seeded QA account. In practice this means the admin-*
 * validation specs test.skip() until scripts/seed-test-users.mjs is
 * extended with a qa-admin-1 row whose app_users.role='admin' (or the env
 * var flip lands with a matching seeded email).
 */
export function loadAdminHarness(): AdminHarness | null {
  const email = process.env.QA_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  try {
    const admin = getAccount(email);
    return { admin };
  } catch {
    return null;
  }
}

export function adminHarnessSkipReason(): string {
  return (
    "Admin QA harness not provisioned — set QA_ADMIN_EMAIL (default " +
    "qa-admin-1@blockid.au) to a seeded QA account in " +
    "/tmp/blockid-qa-accounts.txt whose app_users.role='admin' or whose " +
    "email matches ADMIN_EMAIL (default admin@blockid.au). Extend " +
    "scripts/seed-test-users.mjs to write the qa-admin-1 row before running " +
    "these specs. Deferred alongside P8.5 (STRIPE_PRICE_ADDON_*) and " +
    "P1.5 (H.20 ABN + GST)."
  );
}

/**
 * Temp-reseller fixture — §3 of the P10 temp-reseller mint fixture design
 * (docs/plans/p10-temp-reseller-mint-fixture-design.md §3).
 *
 * Resolves a QAPROBE-prefixed reseller row minted by
 * `web/scripts/seed-qa-reseller.mjs` so a spec can pick the variant whose
 * column state matches its target branch (billing_model=retail for
 * billing_model_not_wholesale, status=paused for reseller_not_active, etc.)
 * without mutating any shared row.
 *
 * Consumed by the ~50 deferred HAPPY-PATH / downstream-reason rows tracked
 * in ticks 92..126. The mint script (§1), the reseller_requests companion
 * (§2), the storage bucket seeder (§4), and the QA account seeder delta
 * (§5) all ship before this fixture is useful. Once all four are applied
 * against staging, this helper resolves the tuple that unlocks the
 * downstream `.spec.ts` rows.
 *
 * Returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset
 * (fixture not provisioned) or when the variant row is missing (mint
 * script not run against the target host). Specs test.skip() with
 * tempResellerSkipReason(variant) rather than throw so the suite stays
 * green while the seed workflow is stood up.
 *
 * cleanup() is a no-op by default — the shared row lives across the whole
 * suite so re-runs land as fixed reads rather than repeat inserts. Specs
 * that mutate row state (approve a request, insert a credit_transactions
 * row) do so against the requests companion's per-run rows (§2), not the
 * shared reseller row. The one exception is `sandbox_setup happy path`
 * which inserts a `projects` row for the reseller sandbox; that spec
 * opts-in via trackProjectForCleanup(projectId) and calls fixture.cleanup()
 * in afterEach so the projects row is removed once the spec finishes.
 */
export type ResellerVariant =
  | "active_wholesale"
  | "active_retail"
  | "paused"
  | "terminated"
  | "no_capability"
  | "tier_only_zero"
  | "no_budget";

// Mirrors web/scripts/seed-qa-reseller.mjs VARIANTS. If a variant is added,
// renamed, or removed there, update this table in the same commit so the
// fixture stays lookup-compatible with the mint script's output.
export const RESELLER_VARIANT_CODES: Record<ResellerVariant, string> = {
  active_wholesale: "QAPROBEWHOLESALEACTIVE",
  active_retail: "QAPROBERETAILACTIVE",
  paused: "QAPROBEPAUSED",
  terminated: "QAPROBETERMINATED",
  no_capability: "QAPROBENOCAP",
  tier_only_zero: "QAPROBETIERONLY0",
  no_budget: "QAPROBENOBUDGET",
};

export interface TempResellerPromotionCode {
  id: string;
  tier_pct: number;
  code: string;
}

export interface TempResellerFixture {
  variant: ResellerVariant;
  resellerId: string;
  code: string;
  displayName: string;
  /** Per-variant reseller-admin email resolved via the P10 Option A
   *  MULTI_ADMIN_EMAILS slot (see docs/plans/p10-temp-reseller-admin-scope-
   *  collision-finding.md §Resolution options → A). Specs
   *  `loginAs(page, fixture.adminEmail)` so each variant hits a DISTINCT
   *  app_users row, avoiding the scopedReseller() .maybeSingle() PGRST116
   *  collision when the same user is mirrored onto multiple variants.
   *  Falls back to QA_RESELLER_ADMIN_EMAIL (or the tick 132 default
   *  qa-reseller-1@blockid.au) when the per-variant slot is unset, so
   *  single-admin hosts stay backwards-compatible. */
  adminEmail: string;
  /** Reseller-admin user_id resolved via the resolved adminEmail. `null`
   *  when the QA account seeder delta (§5) has not run yet OR the
   *  per-variant admin app_users row is missing from the target host. */
  adminUserId: string | null;
  /** Only populated on `active_wholesale` — the attributed founder resolved
   *  via QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL. */
  attributedUserId: string | null;
  /** True only when the seed script also planted a `reseller_attributions`
   *  row (subject_user_id = attributedUserId, reseller_id = resellerId,
   *  status='active'). False when the founder's `app_users` row exists but
   *  the attribution row is missing (partial-seed hosts) — the fixture still
   *  populates `attributedUserId` from the founder row so wave-2 row 145's
   *  `attachAttributedCustomer()` can stamp the cache column, but wave-2
   *  row 146+ specs that hit reseller-admin scope-boundary routes
   *  (`/api/reseller/customers/[id]/drawer`, reveal-email, etc.) MUST skip
   *  when this flag is false because `scopedReseller().allowedCustomerIds()`
   *  reads from `reseller_attributions` and would return 403 not_in_scope. */
  attributionExists: boolean;
  /** Only populated on `active_wholesale` — the attributed founder's email
   *  (env-resolved via QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL, fallback
   *  qa-founder-attributed-1@blockid.au). Wave-2 rows 145-149 use this to
   *  `loginAs(page, fixture.attributedFounderEmail)`; null on non-active
   *  wholesale variants so specs skip cleanly. */
  attributedFounderEmail: string | null;
  /** Only populated on `active_wholesale` — the reseller_attributions
   *  row's `subject_project_id`, when the seed script has stamped one. */
  attributedProjectId: string | null;
  /** Populated on `active_wholesale` (tiers 20 + 40) and `paused` (tier 20
   *  only, per PAUSED_PROMO_TIERS in web/scripts/seed-qa-reseller.mjs) —
   *  the reseller_promotion_codes rows with active=true. Tier 0 is skipped
   *  per ck_stripe_objects_by_tier. Row 157 in
   *  docs/plans/p10-deferred-spec-activation-order.md consumes the paused
   *  entry to drive code-validate past the promo lookup and hit the
   *  reseller.status !== 'active' branch. */
  promotionCodes: ReadonlyArray<TempResellerPromotionCode>;
  /** Opt-in per-spec cleanup registration. The sandbox_setup happy path
   *  is the primary caller: pass the newly-minted projects.id here so
   *  cleanup() drops it after the spec finishes. */
  trackProjectForCleanup(projectId: string): void;
  /** Wave-2 helper (schedule doc row 145 prep note). Ensures the
   *  attributed founder's app_users.attribution_reseller_id cache column
   *  points at THIS variant's reseller so /api/reseller/me returns a
   *  populated `reseller` object. The seed script only writes
   *  reseller_attributions (per-project), not the cache column, so this
   *  helper is required to close the gap without touching the seed script.
   *
   *  Registers a restore closure with cleanup() that reverts the column
   *  to its previous value; specs MUST call fixture.cleanup() in afterEach
   *  so a failing assertion does not leak attribution state into the next
   *  spec.
   *
   *  Returns null when attributedUserId is null (attributed founder not
   *  seeded on this host) or on non-active-wholesale variants; the caller
   *  should skip in that case. */
  attachAttributedCustomer(): Promise<AttachAttributedCustomerResult | null>;
  /** Wave-4 helper (schedule doc rows 159 + 160 prep note). Ensures a
   *  reseller_report_files row + storage object exist for the given month
   *  bucket against THIS variant's reseller so
   *  /api/reseller/reports/[month]/signed-url can mint a signed URL end-to-
   *  end (row 159 happy path) or so a validation spec can prove that an
   *  in-window month with a real metadata row returns 200 while an expired
   *  month returns 403 not_exposed (row 160 in-window vs expired).
   *
   *  Snapshot-then-restore semantics: if the metadata row + storage object
   *  already exist for (reseller_id, month_key) — e.g.
   *  seed-qa-reseller-storage.mjs already ran for this month — the helper
   *  reuses them, returns `{created:false}`, and registers no cleanup so
   *  parallel specs sharing the seed do not race a delete. Only when this
   *  call was the one that inserted the row does cleanup() remove the row
   *  AND the storage object.
   *
   *  Uploads a stripped-down CSV shape-compatible with
   *  web/scripts/seed-qa-reseller-storage.mjs (same CSV_HEADER + one-row
   *  KPI body) so the signed URL round-trip surfaces a valid text/csv
   *  Content-Type against the same object naming convention
   *  (<reseller_id>/<month_key>.csv) that the monthly cron uses.
   *
   *  Returns null when variant !== "active_wholesale" (matches the
   *  attachAttributedCustomer discipline — the seed script only mints the
   *  active_wholesale reseller's storage row so gating other variants here
   *  would be a false positive). Also returns null on an invalid monthKey
   *  so a caller with a bad `YYYY-MM` string bails cleanly instead of
   *  inserting a CHECK-violating row. */
  attachReportRow(monthKey: string): Promise<AttachReportRowResult | null>;
  /** Wave-5 helper (schedule doc row 177 prep note). Ensures a full
   *  reviewer-invite chain exists for THIS variant's attributed founder so
   *  POST /api/showcase-reviews with the returned `token` can clear the
   *  data_room_access_tokens SELECT + data_rooms SELECT + showcase_reviews
   *  upsert path end-to-end (row 177 reviewer-flow POST happy path).
   *
   *  Snapshot-then-restore semantics: the helper looks up the founder's
   *  first `projects.id`, finds (or opportunistically inserts) a
   *  `data_rooms` row scoped to that project, and inserts a fresh
   *  `data_room_access_tokens` row with a unique QAPROBE-prefixed token +
   *  the caller-supplied (or default) investor email. cleanup() removes
   *  the access-token row, any `showcase_reviews` rows the spec upserted
   *  against that (project_id, reviewer_email) pair, and — only when this
   *  call was the one that inserted the data_rooms row — the data_rooms
   *  row itself. Pre-existing data_rooms rows are left alone so other
   *  specs sharing the same founder are not disturbed.
   *
   *  Returns null when variant !== "active_wholesale" (matches the
   *  attachAttributedCustomer + attachReportRow discipline — the seed
   *  script only mints the active_wholesale reseller's attributed founder,
   *  and the reseller-lens reviews rollup only reads from the
   *  active_wholesale portfolio anyway), when `attributedUserId` is null
   *  (attributed founder not seeded), or when the attributed founder owns
   *  no `projects.id` yet (fresh CI host that never planted a workspace).
   *
   *  Throws on any SQL error so a caller-supplied beforeAll catch can
   *  distinguish "table missing" (migration 0062 not applied → data_room_
   *  access_tokens SELECT fails) from "prerequisite missing" (no project
   *  row, no attributed founder) — the former surfaces as a Playwright
   *  test.skip() with the error message, the latter surfaces as a null
   *  return + a targeted skip reason. */
  attachReviewerAccessToken(opts?: {
    investorEmail?: string;
  }): Promise<AttachReviewerAccessTokenResult | null>;
  /** Wave-5 helper (schedule doc row 175 approve-branch prep note). Inserts
   *  a fresh pending `reseller_requests` row (request_type =
   *  'over_budget_approval', requested_by = adminUserId, payload =
   *  {target_user_id, requested_amount, reason}) against THIS variant's
   *  reseller so PATCH /api/admin/resellers/requests/[id] with
   *  {action:'approve'} can fan out end-to-end (approve branch: credit_balances
   *  UPSERT + credit_transactions INSERT + reseller_credit_grants INSERT +
   *  reseller_requests UPDATE). Snapshots the credit_balances baseline for
   *  the target user before the PATCH runs so the spec can assert the exact
   *  post-approve delta rather than relying on a bare non-null check.
   *
   *  Snapshot-then-restore semantics: cleanup() drops the reseller_credit_grants
   *  row (filtered by metadata->>'reseller_request_id' = requestId), the
   *  reseller_requests row (by id — its linked_credit_transaction_id FK to
   *  credit_transactions is ON DELETE SET NULL so the request row deletes
   *  cleanly even after the transaction row is gone), the credit_transactions
   *  row (same metadata filter), and restores credit_balances — either
   *  UPSERTs back to the snapshot (balance, lifetime_earned) when a row
   *  existed pre-attach, or DELETEs the row entirely when this call minted a
   *  fresh row via the route's approve-branch UPSERT (route.ts:228-238).
   *
   *  Returns null when variant !== "active_wholesale" (matches the other
   *  attach helpers — the seed script only mints the active_wholesale
   *  reseller's attributed founder + admin mirror, and the approve branch
   *  reads resellers.can_grant_credits which is only true for the wholesale
   *  variant per the seed script's default), when `attributedUserId` is null
   *  (attributed founder not seeded — no valid target_user_id UUID), or when
   *  `adminUserId` is null (reseller_admins mirror missing — the requested_by
   *  FK to app_users would violate).
   *
   *  Throws on any SQL error so a caller-supplied beforeAll catch can
   *  distinguish "table missing" (migration 0095 or 0096 not applied →
   *  reseller_requests INSERT fails) from "prerequisite missing" (no
   *  admin user, no attributed founder) — the former surfaces as a
   *  Playwright test.skip() with the error message, the latter surfaces as
   *  a null return + a targeted skip reason.
   *
   *  Idempotent under CI replay: over_budget_approval carries no partial
   *  unique index (see 0095:71-73 — only code_request does) so a rerun
   *  inserts a fresh row without a 409 collision. Each call is a NEW
   *  request row keyed on gen_random_uuid(), so parallel workers do not
   *  race the same target row. */
  attachApproveTarget(opts?: {
    requestedAmount?: number;
    reason?: string;
  }): Promise<AttachApproveTargetResult | null>;
  /** Wave-3 helper (schedule doc row 152 prep note). Snapshots
   *  `credit_balances` for the attributed founder and registers a restore
   *  closure that reverses the reseller-side self-approve fan-out that
   *  `POST /api/reseller/credits/grant` executes when `decideGrant()` gate 3
   *  fires (within-budget approval path: `credit_balances` UPSERT +
   *  `credit_transactions` INSERT with `granted_by_reseller_id` stamped +
   *  `reseller_credit_grants` mirror row + `reseller_audit_log`
   *  action='grant_credits' write).
   *
   *  Snapshot-then-restore semantics: `cleanup()` deletes the
   *  `reseller_credit_grants` mirror row (filtered by (reseller_id,
   *  target_user_id, granted_by_user_id, created_at >= since) so a leak from
   *  an earlier spec run cannot be reaped), deletes the `credit_transactions`
   *  row (filtered by (user_id, granted_by_reseller_id, created_at >= since)
   *  matching the route's stamped column at route.ts:194), and restores
   *  `credit_balances` — either UPSERTs back to the (balance,
   *  lifetime_earned) snapshot when a row existed pre-attach, or DELETEs the
   *  row entirely when this call fired the fresh UPSERT branch at
   *  route.ts:169-179. `reseller_audit_log` rows are append-only per
   *  migration 0093 (mutation triggers block DELETE/UPDATE) so they
   *  intentionally are not swept — matches the audit-log-writes.spec.ts
   *  posture where append-only accumulation is expected.
   *
   *  Returns null when variant !== "active_wholesale" (matches the other
   *  attach helpers — the reseller-side self-approve path is scoped to the
   *  wholesale variant since retail resellers do not carry
   *  `can_grant_credits=true` in the seed script's default), when
   *  `attributedUserId` is null (attributed founder not seeded — no valid
   *  target_user_id UUID), or when `adminUserId` is null (reseller_admins
   *  mirror missing — the grant path stamps `granted_by_user_id` from the
   *  authenticated session which resolves to the missing admin user).
   *
   *  Throws on any SQL error so a caller-supplied beforeAll catch can
   *  distinguish "table missing" (migration 0094 not applied →
   *  reseller_credit_grants filter fails) from "prerequisite missing"
   *  (no attributed founder, no admin user).
   *
   *  Idempotent under CI replay: each call captures a fresh `since` cursor
   *  so parallel workers or repeated runs cannot cross-contaminate. */
  attachGrantSelfApprove(opts: {
    amount: number;
  }): Promise<AttachGrantSelfApproveResult | null>;
  /** No-op by default. Deletes any projects.id registered via
   *  trackProjectForCleanup() during the spec AND runs any restore
   *  closure registered by attachAttributedCustomer(), attachReportRow(),
   *  attachReviewerAccessToken(), attachApproveTarget(), or
   *  attachGrantSelfApprove(). */
  cleanup(): Promise<void>;
}

export interface AttachAttributedCustomerResult {
  attributedUserId: string;
  attributedFounderEmail: string;
  /** The cache-column value BEFORE the attach ran — null if unset. cleanup()
   *  writes this back so cross-spec state does not leak. */
  previousAttributionResellerId: string | null;
}

export interface AttachReportRowResult {
  monthKey: string;
  storageBucket: string;
  storagePath: string;
  sizeBytes: number;
  /** True when this call inserted a fresh metadata row + storage object.
   *  False when a pre-existing row was reused (e.g. seed-qa-reseller-
   *  storage.mjs already ran for this month). Only when true does cleanup()
   *  remove the row + storage object; false = no restore closure registered
   *  so parallel specs sharing the seed do not race a delete. */
  created: boolean;
}

export interface AttachApproveTargetResult {
  /** `reseller_requests.id` of the freshly-inserted pending row that the
   *  spec will PATCH via `/api/admin/resellers/requests/[id]` with
   *  {action:"approve"}. */
  requestId: string;
  /** `credit_balances.user_id` the approve branch will credit — mirrors
   *  the payload.target_user_id column, resolved from
   *  `TempResellerFixture.attributedUserId`. */
  targetUserId: string;
  /** The over_budget_approval payload's `requested_amount` — echoed here so
   *  the spec can assert the exact post-approve balance delta without
   *  re-reading the request row. */
  requestedAmount: number;
  /** `credit_balances.balance` BEFORE the PATCH ran. Null if the target
   *  user had no credit_balances row at attach time; cleanup() deletes the
   *  row entirely in that case. Non-null means cleanup() UPSERTs back to
   *  this value + `lifetimeEarnedBefore`. */
  balanceBefore: number | null;
  /** `credit_balances.lifetime_earned` BEFORE the PATCH ran. Null under
   *  the same condition as `balanceBefore`. */
  lifetimeEarnedBefore: number | null;
  /** The `reseller_requests.payload.reason` string echoed onto both the
   *  reseller_credit_grants.metadata + credit_transactions.metadata during
   *  the approve fan-out. The spec can assert the ledger rows carry this
   *  string. */
  reason: string;
}

export interface AttachGrantSelfApproveResult {
  /** `credit_balances.user_id` the reseller-side self-approve branch will
   *  credit — mirrors `TempResellerFixture.attributedUserId`. */
  targetUserId: string;
  /** The `amount` the caller intends to POST to /api/reseller/credits/grant.
   *  Echoed here so the spec can assert `body.balance === (balanceBefore ??
   *  0) + amount` without re-reading the request payload. */
  amount: number;
  /** Snapshot of `credit_balances.balance` BEFORE the POST fires. Null when
   *  the target user had no `credit_balances` row at attach time; in that
   *  case `cleanup()` deletes the row entirely rather than UPSERTing back to
   *  a non-existent baseline. Non-null → `cleanup()` UPSERTs back to
   *  (`balanceBefore`, `lifetimeEarnedBefore`). */
  balanceBefore: number | null;
  /** Snapshot of `credit_balances.lifetime_earned` BEFORE the POST fires.
   *  Null under the same condition as `balanceBefore`. */
  lifetimeEarnedBefore: number | null;
  /** ISO cursor captured immediately before the restore closure was
   *  registered. `cleanup()` scopes its `credit_transactions` +
   *  `reseller_credit_grants` DELETEs to `created_at >= since` so a leak
   *  from an earlier spec run cannot be accidentally reaped. Note:
   *  `reseller_audit_log` rows are append-only per migration 0093 (mutation
   *  triggers block DELETE/UPDATE) so they intentionally are not swept —
   *  the append-only audit trail is the reason the ledger exists. */
  since: string;
}

export interface AttachReviewerAccessTokenResult {
  /** Unique QAPROBE-prefixed token that /api/showcase-reviews POST resolves
   *  via `data_room_access_tokens.token` → `data_rooms.project_id` →
   *  `showcase_reviews.upsert`. Never collides with a real invited-investor
   *  token because production `randomUUID()` values have no QAPROBE prefix. */
  token: string;
  /** The `investor_email` column stored on the access-token row and copied
   *  into `showcase_reviews.reviewer_email` at upsert time. Callers can
   *  reuse this string to sanity-check the row landed against the intended
   *  reviewer identity (the route ignores the POST body's reviewer_email
   *  field and always uses the access-token column). */
  investorEmail: string;
  /** `data_rooms.id` the access token points at. */
  dataRoomId: string;
  /** `projects.id` the data room is scoped to (same value stored on
   *  `data_rooms.project_id`). Handy for assertions that read the
   *  showcase_reviews row via the founder-scoped GET path in the same spec. */
  projectId: string;
  /** True when this call inserted a fresh `data_rooms` row for the
   *  founder's project. False when a pre-existing row was reused. Only when
   *  true does cleanup() delete the `data_rooms` row so other specs sharing
   *  the same founder do not lose their data-room state. */
  dataRoomCreated: boolean;
}

// Mirrors seed-qa-reseller-storage.mjs CSV_HEADER so the fixture-minted CSV
// stays shape-compatible with what the /api/reseller/reports/[month]/signed-
// url route hands back and with what web/src/lib/reseller/monthly-report.ts
// emits. If monthly-report.ts grows a column, both this table AND the seeder
// must add it in the same commit — the signed-URL happy path asserts a
// well-formed CSV body, not a column-by-column diff, but keeping them in
// sync stops future divergence.
const REPORT_CSV_HEADER = [
  "reseller_id",
  "reseller_display_name",
  "month",
  "new_signups",
  "active_customers_eom",
  "attributed_mrr_aud",
  "churned_customers",
  "blockid_gross_revenue_aud",
  "blockid_net_revenue_aud",
  "commission_pct_effective",
  "commission_owed_aud",
  "ai_credits_granted",
  "ai_credits_over_budget_count",
];

const REPORT_BUCKET = "reseller-reports";
const REPORT_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function buildReportCsvFixture(
  resellerId: string,
  displayName: string,
  monthKey: string,
): string {
  const row = [
    resellerId,
    displayName,
    monthKey,
    "0",
    "0",
    "0.00",
    "0",
    "0.00",
    "0.00",
    "0.00",
    "0.00",
    "0",
    "0",
  ];
  const lines = [
    `# BlockID reseller monthly KPI report — ${monthKey} (attachReportRow fixture blob)`,
    REPORT_CSV_HEADER.join(","),
    row.join(","),
  ];
  return `${lines.join("\n")}\n`;
}

const DEFAULT_TEMP_RESELLER_ADMIN_EMAIL = "qa-reseller-1@blockid.au";
const DEFAULT_TEMP_RESELLER_ATTRIBUTED_EMAIL = "qa-founder-attributed-1@blockid.au";
const DEFAULT_QA_REVIEWER_EMAIL = "qa-reviewer-1@blockid.au";

// P10 Option A step 3 — per-variant admin email map. Mirrors MULTI_ADMIN_EMAILS
// in web/scripts/seed-test-users.mjs and web/scripts/seed-qa-reseller.mjs so
// the fixture binds to the SAME seven emails without a shared import (the
// two .mjs seeders are outside the tsconfig include glob). Per-slot override
// via QA_RESELLER_ADMIN_EMAIL_<VARIANT> (upper-snake) matches the seeder
// contract. Defaults reproduce the collision-finding table verbatim.
const DEFAULT_MULTI_ADMIN_EMAILS: Readonly<Record<ResellerVariant, string>> = {
  active_wholesale: "qa-reseller-wholesale-active@blockid.au",
  active_retail: "qa-reseller-retail-active@blockid.au",
  paused: "qa-reseller-paused@blockid.au",
  terminated: "qa-reseller-terminated@blockid.au",
  no_capability: "qa-reseller-no-cap@blockid.au",
  tier_only_zero: "qa-reseller-tier-zero@blockid.au",
  no_budget: "qa-reseller-no-budget@blockid.au",
};

// Uppercase-snake variant slug for the QA_RESELLER_ADMIN_EMAIL_<VARIANT>
// env-var lookup. Kept as a table (rather than variant.toUpperCase()) so a
// future variant with hyphens does not silently drift from the seeder's own
// slot names.
const VARIANT_ENV_SLOT: Readonly<Record<ResellerVariant, string>> = {
  active_wholesale: "ACTIVE_WHOLESALE",
  active_retail: "ACTIVE_RETAIL",
  paused: "PAUSED",
  terminated: "TERMINATED",
  no_capability: "NO_CAPABILITY",
  tier_only_zero: "TIER_ONLY_ZERO",
  no_budget: "NO_BUDGET",
};

/**
 * Resolves the reseller-admin email for the given variant. Mirrors
 * `resolveVariantAdmin()` in web/scripts/seed-qa-reseller.mjs so the fixture
 * points at exactly the same app_users row the seeder mirrored onto
 * `reseller_admins`.
 *
 * Multi-admin gate: `QA_RESELLER_MULTI_ADMIN=1` (matches the seeder flag).
 *
 * When gate is ON (Option A cohort):
 *   1. `QA_RESELLER_ADMIN_EMAIL_<VARIANT>` per-slot override (upper-snake).
 *   2. `DEFAULT_MULTI_ADMIN_EMAILS[variant]` hard-coded slot.
 *   3. `QA_RESELLER_ADMIN_EMAIL` shared fallback (per collision finding
 *      §A step 2: preserve when per-slot missing).
 *   4. `DEFAULT_TEMP_RESELLER_ADMIN_EMAIL` (qa-reseller-1@blockid.au).
 *
 * When gate is OFF (tick 132 single-admin contract): return
 * `QA_RESELLER_ADMIN_EMAIL` or the default. Every variant collapses to the
 * same email, matching the seeder's single-admin mirror.
 *
 * Always returns a string so `TempResellerFixture.adminEmail` is never null;
 * when the resolved email has no matching app_users row the fixture's
 * adminUserId stays null and the spec skips via tempResellerSkipReason().
 */
export function resolveVariantAdminEmail(variant: ResellerVariant): string {
  const multiAdminGate = process.env.QA_RESELLER_MULTI_ADMIN === "1";
  if (multiAdminGate) {
    const slot = VARIANT_ENV_SLOT[variant];
    const perVariantOverride = slot
      ? process.env[`QA_RESELLER_ADMIN_EMAIL_${slot}`]
      : undefined;
    if (perVariantOverride && perVariantOverride.length > 0) {
      return perVariantOverride;
    }
    const perVariantDefault = DEFAULT_MULTI_ADMIN_EMAILS[variant];
    if (perVariantDefault) return perVariantDefault;
  }
  const single = process.env.QA_RESELLER_ADMIN_EMAIL;
  if (single && single.length > 0) return single;
  return DEFAULT_TEMP_RESELLER_ADMIN_EMAIL;
}

/**
 * Resolves the fixture tuple for a given variant. Reads (never writes) the
 * pre-seeded resellers row, its reseller_admins mirror for the QA reseller
 * admin, and — only on `active_wholesale` — its reseller_promotion_codes
 * and reseller_attributions rows.
 *
 * Never mutates DB state; the mint script owns writes. If the caller needs
 * per-spec mutation (a projects.id insert for sandbox_setup), it registers
 * cleanup via trackProjectForCleanup() and calls cleanup() in afterEach.
 */
export async function loadTempReseller(
  variant: ResellerVariant,
): Promise<TempResellerFixture | null> {
  const supabase = loadSupabaseAdmin();
  if (!supabase) return null;
  const code = RESELLER_VARIANT_CODES[variant];
  if (!code) return null;

  const { data: reseller, error: rErr } = await supabase
    .from("resellers")
    .select("id, code, display_name")
    .eq("code", code)
    .maybeSingle();
  if (rErr || !reseller) return null;

  const resellerId = reseller.id as string;

  const adminEmail = resolveVariantAdminEmail(variant);
  let adminUserId: string | null = null;
  if (adminEmail) {
    const { data: adminUser } = await supabase
      .from("app_users")
      .select("id")
      .ilike("email", adminEmail)
      .maybeSingle();
    if (adminUser?.id) {
      const { data: adminMembership } = await supabase
        .from("reseller_admins")
        .select("user_id")
        .eq("reseller_id", resellerId)
        .eq("user_id", adminUser.id as string)
        .eq("status", "active")
        .maybeSingle();
      if (adminMembership?.user_id) {
        adminUserId = adminMembership.user_id as string;
      }
    }
  }

  let attributedUserId: string | null = null;
  let attributedFounderEmail: string | null = null;
  let attributedProjectId: string | null = null;
  let attributionExists = false;
  let promotionCodes: ReadonlyArray<TempResellerPromotionCode> = [];

  // Finding-2 fixture delta (docs/plans/p10-wave3-preflight-finding.md §Finding 2):
  // rows 150 + 151 probe `no_capability` + `no_budget` variants and need
  // fixture.attributedUserId + attributionExists to populate so decideReveal
  // clears not_in_scope and the intended capability_disabled / over_budget
  // oracle fires. Whitelist mirrors ATTRIBUTION_VARIANTS in
  // web/scripts/seed-qa-reseller.mjs. Promotion codes are minted on
  // active_wholesale (tiers 20 + 40) and paused (tier 20 only, per row 157
  // in docs/plans/p10-deferred-spec-activation-order.md) — see
  // PROMO_VARIANTS below.
  const ATTRIBUTION_VARIANTS = new Set<ResellerVariant>([
    "active_wholesale",
    "no_capability",
    "no_budget",
  ]);
  if (ATTRIBUTION_VARIANTS.has(variant)) {
    const attrEmail =
      process.env.QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL ??
      DEFAULT_TEMP_RESELLER_ATTRIBUTED_EMAIL;
    if (attrEmail) {
      const { data: attrUser } = await supabase
        .from("app_users")
        .select("id")
        .ilike("email", attrEmail)
        .maybeSingle();
      if (attrUser?.id) {
        // Expose the founder's email whenever the app_users row exists so
        // wave-2 attachAttributedCustomer() can drive attribution_reseller_id
        // even before the seed script's reseller_attributions row lands.
        attributedFounderEmail = attrEmail;
        const { data: attr } = await supabase
          .from("reseller_attributions")
          .select("subject_user_id, subject_project_id")
          .eq("reseller_id", resellerId)
          .eq("subject_user_id", attrUser.id as string)
          .eq("status", "active")
          .maybeSingle();
        if (attr) {
          attributedUserId = (attr.subject_user_id as string | null) ?? null;
          attributedProjectId = (attr.subject_project_id as string | null) ?? null;
          attributionExists = attributedUserId !== null;
        } else {
          // Row missing but user seeded — still surface the user_id so
          // attachAttributedCustomer() can toggle the cache column against
          // the correct app_users row.
          attributedUserId = attrUser.id as string;
        }
      }
    }
  }

  // P10 wave-4 row 157 fixture delta — the paused variant also mints one
  // active reseller_promotion_codes row so code-validate.spec.ts can drive
  // the route past the promo lookup and hit the reseller.status !== 'active'
  // branch (404 reason='inactive'). Mirrors the seedPromotionCodes(...,
  // PAUSED_PROMO_TIERS) call in web/scripts/seed-qa-reseller.mjs. Other
  // variants intentionally stay promo-less: active_retail has
  // monthly_credit_budget=0 and no can_grant_credits so no downstream row
  // needs a promo; terminated + no_capability + tier_only_zero + no_budget
  // are probed via decideGrant/decideCreateStartup gates that fire before
  // any promo lookup.
  const PROMO_VARIANTS = new Set<ResellerVariant>(["active_wholesale", "paused"]);
  if (PROMO_VARIANTS.has(variant)) {
    const { data: pc } = await supabase
      .from("reseller_promotion_codes")
      .select("id, tier_pct, code")
      .eq("reseller_id", resellerId)
      .eq("active", true);
    promotionCodes = (pc ?? []).map((row) => ({
      id: row.id as string,
      tier_pct: row.tier_pct as number,
      code: row.code as string,
    }));
  }

  const projectsToClean: string[] = [];
  const restoreClosures: Array<() => Promise<void>> = [];

  return {
    variant,
    resellerId,
    code: reseller.code as string,
    displayName: reseller.display_name as string,
    adminEmail,
    adminUserId,
    attributedUserId,
    attributedFounderEmail,
    attributedProjectId,
    attributionExists,
    promotionCodes,
    trackProjectForCleanup(projectId: string) {
      if (projectId && !projectsToClean.includes(projectId)) {
        projectsToClean.push(projectId);
      }
    },
    async attachAttributedCustomer() {
      if (variant !== "active_wholesale") return null;
      if (!attributedUserId || !attributedFounderEmail) return null;
      const attributedUserIdSnapshot = attributedUserId;
      const { data: before, error: readErr } = await supabase
        .from("app_users")
        .select("attribution_reseller_id")
        .eq("id", attributedUserIdSnapshot)
        .maybeSingle();
      if (readErr) {
        throw new Error(
          `attachAttributedCustomer: read app_users failed: ${readErr.message}`,
        );
      }
      const previousAttributionResellerId =
        ((before as { attribution_reseller_id?: string | null } | null)
          ?.attribution_reseller_id ?? null) as string | null;
      if (previousAttributionResellerId !== resellerId) {
        const { error: writeErr } = await supabase
          .from("app_users")
          .update({ attribution_reseller_id: resellerId })
          .eq("id", attributedUserIdSnapshot);
        if (writeErr) {
          throw new Error(
            `attachAttributedCustomer: update app_users failed: ${writeErr.message}`,
          );
        }
        restoreClosures.push(async () => {
          const { error } = await supabase
            .from("app_users")
            .update({ attribution_reseller_id: previousAttributionResellerId })
            .eq("id", attributedUserIdSnapshot);
          if (error) {
            throw new Error(
              `attachAttributedCustomer.restore: update app_users failed: ${error.message}`,
            );
          }
        });
      }
      return {
        attributedUserId: attributedUserIdSnapshot,
        attributedFounderEmail,
        previousAttributionResellerId,
      };
    },
    async attachReportRow(monthKey: string) {
      if (variant !== "active_wholesale") return null;
      if (!REPORT_MONTH_RE.test(monthKey)) return null;

      const storagePath = `${resellerId}/${monthKey}.csv`;

      const { data: existing, error: readErr } = await supabase
        .from("reseller_report_files")
        .select("id, storage_bucket, storage_path, size_bytes")
        .eq("reseller_id", resellerId)
        .eq("month_key", monthKey)
        .maybeSingle();
      if (readErr) {
        throw new Error(
          `attachReportRow: read reseller_report_files failed: ${readErr.message}`,
        );
      }
      if (existing) {
        return {
          monthKey,
          storageBucket: (existing.storage_bucket as string) ?? REPORT_BUCKET,
          storagePath: (existing.storage_path as string) ?? storagePath,
          sizeBytes: (existing.size_bytes as number) ?? 0,
          created: false,
        };
      }

      const displayName = reseller.display_name as string;
      const csv = buildReportCsvFixture(resellerId, displayName, monthKey);
      const sizeBytes = Buffer.byteLength(csv, "utf8");

      const { error: uploadErr } = await supabase.storage
        .from(REPORT_BUCKET)
        .upload(storagePath, csv, {
          contentType: "text/csv",
          upsert: true,
        });
      if (uploadErr) {
        throw new Error(
          `attachReportRow: storage.upload ${REPORT_BUCKET}/${storagePath}: ${uploadErr.message}`,
        );
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("reseller_report_files")
        .insert({
          reseller_id: resellerId,
          month_key: monthKey,
          storage_bucket: REPORT_BUCKET,
          storage_path: storagePath,
          size_bytes: sizeBytes,
          row_count: 1,
        })
        .select("id")
        .maybeSingle();
      if (insertErr || !inserted) {
        // Roll the storage upload back before throwing so a failed insert
        // does not leak a dangling object into the fixture bucket.
        await supabase.storage.from(REPORT_BUCKET).remove([storagePath]);
        throw new Error(
          `attachReportRow: reseller_report_files insert failed: ${insertErr?.message ?? "no row returned"}`,
        );
      }
      const insertedId = inserted.id as string;

      restoreClosures.push(async () => {
        const errors: string[] = [];
        const { error: delMetaErr } = await supabase
          .from("reseller_report_files")
          .delete()
          .eq("id", insertedId);
        if (delMetaErr) {
          errors.push(
            `delete reseller_report_files ${insertedId}: ${delMetaErr.message}`,
          );
        }
        const { error: delObjErr } = await supabase.storage
          .from(REPORT_BUCKET)
          .remove([storagePath]);
        if (delObjErr) {
          errors.push(
            `storage.remove ${REPORT_BUCKET}/${storagePath}: ${delObjErr.message}`,
          );
        }
        if (errors.length > 0) {
          throw new Error(`attachReportRow.restore: ${errors.join("; ")}`);
        }
      });

      return {
        monthKey,
        storageBucket: REPORT_BUCKET,
        storagePath,
        sizeBytes,
        created: true,
      };
    },
    async attachReviewerAccessToken(opts?: { investorEmail?: string }) {
      if (variant !== "active_wholesale") return null;
      if (!attributedUserId) return null;
      const attributedUserIdSnapshot = attributedUserId;

      const { data: existingProject, error: projectReadErr } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", attributedUserIdSnapshot)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (projectReadErr) {
        throw new Error(
          `attachReviewerAccessToken: read projects failed: ${projectReadErr.message}`,
        );
      }
      const projectId = (existingProject?.id as string | undefined) ?? null;
      if (!projectId) return null;

      const { data: existingRoom, error: roomReadErr } = await supabase
        .from("data_rooms")
        .select("id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (roomReadErr) {
        throw new Error(
          `attachReviewerAccessToken: read data_rooms failed: ${roomReadErr.message}`,
        );
      }

      let dataRoomId: string;
      let dataRoomCreated = false;
      if (existingRoom?.id) {
        dataRoomId = existingRoom.id as string;
      } else {
        const { data: insertedRoom, error: insertRoomErr } = await supabase
          .from("data_rooms")
          .insert({
            user_id: attributedUserIdSnapshot,
            project_id: projectId,
            name: "QA reviewer fixture data room",
            template: "qa-fixture",
            is_public: false,
          })
          .select("id")
          .maybeSingle();
        if (insertRoomErr || !insertedRoom?.id) {
          throw new Error(
            `attachReviewerAccessToken: insert data_rooms failed: ${insertRoomErr?.message ?? "no row returned"}`,
          );
        }
        dataRoomId = insertedRoom.id as string;
        dataRoomCreated = true;
      }

      const investorEmail = opts?.investorEmail ?? DEFAULT_QA_REVIEWER_EMAIL;
      const token = `qaprobe-reviewer-${randomUUID()}`;
      const { data: insertedToken, error: insertTokenErr } = await supabase
        .from("data_room_access_tokens")
        .insert({
          data_room_id: dataRoomId,
          account_id: attributedUserIdSnapshot,
          token,
          investor_email: investorEmail,
          is_active: true,
        })
        .select("id")
        .maybeSingle();
      if (insertTokenErr || !insertedToken?.id) {
        if (dataRoomCreated) {
          await supabase.from("data_rooms").delete().eq("id", dataRoomId);
        }
        throw new Error(
          `attachReviewerAccessToken: insert data_room_access_tokens failed: ${insertTokenErr?.message ?? "no row returned"}`,
        );
      }
      const tokenId = insertedToken.id as string;

      restoreClosures.push(async () => {
        const errors: string[] = [];
        const { error: delReviewErr } = await supabase
          .from("showcase_reviews")
          .delete()
          .eq("project_id", projectId)
          .eq("reviewer_email", investorEmail);
        if (delReviewErr) {
          errors.push(
            `delete showcase_reviews (${projectId}, ${investorEmail}): ${delReviewErr.message}`,
          );
        }
        const { error: delTokenErr } = await supabase
          .from("data_room_access_tokens")
          .delete()
          .eq("id", tokenId);
        if (delTokenErr) {
          errors.push(
            `delete data_room_access_tokens ${tokenId}: ${delTokenErr.message}`,
          );
        }
        if (dataRoomCreated) {
          const { error: delRoomErr } = await supabase
            .from("data_rooms")
            .delete()
            .eq("id", dataRoomId);
          if (delRoomErr) {
            errors.push(`delete data_rooms ${dataRoomId}: ${delRoomErr.message}`);
          }
        }
        if (errors.length > 0) {
          throw new Error(`attachReviewerAccessToken.restore: ${errors.join("; ")}`);
        }
      });

      return {
        token,
        investorEmail,
        dataRoomId,
        projectId,
        dataRoomCreated,
      };
    },
    async attachApproveTarget(opts?: {
      requestedAmount?: number;
      reason?: string;
    }) {
      if (variant !== "active_wholesale") return null;
      if (!attributedUserId) return null;
      if (!adminUserId) return null;
      const targetUserIdSnapshot = attributedUserId;
      const requestedAmount = opts?.requestedAmount ?? 1;
      const reason = opts?.reason ?? "p10_wave5_row_175_approve_probe";

      const { data: balanceBefore, error: balReadErr } = await supabase
        .from("credit_balances")
        .select("balance, lifetime_earned")
        .eq("user_id", targetUserIdSnapshot)
        .maybeSingle();
      if (balReadErr) {
        throw new Error(
          `attachApproveTarget: read credit_balances failed: ${balReadErr.message}`,
        );
      }
      const balanceBeforeVal =
        (balanceBefore?.balance as number | null | undefined) ?? null;
      const lifetimeBeforeVal =
        (balanceBefore?.lifetime_earned as number | null | undefined) ?? null;
      const balanceRowExisted = balanceBefore !== null;

      const { data: insertedRequest, error: insertErr } = await supabase
        .from("reseller_requests")
        .insert({
          reseller_id: resellerId,
          requested_by: adminUserId,
          request_type: "over_budget_approval",
          status: "pending",
          payload: {
            target_user_id: targetUserIdSnapshot,
            requested_amount: requestedAmount,
            reason,
          },
        })
        .select("id")
        .maybeSingle();
      if (insertErr || !insertedRequest?.id) {
        throw new Error(
          `attachApproveTarget: insert reseller_requests failed: ${insertErr?.message ?? "no row returned"}`,
        );
      }
      const requestId = insertedRequest.id as string;

      restoreClosures.push(async () => {
        const errors: string[] = [];
        // 1. reseller_credit_grants first — mirror row that references
        //    credit_transactions.id via ON DELETE SET NULL, but scrubbing
        //    it first keeps the cleanup trace tidy.
        const { error: delGrantErr } = await supabase
          .from("reseller_credit_grants")
          .delete()
          .eq("reseller_id", resellerId)
          .eq("target_user_id", targetUserIdSnapshot)
          .filter("metadata->>reseller_request_id", "eq", requestId);
        if (delGrantErr) {
          errors.push(
            `delete reseller_credit_grants (${requestId}): ${delGrantErr.message}`,
          );
        }
        // 2. reseller_requests — its linked_credit_transaction_id FK is
        //    ON DELETE SET NULL so the request row deletes cleanly even
        //    while credit_transactions is still present.
        const { error: delReqErr } = await supabase
          .from("reseller_requests")
          .delete()
          .eq("id", requestId);
        if (delReqErr) {
          errors.push(
            `delete reseller_requests ${requestId}: ${delReqErr.message}`,
          );
        }
        // 3. credit_transactions — deleted after request row so the FK
        //    holder (reseller_requests.linked_credit_transaction_id) is
        //    already gone.
        const { error: delTxErr } = await supabase
          .from("credit_transactions")
          .delete()
          .eq("user_id", targetUserIdSnapshot)
          .filter("metadata->>reseller_request_id", "eq", requestId);
        if (delTxErr) {
          errors.push(
            `delete credit_transactions (${requestId}): ${delTxErr.message}`,
          );
        }
        // 4. credit_balances — restore snapshot when a row existed, else
        //    delete the row the approve branch's UPSERT freshly minted.
        if (balanceRowExisted) {
          const { error: restoreErr } = await supabase
            .from("credit_balances")
            .upsert(
              {
                user_id: targetUserIdSnapshot,
                balance: balanceBeforeVal ?? 0,
                lifetime_earned: lifetimeBeforeVal ?? 0,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            );
          if (restoreErr) {
            errors.push(
              `restore credit_balances ${targetUserIdSnapshot}: ${restoreErr.message}`,
            );
          }
        } else {
          const { error: delBalErr } = await supabase
            .from("credit_balances")
            .delete()
            .eq("user_id", targetUserIdSnapshot);
          if (delBalErr) {
            errors.push(
              `delete credit_balances ${targetUserIdSnapshot}: ${delBalErr.message}`,
            );
          }
        }
        if (errors.length > 0) {
          throw new Error(`attachApproveTarget.restore: ${errors.join("; ")}`);
        }
      });

      return {
        requestId,
        targetUserId: targetUserIdSnapshot,
        requestedAmount,
        balanceBefore: balanceBeforeVal,
        lifetimeEarnedBefore: lifetimeBeforeVal,
        reason,
      };
    },
    async attachGrantSelfApprove(opts: { amount: number }) {
      if (variant !== "active_wholesale") return null;
      if (!attributedUserId) return null;
      if (!adminUserId) return null;
      const targetUserIdSnapshot = attributedUserId;
      const adminUserIdSnapshot = adminUserId;
      const amount = opts.amount;

      const { data: balanceBefore, error: balReadErr } = await supabase
        .from("credit_balances")
        .select("balance, lifetime_earned")
        .eq("user_id", targetUserIdSnapshot)
        .maybeSingle();
      if (balReadErr) {
        throw new Error(
          `attachGrantSelfApprove: read credit_balances failed: ${balReadErr.message}`,
        );
      }
      const balanceBeforeVal =
        (balanceBefore?.balance as number | null | undefined) ?? null;
      const lifetimeBeforeVal =
        (balanceBefore?.lifetime_earned as number | null | undefined) ?? null;
      const balanceRowExisted = balanceBefore !== null;
      const since = new Date().toISOString();

      restoreClosures.push(async () => {
        const errors: string[] = [];
        // 1. reseller_credit_grants mirror first — scoped by (reseller_id,
        //    target_user_id, granted_by_user_id, created_at >= since) so a
        //    prior-run leak on the same triple stays intact. Matches the
        //    columns route.ts:206-218 writes on the wave-3 self-approve path.
        const { error: delGrantErr } = await supabase
          .from("reseller_credit_grants")
          .delete()
          .eq("reseller_id", resellerId)
          .eq("target_user_id", targetUserIdSnapshot)
          .eq("granted_by_user_id", adminUserIdSnapshot)
          .gte("created_at", since);
        if (delGrantErr) {
          errors.push(
            `delete reseller_credit_grants (${since}): ${delGrantErr.message}`,
          );
        }
        // 2. credit_transactions — filtered by the stamped
        //    granted_by_reseller_id column that route.ts:194 writes, plus
        //    the since cursor. Deleted after the mirror row so the FK
        //    holder (reseller_credit_grants.credit_transaction_id) is
        //    already gone when this row disappears.
        const { error: delTxErr } = await supabase
          .from("credit_transactions")
          .delete()
          .eq("user_id", targetUserIdSnapshot)
          .eq("granted_by_reseller_id", resellerId)
          .gte("created_at", since);
        if (delTxErr) {
          errors.push(
            `delete credit_transactions (${since}): ${delTxErr.message}`,
          );
        }
        // 3. credit_balances — restore snapshot when a row existed, else
        //    delete the row the self-approve branch's UPSERT freshly
        //    minted at route.ts:169-179.
        if (balanceRowExisted) {
          const { error: restoreErr } = await supabase
            .from("credit_balances")
            .upsert(
              {
                user_id: targetUserIdSnapshot,
                balance: balanceBeforeVal ?? 0,
                lifetime_earned: lifetimeBeforeVal ?? 0,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            );
          if (restoreErr) {
            errors.push(
              `restore credit_balances ${targetUserIdSnapshot}: ${restoreErr.message}`,
            );
          }
        } else {
          const { error: delBalErr } = await supabase
            .from("credit_balances")
            .delete()
            .eq("user_id", targetUserIdSnapshot);
          if (delBalErr) {
            errors.push(
              `delete credit_balances ${targetUserIdSnapshot}: ${delBalErr.message}`,
            );
          }
        }
        // reseller_audit_log rows deliberately left in place — migration
        // 0093 mutation triggers block DELETE/UPDATE (append-only ledger)
        // so a sweep would fail. Matches audit-log-writes.spec.ts posture
        // where append-only accumulation is expected.
        if (errors.length > 0) {
          throw new Error(`attachGrantSelfApprove.restore: ${errors.join("; ")}`);
        }
      });

      return {
        targetUserId: targetUserIdSnapshot,
        amount,
        balanceBefore: balanceBeforeVal,
        lifetimeEarnedBefore: lifetimeBeforeVal,
        since,
      };
    },
    async cleanup() {
      const errors: string[] = [];
      while (restoreClosures.length > 0) {
        const restore = restoreClosures.pop();
        if (!restore) continue;
        try {
          await restore();
        } catch (err) {
          errors.push((err as Error).message);
        }
      }
      if (projectsToClean.length > 0) {
        const ids = projectsToClean.splice(0);
        const { error } = await supabase.from("projects").delete().in("id", ids);
        if (error) {
          errors.push(
            `failed to delete projects [${ids.join(",")}]: ${error.message}`,
          );
        }
      }
      if (errors.length > 0) {
        // Bubble up so afterEach fails loudly rather than silently leaving
        // state that would poison the next spec run.
        throw new Error(`loadTempReseller.cleanup(): ${errors.join("; ")}`);
      }
    },
  };
}

export function tempResellerSkipReason(variant: ResellerVariant): string {
  const code = RESELLER_VARIANT_CODES[variant] ?? "<unknown>";
  return (
    `Temp-reseller fixture for variant='${variant}' (code=${code}) not ` +
    "provisioned — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the " +
    "Playwright env and run `node web/scripts/seed-qa-reseller.mjs` " +
    "(and, for the active_wholesale variant, seed-qa-reseller-storage.mjs + " +
    "the seed-test-users.mjs reseller-fixture delta) before invoking the " +
    "Playwright suite. For the P10 Option A multi-admin cohort, run both " +
    "seeders with QA_RESELLER_MULTI_ADMIN=1 (or --reseller-multi-admin) so " +
    "each variant mirrors a DISTINCT app_users row and scopedReseller() " +
    ".maybeSingle() does not PGRST116 on the first /api/reseller/* request. " +
    "Design source: docs/plans/p10-temp-reseller-mint-fixture-design.md §3 + " +
    "docs/plans/p10-temp-reseller-admin-scope-collision-finding.md §A step 3."
  );
}
