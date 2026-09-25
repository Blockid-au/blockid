// GET|POST /api/cron/lifecycle-digest — G34-BT4 EM19 monthly digest.
//
// Queues one `monthly_digest` row per active, consenting account holder for
// the previous calendar month — quiet months included (the old weekly
// founder digest skipped quiet weeks). Content: score trend, report views
// and investor leads, top-3 missing (the founder-weekly-digest nudge
// loader), peer percentile only when the stage cohort n ≥ 10. The hourly
// `email-drip` worker sends it through the C-class gate and quiet hours.
// One per address per month (dedupe on the period key). `?dry=1` lists
// would-be recipients and writes nothing. Handler: lib/lifecycle/cron-handler.ts.

import { handleLifecycleCron } from "@/lib/lifecycle/cron-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleLifecycleCron(request, ["digest"]);
}

export async function POST(request: Request) {
  return handleLifecycleCron(request, ["digest"]);
}
