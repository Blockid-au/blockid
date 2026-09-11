import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import {
  calculateDimensionCompleteness,
  generateFixRoadmap,
  forecastRoadmapImpact,
  EVIDENCE_CATALOG,
} from "@/lib/svi-completeness";

export const dynamic = "force-dynamic";

// S18-A — member-aware: rows are keyed on project_id only, so the role
// gate is the whole story here (GET viewer+, POST/DELETE editor+). With no
// resolvable project the legacy svi_accounts lookup stays OWNER-only
// (keyed on the caller's own user_id).
async function resolveProjectId(
  userId: string,
  minRole: "viewer" | "editor",
): Promise<{ projectId: string | null; denied: NextResponse | null }> {
  const { scope, denied } = await projectScopeOrDeny(minRole);
  if (denied) return { projectId: null, denied };
  if (scope) return { projectId: scope.projectId, denied: null };
  // Fall back to svi_accounts lookup
  const supabase = getSupabaseAdmin();
  if (!supabase) return { projectId: null, denied: null };
  const { data } = await supabase
    .from("svi_accounts")
    .select("project_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { projectId: (data?.project_id as string | null) ?? null, denied: null };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, dimensions: [], roadmap: [], forecast: null, currentSvi: 0 });

  const { projectId, denied } = await resolveProjectId(user.id, "viewer");
  if (denied) return denied;

  let currentSvi = 0;
  if (projectId) {
    const { data: snapshot } = await supabase
      .from("svi_snapshots")
      .select("overall_score")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapshot?.overall_score) currentSvi = snapshot.overall_score as number;
  }

  // Load all evidence rows for this project
  let evidenceRows: { dimension: string; evidence_type: string }[] = [];
  if (projectId) {
    const { data } = await supabase
      .from("svi_dimension_evidence")
      .select("dimension, evidence_type")
      .eq("project_id", projectId);
    if (data) evidenceRows = data as { dimension: string; evidence_type: string }[];
  }

  // Group evidence types by dimension
  const presentByDimension: Record<string, Set<string>> = {};
  for (const row of evidenceRows) {
    if (!presentByDimension[row.dimension]) presentByDimension[row.dimension] = new Set();
    presentByDimension[row.dimension].add(row.evidence_type);
  }

  const dimensions = Object.keys(EVIDENCE_CATALOG).map((dim) =>
    calculateDimensionCompleteness(dim, presentByDimension[dim] ?? new Set())
  );

  const roadmap = generateFixRoadmap(dimensions);
  const forecast = forecastRoadmapImpact(roadmap, currentSvi);

  return NextResponse.json({ ok: true, dimensions, roadmap, forecast, currentSvi });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const { projectId, denied } = await resolveProjectId(user.id, "editor");
  if (denied) return denied;
  if (!projectId) return NextResponse.json({ ok: false, error: "No project found" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const {
    dimension,
    evidenceType,
    evidenceLabel,
    confidenceLevel = "self_declared",
    evidenceValueOrUrl,
  } = body as {
    dimension: string;
    evidenceType: string;
    evidenceLabel?: string;
    confidenceLevel?: string;
    evidenceValueOrUrl?: string;
  };

  if (!dimension || !evidenceType) {
    return NextResponse.json({ ok: false, error: "dimension and evidenceType are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("svi_dimension_evidence")
    .upsert(
      {
        project_id: projectId,
        dimension,
        evidence_type: evidenceType,
        evidence_label: evidenceLabel ?? evidenceType,
        confidence_level: confidenceLevel,
        evidence_value_or_url: evidenceValueOrUrl ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,dimension,evidence_type" }
    );

  if (error) {
    console.error("[blockid:svi-evidence] upsert failed", error);
    return NextResponse.json({ ok: false, error: "Failed to save evidence" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const { projectId, denied } = await resolveProjectId(user.id, "editor");
  if (denied) return denied;
  if (!projectId) return NextResponse.json({ ok: false, error: "No project found" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const dimension = searchParams.get("dimension");
  const evidenceType = searchParams.get("evidenceType");

  if (!dimension || !evidenceType) {
    return NextResponse.json({ ok: false, error: "dimension and evidenceType query params are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("svi_dimension_evidence")
    .delete()
    .eq("project_id", projectId)
    .eq("dimension", dimension)
    .eq("evidence_type", evidenceType);

  if (error) {
    console.error("[blockid:svi-evidence] delete failed", error);
    return NextResponse.json({ ok: false, error: "Failed to delete evidence" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
