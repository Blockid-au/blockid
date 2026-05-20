import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getReferralStats } from "@/lib/referrals";

export const dynamic = "force-dynamic";

// GET /api/referrals — return referral stats for current user
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const stats = await getReferralStats(user.id);

  return NextResponse.json({ ok: true, stats });
}
