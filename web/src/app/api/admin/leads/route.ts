import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // G36-A: signed in is not enough — the leads inbox (contact-form e-mails +
  // payloads) is admin-only. Any free account could read / rewrite it before.
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ leads: [] });

  const { data } = await supabase
    .from("leads")
    .select("id, source, email, payload, created_at, status, notes")
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({ leads: data ?? [] });
}

async function POST_handler(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // G36-A: signed in is not enough — the leads inbox (contact-form e-mails +
  // payloads) is admin-only. Any free account could read / rewrite it before.
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false });

  const { id, status, notes } = await req.json() as {
    id: string;
    status: string;
    notes: string;
  };
  await supabase.from("leads").update({ status, notes }).eq("id", id);
  return NextResponse.json({ ok: true });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/admin/leads/route.ts", method: "POST" }, POST_handler);
