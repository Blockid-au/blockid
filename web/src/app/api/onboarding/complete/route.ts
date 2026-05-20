import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json()) as {
    name?: string;
    role?: string;
    startupName?: string;
    stage?: string;
    industry?: string;
  };

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from("app_users")
      .update({
        display_name: body.name,
        role: body.role,
        startup_name: body.startupName,
        startup_stage: body.stage,
        industry: body.industry,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("email", user.email);
  }

  return NextResponse.json({ ok: true });
}
