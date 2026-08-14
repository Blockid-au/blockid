import { patchHandler, deleteHandler, type CrudConfig } from "@/lib/founder-crud";

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

export const PATCH = patchHandler(CFG);
export const DELETE = deleteHandler(CFG);
