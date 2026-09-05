import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface IngestBody {
  user_email: string;
  startup_name: string;
  inputs: Record<string, unknown>;
  svi_analysis: unknown;
  sub_scores?: Record<string, number>;
  total_score: number;
  valuation_low_aud?: number | null;
  valuation_high_aud?: number | null;
  source: "svi";
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-blockid-api-key");
  const expectedKey = process.env.HISTORY_INGEST_KEY ?? process.env.CRON_SECRET;

  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const body: IngestBody = await req.json();

  // Look up user by email from app_users table
  const { data: userRow, error: userError } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", body.user_email)
    .single();

  if (userError || !userRow) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const userId = userRow.id;
  const slugName = (body.startup_name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";
  const startupId = `${userId}:${slugName}`;

  const { error: insertError } = await supabase
    .from("startup_score_history")
    .insert({
      user_id: userId,
      startup_id: startupId,
      startup_name: body.startup_name,
      inputs: body.inputs,
      svi_analysis: body.svi_analysis,
      sub_scores: body.sub_scores ?? null,
      total_score: body.total_score,
      valuation_low_aud: body.valuation_low_aud ?? null,
      valuation_high_aud: body.valuation_high_aud ?? null,
      source: body.source,
    });

  if (insertError) {
    console.error("[blockid:history:ingest] insert failed", insertError);
    return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, startup_id: startupId });
}
