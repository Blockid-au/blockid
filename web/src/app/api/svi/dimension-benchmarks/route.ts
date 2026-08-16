import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeDimensionPercentiles } from "@/lib/svi-dimension-benchmarks";

export const dynamic = "force-dynamic";

async function resolveProjectId(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!account?.id) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (project?.id as string | null) ?? null;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const stageParam = searchParams.get("stage");

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      stage: stageParam ? Number(stageParam) : 0,
      dimensionPercentiles: [],
      source: "no_data",
    });
  }

  const projectId = await resolveProjectId(user.id);

  if (!projectId) {
    return NextResponse.json({
      ok: true,
      stage: stageParam ? Number(stageParam) : 0,
      dimensionPercentiles: [],
      source: "no_data",
    });
  }

  const { data: snapshot } = await supabase
    .from("svi_snapshots")
    .select("dimension_scores, stage")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!snapshot?.dimension_scores) {
    return NextResponse.json({
      ok: true,
      stage: stageParam ? Number(stageParam) : 0,
      dimensionPercentiles: [],
      source: "no_data",
    });
  }

  const stage =
    stageParam !== null
      ? Number(stageParam)
      : typeof snapshot.stage === "number"
        ? snapshot.stage
        : 0;

  const dimensionScores = snapshot.dimension_scores as Record<string, number>;
  const dimensionPercentiles = computeDimensionPercentiles(dimensionScores, stage);

  return NextResponse.json({
    ok: true,
    stage,
    dimensionPercentiles,
    source: "benchmark_table",
  });
}
