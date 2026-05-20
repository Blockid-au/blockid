import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { BADGES } from "@/lib/svi-badges";

// GET /api/badges?email=x — Returns all badges with earned status

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ ok: false }, { status: 400 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      badges: BADGES.map((b) => ({ ...b, earned: false, earnedAt: null })),
    });
  }

  const supabase = getSupabaseAdmin()!;

  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

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

  const badges = BADGES.map((b) => ({
    ...b,
    earned: b.code in earnedMap,
    earnedAt: earnedMap[b.code] ?? null,
  }));

  return NextResponse.json({ ok: true, badges });
}

export const dynamic = "force-dynamic";
