import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { getCurrentUser } from "@/lib/auth";

// POST /api/actions — Record a user action from SVI report
// Body: { email, actionType, actionLabel, dimension?, sourceGap?, toolSlug?, metadata? }
// No auth required (actions can be tracked for anonymous users by email)

async function POST_handler(request: Request) {
  let body: unknown = null;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON" }, { status: 400 });
  }

  const { email, actionType, actionLabel, dimension, sourceGap, toolSlug, metadata } =
    (body as Record<string, unknown>) ?? {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ ok: false, reason: "Email required" }, { status: 400 });
  }
  if (!actionType || !actionLabel) {
    return NextResponse.json({ ok: false, reason: "actionType and actionLabel required" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, tracked: false });
  }

  const supabase = getSupabaseAdmin()!;

  // Find or create svi_account for this email
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  const { error } = await supabase.from("user_actions").insert({
    account_id: account?.id ?? null,
    email: email as string,
    action_type: actionType as string,
    action_label: actionLabel as string,
    dimension: (dimension as string) ?? null,
    source_gap: (sourceGap as string) ?? null,
    tool_slug: (toolSlug as string) ?? null,
    metadata: metadata ?? {},
  });

  if (error) {
    console.error("[blockid:actions] insert failed", error);
    return NextResponse.json({ ok: false, reason: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tracked: true });
}

// GET /api/actions?email=x — Get action history for the SIGNED-IN user.
//
// G33-T13 (24/09 security review): this answered any `?email=` anonymously —
// account id, action labels and dates for any address. The only caller is the
// signed-in workspace (profile-progress.tsx) asking for its own email, so the
// query now requires a session and must name that session's own address.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");

  if (!email) {
    return NextResponse.json({ ok: false, reason: "Email required" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Sign in required" }, { status: 401 });
  }
  if ((user.email ?? "").trim().toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, actions: [] });
  }

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from("user_actions")
    .select("*")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[blockid:actions] query failed", error);
    return NextResponse.json({ ok: false, reason: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, actions: data ?? [] });
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/actions/route.ts", method: "POST" }, POST_handler);
