// GET /api/admin/users — paginated list of app_users with search + filter.
//
// Query params:
//   q       — email prefix (case-insensitive, ilike `${q}%`).
//   filter  — "all" | "admin" | "reseller" | "unverified".
//   limit   — 1..200, default 50.
//   offset  — >= 0, default 0.
//
// requireAdmin gate per web/src/lib/reseller/require-admin.ts.
//
// Response:
//   { ok: true, users: [...], total, limit, offset }
//   { ok: false, reason: "..."} + 4xx/5xx status

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Filter = "all" | "admin" | "reseller" | "unverified";

function parseFilter(v: string | null): Filter {
  return v === "admin" || v === "reseller" || v === "unverified" ? v : "all";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json(
        { ok: false, reason: err.code },
        { status: err.code === "no_user" ? 401 : 403 },
      );
    }
    throw err;
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const filter = parseFilter(url.searchParams.get("filter"));
  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50),
  );
  const offset = Math.max(
    0,
    Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
  );

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  try {
    let query = supabase
      .from("app_users")
      .select(
        "id, email, display_name, role, plan, segment, account_type, attribution_reseller_id, created_at, last_login_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) query = query.ilike("email", `${q}%`);
    if (filter === "admin") query = query.eq("role", "admin");
    if (filter === "reseller") query = query.not("attribution_reseller_id", "is", null);
    if (filter === "unverified") query = query.is("last_login_at", null);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      users: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "query_failed", error: (err as Error).message },
      { status: 500 },
    );
  }
}
