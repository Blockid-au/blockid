import { patchHandler, deleteHandler, type CrudConfig } from "@/lib/founder-crud";

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

export const PATCH = patchHandler(CFG);
export const DELETE = deleteHandler(CFG);
