// GET  /api/admin/platform-config  — read current config (admin only)
// PUT  /api/admin/platform-config  — save partial config (admin only)

import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import {
  getPlatformConfig,
  savePlatformConfig,
  CONFIG_DEFAULTS,
  type PlatformConfig,
} from "@/lib/platform-config";

export const dynamic = "force-dynamic";

function isAdmin(user: { email?: string | null; role?: string } | null) {
  if (!user) return false;
  return user.email === ADMIN_EMAIL || user.role === "admin";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cfg = await getPlatformConfig();
  return NextResponse.json({ config: cfg, defaults: CONFIG_DEFAULTS });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Partial<PlatformConfig>;
  try {
    body = await req.json() as Partial<PlatformConfig>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate types against defaults (primitives must match; objects/arrays pass through)
  const validated: Partial<PlatformConfig> = {};
  for (const [k, v] of Object.entries(body)) {
    const key = k as keyof PlatformConfig;
    if (!(key in CONFIG_DEFAULTS)) continue;
    const defaultVal = CONFIG_DEFAULTS[key];
    const expectedType = typeof defaultVal;
    // Accept if types match, or if the default is an object/array (JSONB fields)
    if (typeof v === expectedType || expectedType === "object") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (validated as any)[key] = v;
    }
  }

  const result = await savePlatformConfig(validated, user?.email ?? "admin");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true });
}
