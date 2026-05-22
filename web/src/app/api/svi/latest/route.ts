import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const emailParam = url.searchParams.get("email")?.toLowerCase().trim();

  if (!emailParam) return NextResponse.json({ ok: false }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, analysis: null });

  const supabase = getSupabaseAdmin()!;

  // Determine if the caller is authenticated
  let isAuthenticated = false;
  try {
    const store = await cookies();
    const sessionToken = store.get("blockid_session")?.value;
    if (sessionToken) {
      const { data: session } = await supabase
        .from("sessions")
        .select("user_id")
        .eq("token", sessionToken)
        .maybeSingle();
      if (session) {
        // Verify the authenticated user owns this email
        const { data: user } = await supabase
          .from("app_users")
          .select("email")
          .eq("id", session.user_id)
          .maybeSingle();
        if (user?.email?.toLowerCase() === emailParam) {
          isAuthenticated = true;
        }
      }
    }
  } catch {
    // Cookie/session check failed — treat as unauthenticated
  }

  // Scope by active project if authenticated
  const projectId = isAuthenticated ? await getProjectIdFromRequest() : null;

  const query = supabase
    .from("svi_analyses")
    .select("id, email, total_svi, input_type, created_at, rnd_report_json, analysis_json")
    .eq("email", emailParam);
  if (projectId) query.eq("project_id", projectId);
  else if (isAuthenticated) query.is("project_id", null);

  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return NextResponse.json({ ok: true, analysis: null });

  const tier = data.rnd_report_json?.tier ?? "standard";

  // Unauthenticated requests only get totalSvi and tier (for delta display).
  // Full analysisJson is restricted to authenticated users who own the email.
  if (!isAuthenticated) {
    return NextResponse.json({
      ok: true,
      analysis: {
        totalSvi: data.total_svi,
        tier,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    analysis: {
      slug: data.id,
      totalSvi: data.total_svi,
      inputType: data.input_type ?? "idea",
      createdAt: data.created_at,
      tier,
      analysisJson: data.analysis_json ?? null,
    },
  });
}

export const dynamic = "force-dynamic";
