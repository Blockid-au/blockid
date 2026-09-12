import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const { email, name, startup_name, plan } = await request.json() as {
      email: string;
      name?: string;
      startup_name?: string;
      plan?: string;
    };

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    // Verify the requesting user owns this email to prevent enumeration
    if (email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "Email does not match authenticated user" },
        { status: 403 },
      );
    }

    // Get active project ID — each startup gets its own svi_account.
    // S18-A — member-aware (editor+): on a shared project the row is the
    // OWNER's (scope.dataEmail); `plan` is billing state and stays
    // owner-only (ignored for members).
    const { scope, denied } = await projectScopeOrDeny("editor");
    if (denied) return denied;
    const projectId = scope?.projectId ?? null;
    const dataEmail = scope?.dataEmail ?? email;
    const planUpdate = !scope || scope.isOwner ? plan : undefined;

    // Check if account already exists for this (email, project_id) pair
    const query = supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", dataEmail);

    if (projectId) {
      query.eq("project_id", projectId);
    } else {
      query.is("project_id", null);
    }

    const { data: existing } = await query.maybeSingle();

    let data;
    let error;

    if (existing) {
      // UPDATE existing account — don't overwrite other projects' data
      const result = await supabase
        .from("svi_accounts")
        .update({
          name: name ?? undefined,
          startup_name: startup_name ?? undefined,
          plan: planUpdate ?? undefined,
          last_active_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // INSERT new account for this project
      const result = await supabase
        .from("svi_accounts")
        .insert({
          email: dataEmail,
          name: name ?? null,
          startup_name: startup_name ?? null,
          plan: planUpdate ?? "free",
          project_id: projectId,
          last_active_at: new Date().toISOString(),
        })
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) throw error;

    return NextResponse.json({ ok: true, account: data });
  } catch (err) {
    console.error("svi-accounts error:", err);
    return NextResponse.json({ ok: false, error: "Failed to create account" }, { status: 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/svi-accounts/route.ts", method: "POST" }, POST_handler);
