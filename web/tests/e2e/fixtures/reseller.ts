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
  /** Only populated on `active_wholesale` — the attributed founder's email
   *  (env-resolved via QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL, fallback
   *  qa-founder-attributed-1@blockid.au). Wave-2 rows 145-149 use this to
   *  `loginAs(page, fixture.attributedFounderEmail)`; null on non-active
   *  wholesale variants so specs skip cleanly. */
  attributedFounderEmail: string | null;
  /** Only populated on `active_wholesale` — the reseller_attributions
   *  row's `subject_project_id`, when the seed script has stamped one. */
  attributedProjectId: string | null;
  /** Only populated on `active_wholesale` — the reseller_promotion_codes
   *  rows for tiers 20 + 40 (tier 0 skipped per ck_stripe_objects_by_tier). */
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
  /** No-op by default. Deletes any projects.id registered via
   *  trackProjectForCleanup() during the spec AND runs any restore
   *  closure registered by attachAttributedCustomer(). */
  cleanup(): Promise<void>;
}

export interface AttachAttributedCustomerResult {
  attributedUserId: string;
  attributedFounderEmail: string;
  /** The cache-column value BEFORE the attach ran — null if unset. cleanup()
   *  writes this back so cross-spec state does not leak. */
  previousAttributionResellerId: string | null;
}

const DEFAULT_TEMP_RESELLER_ADMIN_EMAIL = "qa-reseller-1@blockid.au";
const DEFAULT_TEMP_RESELLER_ATTRIBUTED_EMAIL = "qa-founder-attributed-1@blockid.au";

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
  let promotionCodes: ReadonlyArray<TempResellerPromotionCode> = [];

  if (variant === "active_wholesale") {
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
        } else {
          // Row missing but user seeded — still surface the user_id so
          // attachAttributedCustomer() can toggle the cache column against
          // the correct app_users row.
          attributedUserId = attrUser.id as string;
        }
      }
    }

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
