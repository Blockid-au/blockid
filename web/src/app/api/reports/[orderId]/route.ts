/**
 * GET /api/reports/[orderId] — Trust Business Report delivery.
 *
 * Master Upgrade Plan §8.4 + §8.7. This is the missing half of the
 * paywall: `/api/reports/checkout` (A$5.50 inc-GST) and
 * `/api/reports/redeem` (credits) take the money and hand back an
 * `orderId`; the drain cron generates the artifact and parks it in
 * `assembled_reports`. Until this route existed a paying customer had
 * no way to fetch what they bought.
 *
 * ── Contract ──────────────────────────────────────────────────────────
 *
 *   GET /api/reports/:orderId?format=json|pdf|docx
 *
 *   order status         │ HTTP │ body
 *   ─────────────────────┼──────┼──────────────────────────────────────
 *   READY, SHARED        │ 200  │ report + order metadata (or binary)
 *   PAID, GENERATING     │ 202  │ { status, retryInSeconds } — poll
 *   CHECKOUT_INITIATED   │ 402  │ not paid yet
 *   PAYMENT_PENDING      │ 402  │ payment has not settled
 *   FAILED               │ 410  │ + failureReason, refunded:false
 *   REFUNDED             │ 410  │ + refunded:true (money came back)
 *   EXPIRED              │ 410  │ + regenerable:true (paid_at + 90d)
 *
 *   anonymous            │ 401
 *   not yours / no such  │ 404  ← see "Why 404, never 403" below
 *   unknown ?format      │ 400
 *
 * ── Why 404, never 403 ────────────────────────────────────────────────
 *
 * A 403 on someone else's order is an existence oracle: it confirms that
 * order id is real, which confirms *somebody bought a Trust Report*. Order
 * ids are uuids so they are not walkable, but ids leak through referrer
 * headers, shared screenshots and support threads, and "did competitor X
 * buy a report on business Y" is exactly the question this product must
 * not answer. So ownership is enforced *inside the query* — a single
 * `.eq("id", …).eq("user_id", …)` — and a miss is indistinguishable from
 * a non-existent id, because at that point the server genuinely does not
 * know which it was. Same non-enumeration posture as
 * /api/reseller/validate-promo-code, which collapses unknown/inactive
 * codes into one response.
 *
 * ── Exports ───────────────────────────────────────────────────────────
 *
 * §8.7 sells PDF + DOCX as part of the A$5.50 deliverable, so the export
 * formats hang off this same owner-scoped, status-gated route rather than
 * a second endpoint with its own auth to get wrong. Both reuse the
 * existing renderers (`@/lib/pdf/svi-report-pdf`, `@/lib/docx/svi-report-docx`).
 *
 * Note the deliberate difference from POST /api/svi/docx: that route
 * charges `docx_export` credits because it exports an arbitrary report.
 * Here the buyer has *already paid* for this specific report including
 * its exports, so no second charge is levied.
 *
 * Cache: `private, no-store` on every path. Paid, per-user content must
 * never land in a shared cache or a CDN edge.
 */

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  ORDER_SELECT_COLUMNS,
  REPORT_SELECT_COLUMNS,
  dispositionForStatus,
  exportFilename,
  parseExportFormat,
  parseOrderStatus,
  reconstructAssembledReport,
  sanitiseFailureReason,
  toOrderView,
  toReportView,
  type ReportExportFormat,
} from "@/lib/paywall/report-delivery";
import type { SVIAnalysis } from "@/lib/svi-analysis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" } as const;
const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Row = Record<string, unknown>;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

/**
 * The one and only "you cannot have this" response. Malformed ids,
 * missing orders and other people's orders all land here so none of them
 * can be told apart from outside.
 */
