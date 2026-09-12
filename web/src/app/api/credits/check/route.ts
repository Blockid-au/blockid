import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAfford, FEATURE_COSTS } from "@/lib/credits";
import { apiRoute } from "@/lib/audit/api-route";

// POST /api/credits/check
// Pre-flight check: can the authenticated user afford a given feature?
// Body: { feature: "svi_analysis" }
// Returns: { allowed, balance, cost, reason? }

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { feature } = (body as { feature?: string }) ?? {};

  if (!feature || typeof feature !== "string") {
    return NextResponse.json(
      { ok: false, reason: "Feature name is required" },
      { status: 400 },
    );
  }

  if (FEATURE_COSTS[feature] === undefined) {
    return NextResponse.json(
      {
        ok: false,
        reason: `Unknown feature "${feature}". Valid features: ${Object.keys(FEATURE_COSTS).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const result = await canAfford(user.id, feature);

  return NextResponse.json({
    ok: true,
    ...result,
  });
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/credits/check/route.ts", method: "POST" }, POST_handler);
