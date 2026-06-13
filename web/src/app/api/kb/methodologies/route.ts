// GET /api/kb/methodologies — list KB methodologies (optional ?type=)
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set([
  "valuation_method", "svi_dimension", "equity_model",
  "financial_template", "process",
]);

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ methodologies: [] });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  const supabase = getSupabaseAdmin()!;
  let query = supabase
    .from("kb_methodologies")
    .select("*")
    .order("name");

  if (type && VALID_TYPES.has(type)) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ methodologies: data ?? [] });
}
