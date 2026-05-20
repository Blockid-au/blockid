import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendSVIReport } from "@/lib/email";
import type { SVIAnalysis } from "@/lib/svi-analysis";

// POST /api/svi/email-report
// Body: { email, slug, analysis }
// Generates the SVI PDF report and sends it as an email attachment.

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = body as {
    email?: string;
    slug?: string;
    analysis?: SVIAnalysis;
  } | null;

  if (!parsed?.email || !parsed.email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
  }
  if (!parsed.slug) {
    return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
  }
  if (!parsed.analysis || typeof parsed.analysis.totalSVI !== "number") {
    return NextResponse.json({ ok: false, error: "analysis with totalSVI is required" }, { status: 400 });
  }

  const result = await sendSVIReport({
    to: parsed.email,
    slug: parsed.slug,
    analysis: parsed.analysis,
  });

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { ok: false, error: result.reason },
    { status: result.reason === "not_configured" ? 503 : 500 },
  );
}

export const dynamic = "force-dynamic";
