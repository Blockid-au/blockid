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
import { apiRoute } from "@/lib/audit/api-route";
import { PAYG_CONFIG_KEYS, validatePaygConfig } from "@/lib/pricing/v5-payg";

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

async function PUT_handler(req: NextRequest) {
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

  // G35 P1 — Pricing v5 PAYG keys carry range + ordering rules (display
  // prices Snapshot < Full < Verified, SLA 1–10 days, Verified cap 0–100).
  // Validate the merged result so a partial patch cannot break the ladder.
  if (PAYG_CONFIG_KEYS.some((k) => k in validated)) {
    const current = await getPlatformConfig();
    const errors = validatePaygConfig({ ...current, ...validated });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
    }
  }

  const result = await savePlatformConfig(validated, user?.email ?? "admin");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PUT = apiRoute({ route: "api/admin/platform-config/route.ts", method: "PUT" }, PUT_handler);
