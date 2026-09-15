// POST /api/analyses/[id]/full-report/resend — "Resend report" (S32-B).
//
// Re-sends the finished first-analysis PDF to the address on file (the
// account email, or the address the guest gave at the free-summary card).
// Rate-limited to RESEND_LIMIT_PER_DAY per analysis so a stuck button can
// never turn into a mail loop. Tenancy is the analyses boundary (owner or
// anon cookie); a guest with no email on file is told to give one first —
// the endpoint never accepts a NEW address, that is the free-summary card's
// job, so no one can point somebody else's report at their own inbox.
//
// Always HTTP 200 with a discriminated `outcome` (the /api/intake contract),
// except 404 for "not found / not yours".

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { readAnonKey } from "@/lib/analyses/anon-key";
import { getAnalysisForViewer } from "@/lib/analyses/store";
import { loadFullReportRow } from "@/lib/analyses/first-analysis/store";
import { deliverFullReport } from "@/lib/analyses/first-analysis/job";
import { isFullReportReadable } from "@/lib/analyses/first-analysis/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A 17-page render plus an SMTP round trip. */
export const maxDuration = 60;

export const RESEND_LIMIT_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResendOutcome =
  | "sent"
  | "not_ready"
  | "no_email"
  | "rate_limited"
  | "unsubscribed"
  | "send_failed"
  | "not_found";

function reply(outcome: ResendOutcome, extra: Record<string, unknown> = {}) {
  const status = outcome === "not_found" ? 404 : 200;
  return NextResponse.json({ ok: outcome === "sent", outcome, ...extra }, { status });
}

async function POST_handler(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return reply("not_found");

  let userId: string | null = null;
  try {
    userId = (await getCurrentUser())?.id ?? null;
  } catch {
    userId = null;
  }
  const anonKey = await readAnonKey();
  const owned = await getAnalysisForViewer(id, { userId, anonKey });
  if (!owned) return reply("not_found");

  const row = await loadFullReportRow(id);
  if (!row) return reply("not_found");
  if (!isFullReportReadable(row.full_report_status) || !row.full_report_json) return reply("not_ready");
  if (!row.full_report_email && !row.user_id) return reply("no_email");

  const limit = checkRateLimit(`first-analysis-resend:${id}`, RESEND_LIMIT_PER_DAY, DAY_MS);
  if (!limit.allowed) {
    return reply("rate_limited", { retryAfterSec: Math.ceil(limit.resetIn / 1000) });
  }

  const outcome = await deliverFullReport(row, row.full_report_json, { force: true });
  if (outcome === "sent") return reply("sent", { remaining: limit.remaining });
  if (outcome === "unsubscribed") return reply("unsubscribed");
  if (outcome === "no_destination") return reply("no_email");
  if (outcome === "not_done") return reply("not_ready");
  return reply("send_failed");
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/analyses/[id]/full-report/resend/route.ts", method: "POST" }, POST_handler);
