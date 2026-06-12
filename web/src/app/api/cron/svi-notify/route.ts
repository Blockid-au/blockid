// POST /api/cron/svi-notify — DISABLED (email spam prevention)
//
// Email policy: lifecycle-only (4 emails total per user).
// Previously sent: welcome, weekly reports, nurture sequences, re-engagement.
// Now all replaced by /api/cron/weekly-insights lifecycle milestones:
//   1. SVI received (immediate, via SVI route)
//   2. 1 week follow-up
//   3. 1 month follow-up
//   4. 3 months follow-up (final)
//
// Route kept alive for crontab compatibility but sends no emails.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    notified: 0,
    emailed: 0,
    policy: "disabled — lifecycle emails only (SVI → 1w → 1m → 3m)",
  });
}

export { GET as POST };
