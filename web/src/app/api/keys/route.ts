import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listApiKeys, createApiKey, canCreateApiKeys, getRateLimitForPlan } from "@/lib/api-keys";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";

// GET /api/keys — List user's API keys (session auth required)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  const keys = await listApiKeys(user.id);
  return NextResponse.json({ ok: true, keys });
}

// POST /api/keys — Create a new API key (session auth, Growth+ plan required)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!(await canCreateApiKeys(user))) {
    return NextResponse.json(
      { ok: false, reason: "API keys require a Growth plan or above." },
      { status: 403 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { name } = (body as { name?: string }) ?? {};

  const result = await createApiKey(user.id, user.plan, name);

  if ("error" in result) {
    return NextResponse.json(
      { ok: false, reason: result.error },
      { status: 400 },
    );
  }

  const displayName = name?.trim() || "Default";
  const keyPrefix = result.key.slice(0, 8);

  // SOC2-lite audit — fields carry ONLY the display name + first-8-char
  // prefix. The raw secret (`result.key`) is returned to the caller but
  // NEVER written to the audit trail.
  await logUserAction({
    userId: user.id,
    action: "api_key.created",
    subjectType: "api_key",
    subjectId: result.id,
    fields: {
      key_name: displayName,
      key_prefix: keyPrefix,
    },
    route: "/api/keys",
    ip: extractIp(request.headers),
    ua: extractUserAgent(request.headers),
  });

  return NextResponse.json({
    ok: true,
    key: result.key,
    id: result.id,
    name: displayName,
    prefix: result.key.slice(0, 16) + "...",
    permissions: ["svi:read", "svi:create", "score:create"],
    rateLimitPerMin: getRateLimitForPlan(user.plan),
  });
}

export const dynamic = "force-dynamic";
