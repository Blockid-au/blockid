// /api/cron/evidence-expiry — daily 02:35 UTC (G21 P1-A).
//
//   * evidence_records past `expires_at` → status `expired`, the claims they
//     backed re-graded (a claim whose only proof lapsed drops to `claimed`),
//     `evidence.expired` + `claim.status_changed` audit rows;
//   * Phase-3 `public.evidence` rows past `expires_at` go through
//     state-machine.ts `expire` (the first caller of that transition);
//   * `?dry=1` reports the plan and writes / audits nothing.
//
// Auth: CRON_SECRET via `Authorization: Bearer` or `x-cron-secret`, like
// every other cron here. GET and POST both work (cron-runner.sh POSTs).
// Allow-listed from apiRoute (api/cron/** — system actor; the run lands in
// cron-health.jsonl via the runner and the job writes its own audit rows).

import { NextResponse } from "next/server";
import { runEvidenceExpiry } from "@/lib/evidence/expiry";
import { isCronAuthorised } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function run(request: Request) {
  if (!isCronAuthorised(request, { xCronSecretHeader: true })) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const result = await runEvidenceExpiry({ dry });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blockid:evidence-expiry] failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
