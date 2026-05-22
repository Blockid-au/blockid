import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    // Get active project ID — each startup gets its own svi_account
    const projectId = await getProjectIdFromRequest();

    // Check if account already exists for this (email, project_id) pair
    const query = supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", email);

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
          plan: plan ?? undefined,
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
          email,
          name: name ?? null,
          startup_name: startup_name ?? null,
          plan: plan ?? "founding50",
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
