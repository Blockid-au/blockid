// GET /api/founder-pain-points — Founder Pain-Point Insight Service (T0177 / T0184 / T0187).
//
// Public read-only endpoint that exposes a curated, source-cited catalogue of
// the patterns founders repeatedly hit at each AU startup stage. Consumed by
// the R&D pain-point widget, marketing surfaces, and downstream agents that
// need evidence rather than an ad-hoc LLM call.
//
// Query params: ?stage=pre-seed|seed|series-a|series-b · ?category=<tag>
//              · ?q=<substring> · ?limit=1..25
// Unknown stage / category values 400 rather than silently dropping the
// filter, so callers see the mistake in their fixture.

import { NextResponse } from "next/server";
import {
  PAIN_POINT_CATEGORIES,
  PAIN_POINT_STAGES,
  queryFounderPainPoints,
  type PainPointCategory,
  type PainPointStage,
} from "@/lib/founder-pain-points";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const stageParam = url.searchParams.get("stage");
  const categoryParam = url.searchParams.get("category");
  const q = url.searchParams.get("q")?.trim() || undefined;
  const limitParam = url.searchParams.get("limit");

  if (stageParam && !PAIN_POINT_STAGES.includes(stageParam as PainPointStage)) {
    return NextResponse.json(
      { ok: false, error: `Unknown stage. Expected one of: ${PAIN_POINT_STAGES.join(", ")}` },
      { status: 400 },
    );
  }
  if (categoryParam && !PAIN_POINT_CATEGORIES.includes(categoryParam as PainPointCategory)) {
    return NextResponse.json(
      { ok: false, error: `Unknown category. Expected one of: ${PAIN_POINT_CATEGORIES.join(", ")}` },
      { status: 400 },
    );
  }

  let limit: number | undefined;
  if (limitParam !== null) {
    const n = Number(limitParam);
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json({ ok: false, error: "limit must be a positive integer" }, { status: 400 });
    }
    limit = Math.floor(n);
  }

  const items = queryFounderPainPoints({
    stage: (stageParam ?? undefined) as PainPointStage | undefined,
    category: (categoryParam ?? undefined) as PainPointCategory | undefined,
    q,
    limit,
  });

  return NextResponse.json({
    ok: true,
    count: items.length,
    stages: PAIN_POINT_STAGES,
    categories: PAIN_POINT_CATEGORIES,
    items,
  });
}
