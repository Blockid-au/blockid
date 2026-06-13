// DELETE /api/evidence/disconnect — remove all connected_source evidence for a provider
// Body: { evidence_type: "github" | "linkedin" | "stripe" | "analytics" }

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findOrCreateSVIAccount, getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["github", "github_repo_audit", "linkedin", "stripe", "analytics"] as const;

async function authenticateRequest(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value;
  if (!sessionToken) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("token", sessionToken)
    .maybeSingle();
  if (!session) return null;

  const { data: user } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("id", session.user_id)
    .single();
  if (!user) return null;

  return { userId: user.id as string, email: user.email as string };
}

export async function DELETE(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
    }

    const auth = await authenticateRequest(supabase);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as { evidence_type?: string };
    const evidenceType = body.evidence_type;

    if (!evidenceType || !ALLOWED_TYPES.includes(evidenceType as (typeof ALLOWED_TYPES)[number])) {
      return NextResponse.json(
        { ok: false, error: "Invalid evidence_type. Allowed: github, linkedin, stripe, analytics" },
        { status: 400 },
      );
    }

    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(auth.email, projectId);
    if (!accountId) {
      return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
    }

    // Delete all evidence items of this type for the account
    // For github, also remove github_repo_audit items
    const typesToDelete = evidenceType === "github"
      ? ["github", "github_repo_audit"]
      : [evidenceType];

    for (const t of typesToDelete) {
      await supabase
        .from("svi_evidence")
        .delete()
        .eq("account_id", accountId)
        .eq("evidence_type", t);
    }

    // Remove OAuth connection record
    const providerKey = evidenceType === "analytics" ? "analytics" : evidenceType;
    await supabase
      .from("oauth_connections")
      .delete()
      .eq("account_id", accountId)
      .eq("provider", providerKey);

    return NextResponse.json({ ok: true, removed: evidenceType });
  } catch (err) {
    console.error("[blockid:evidence:disconnect]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
