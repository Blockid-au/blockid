// GET /api/svi/report/leads?projectId=<pid>
//
// Wave 27A — founder-facing feed of investor leads captured on their shared
// TBR. Ownership is enforced through the svi_accounts → svi_snapshots chain:
// we only return leads whose share_token maps to a snapshot on an account
// owned by the authenticated user.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LeadRow {
  id: number;
  share_token: string;
  project_id: string | null;
  investor_name: string | null;
  investor_email: string;
  investor_firm: string | null;
  investor_role: string | null;
  interest_level: "exploring" | "warm" | "ready_to_talk";
  message: string | null;
  viewer_country: string | null;
  created_at: string;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim() || null;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  // Locate the founder's most recent snapshot for this project. Only leads
  // tied to *its* share_token are returned — the caller cannot enumerate
  // leads from other accounts by guessing project ids.
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const accountId = (account as { id: string } | null)?.id ?? null;
  if (!accountId) {
    return NextResponse.json({
      ok: true,
      leads: [],
      total_leads: 0,
      leads_by_interest: { exploring: 0, warm: 0, ready_to_talk: 0 },
    });
  }

  let snapQ = supabase
    .from("svi_snapshots")
    .select("id, report_share_token")
    .eq("account_id", accountId)
    .not("report_share_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (projectId && projectId !== "default") snapQ = snapQ.eq("project_id", projectId);
  const { data: snapshot } = await snapQ.maybeSingle();
  const token = (snapshot as { report_share_token: string | null } | null)?.report_share_token ?? null;
  if (!token) {
    return NextResponse.json({
      ok: true,
      leads: [],
      total_leads: 0,
      leads_by_interest: { exploring: 0, warm: 0, ready_to_talk: 0 },
    });
  }

  const { data: leads, error } = await supabase
    .from("tbr_leads")
    .select(
      "id, share_token, project_id, investor_name, investor_email, investor_firm, investor_role, interest_level, message, viewer_country, created_at",
    )
    .eq("share_token", token)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", detail: error.message },
      { status: 500 },
    );
  }

  const rows = (leads as LeadRow[] | null) ?? [];
  const by = { exploring: 0, warm: 0, ready_to_talk: 0 };
  for (const r of rows) by[r.interest_level] += 1;

  return NextResponse.json({
    ok: true,
    leads: rows,
    total_leads: rows.length,
    leads_by_interest: by,
  });
}
