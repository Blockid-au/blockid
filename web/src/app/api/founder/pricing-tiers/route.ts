import { listHandler, createHandler, type CrudConfig } from "@/lib/founder-crud";
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
  requiredFields: ["name"],
  orderBy: [
    { column: "sort_order", ascending: true },
    { column: "created_at", ascending: true },
  ],
};

export const GET = listHandler(CFG);
const POST_handler = createHandler(CFG);

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/founder/pricing-tiers/route.ts", method: "POST" }, POST_handler);
