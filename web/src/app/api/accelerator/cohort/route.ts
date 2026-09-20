// /api/accelerator/cohort — RETIRED (G21 P2-A, 2026-09-20).
//
// Was the W5b "cohort CRUD stub": GET echoed a hard-coded placeholder cohort
// from lib/accelerator-portal (the `cohorts` table it read never existed)
// and POST echoed a draft back with a generated id — nothing persisted.
// `evaluation_batches` is now the one BlockID Cohort. Every method answers
// 410 Gone with a JSON pointer to the batch API so an old client learns the
// new endpoint instead of reading placeholder numbers.
//
//   GET /api/evaluations/batch                      list my cohorts
//   POST /api/evaluations/batch                     create one (allow_empty for an import-first cohort)
//   POST /api/evaluations/batch/[id]/import.csv     CSV import
//   GET  /api/evaluations/batch/[id]/snapshots      history + Δ
//   page /workspace/evaluations/cohort

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const COHORT_API_GONE = Object.freeze({
  ok: false,
  error: "gone",
  message: "The accelerator cohort stub was retired. Cohorts are evaluation batches — use /api/evaluations/batch.",
  replaced_by: {
    list: "/api/evaluations/batch",
    create: "/api/evaluations/batch",
    import_csv: "/api/evaluations/batch/[id]/import.csv",
    snapshots: "/api/evaluations/batch/[id]/snapshots",
    page: "/workspace/evaluations/cohort",
  },
});

function gone() {
  return NextResponse.json(COHORT_API_GONE, { status: 410, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  return gone();
}

async function POST_handler() {
  return gone();
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/accelerator/cohort/route.ts", method: "POST" }, POST_handler);
