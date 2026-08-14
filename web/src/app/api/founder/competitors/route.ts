// Competitors — list + create.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

const FIELDS = new Set([
  "name",
  "website",
  "category",
  "positioning",
  "pricing",
  "strengths",
  "weaknesses",
  "our_edge",
  "threat_level",
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });
  const projectId = await getProjectIdFromRequest();
  if (!projectId) return NextResponse.json({ ok: true, items: [] });

  const { data, error } = await sb
    .from("competitors")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });
  const projectId = await getProjectIdFromRequest();
  if (!projectId) return NextResponse.json({ ok: false, error: "no project" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  }

  const payload: Record<string, unknown> = { user_id: user.id, project_id: projectId };
  for (const [k, v] of Object.entries(body)) {
    if (FIELDS.has(k)) payload[k] = v === "" ? null : v;
  }

  const { data, error } = await sb.from("competitors").insert(payload).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
