import { patchHandler, deleteHandler, type CrudConfig } from "@/lib/founder-crud";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

const CFG: CrudConfig = {
  table: "pricing_tiers",
  fields: new Set([
    "name",
    "model",
    "price_monthly_aud",
    "price_annual_aud",
    "billing_note",
    "features",
    "target_segment",
    "cta_label",
    "sort_order",
  ]),
};

const PATCH_handler = patchHandler(CFG);
const DELETE_handler = deleteHandler(CFG);

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/founder/pricing-tiers/[id]/route.ts", method: "PATCH" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/founder/pricing-tiers/[id]/route.ts", method: "DELETE" }, DELETE_handler);
