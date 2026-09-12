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
import { readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { listGrants, listPrograms } from "@/lib/funding/data";
import { parseFundingIntake } from "@/lib/funding/intake";
import { buildFundingPreview } from "@/lib/funding/preview";
import { FUNDING_DISCLAIMER } from "@/lib/agents/grant-advisor";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

const PREVIEW_RATE_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 } as const;
export const INTAKE_BODY_MAX_BYTES = 16 * 1024;

async function POST_handler(request: Request) {
  const limited = enforceRateLimit("funding-preview", null, request, PREVIEW_RATE_LIMIT.max, PREVIEW_RATE_LIMIT.windowMs);
  if (limited) return limited;

  // S8-C: 16 KB byte cap before parsing (the intake is ≤ 2 000 chars + flags).
  const read = await readJsonBody(request, INTAKE_BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body", field: "description" }, { status: 400 });
  }
  const body = read.body;

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

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/funding/preview/route.ts", method: "POST" }, POST_handler);
