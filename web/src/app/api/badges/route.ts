import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { BADGE_DEFS } from "@/lib/badges";

// GET /api/badges — Returns earned badges and available (unearned) badges
// for the currently logged-in user.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isSupabaseConfigured()) {
    // Graceful fallback: everything shows as available
    return NextResponse.json({
      ok: true,
      badges: [],
      available: BADGE_DEFS.map((b) => ({
        code: b.code,
        label: b.label,
        description: b.description,
      })),
    });
  }

  const supabase = getSupabaseAdmin()!;

  // Look up the user's SVI account
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  // Build earned map: badge_code -> achieved_at
  let earnedMap: Record<string, string> = {};
  if (account) {
    const { data: milestones } = await supabase
      .from("svi_milestones")
      .select("badge_code, achieved_at")
      .eq("account_id", account.id);

    earnedMap = Object.fromEntries(
      (milestones ?? []).map((m) => [m.badge_code, m.achieved_at]),
    );
  }

  // Split into earned and available
  const badges = BADGE_DEFS.filter((b) => b.code in earnedMap).map((b) => ({
    code: b.code,
    label: b.label,
    achieved_at: earnedMap[b.code],
  }));

  const available = BADGE_DEFS.filter((b) => !(b.code in earnedMap)).map(
    (b) => ({
      code: b.code,
      label: b.label,
      description: b.description,
    }),
  );

  return NextResponse.json({ ok: true, badges, available });
}

export const dynamic = "force-dynamic";
