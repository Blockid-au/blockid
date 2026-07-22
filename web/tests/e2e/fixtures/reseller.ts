// Playwright reseller harness — P10 dry-run scaffolding.
//
// Resolves the (reseller admin QA account, one attributed customer id) tuple
// that the reseller-scope E2E specs need. Returns null when either half is
// unprovisioned so specs can test.skip() while P1.5_infovision_seed
// (H.20 ABN + GST) and P8.5_env_and_playwright (STRIPE_PRICE_ADDON_*) remain
// human-blocked. Once those clear, set QA_RESELLER_ADMIN_EMAIL +
// QA_RESELLER_ATTRIBUTED_CUSTOMER_ID (or QA_RESELLER_ATTRIBUTED_PROJECT_ID)
// to activate the specs against staging.

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
  /** Reseller-admin user_id resolved via QA_RESELLER_ADMIN_EMAIL. `null`
   *  when the QA account seeder delta (§5) has not run yet. */
  adminUserId: string | null;
  /** Only populated on `active_wholesale` — the attributed founder resolved
   *  via QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL. */
  attributedUserId: string | null;
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
  /** No-op by default. Deletes any projects.id registered via
   *  trackProjectForCleanup() during the spec. */
  cleanup(): Promise<void>;
}

const DEFAULT_TEMP_RESELLER_ADMIN_EMAIL = "qa-reseller-1@blockid.au";
const DEFAULT_TEMP_RESELLER_ATTRIBUTED_EMAIL = "qa-founder-attributed-1@blockid.au";

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

  const adminEmail =
    process.env.QA_RESELLER_ADMIN_EMAIL ?? DEFAULT_TEMP_RESELLER_ADMIN_EMAIL;
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

  return {
    variant,
    resellerId,
    code: reseller.code as string,
    displayName: reseller.display_name as string,
    adminUserId,
    attributedUserId,
    attributedProjectId,
    promotionCodes,
    trackProjectForCleanup(projectId: string) {
      if (projectId && !projectsToClean.includes(projectId)) {
        projectsToClean.push(projectId);
      }
    },
    async cleanup() {
      if (projectsToClean.length === 0) return;
      const ids = projectsToClean.splice(0);
      const { error } = await supabase.from("projects").delete().in("id", ids);
      if (error) {
        // Bubble up so afterEach fails loudly rather than silently leaving
        // an orphan projects row that would poison the next spec run.
        throw new Error(
          `loadTempReseller.cleanup(): failed to delete projects [${ids.join(",")}]: ${error.message}`,
        );
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
    "Playwright suite. Design source: " +
    "docs/plans/p10-temp-reseller-mint-fixture-design.md §3."
  );
}
