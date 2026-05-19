import { NextResponse } from "next/server";
import { sendSVIShare } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST /api/svi/share
// Body: { email, recipientEmail, slug, senderName? }
// Shares the SVI report with another person via email.

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = body as {
    email?: string;
    recipientEmail?: string;
    slug?: string;
    senderName?: string;
  } | null;

  if (!parsed?.recipientEmail || !parsed.recipientEmail.includes("@")) {
    return NextResponse.json({ ok: false, error: "Valid recipientEmail is required" }, { status: 400 });
  }
  if (!parsed.slug) {
    return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
  }

  // Look up the SVI score from the database if available
  let svi = 0;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("svi_analyses")
      .select("total_svi")
      .eq("id", parsed.slug)
      .single();
    if (data?.total_svi != null) {
      svi = data.total_svi;
    }
  }

  const result = await sendSVIShare({
    to: parsed.recipientEmail,
    senderName: parsed.senderName || null,
    slug: parsed.slug,
    svi,
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
