// POST /api/cron/model-eval — G35 A2 (pricing v5 §7.4) model eval loop.
//
//   ?mode=smoke  (default) nightly: 3 dev cases per task × every candidate
//   ?mode=full   weekly: the held-out split + a different-family judge sample
//   ?restart=1   start a new run even if this period's run already finished
//   ?dry=1       plan only: item count + worst-case cost, no model call
//
// Resumable: each tick works ≤ 240 s and checkpoints; the next tick of the
// same period (UTC day / ISO week) continues; afterwards ticks are no-ops
// (`noop: true`, cron-runner skips the health-log line). A finished run is
// coordinated: ai-model-scorecard.json(.jsonl) + ai-routing-policy.json —
// FREE ladders change automatically, the PAID report ladder only gets a
// proposal for /admin/ai-health (Approve / Rollback).
//
// Spend: hard cap US$1 per run + its own monthly eval budget (US$5 default,
// MODEL_EVAL_MONTHLY_BUDGET_USD); DeepInfra is the only paid provider the
// eval can reach (lib/ai/model-eval-transport.ts).
//
// Auth: Bearer CRON_SECRET (lib/security/cron-auth).

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { runModelEvalCron } from "@/lib/ai/model-eval-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request): Promise<NextResponse> {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const modeRaw = url.searchParams.get("mode") ?? "smoke";
  if (modeRaw !== "smoke" && modeRaw !== "full") {
    return NextResponse.json({ ok: false, error: "mode must be smoke or full" }, { status: 400 });
  }
  const flag = (k: string) => url.searchParams.get(k) === "1" || url.searchParams.get(k) === "true";
  try {
    const result = await runModelEvalCron({ mode: modeRaw, restart: flag("restart"), dryRun: flag("dry") });
    return NextResponse.json({ ok: true, noop: result.status === "noop", ...result });
  } catch (err) {
    console.error("[cron:model-eval] failed", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "model eval failed" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
