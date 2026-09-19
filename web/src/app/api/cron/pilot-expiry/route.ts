// /api/cron/pilot-expiry — daily 04:20 UTC (G16-C).
//
//   * T-3 d: reminder e-mail to the evaluator (once — `reminder_sent_at`
//     in the ledger) + ops alert;
//   * on / after `expires_at`: same revert logic as "end early" with reason
//     `expired` — plan → previous_plan UNLESS a Stripe subscription row
//     exists or the plan is no longer the pilot tier; status `expired`;
//     evaluator e-mailed; `pilot.expired` audit row; ops alert.
//   * `?dry=1` reports the plan and writes / sends nothing.
//
// Auth: CRON_SECRET via `Authorization: Bearer` or `x-cron-secret`, like
// every other cron here. GET and POST both work (cron-runner.sh POSTs).
// Allow-listed from apiRoute (api/cron/** — system actor; the run lands in
// cron-health.jsonl via the runner and the service writes its own audit
// rows).

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { runPilotExpiry } from "@/lib/pilots/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function run(request: Request) {
  if (!isCronAuthorised(request, { xCronSecretHeader: true })) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const result = await runPilotExpiry({ dry });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blockid:pilot-expiry] failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
