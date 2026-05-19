import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendSVIShare } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST /api/svi/share
// Body: { email, recipientEmail, slug, senderName? }
// Shares the SVI report with another person via email.

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

  // Look up the SVI score and verify ownership
  let svi = 0;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("svi_analyses")
      .select("total_svi, email")
      .eq("id", parsed.slug)
      .single();
    if (data) {
      // Verify the caller owns this SVI analysis
      if (data.email?.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
        return NextResponse.json(
          { ok: false, error: "You do not own this SVI analysis" },
          { status: 403 },
        );
      }
      if (data.total_svi != null) {
        svi = data.total_svi;
      }
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
