// GET /api/analyses/[id]/full-report — poll the first-analysis job (S32-B).
//
// Same tenancy boundary as GET /api/analyses/[id]: the run belongs to the
// signed-in user, or to the holder of the anon cookie it was written
// against; everyone else gets 404, never 403 (a 403 confirms the id).
//
// The body is a `FullReportView` (lib/analyses/first-analysis/view.ts):
//   * `status`      queued | running | done | failed | null
//   * `locked`      true for a guest who has not given an email yet — they
//                   get `preview` (echo, SVI, valuation, one CEO paragraph);
//   * `report`      the streaming FirstAnalysisReport once unlocked;
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Pre-0390 row, or a save that raced the enqueue: start it now.
  if (row.full_report_status === null) {
    const queued = await enqueueFullReport(id);
    if (queued) {
      startFirstAnalysisJob(id, { userId: row.user_id });
      row = (await loadFullReportRow(id)) ?? row;
    }
  } else if (row.full_report_status === "queued") {
    // A queued row whose runner died with the process — kick it again; the
    // claim makes a duplicate start harmless.
    startFirstAnalysisJob(id, { userId: row.user_id });
  }

  const view = buildFullReportView(row);
  return NextResponse.json(
    { ok: true, ...view },
    { headers: { "cache-control": "no-store" } },
  );
}
