// GET|POST /api/cron/money-radar-sweep
//
// T0245 (G11 sprint S4) — weekly Sunday 05:00 UTC, one hour after
// `refresh-funding-sources`. Re-matches every Money Radar subscriber (plan
// flag `money_radar`) and every A$3 / credit report buyer of the last 90 days
// against the refreshed `au_grants` / `au_programs`, upserts
// `funding_matches`, diffs against last week and fans the events out as
// in-app notifications (`new_matches`, `grant_deadline`, `program_intake`,
// `event_match`). Email is the drip worker: after the sweep, T0246's
// `enqueueRadarDripsFromMatches` turns every `last_notified.pending_email`
// entry (contract in `@/lib/funding/radar-sweep`) into a `radar_t30/t14/t3`
// email_drips row that the hourly /api/cron/email-drip sends. That call is
// guarded — a drip failure never fails the sweep — and reported as `drips`.
// S11-A: subscribers the sweep finds with zero targets (no profile, no
// intake) get the activation nudge inside the sweep itself — in-app
// `radar_setup_nudge` + `radar_setup` / `radar_setup_2` drips, two touches
// ever — reported as `setup_nudges` (`?dry=1` counts without writing).
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (pattern: refresh-funding-sources).
// `?dry=1` computes everything, writes nothing and returns the full event list.
//
// cron-runner.sh appends the JSON body to content/reports/cron-health.jsonl,
// so the non-dry response keeps `events` out (counts only).

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { runMoneyRadarSweep } from "@/lib/funding/radar-sweep";
import { enqueueRadarDripsFromMatches, type RadarDripsSummary } from "@/lib/funding/radar-drips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  // S8-C (2026-09-11): constant-time compare of the bearer secret.
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dryRun = isDry(request);
  const startedAt = Date.now();
  const summary = await runMoneyRadarSweep({ dryRun });

  if (!summary.ok && summary.error === "supabase_unavailable") {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  if (!summary.ok) {
    const { events: _events, ...rest } = summary;
    void _events;
    return NextResponse.json({ ...rest, ok: false, error: summary.error ?? "sweep_failed" }, { status: 500 });
  }

  // T0246 — hand pending deadline tiers to the drip worker. Guarded: the
  // sweep already committed; a drip-side failure is reported, not fatal.
  let drips: RadarDripsSummary | { ok: false; error: string };
  try {
    drips = await enqueueRadarDripsFromMatches({ dryRun });
  } catch (err) {
    drips = { ok: false, error: err instanceof Error ? err.message : String(err) };
    console.warn("[money-radar-sweep] radar drips failed", drips.error);
  }

  const { events, ...rest } = summary;
  return NextResponse.json({
    ...rest,
    ok: true,
    duration_ms: Date.now() - startedAt,
    drips,
    ...(dryRun ? { events } : {}),
  });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
