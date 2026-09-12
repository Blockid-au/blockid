import { patchHandler, deleteHandler, type CrudConfig } from "@/lib/founder-crud";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

const CFG: CrudConfig = {
  table: "team_members",
  fields: new Set([
    "role_title",
    "role_category",
    "full_name",
    "equity_pct",
    "salary_aud",
    "start_date",
    "status",
    "reports_to",
    "notes",
  ]),
};

const PATCH_handler = patchHandler(CFG);
const DELETE_handler = deleteHandler(CFG);

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/founder/team/[id]/route.ts", method: "PATCH" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/founder/team/[id]/route.ts", method: "DELETE" }, DELETE_handler);
