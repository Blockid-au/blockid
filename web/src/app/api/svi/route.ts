import { NextResponse } from "next/server";
import { extractSignals, computeSVI, type SVITextInput } from "@/lib/svi-analysis";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { newSlug } from "@/lib/slug";
import { sendSVIReport } from "@/lib/email";

// POST /api/svi
// Body: { email, input: { rawText, fileName? } }
// Returns full Startup Value Index analysis.

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = body as { email?: string; input?: SVITextInput } | null;

  if (!parsed?.email || !parsed.email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
  }
  if (!parsed.input?.rawText?.trim()) {
    return NextResponse.json({ ok: false, error: "Input text is required" }, { status: 400 });
  }

  const signals = extractSignals(parsed.input);
  const analysis = computeSVI(signals);

  const supabase = getSupabaseAdmin();
  let slug = newSlug();

  if (!supabase) {
    slug = `svi-demo-${slug.slice(0, 6)}`;
  } else {
    const { error } = await supabase.from("svi_analyses").insert({
      id: slug,
      email: parsed.email,
      raw_input: parsed.input.rawText,
      file_name: parsed.input.fileName ?? null,
      total_svi: analysis.totalSVI,
      net_adjustment: analysis.netAdjustment,
      confidence_multiplier: analysis.confidenceMultiplier,
      analysis_json: analysis,
      svi_version: analysis.version,
    }).select("id").single();

    if (error) {
      console.error("[blockid:svi] Supabase insert failed", error);
      slug = `svi-demo-${slug.slice(0, 6)}`;
    }
  }

  // After persisting, send report email (fire-and-forget)
  void sendSVIReport({ to: parsed.email, slug, analysis }).catch(() => {});

  return NextResponse.json({
    ok: true,
    slug,
    totalSVI: analysis.totalSVI,
    analysis,
    persisted: isSupabaseConfigured() && !slug.startsWith("svi-demo-"),
  });
}

export const dynamic = "force-dynamic";
