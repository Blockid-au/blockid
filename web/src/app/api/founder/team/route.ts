import { listHandler, createHandler, type CrudConfig } from "@/lib/founder-crud";
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
  requiredFields: ["role_title"],
};

export const GET = listHandler(CFG);
const POST_handler = createHandler(CFG);

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/founder/team/route.ts", method: "POST" }, POST_handler);
