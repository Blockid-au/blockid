import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/referral/history — return list of individual referrals for current user
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, referrals: [], total: 0 });
  }

  const { data, count, error } = await supabase
    .from("referrals")
    .select("id, referred_email, status, credits_awarded, created_at", {
      count: "exact",
    })
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: true, referrals: [], total: 0 });
  }

  return NextResponse.json({
    ok: true,
    referrals: data ?? [],
    total: count ?? 0,
  });
}
