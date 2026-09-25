// G34-BT4 — shared handler for the two lifecycle cron routes:
//   /api/cron/lifecycle-scan    daily: evidence, intake, rerun, quota, sunset
//   /api/cron/lifecycle-digest  monthly: the EM19 digest
// (cron-runner.sh posts to `/api/cron/<name>` with no query string, so the
// monthly flow gets its own route instead of `?flows=digest`).
//
//   ?flows=a,b   override the route's default flow list (manual runs)
//   ?dry=1       read everything, write nothing; lists the `campaign:email`
//                rows that WOULD be queued and the sunset switch-offs that
//                WOULD happen
//
// Rollout switch LIFECYCLE_EMAIL (lib/lifecycle/mode.ts): `off` answers
// `disabled` and reads nothing; unset / `dry` forces every run dry (the
// scheduled job logs would-be recipients); `live` queues rows.
// Auth: `Authorization: Bearer <CRON_SECRET>` (lib/security/cron-auth).

import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { parseScanFlows, runLifecycleScan, type ScanFlow } from "./scan";
import { lifecycleMode } from "./mode";

export async function handleLifecycleCron(request: Request, defaultFlows: readonly ScanFlow[]): Promise<Response> {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const mode = lifecycleMode();
  if (mode === "off") {
    return NextResponse.json({ ok: true, disabled: true });
  }
  const url = new URL(request.url);
  // An explicit `?dry=1` is an operator's review run: the response lists the
  // recipients. A scheduled run that is dry only because of the rollout
  // switch returns counts — cron-runner.sh copies the first 200 bytes of the
  // body into content/reports/cron-health.jsonl, which is committed to a
  // public repo — and writes masked samples to the server log instead.
  const explicitDry = url.searchParams.get("dry") === "1";
  const dry = mode !== "live" || explicitDry;
  const raw = url.searchParams.get("flows");
  const flows = raw ? parseScanFlows(raw) : [...defaultFlows];
  if (flows.length === 0) {
    return NextResponse.json({ ok: false, error: "no known flow in ?flows=" }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  const results = await runLifecycleScan({ db, now: new Date(), dry }, flows);
  if (dry && !explicitDry) {
    for (const r of results) {
      console.info("[lifecycle-scan] dry", r.flow, JSON.stringify({ wouldQueue: r.queued.slice(0, 50).map(maskEntry), wouldSunset: (r.sunsetOff ?? []).slice(0, 50).map(maskEmail) }));
    }
  }
  return NextResponse.json({
    ok: results.every((r) => !r.error),
    mode,
    dryRun: dry,
    flows: results.map((r) => ({
      flow: r.flow,
      candidates: r.candidates,
      queued: r.queued.length,
      skipped: r.skipped,
      ...(r.sunsetOff ? { sunsetOff: r.sunsetOff.length } : {}),
      ...(r.error ? { error: r.error } : {}),
      // Recipient lists only on an explicit dry run (the operator's review before a flow is switched on).
      ...(explicitDry ? { wouldQueue: r.queued.slice(0, 200), ...(r.sunsetOff ? { wouldSunset: r.sunsetOff.slice(0, 200) } : {}) } : {}),
    })),
  });
}

/** "sam@example.com" → "s**@example.com" — enough to spot-check a sample, not a mailing list. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}${"*".repeat(Math.min(6, Math.max(2, at - 1)))}${email.slice(at)}`;
}

function maskEntry(entry: string): string {
  const i = entry.indexOf(":");
  return i < 0 ? maskEmail(entry) : `${entry.slice(0, i)}:${maskEmail(entry.slice(i + 1))}`;
}
