// Competitor — update + delete a single row.
//
// S18-A — routed through the shared founder-crud handlers so the row is
// keyed on (user_id = project OWNER, project_id) and gated at editor+,
// exactly like the sibling /founder/*/[id] routes.
import { patchHandler, deleteHandler, type CrudConfig } from "@/lib/founder-crud";
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
};

const PATCH_handler = patchHandler(CFG);
const DELETE_handler = deleteHandler(CFG);

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/founder/competitors/[id]/route.ts", method: "PATCH" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/founder/competitors/[id]/route.ts", method: "DELETE" }, DELETE_handler);
