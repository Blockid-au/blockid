import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/advisor/clients — return clients linked to this advisor
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, clients: [] });
  }

  // Fetch advisor-client relationships
  const { data: relationships } = await supabase
    .from("advisor_clients")
    .select("client_id")
    .eq("advisor_id", user.id)
    .eq("status", "active");

  if (!relationships?.length) {
    return NextResponse.json({ ok: true, clients: [] });
  }

  const clientIds = relationships.map((r) => r.client_id as string);

  // Fetch client profiles
  const { data: users } = await supabase
    .from("app_users")
    .select(
      "id, email, display_name, startup_name, startup_stage, plan, created_at",
    )
    .in("id", clientIds);

  if (!users?.length) {
    return NextResponse.json({ ok: true, clients: [] });
  }

  // Fetch latest SVI scores for each client
  const { data: sviBatch } = await supabase
    .from("svi_results")
    .select("user_id, svi, created_at")
    .in("user_id", clientIds)
    .order("created_at", { ascending: false });

  // Keep only the most recent SVI per user
  const latestSvi = new Map<
    string,
    { svi: number; created_at: string }
  >();
  for (const row of sviBatch ?? []) {
    if (!latestSvi.has(row.user_id as string)) {
      latestSvi.set(row.user_id as string, {
        svi: row.svi as number,
        created_at: row.created_at as string,
      });
    }
  }

  const clients = users.map((u) => {
    const sviData = latestSvi.get(u.id as string);
    return {
      id: u.id,
      email: u.email,
      displayName: u.display_name ?? null,
      startupName: u.startup_name ?? null,
      startupStage: u.startup_stage ?? null,
      plan: u.plan ?? null,
      svi: sviData?.svi ?? null,
      lastAnalysisAt: sviData?.created_at ?? null,
    };
  });

  return NextResponse.json({ ok: true, clients });
}
