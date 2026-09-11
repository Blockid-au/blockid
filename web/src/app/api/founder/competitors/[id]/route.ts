// Competitor — update + delete a single row.
//
// S18-A — routed through the shared founder-crud handlers so the row is
// keyed on (user_id = project OWNER, project_id) and gated at editor+,
// exactly like the sibling /founder/*/[id] routes.
import { patchHandler, deleteHandler, type CrudConfig } from "@/lib/founder-crud";

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

export const PATCH = patchHandler(CFG);
export const DELETE = deleteHandler(CFG);
