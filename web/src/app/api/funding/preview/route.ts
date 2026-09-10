/**
 * POST /api/funding/preview — free Money Finder preview (T0242, plan §4a/§4e).
 *
 * Public, no auth. Body = the 3-question intake (+ optional "improve my
 * match" fields, see `parseFundingIntake`). Returns only what the free tier
 * shows: counts, top-3 grant / program names with a one-line why, and the
 * top-5 "up to A$X" figure. No checklist, no timeline, no estimates — those
 * are the paid analysis (§5a: grant information is free, we sell analysis).
 *
 * Rate limit: 30 previews / 10 min per IP via `enforceRateLimit` (IP
 * fallback built in). The matcher is pure and cheap; the limit only keeps a
 * scraper from using us as a free catalogue API.
 *
 *   200 { ok: true, preview: FundingPreviewPayload, disclaimer }
 *   400 { ok: false, error, field }
 *   429 { ok: false, error, retryInSeconds }
 */

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { listGrants, listPrograms } from "@/lib/funding/data";
import { parseFundingIntake } from "@/lib/funding/intake";
import { buildFundingPreview } from "@/lib/funding/preview";
import { FUNDING_DISCLAIMER } from "@/lib/agents/grant-advisor";

export const dynamic = "force-dynamic";

const PREVIEW_RATE_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 } as const;

export async function POST(request: Request) {
  const limited = enforceRateLimit("funding-preview", null, request, PREVIEW_RATE_LIMIT.max, PREVIEW_RATE_LIMIT.windowMs);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body", field: "description" }, { status: 400 });
  }

  const parsed = parseFundingIntake(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, field: parsed.field }, { status: 400 });
  }

  const [grants, programs] = await Promise.all([
    listGrants({ excludeNonMatching: true }).catch(() => []),
    listPrograms({}).catch(() => []),
  ]);

  const preview = buildFundingPreview(parsed.intake, grants, programs);
  return NextResponse.json(
    { ok: true, preview, disclaimer: FUNDING_DISCLAIMER },
    { headers: { "Cache-Control": "no-store" } },
  );
}
