// POST /api/analyses/[id]/free-summary — the free tier's one delivery.
//
// THE ORDER OF EVENTS THIS ENDPOINT EXISTS TO PRESERVE
//
// The founder has already run the analysis and already seen the score and the
// valuation range on screen. Nothing was asked of them to get that far, and
// nothing here retrospectively walls it. This endpoint is the *continuation*:
// they liked what they saw, they want the written version, so they give us an
// address. Value first, ask second — which is also why the offer is never
// rendered before results exist.
//
// TENANCY
//
// `getAnalysisForViewer` is the same boundary GET /api/analyses/[id] uses:
// the run belongs to the signed-in user, or to the holder of the httpOnly
// `blockid_anon` cookie it was written against. Anyone else gets 404, not 403
// — a 403 would confirm the id exists. Without this you could email yourself
// a summary of somebody else's analysis by guessing a uuid.
//
// ONCE, AND ONLY ONCE
//
// `claimSummarySend` is a conditional UPDATE on `summary_requested_at`. The
// second caller loses the race and gets `already_sent` — no PDF is rendered,
// no mail is sent. A send that provably failed releases the claim so a retry
// works; a send that succeeded never releases it.
//
// SUPPRESSION
//
// `canSendEmail(email, "promotions")` over `email_preferences`, which is the
// codebase's one suppression mechanism. It is checked here BEFORE the claim,
// so an unsubscribed address does not consume the analysis's single send —
// they can come back with a different address. `sendFreeSummary` checks it
// again on the way out.

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { readAnonKey } from "@/lib/analyses/anon-key";
import {
  claimSummarySend,
  getAnalysisForViewer,
  markSummarySent,
  releaseSummaryClaim,
} from "@/lib/analyses/store";
import {
  normaliseSummaryEmail,
  maskSummaryEmail,
  type FreeSummaryOutcome,
} from "@/lib/analyses/free-summary";
import { canSendEmail } from "@/lib/email-preferences";
import { sendFreeSummary } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeSVI, type SVIAnalysis } from "@/lib/svi-analysis";
import { estimateValuation } from "@/lib/valuation";
import { extractProjectName } from "@/lib/project-name-extractor";
import { savedAnalysisUrl } from "@/lib/analyses/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The PDF render plus an SMTP round trip. Generous, but bounded. */
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-IP ceiling. The endpoint sends mail, so it needs one. */
const SEND_LIMIT_PER_IP = 10;
const SEND_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function reply(outcome: FreeSummaryOutcome, maskedEmail?: string | null) {
  // Always HTTP 200 with a discriminated body, matching /api/intake: the
  // status line is not the contract, `outcome` is. The one exception is
  // `not_found`, which is a genuine 404 so it is indistinguishable from an id
  // that never existed.
  const status = outcome === "not_found" ? 404 : 200;
  return NextResponse.json(
    { ok: outcome === "sent" || outcome === "already_sent", outcome, maskedEmail: maskedEmail ?? null },
    { status },
  );
}

function siteOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return "https://blockid.au";
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return reply("not_found");

  let body: { email?: unknown } = {};
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return reply("invalid_email");
  }

  const email = normaliseSummaryEmail(body.email);
  if (!email) return reply("invalid_email");

  // Same header the intake route reads — one convention for "who is this".
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (ip && ip !== "unknown") {
    const limit = checkRateLimit(
      `free-summary:ip:${ip}`,
      SEND_LIMIT_PER_IP,
      SEND_LIMIT_WINDOW_MS,
    );
    if (!limit.allowed) return reply("rate_limited");
  }

  // ── Tenancy ────────────────────────────────────────────────────────────
  let userId: string | null = null;
  try {
    userId = (await getCurrentUser())?.id ?? null;
  } catch {
    userId = null;
  }
  const anonKey = await readAnonKey();
  const analysis = await getAnalysisForViewer(id, { userId, anonKey });
  if (!analysis) return reply("not_found");

  // ── Suppression, BEFORE the claim ──────────────────────────────────────
  // An address that opted out must not burn this analysis's single send.
  let allowed = true;
  try {
    allowed = await canSendEmail(email, "promotions");
  } catch {
    allowed = true; // fail open: the sender checks again on the way out
  }
  if (!allowed) return reply("unsubscribed");

  // ── The claim ──────────────────────────────────────────────────────────
  const claim = await claimSummarySend(id, email);
  if (claim.outcome === "already_claimed") return reply("already_sent");
  if (claim.outcome === "unavailable") return reply("send_failed");

  const masked = maskSummaryEmail(email);

  try {
    const intake = (analysis as { intake?: Record<string, unknown> }).intake ?? {};
    const signals = (intake as { signals?: unknown }).signals;
    if (!signals) throw new Error("analysis has no signals to score");

    // Recompute rather than read back a stored blob: `computeSVI(signals)` is
    // pure and free, and it is exactly what the screen rendered, so the PDF
    // and the page can never disagree about what the founder was shown
    // (see migration 0124's storage-size reasoning).
    const svi: SVIAnalysis = computeSVI(
      signals as Parameters<typeof computeSVI>[0],
    );
    const dims =
      svi.dimensionScores ??
      Object.fromEntries((svi.subs ?? []).map((sub) => [sub.key, sub.value]));
    const valuation = estimateValuation(
      svi.totalSVI,
      svi.stage,
      { sector: svi.sector ?? svi.signals?.sector },
      dims,
    );

    const rawText = typeof (intake as { rawText?: unknown }).rawText === "string"
      ? ((intake as { rawText: string }).rawText)
      : "";
    let startupName: string | null = null;
    try {
      startupName = extractProjectName({ rawText })?.name ?? null;
    } catch {
      startupName = null;
    }

    // Imported here rather than at module scope: @react-pdf pulls in a large
    // dependency graph, and this route is the only place the free summary is
    // rendered.
    const [{ renderToBuffer }, { SVISummaryPDF }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("@/lib/pdf/svi-summary-pdf"),
    ]);
    const pdf = await renderToBuffer(
      SVISummaryPDF({ analysis: svi, startupName: startupName ?? undefined }),
    );

    const result = await sendFreeSummary({
      email,
      pdf,
      svi: svi.totalSVI,
      stageLabel: svi.stageLabel,
      valuationLow: valuation.low,
      valuationHigh: valuation.high,
      startupName,
      analysisUrl: savedAnalysisUrl(id, siteOrigin(request)),
      analysisId: id,
    });

    if (!result.ok) {
      await releaseSummaryClaim(id, result.reason);
      return reply(result.reason === "unsubscribed" ? "unsubscribed" : "send_failed");
    }

    await markSummarySent(id);
    return reply("sent", masked);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[free-summary] send failed —", message, { analysisId: id });
    await releaseSummaryClaim(id, message);
    return reply("send_failed");
  }
}
