// GET|POST /api/cron/investor-followups
//
// S26-A — DocSend-style follow-up after a data-room view. Crontab:
// `0 21 * * * bash $RUN investor-followups --timeout 120` (21:00 UTC =
// 07:00 AEST next morning, so the note is in the investor's inbox at the
// start of their day, never overnight).
//
// Per tick (lib/investor-drips/follow-up-server.ts does the work):
//   1. listFollowUpCandidates(50) — links with `auto_follow_up = true`, an
//      investor email and a view ≥ 2 calendar days old, joined to their
//      room and to the send ledger (`data_room_follow_ups`, 0355);
//   2. followUpDecision() — the pure veto (lib/investor-drips/follow-up):
//      opt-out, inactive / revoked / expired link, no email, never viewed,
//      < 2 BUSINESS days since the last view (i.e. the investor came back
//      → the clock restarted), NDA required and unaccepted, already sent
//      (max 1 per link, ever), on the unsubscribe list;
//   3. sendFollowUp() — claim the ledger row FIRST (UNIQUE per link), then
//      email in the founder's name via the platform sender with
//      `unsubFooter()`; a failed send rolls the claim back.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (constant-time). `?dry=1`
// lists what the next live tick would send and writes nothing. Nothing
// here logs a share token or an address: summaries carry link ids, room
// ids and outcomes only.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  MAX_FOLLOW_UPS_PER_TICK,
  followUpDecision,
  listFollowUpCandidates,
  sendFollowUp,
  type FollowUpSummary,
} from "@/lib/investor-drips/follow-up-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BUDGET_MS = 90_000;

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/+$/, "");
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const dryRun = isDry(request);
  const startedAt = Date.now();
  const now = new Date(startedAt);

  let candidates;
  try {
    candidates = await listFollowUpCandidates(supabase, now, MAX_FOLLOW_UPS_PER_TICK);
  } catch (err) {
    // 42703 / relation errors = migration 0355 not applied yet.
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[investor-followups] candidate listing failed", message);
    return NextResponse.json({ ok: false, dryRun, error: "candidates_unavailable", detail: message }, { status: 503 });
  }

  const summaries: FollowUpSummary[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let claimedElsewhere = 0;
  let budgetExceeded = false;

  for (const c of candidates) {
    if (Date.now() - startedAt > BUDGET_MS) {
      budgetExceeded = true;
      break;
    }
    const reason = await followUpDecision(c, now);
    if (reason) {
      skipped++;
      summaries.push({ link_id: c.link.id, data_room_id: c.link.data_room_id, outcome: "skipped", reason });
      continue;
    }
    const s = await sendFollowUp(supabase, c, { baseUrl: baseUrl(), now, dry: dryRun });
    summaries.push(s);
    if (s.outcome === "sent" || s.outcome === "would_send") sent++;
    else if (s.outcome === "failed") failed++;
    else if (s.outcome === "claimed_elsewhere") claimedElsewhere++;
    else skipped++;
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    candidates: candidates.length,
    processed: summaries.length,
    sent,
    skipped,
    failed,
    claimedElsewhere,
    budgetExceeded,
    links: summaries,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
