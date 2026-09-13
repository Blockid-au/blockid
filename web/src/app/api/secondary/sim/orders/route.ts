// GET|POST /api/secondary/sim/orders (S27-B) — secondary trading SANDBOX.
//
// SANDBOX: no real securities are offered or transferred; nothing here is an
// offer under Chapter 6D / Chapter 7 of the Corporations Act 2001 (Cth).
// Every response carries `sandbox: true` and the notice.
//
// GET  (viewer+)          recent orders for the project (all holders).
// POST (editor+, Growth+) { action: "place", side, price, qty,
//                           shareholderId? | holderLabel? }
//                         { action: "cancel", orderId }
//                         { action: "settings", rofrEnabled?, rofrHoldHours? }
//
// The register the sandbox trades over belongs to the project OWNER
// (`shareholders.account_id` = owner user id), so both handlers key on
// `scope.ownerUserId`; the caller's own id is stamped on the orders they
// place for provenance / erasure only.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { apiRoute } from "@/lib/audit/api-route";
import { SANDBOX_NOTICE } from "@/lib/secondary/order-book";
import { cancelOrder, listOrders, placeOrder, saveSettings } from "@/lib/secondary/sim";

export const dynamic = "force-dynamic";

const SANDBOX = { sandbox: true as const, notice: SANDBOX_NOTICE };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const orders = await listOrders(supabase, scope.projectId);
  return NextResponse.json({ ok: true, ...SANDBOX, role: scope.role, orders });
}

async function POST_handler(request: Request) {
  const gate = await gateRequireFeature("secondary_market.view");
  if (!gate.ok) return gate.response;
  const user = gate.user;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, ...SANDBOX, error: "Invalid JSON" }, { status: 400 });
  }
  const action = String(body.action ?? "place");

  if (action === "cancel") {
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ ok: false, ...SANDBOX, error: "orderId required" }, { status: 400 });
    const r = await cancelOrder(supabase, { projectId: scope.projectId, orderId });
    if (!r.ok) return NextResponse.json({ ok: false, ...SANDBOX, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, ...SANDBOX, order: r.order });
  }

  if (action === "settings") {
    const patch: { rofrEnabled?: boolean; rofrHoldHours?: number } = {};
    if (typeof body.rofrEnabled === "boolean") patch.rofrEnabled = body.rofrEnabled;
    if (Number.isFinite(Number(body.rofrHoldHours))) patch.rofrHoldHours = Number(body.rofrHoldHours);
    const settings = await saveSettings(supabase, scope.projectId, patch);
    return NextResponse.json({ ok: true, ...SANDBOX, settings });
  }

  if (action !== "place") return NextResponse.json({ ok: false, ...SANDBOX, error: `Unknown action: ${action}` }, { status: 400 });

  const side = body.side === "buy" || body.side === "sell" ? body.side : null;
  if (!side) return NextResponse.json({ ok: false, ...SANDBOX, error: "side must be buy or sell" }, { status: 400 });
  const price = Number(body.price);
  const qty = Number(body.qty);
  const shareholderId = typeof body.shareholderId === "string" && body.shareholderId ? body.shareholderId : null;
  const holderLabel = typeof body.holderLabel === "string" ? body.holderLabel : null;

  const r = await placeOrder(supabase, {
    projectId: scope.projectId,
    ownerUserId: scope.ownerUserId,
    userId: user.id,
    side,
    price,
    qty,
    shareholderId,
    holderLabel,
  });
  if (!r.ok) return NextResponse.json({ ok: false, ...SANDBOX, error: r.error, detail: r.detail }, { status: r.status });
  return NextResponse.json({ ok: true, ...SANDBOX, order: r.order, fills: r.fills, held: r.held });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/secondary/sim/orders/route.ts", method: "POST" }, POST_handler);
