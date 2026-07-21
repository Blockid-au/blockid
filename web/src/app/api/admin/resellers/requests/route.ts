// GET /api/admin/resellers/requests — admin inbox listing
//
// Track A P9.3. requireAdmin gate. Filters via ?status=pending|approved|denied
// (default: pending) and optional ?request_type=... .

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set(["pending", "approved", "denied", "cancelled"]);
const ALLOWED_TYPE = new Set([
  "code_request",
  "over_budget_approval",
  "collateral_approval",
]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 401 });
    }
    throw err;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "pending";
  const typeParam = url.searchParams.get("request_type");
  const status = ALLOWED_STATUS.has(statusParam) ? statusParam : "pending";

  let query = supabase
    .from("reseller_requests")
    .select(
      "id, reseller_id, requested_by, request_type, status, payload, decision_by, decision_at, decision_reason, linked_credit_transaction_id, linked_promotion_code_id, created_at, resellers(code, display_name)",
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (typeParam && ALLOWED_TYPE.has(typeParam)) {
    query = query.eq("request_type", typeParam);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { ok: false, reason: "query_failed", error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, requests: data ?? [] });
}
