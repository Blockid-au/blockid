// GTM Strategy — upsert-only (one row per project).
// GET  → { ok: true, strategy: GtmStrategy | null }
// PUT  → { ok: true, strategy: GtmStrategy }
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

function unauth() {
  return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
}
function noDb() {
  return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
}
function noProject() {
  return NextResponse.json({ ok: false, error: "No active project" }, { status: 400 });
}

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauth();
  const sb = getSupabaseAdmin();
  if (!sb) return noDb();
  const projectId = await getProjectIdFromRequest();
  if (!projectId) return noProject();

  const { data, error } = await sb
    .from("gtm_strategies")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, strategy: data ?? null });
}

const ALLOWED_FIELDS = new Set([
  "target_segment",
  "problem_statement",
  "value_prop",
  "positioning",
  "primary_channel",
  "secondary_channels",
  "sales_motion",
  "price_anchor",
  "launch_plan",
  "north_star_metric",
  "north_star_target",
]);

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauth();
  const sb = getSupabaseAdmin();
  if (!sb) return noDb();
  const projectId = await getProjectIdFromRequest();
  if (!projectId) return noProject();

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    project_id: projectId,
  };
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) payload[k] = v === "" ? null : v;
  }

  const { data, error } = await sb
    .from("gtm_strategies")
    .upsert(payload, { onConflict: "project_id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, strategy: data });
}
