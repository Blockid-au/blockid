import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { SVIReportPDF } from "@/lib/pdf/svi-report-pdf";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      analysis?: SVIAnalysis;
      email?: string;
      slug?: string;
      analysisId?: string;
    };

    let analysis: SVIAnalysis | undefined = body.analysis;
    let email: string | undefined = body.email;
    let slug: string | undefined = body.slug;

    // ── Slug / ID-based lookup: load from DB with auth check ────────────
    if (!analysis && (body.slug || body.analysisId)) {
      const lookupKey = body.slug ?? body.analysisId;

      if (!isSupabaseConfigured()) {
        return NextResponse.json(
          { error: "Database not configured" },
          { status: 500 },
        );
      }

      const supabase = getSupabaseAdmin()!;

      // Resolve authenticated user email from session cookie
      let sessionEmail: string | null = null;
      const store = await cookies();
      const sessionToken = store.get("blockid_session")?.value;
      if (sessionToken) {
        const { data: session } = await supabase
          .from("sessions")
          .select("user_id")
          .eq("token", sessionToken)
          .maybeSingle();
        if (session) {
          const { data: user } = await supabase
            .from("app_users")
            .select("email")
            .eq("id", session.user_id)
            .maybeSingle();
          sessionEmail = (user?.email as string) ?? null;
        }
      }

      // Load analysis
      const { data: row, error } = await supabase
        .from("svi_analyses")
        .select("id, email, analysis_json")
        .eq("id", lookupKey)
        .maybeSingle();

      if (error || !row) {
        return NextResponse.json(
          { error: "Analysis not found" },
          { status: 404 },
        );
      }

      // Ownership check: session user must match analysis email
      if (sessionEmail && row.email && sessionEmail !== row.email) {
        return NextResponse.json(
          { error: "Forbidden — you do not own this analysis" },
          { status: 403 },
        );
      }

      analysis = row.analysis_json as SVIAnalysis;
      email = email ?? (row.email as string | undefined);
      slug = row.id as string;
    }

    // ── Validate ────────────────────────────────────────────────────────
    if (!analysis) {
      return NextResponse.json(
        { error: "Provide `analysis` in body or `slug`/`analysisId` to look up" },
        { status: 400 },
      );
    }

    // ── Render PDF ──────────────────────────────────────────────────────
    const buffer = await renderToBuffer(
      SVIReportPDF({ analysis, email }),
    );

    const filename = slug
      ? `BlockID-SVI-Report-${slug}.pdf`
      : `BlockID-SVI-Report-${analysis.totalSVI}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
