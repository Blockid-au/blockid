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

const DEFAULT_RESELLER_EMAIL = "qa-reseller-1@blockid.au";
const DEFAULT_ATTRIBUTED_FOUNDER_EMAIL = "qa-founder-attributed-1@blockid.au";
const DEFAULT_UNATTRIBUTED_FOUNDER_EMAIL = "qa-founder-1@blockid.au";

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