function notFound(): NextResponse {
  return json({ ok: false, reason: "Report order not found" }, 404);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> },
) {
  // ── 1. Auth ──────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return json({ ok: false, reason: "Authentication required" }, 401);
  }

  const { orderId } = await ctx.params;
  const { searchParams } = new URL(request.url);

  const format = parseExportFormat(searchParams.get("format"));
  if (format === null) {
    return json(
      { ok: false, reason: "format must be one of json, pdf, docx" },
      400,
    );
  }

  // Malformed id → 404, not 400. A 400 would confirm "well-formed ids
  // that 404 are the interesting ones", narrowing an attacker's search.
  if (!UUID_RE.test(orderId ?? "")) return notFound();

  // PDF/DOCX rendering is synchronous CPU work on the request thread —
  // throttle it the same way /api/svi/pdf and /api/svi/docx do so one
  // buyer cannot stall the instance. JSON polling is cheap and is capped
  // more loosely because the UI polls every 15s while GENERATING.
  const limited =
    format === "json"
      ? enforceRateLimit("report-order-read", user.email, request, 600, 60 * 60 * 1000)
      : enforceRateLimit("report-order-export", user.email, request, 40, 60 * 60 * 1000);
  if (limited) return limited;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return json({ ok: false, reason: "Database not configured" }, 503);
  }

  // ── 2. Owner-scoped lookup ───────────────────────────────────────────
  // Ownership is a WHERE clause, not a post-fetch comparison: there is no
  // code path on which a row belonging to another user is ever in memory.
  const { data: orderRaw, error: orderErr } = await supabase
    .from("report_orders")
    .select(ORDER_SELECT_COLUMNS)
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (orderErr) {
    console.error("[blockid:reports/order] order lookup failed", orderErr);
    return json({ ok: false, reason: "Lookup failed" }, 500);
  }
  if (!orderRaw) return notFound();

  const orderRow = orderRaw as Row;
  const status = parseOrderStatus(orderRow.status);
  if (!status) {
    // A status outside the enum means the DB CHECK and the state machine
    // have drifted. Fail loud rather than guessing a disposition.
    console.error("[blockid:reports/order] unknown order status", {
      orderId,
      status: orderRow.status,
    });
    return json({ ok: false, reason: "Order in an unknown state" }, 500);
  }

  const disposition = dispositionForStatus(status);
  const order = toOrderView(orderRow, status);

  // ── 3. Non-deliverable states ────────────────────────────────────────
  if (disposition.kind !== "deliver") {
    const body: Record<string, unknown> = {
      ok: false,
      status,
      reason: disposition.reason,
      message: disposition.message,
      order,
    };
    if (disposition.retryInSeconds !== undefined) {
      body.retryInSeconds = disposition.retryInSeconds;
    }
    if (disposition.kind === "gone") {
      body.refunded = disposition.refunded ?? false;
      body.regenerable = disposition.regenerable ?? false;
      const failureReason = sanitiseFailureReason(orderRow.failure_reason);
      if (failureReason) body.failureReason = failureReason;
    }
    return json(body, disposition.httpStatus);
  }

  // ── 4. Resolve the artifact ──────────────────────────────────────────
  const reportId =
    typeof orderRow.report_id === "string" ? orderRow.report_id : "";
  if (!reportId) {
    // READY with no report_id should be impossible (the worker sets both
    // in one UPDATE) but a buyer must never see a blank 200.
    console.error("[blockid:reports/order] READY order has no report_id", {
      orderId,
    });
    return json(
      {
        ok: false,
        status,
        reason: "report_unavailable",
        message:
          "Your report could not be located. Support has been notified — please contact us and we will regenerate or refund it.",
        order,
      },
      404,
    );
  }

  // Scope the artifact read to the buyer as well. The order already
  // proved ownership; this is defence in depth against a mis-linked
  // report_id ever serving another account's content.
  const { data: reportRaw, error: reportErr } = await supabase
    .from("assembled_reports")
    .select(REPORT_SELECT_COLUMNS)
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (reportErr) {
    console.error("[blockid:reports/order] report lookup failed", reportErr);
    return json({ ok: false, reason: "Lookup failed" }, 500);
  }
  if (!reportRaw) {
    console.error("[blockid:reports/order] report_id resolves to nothing", {
      orderId,
      reportId,
    });
    return json(
      {
        ok: false,
        status,
        reason: "report_unavailable",
        message:
          "Your report could not be located. Support has been notified — please contact us and we will regenerate or refund it.",
        order,
      },
      404,
    );
  }

  // REPORT_SELECT_COLUMNS is assembled by concatenation, so supabase-js
  // cannot parse it into a row type and infers its GenericStringError
  // sentinel. The runtime shape is a plain row; go through `unknown`
  // rather than weakening the whole client to `any`.
  const reportRow = reportRaw as unknown as Row;
  const report = reconstructAssembledReport(reportRow);

  // ── 5. Serve ─────────────────────────────────────────────────────────
  if (format === "json") {
    return json(
      {
        ok: true,
        status,
        reason: disposition.reason,
        message: disposition.message,
        order,
        report: toReportView(report, reportRow),
      },
      200,
    );
  }

  return renderExport(format, report, reportRow, user, supabase);
}

