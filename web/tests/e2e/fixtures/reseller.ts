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
