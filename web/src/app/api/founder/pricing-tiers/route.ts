import { listHandler, createHandler, type CrudConfig } from "@/lib/founder-crud";

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
export const POST = createHandler(CFG);
