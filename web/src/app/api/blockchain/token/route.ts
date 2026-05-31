// GET /api/blockchain/token
// Returns the equity token deployed for the CURRENT project's startup, or null
// if it hasn't been tokenized yet. Lets client pages (equity dashboard,
// shareholders, wallet) read the per-startup token instead of a hardcoded one.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findSVIAccountWithFallback } from "@/lib/projects";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const projectId = await getProjectIdFromRequest();
  const account = await findSVIAccountWithFallback(user.email, projectId);
  if (!account) {
    return NextResponse.json({ ok: true, token: null });
  }

  const { data: cfg } = await supabase
    .from("blockchain_sync_config")
    .select("token_symbol, token_name, token_address")
    .eq("account_id", account.id)
    .maybeSingle();

  if (!cfg?.token_address || !ADDRESS_RE.test(cfg.token_address)) {
    return NextResponse.json({ ok: true, token: null });
  }

  return NextResponse.json({
    ok: true,
    token: {
      address: cfg.token_address,
      symbol: cfg.token_symbol ?? "SVT",
      name: cfg.token_name ?? "Startup Value Token",
    },
  });
}
