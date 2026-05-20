import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.toLowerCase().trim();

  if (!email) return NextResponse.json({ ok: false }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, analysis: null });

  const supabase = getSupabaseAdmin()!;
  const { data } = await supabase
    .from("svi_analyses")
    .select("id, email, total_svi, input_type, created_at, rnd_report_json, analysis_json")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return NextResponse.json({ ok: true, analysis: null });

  const tier = data.rnd_report_json?.tier ?? "standard";

  return NextResponse.json({
    ok: true,
    analysis: {
      slug: data.id,
      totalSvi: data.total_svi,
      inputType: data.input_type ?? "idea",
      createdAt: data.created_at,
      tier,
      analysisJson: data.analysis_json ?? null,
    },
  });
}

export const dynamic = "force-dynamic";
