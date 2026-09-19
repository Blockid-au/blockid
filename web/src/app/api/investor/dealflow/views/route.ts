// /api/investor/dealflow/views — deal-flow saved views (G13-W3-T2, BA spec
// §B.8 "Saved views stored in app_users.investor_prefs.saved_views[]",
// §B.10 T6: ≤ 10 per user, persists across sessions).
//
//   GET     → { ok, views[] }
//   POST    → { name, filters, sort? } → 201 { ok, view, views[] }
//             (same name replaces; 402 limit_reached at 10)
//   DELETE  → ?id= → { ok, views[] }
//
// Gate: investor.dealflow (402). Zod `saveViewBodySchema`. Rate limit
// 60/min/user, 16 kB body.

import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { getCurrentUser } from "@/lib/auth";
import { can, recordGateHit } from "@/lib/entitlements";
import { apiRoute } from "@/lib/audit/api-route";
import { deleteView, listSavedViews, saveView } from "@/lib/investors/dealflow";
import { saveViewBodySchema } from "@/lib/investors/saved-views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BODY_MAX_BYTES = 16 * 1024;

async function gate() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  const subset = { id: user.id, plan: user.plan ?? "", segment: "investor" };
  if (!(await can(subset, "investor.dealflow"))) {
    await recordGateHit(subset, "investor.dealflow", "api", "api/investor/dealflow/views");
    return { user: null, response: NextResponse.json({ ok: false, error: "feature_locked", feature: "investor.dealflow" }, { status: 402 }) };
  }
  return { user, response: null };
}

export async function GET() {
  const { user, response } = await gate();
  if (!user) return response;
  return NextResponse.json({ ok: true, views: await listSavedViews(user.id) }, { headers: PRIVATE_JSON_HEADERS });
}

async function POST_handler(req: NextRequest) {
  const { user, response } = await gate();
  if (!user) return response;
  const limited = enforceRateLimit("investor-dealflow-views", user.id, req, 60, 60_000);
  if (limited) return limited;
  const read = await readJsonBody<unknown>(req, BODY_MAX_BYTES);
  if (!read.ok) return read.response;
  const parsed = saveViewBodySchema.safeParse(read.body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const res = await saveView(user.id, { name: parsed.data.name, filters: parsed.data.filters, sort: parsed.data.sort });
  if (!res.ok) {
    const status = res.reason === "limit_reached" ? 402 : 500;
    return NextResponse.json({ ok: false, error: res.reason, views: res.views }, { status });
  }
  return NextResponse.json({ ok: true, view: res.view, views: res.views }, { status: 201, headers: PRIVATE_JSON_HEADERS });
}

async function DELETE_handler(req: NextRequest) {
  const { user, response } = await gate();
  if (!user) return response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9]{6,16}$/.test(id)) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const res = await deleteView(user.id, id);
  return NextResponse.json({ ok: res.ok, views: res.views }, { status: res.ok ? 200 : 404, headers: PRIVATE_JSON_HEADERS });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts).
export const POST = apiRoute({ route: "api/investor/dealflow/views/route.ts", method: "POST" }, POST_handler);
export const DELETE = apiRoute({ route: "api/investor/dealflow/views/route.ts", method: "DELETE" }, DELETE_handler);
