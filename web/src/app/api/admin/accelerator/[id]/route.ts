import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return null;
  }
  return user;
}

/**
 * GET /api/admin/accelerator/[id] — cohort details + members with SVI scores
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  // Fetch cohort
  const { data: cohort, error: cohortErr } = await supabase
    .from("accelerator_cohorts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (cohortErr) return NextResponse.json({ error: cohortErr.message }, { status: 500 });
  if (!cohort) return NextResponse.json({ error: "Cohort not found" }, { status: 404 });

  // Fetch members
  const { data: members, error: membersErr } = await supabase
    .from("cohort_members")
    .select("*")
    .eq("cohort_id", id)
    .order("joined_at", { ascending: false });

  if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 });

  // Fetch SVI data for all linked accounts
  const sviAccountIds = (members ?? [])
    .map((m) => m.svi_account_id)
    .filter(Boolean) as string[];

  const sviMap: Record<string, { current_svi: number; current_stage: number; enrolled_at: string }> = {};
  if (sviAccountIds.length > 0) {
    const { data: sviAccounts } = await supabase
      .from("svi_accounts")
      .select("id, current_svi, current_stage, enrolled_at")
      .in("id", sviAccountIds);
    for (const acc of sviAccounts ?? []) {
      sviMap[acc.id] = {
        current_svi: acc.current_svi ?? 0,
        current_stage: acc.current_stage ?? 0,
        enrolled_at: acc.enrolled_at,
      };
    }
  }

  // Fetch latest SVI analyses for trend detection (last 2 per email)
  const memberEmails = (members ?? []).map((m) => m.email);
  const trendMap: Record<string, "up" | "down" | "flat"> = {};
  if (memberEmails.length > 0) {
    const { data: analyses } = await supabase
      .from("svi_analyses")
      .select("email, total_svi, created_at")
      .in("email", memberEmails)
      .order("created_at", { ascending: false })
      .limit(memberEmails.length * 3);

    // Group by email and compute trend from last 2 analyses
    const byEmail: Record<string, number[]> = {};
    for (const a of analyses ?? []) {
      if (!byEmail[a.email]) byEmail[a.email] = [];
      if (byEmail[a.email].length < 2) byEmail[a.email].push(a.total_svi ?? 0);
    }
    for (const [email, scores] of Object.entries(byEmail)) {
      if (scores.length >= 2) {
        const diff = scores[0] - scores[1];
        trendMap[email] = diff > 2 ? "up" : diff < -2 ? "down" : "flat";
      } else {
        trendMap[email] = "flat";
      }
    }
  }

  const enrichedMembers = (members ?? []).map((m) => {
    const svi = m.svi_account_id ? sviMap[m.svi_account_id] : null;
    return {
      ...m,
      svi_score: svi?.current_svi ?? 0,
      stage: svi?.current_stage ?? 0,
      trend: trendMap[m.email] ?? "flat",
      last_active: svi?.enrolled_at ?? m.joined_at,
    };
  });

  return NextResponse.json({ ok: true, cohort, members: enrichedMembers });
}

/**
 * POST /api/admin/accelerator/[id] — add member to cohort
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = (await request.json()) as {
    email?: string;
    startupName?: string;
  };

  if (!body.email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();

  // Check cohort exists
  const { data: cohort } = await supabase
    .from("accelerator_cohorts")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!cohort) return NextResponse.json({ error: "Cohort not found" }, { status: 404 });

  // Try to find existing SVI account for this email
  let sviAccountId: string | null = null;
  const { data: sviAccount } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (sviAccount) sviAccountId = sviAccount.id;

  const { data, error } = await supabase
    .from("cohort_members")
    .insert({
      cohort_id: id,
      email,
      startup_name: body.startupName || null,
      svi_account_id: sviAccountId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This email is already in the cohort" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, member: data }, { status: 201 });
}

/**
 * DELETE /api/admin/accelerator/[id] — delete cohort
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await supabase
    .from("accelerator_cohorts")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
