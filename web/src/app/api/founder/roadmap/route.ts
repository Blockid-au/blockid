import { listHandler, createHandler, type CrudConfig } from "@/lib/founder-crud";

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
  requiredFields: ["quarter", "title"],
  orderBy: [
    { column: "quarter", ascending: true },
    { column: "sort_order", ascending: true },
  ],
};

export const GET = listHandler(CFG);
export const POST = createHandler(CFG);
