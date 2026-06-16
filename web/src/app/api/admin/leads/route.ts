import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ leads: [] });

  const { data } = await supabase
    .from("leads")
    .select("id, source, email, payload, created_at, status, notes")
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({ leads: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
