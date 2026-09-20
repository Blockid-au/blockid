// SVI data-API tier facts that both the server (lib/svi-api-auth.ts) and the
// "use client" settings section quote. G18-A (2026-09-19): the settings page
// typed "A$199" / "A$2,000" by hand while the sold rung is the Index API row
// (A$299/mo) and Institutional is contact-sales. Pure module — no I/O.

import { PLANS_V2, formatAud } from "@/lib/plans-v2";

const INDEX_API = PLANS_V2.find((p) => p.id === "index_api");

/** Index API monthly price in whole AUD (299), from plans-v2. */
export const INDEX_API_MONTHLY_AUD: number = INDEX_API?.monthly_aud ?? 0;

/** Daily call allowance the Team tier sells (plans.csv `api_daily_calls`). */
export const INDEX_API_DAILY_CALLS = 1000;

/** Where the contact-sales rung sends a buyer (matches the /pricing contact row). */
export const INSTITUTIONAL_CONTACT_HREF = "/contact?plan=investor_vc_ent";

/** "A$299" / "A$0" / "Custom" for a tier's monthly price. */
export function sviApiTierPriceLabel(priceAud: number | null): string {
  return formatAud(priceAud);
}
