import { listHandler, createHandler, type CrudConfig } from "@/lib/founder-crud";

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
export const POST = createHandler(CFG);
