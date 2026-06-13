// POST /api/valuation/pdf
// Generates a PDF for a VcValuationReport.
// Body: { report: VcValuationReport, email?: string }
// Returns: application/pdf

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ValuationReportPDF } from "@/lib/pdf/valuation-report-pdf";
import type { VcValuationReport } from "@/lib/agents/cfo-valuation";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    }

    const limited = enforceRateLimit("valuation-pdf", user.email, request, 20, 60 * 60 * 1000);
    if (limited) return limited;

    const body = (await request.json()) as { report?: VcValuationReport; email?: string };
    const { report, email } = body;

    if (!report || !report.blended || !report.methods) {
      return NextResponse.json({ ok: false, error: "Missing report data" }, { status: 400 });
    }

    const buffer = await renderToBuffer(
      ValuationReportPDF({ report, email: email ?? user.email }),
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="blockid-valuation-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[valuation:pdf]", err);
    return NextResponse.json({ ok: false, error: "PDF generation failed" }, { status: 500 });
  }
}
