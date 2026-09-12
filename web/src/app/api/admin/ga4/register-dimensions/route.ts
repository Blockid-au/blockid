// POST /api/admin/ga4/register-dimensions — admin-gated GA4 custom-dimension
// registration (S23-B). Same logic as scripts/ga4-register-dimensions.mjs:
// list → diff against GA4_CUSTOM_DIMENSIONS → create the missing ones.
//
//   body { dryRun?: boolean }   default false — the button on /admin/growth
//                               is the "do it" action; GET gives the diff.
//
// Response (always 200 once past the gate — the panel keys off the fields):
//   { ok, dryRun, property, created, existing, missing, unmanaged,
//     blocked: { reason, steps, message } | null, error }
//
// `blocked` carries the two operator steps when the Admin API is disabled in
// GCP project 990415480608 or the service account is not an Editor on the
// property — the service account cannot do either itself.
//
// In-process throttle (30s) so a double-click never issues two create bursts.

import { NextResponse } from "next/server";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { registerCustomDimensions } from "@/lib/analytics/ga4-admin";
import { apiRoute } from "@/lib/audit/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THROTTLE_MS = 30_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (typeof g.__ga4RegisterDimensionsLastAt !== "number") g.__ga4RegisterDimensionsLastAt = 0;

async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && (user.email === ADMIN_EMAIL || user.role === "admin");
}

/** GET — dry-run diff (no throttle: it is a read). */
export async function GET(): Promise<Response> {
  if (!(await isAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const result = await registerCustomDimensions({ dryRun: true });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}

async function POST_handler(req: Request): Promise<Response> {
  if (!(await isAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let dryRun = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { dryRun?: unknown };
    dryRun = body.dryRun === true;
  } catch {
    dryRun = false;
  }

  if (!dryRun) {
    const now = Date.now();
    const since = now - (g.__ga4RegisterDimensionsLastAt as number);
    if (since < THROTTLE_MS) {
      return NextResponse.json(
        { ok: false, error: `rate-limited: retry in ${Math.ceil((THROTTLE_MS - since) / 1000)}s` },
        { status: 429 },
      );
    }
    g.__ga4RegisterDimensionsLastAt = now;
  }

  const result = await registerCustomDimensions({ dryRun });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/admin/ga4/register-dimensions/route.ts", method: "POST" }, POST_handler);
