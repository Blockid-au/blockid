import { listHandler, createHandler, type CrudConfig } from "@/lib/founder-crud";
import { apiRoute } from "@/lib/audit/api-route";

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
const POST_handler = createHandler(CFG);

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/founder/roadmap/route.ts", method: "POST" }, POST_handler);
