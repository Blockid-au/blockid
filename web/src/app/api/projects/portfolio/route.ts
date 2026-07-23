// GET /api/projects/portfolio — portfolio dashboard row feed.
//
// Returns one row per non-archived project the current user owns, with
// the fields the /dashboard/portfolio surface renders side-by-side:
//
//   { id, slug, name, current_svi_score, canonical_stage,
//     credits_used_mtd, last_activity_at, next_action }
//
// Data shape and query fan-out live in `@/lib/portfolio` so the RSC and
// this route share exactly the same row payload. Kept as an explicit
// JSON contract because mobile / partner clients hit this endpoint
// directly.
//
// See docs/goals/feature-upgrade-roadmap-v2.md — Q4 Multi-project #1
// ("Portfolio dashboard — all startups side-by-side").

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioRows } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const rows = await getPortfolioRows(user);
  return NextResponse.json({ ok: true, rows });
}
