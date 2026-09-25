// POST /api/cron/nurture — DISABLED
//
// ⛔ RETIRED — G34-BT2 EM01 (2026-09-25): unscheduled in scripts/crontab.production.
// Already a no-op; the envelope is unchanged so old callers keep a 200.
// `email_drips` + lib/email-drip.ts is the one commercial-mail engine.
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
import { isCronAuthorised } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
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
