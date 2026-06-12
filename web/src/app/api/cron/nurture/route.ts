// POST /api/cron/nurture — DISABLED
//
// Email policy: lifecycle-only (4 emails total per user).
// All follow-up emails handled by /api/cron/weekly-insights (lifecycle milestones):
//   1. SVI analysis received (immediate, handled by SVI route)
//   2. 1 week later
//   3. 1 month later
//   4. 3 months later (final email)
//
// This route kept alive for crontab compatibility but sends nothing.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    sent: 0,
    skipped: 0,
    ts: new Date().toISOString(),
    policy: "disabled — lifecycle emails only (SVI → 1w → 1m → 3m)",
  });
}

export { GET as POST };
