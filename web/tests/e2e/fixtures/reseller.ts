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

const DEFAULT_RESELLER_EMAIL = "qa-reseller-1@blockid.au";

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
