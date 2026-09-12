import { patchHandler, deleteHandler, type CrudConfig } from "@/lib/founder-crud";
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
};

const PATCH_handler = patchHandler(CFG);
const DELETE_handler = deleteHandler(CFG);

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/founder/roadmap/[id]/route.ts", method: "PATCH" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/founder/roadmap/[id]/route.ts", method: "DELETE" }, DELETE_handler);
