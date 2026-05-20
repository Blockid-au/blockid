import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { SVIReportPDF } from "@/components/svi/svi-report-pdf";
import type { SVIAnalysis } from "@/lib/svi-analysis";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { analysis, email } = (await request.json()) as {
      analysis: SVIAnalysis;
      email?: string;
    };

    if (!analysis) {
      return NextResponse.json({ error: "analysis required" }, { status: 400 });
    }

    const buffer = await renderToBuffer(
      SVIReportPDF({ analysis, email })
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="BlockID-SVI-Report-${analysis.totalSVI}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[svi-pdf]", err);
    return NextResponse.json(
      { error: "PDF generation failed" },
      { status: 500 },
    );
  }
}