// ─────────────────────────────────────────────────────────────────────────────
// Export rendering
// ─────────────────────────────────────────────────────────────────────────────

interface ExportUser {
  id: string;
  email: string;
  plan: string | null;
}

/** The service-role client, non-null (the caller already 503'd on null). */
type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function renderExport(
  format: Exclude<ReportExportFormat, "json">,
  report: ReturnType<typeof reconstructAssembledReport>,
  reportRow: Row,
  user: ExportUser,
  supabase: AdminClient,
): Promise<NextResponse> {
  const filename = exportFilename(report.title, format);

  try {
    if (format === "docx") {
      const { generateSVIDocx } = await import("@/lib/docx/svi-report-docx");
      const buffer = await generateSVIDocx(report);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type": DOCX_MIME,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(buffer.length),
        },
      });
    }

    // PDF. SVIReportPDF is built around the SVI analysis (score, risk
    // penalties, sub-scores) with the narrative sections layered on top,
    // so we need the analysis the report was written against. The
    // generator stores that link as assembled_reports.analysis_id.
    const analysis = await loadAnalysisForReport(supabase, reportRow, user);
    if (!analysis) {
      return json(
        {
          ok: false,
          reason: "pdf_source_analysis_missing",
          message:
            "The SVI analysis behind this report is no longer available, so the PDF layout cannot be rebuilt. The DOCX export and the on-screen report are unaffected.",
        },
        409,
      );
    }

    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { SVIReportPDF } = await import("@/lib/pdf/svi-report-pdf");
    const { loadBrandSettings } = await import("@/lib/branding/load");
    const branding = await loadBrandSettings(user.id, user.plan);

    const buffer = await renderToBuffer(
      SVIReportPDF({
        analysis,
        startupName: report.title.replace(/^SVI Enhanced Report:\s*/i, ""),
        email: user.email,
        tier: report.tier === "standard" ? "standard" : "premium",
        sections: report.sections.map((section) => ({
          id: section.id,
          title: section.title,
          content: section.content,
          score: section.score,
        })),
        branding,
      }),
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": PDF_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    console.error(`[blockid:reports/order] ${format} render failed`, err);
    return json(
      { ok: false, reason: `${format}_generation_failed` },
      500,
    );
  }
}

/**
 * Load the SVIAnalysis the report was generated from.
 *
 * `assembled_reports.analysis_id` is always populated by
 * report-generator.ts, so the happy path is a single scoped read. The
 * email check is the same fail-closed ownership guard /api/svi/pdf uses
 * on svi_analyses.
 */
async function loadAnalysisForReport(
  supabase: AdminClient,
  reportRow: Row,
  user: ExportUser,
): Promise<SVIAnalysis | null> {
  const analysisId =
    typeof reportRow.analysis_id === "string" ? reportRow.analysis_id : "";
  if (!analysisId) return null;

  const { data } = await supabase
    .from("svi_analyses")
    .select("id, email, analysis_json")
    .eq("id", analysisId)
    .maybeSingle();

  if (!data) return null;
  if (typeof data.email === "string" && data.email !== user.email) return null;

  const analysisJson = data.analysis_json;
  if (!analysisJson || typeof analysisJson !== "object") return null;
  return analysisJson as SVIAnalysis;
}
