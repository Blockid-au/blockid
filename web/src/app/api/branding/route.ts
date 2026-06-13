import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PRO_PLANS = new Set(["growth", "scale", "enterprise"]);

function isPro(user: { plan: string | null; role?: string }): boolean {
  return user.role === "admin" || PRO_PLANS.has(user.plan ?? "");
}

// GET /api/branding — return saved brand settings for current user
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, settings: null });
  }

  const { data } = await supabase
    .from("brand_settings")
    .select("logo_url, primary_color, accent_color, report_header, footer_text")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return NextResponse.json({ ok: true, settings: null });

  return NextResponse.json({
    ok: true,
    settings: {
      logoUrl: data.logo_url,
      primaryColor: data.primary_color ?? "#2563eb",
      accentColor: data.accent_color ?? "#f59e0b",
      reportHeader: data.report_header ?? "",
      footerText: data.footer_text ?? "",
    },
  });
}

// POST /api/branding — save brand settings
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isPro(user)) {
    return NextResponse.json(
      { ok: false, error: "Custom branding requires Growth plan or above" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const {
    logoUrl,
    primaryColor,
    accentColor,
    reportHeader,
    footerText,
  } = (body as Record<string, string | null>) ?? {};

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  const { error } = await supabase.from("brand_settings").upsert(
    {
      user_id: user.id,
      logo_url: logoUrl ?? null,
      primary_color: primaryColor ?? "#2563eb",
      accent_color: accentColor ?? "#f59e0b",
      report_header: reportHeader ?? "",
      footer_text: footerText ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[blockid:branding] upsert failed", error);
    return NextResponse.json({ ok: false, error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
