// /api/dashboard/layout — GET/PUT the signed-in founder's /dashboard widget
// layout (pin + reorder + hide), G4 #4 server sync.
//
//   GET  → { ok:true, layout: DashboardLayout | null }     (null = never saved)
//   PUT  → body DashboardLayout (≤ 4 KB) → { ok:true, layout }  (normalised)
//
// The client (components/dashboard/widget-grid.tsx) keeps localStorage as
// the instant cache and calls here after mount: the side with the newer
// `updated_at` wins, and every pin/reorder/hide change is debounced into a
// PUT. Unknown widget ids are dropped against lib/dashboard/widget-ids.ts
// before the row is touched. Storage is app_users.dashboard_layout
// (migration 0326), written via the service role — app_users carries no
// self-service RLS policy — and always scoped to the caller's own id.

import { NextResponse, type NextRequest } from "next/server";
import { PRIVATE_JSON_HEADERS } from "@/lib/security/request-guards";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getDashboardLayout, setDashboardLayout } from "@/lib/dashboard/layout-store";
import { LAYOUT_MAX_BYTES, parseLayout } from "@/lib/dashboard/widget-layout";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

/** PUTs per user per minute — a drag session fires at most one per 800 ms. */
export const PUT_RATE_MAX = 60;
export const PUT_RATE_WINDOW_MS = 60_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "auth_required", layout: null }, { status: 401 });
  }
  const layout = await getDashboardLayout(user.id);
  return NextResponse.json({ ok: true, layout }, { headers: PRIVATE_JSON_HEADERS });
}

async function PUT_handler(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  const limited = enforceRateLimit("dashboard-layout", user.id, req, PUT_RATE_MAX, PUT_RATE_WINDOW_MS);
  if (limited) return limited;

  // Size gate before parsing — read the raw text so a 2 MB body is refused
  // without ever being JSON.parsed. Content-Length is advisory only.
  let text: string;
  try {
    text = await req.text();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (new TextEncoder().encode(text).length > LAYOUT_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "payload_too_large", max_bytes: LAYOUT_MAX_BYTES },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const layout = parseLayout(body);
  if (!layout) {
    return NextResponse.json({ ok: false, error: "invalid_layout" }, { status: 400 });
  }

  const result = await setDashboardLayout(user.id, layout);
  if (!result.ok) {
    // column_missing (0326 not applied yet) is a soft failure: the client
    // keeps its localStorage copy and retries on the next change.
    const soft = result.reason === "column_missing";
    return NextResponse.json(
      { ok: false, error: result.reason, layout },
      { status: soft ? 200 : 500 },
    );
  }
  return NextResponse.json({ ok: true, layout });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PUT = apiRoute({ route: "api/dashboard/layout/route.ts", method: "PUT" }, PUT_handler);
