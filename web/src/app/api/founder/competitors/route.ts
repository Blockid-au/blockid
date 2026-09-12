// Competitors — list + create.
//
// S18-A — routed through the shared founder-crud handlers: rows are keyed
// on (user_id = project OWNER, project_id); viewer+ lists, editor+ creates.
import { listHandler, createHandler, type CrudConfig } from "@/lib/founder-crud";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

const CFG: CrudConfig = {
  table: "competitors",
  fields: new Set([
    "name",
    "website",
    "category",
    "positioning",
    "pricing",
    "strengths",
    "weaknesses",
    "our_edge",
    "threat_level",
  ]),
  requiredFields: ["name"],
  orderBy: [{ column: "created_at", ascending: true }],
};

export const GET = listHandler(CFG);
const POST_handler = createHandler(CFG);

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/founder/competitors/route.ts", method: "POST" }, POST_handler);
