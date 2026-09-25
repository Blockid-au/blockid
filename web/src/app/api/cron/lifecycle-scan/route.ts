// GET|POST /api/cron/lifecycle-scan — G34-BT4 daily lifecycle scan.
//
// Finds who is due for each behaviour-triggered flow (plan §9.2) and queues
// rows on `email_drips`; the hourly `email-drip` worker sends them through
// the one gate (preference, consent, suppression, frequency cap, quiet
// hours, stop condition). This route never sends mail itself.
//
// Default flows: evidence (EM14), intake (EM13), rerun (EM15), quota (EM16),
// sunset (EM20 — ask after 90 d without a sign-in; switch commercial
// categories off 30 d later when there was no sign-in and no saved
// preference). The monthly digest (EM19) is /api/cron/lifecycle-digest.
// `?dry=1` lists would-be recipients and writes nothing; `?flows=` overrides.
// Handler: lib/lifecycle/cron-handler.ts.

import { handleLifecycleCron } from "@/lib/lifecycle/cron-handler";
import { DAILY_SCAN_FLOWS } from "@/lib/lifecycle/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleLifecycleCron(request, DAILY_SCAN_FLOWS);
}

export async function POST(request: Request) {
  return handleLifecycleCron(request, DAILY_SCAN_FLOWS);
}
