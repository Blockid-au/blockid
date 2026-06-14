// GET /api/founding50/spots — returns how many Founding 100 spots remain (public)
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TOTAL_SPOTS = 100;

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, taken: 0, remaining: TOTAL_SPOTS, total: TOTAL_SPOTS });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ ok: true, taken: 0, remaining: TOTAL_SPOTS, total: TOTAL_SPOTS });
    }

    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", "founding50");

    const taken = count ?? 0;
    const remaining = Math.max(0, TOTAL_SPOTS - taken);
    return NextResponse.json({ ok: true, taken, remaining, total: TOTAL_SPOTS });
  } catch {
    return NextResponse.json({ ok: true, taken: 0, remaining: TOTAL_SPOTS, total: TOTAL_SPOTS });
  }
}
