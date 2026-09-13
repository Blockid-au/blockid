import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json()) as {
    name?: string;
    role?: string;
    startupName?: string;
    stage?: string;
    industry?: string;
    goals?: string[];
  };

  const supabase = getSupabaseAdmin();
  if (supabase) {
    // S31-B (2026-09-13): `role` is the AUTH column ("user" | "admin"). The
    // welcome wizard posts role:"founder", and this update wrote it straight
    // through — a live customer row carries role='founder' today, and an
    // admin who ran the wizard would have demoted themselves. The persona
    // already lives in account_type / segment (set at signup); ignore it here.
    void body.role;
    await supabase
      .from("app_users")
      .update({
        display_name: body.name,
        startup_name: body.startupName,
        startup_stage: body.stage,
        industry: body.industry,
        startup_goals: body.goals ?? [],
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("email", user.email);
  }

  return NextResponse.json({ ok: true });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/onboarding/complete/route.ts", method: "POST" }, POST_handler);
