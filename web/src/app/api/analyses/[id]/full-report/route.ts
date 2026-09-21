// GET /api/analyses/[id]/full-report — poll the first-analysis job (S32-B).
//
// Same tenancy boundary as GET /api/analyses/[id]: the run belongs to the
// signed-in user, or to the holder of the anon cookie it was written
// against; everyone else gets 404, never 403 (a 403 confirms the id).
//
// The body is a `FullReportView` (lib/analyses/first-analysis/view.ts):
//   * `status`      queued | running | done | done_partial | failed | null
//                   (`done_partial` — S32-E: >= 4 of 7 voices delivered, the
//                   cron backfills the rest; the page keeps polling slowly)
//   * `locked`      true for a guest who has not given an email yet — they
//                   get `preview` (echo, SVI, valuation, one CEO paragraph);
//   * `report`      the streaming report once unlocked — `report.agents` is
//                   always one object per voice ({role, title, body,
//                   nextSteps, provider, model, status, …}), never a string;
//   * `pollAfterSec` honest backoff — 0 when finished, longer while the AI
//                   queue is saturated (`progress.queuedForSec`).
//
// A row from before migration 0390 (`status: null`) is enqueued and started
// on first sight, so the saved view of an older run grows its full report
// the first time somebody opens it.

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { readAnonKey } from "@/lib/analyses/anon-key";
import { getAnalysisForViewer } from "@/lib/analyses/store";
import { enqueueFullReport, loadFullReportRow } from "@/lib/analyses/first-analysis/store";
import { startFirstAnalysisJob } from "@/lib/analyses/first-analysis/job";
import { buildFullReportView } from "@/lib/analyses/first-analysis/view";
import { isNeverStarted } from "@/lib/analyses/first-analysis/store";
import { freeReportsCapReached, grantForAnalysis } from "@/lib/reports/free-grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** G25-C: poll cadence while a run is held for today's free cap (the cron starts it, not the poll). */
export const HELD_POLL_SEC = 60;

function notFound() {
  return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return notFound();

  let userId: string | null = null;
  try {
    userId = (await getCurrentUser())?.id ?? null;
  } catch {
    userId = null;
  }
  const anonKey = await readAnonKey();

  // Tenancy first. `getAnalysisForViewer` answers null for "missing" AND
  // "not yours" — indistinguishable on purpose.
  const owned = await getAnalysisForViewer(id, { userId, anonKey });
  if (!owned) return notFound();

  let row = await loadFullReportRow(id);
  if (!row) return notFound();
  let heldForCap = false;

  // Pre-0390 row, or a save that raced the enqueue: start it now.
  if (row.full_report_status === null) {
    const queued = await enqueueFullReport(id);
    if (queued) {
      startFirstAnalysisJob(id, { userId: row.user_id });
      row = (await loadFullReportRow(id)) ?? row;
    }
  } else if (row.full_report_status === "queued") {
    // A queued row whose runner died with the process — kick it again; the
    // claim makes a duplicate start harmless. G25-C: a never-started row
    // while today's free cap is reached is the intake route's deferral
    // ("we e-mail you when it is ready") — the cron starts it tomorrow, the
    // poll must not start it now. Only a FREE row (one with a grant) is
    // ever held — an entitled member's row is kicked regardless.
    if (isNeverStarted(row)) {
      try {
        heldForCap = (await freeReportsCapReached()) && Boolean(await grantForAnalysis(id));
      } catch {
        heldForCap = false;
      }
    }
    if (!heldForCap) startFirstAnalysisJob(id, { userId: row.user_id });
  }

  const view = buildFullReportView(row);
  return NextResponse.json(
    // `heldForCap` — the page prints "queued, we e-mail you when it is
    // ready" instead of the writing timeline; the poll slows to the cron's cadence.
    { ok: true, ...view, heldForCap, ...(heldForCap ? { pollAfterSec: HELD_POLL_SEC } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
