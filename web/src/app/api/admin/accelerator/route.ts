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
 * GET /api/admin/accelerator — list all cohorts with member count + avg SVI
 */
export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  // Fetch all cohorts
  const { data: cohorts, error: cohortsErr } = await supabase
    .from("accelerator_cohorts")
    .select("*")
    .order("created_at", { ascending: false });

  if (cohortsErr) return NextResponse.json({ error: cohortsErr.message }, { status: 500 });

  // Fetch all members with their SVI data
  const { data: members, error: membersErr } = await supabase
    .from("cohort_members")
    .select("cohort_id, email, startup_name, svi_account_id");

  if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 });

  // Fetch SVI accounts for score data
  const sviAccountIds = (members ?? [])
    .map((m) => m.svi_account_id)
    .filter(Boolean) as string[];

  const sviMap: Record<string, number> = {};
  if (sviAccountIds.length > 0) {
    const { data: sviAccounts } = await supabase
      .from("svi_accounts")
      .select("id, current_svi")
      .in("id", sviAccountIds);
    for (const acc of sviAccounts ?? []) {
      sviMap[acc.id] = acc.current_svi ?? 0;
    }
  }

  // Aggregate per cohort
  const result = (cohorts ?? []).map((cohort) => {
    const cohortMembers = (members ?? []).filter((m) => m.cohort_id === cohort.id);
    const scores = cohortMembers
      .map((m) => (m.svi_account_id ? sviMap[m.svi_account_id] ?? 0 : 0))
      .filter((s) => s > 0);
    const avgSvi = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    return {
      ...cohort,
      member_count: cohortMembers.length,
      avg_svi: avgSvi,
      svi_distribution: {
        below80: scores.filter((s) => s < 80).length,
        range80to100: scores.filter((s) => s >= 80 && s < 100).length,
        range100to120: scores.filter((s) => s >= 100 && s < 120).length,
        above120: scores.filter((s) => s >= 120).length,
      },
    };
  });

  return NextResponse.json({ ok: true, cohorts: result });
}

/**
 * POST /api/admin/accelerator — create a new cohort
 */
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = (await request.json()) as {
    name?: string;
    organization?: string;
    managerEmail?: string;
    startDate?: string;
    endDate?: string;
  };

  if (!body.name || !body.managerEmail) {
    return NextResponse.json(
      { error: "name and managerEmail are required" },
      { status: 400 },
    );
  }

  // Generate slug from name
  const slug = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data, error } = await supabase
    .from("accelerator_cohorts")
    .insert({
      name: body.name,
      slug,
      organization: body.organization || null,
      manager_email: body.managerEmail,
      start_date: body.startDate || null,
      end_date: body.endDate || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A cohort with this name/slug already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cohort: data }, { status: 201 });
}
