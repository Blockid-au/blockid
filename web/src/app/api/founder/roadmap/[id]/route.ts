import { patchHandler, deleteHandler, type CrudConfig } from "@/lib/founder-crud";

export const dynamic = "force-dynamic";

const CFG: CrudConfig = {
  table: "roadmap_milestones",
  fields: new Set([
    "quarter",
    "title",
    "description",
    "category",
    "status",
    "target_date",
    "owner",
    "sort_order",
  ]),
};

export const PATCH = patchHandler(CFG);
export const DELETE = deleteHandler(CFG);
