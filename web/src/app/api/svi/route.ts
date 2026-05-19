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

  const email = parsed.email.toLowerCase().trim();

  // ── Free analysis gate (server-side) ──────────────────────────────────
  if (isSupabaseConfigured()) {
    const gateSupabase = getSupabaseAdmin()!;

    // Check if this email has analysis credits or free usage remaining
    const { data: usage } = await gateSupabase
      .from("svi_analysis_usage")
      .select("free_used, credits_remaining")
      .eq("email", email)
      .maybeSingle();

    // Also check if user has a paid plan (founding50 or growth = unlimited)
    const { data: account } = await gateSupabase
      .from("svi_accounts")
      .select("plan")
      .eq("email", email)
      .maybeSingle();

    const hasPaidPlan = account?.plan && account.plan !== "free";

    if (!hasPaidPlan) {
      if (!usage) {
        // First time — create row, allow free analysis
        await gateSupabase.from("svi_analysis_usage").insert({
          email,
          free_used: false,
          total_analyses: 0,
          credits_remaining: 0,
        });
      } else if (usage.free_used && usage.credits_remaining <= 0) {
        // Free used up, no credits — BLOCK
        return NextResponse.json({
          ok: false,
          reason: "analysis_limit_reached",
          message: "You have already used your free analysis. Purchase additional analyses or upgrade to the Founder plan for unlimited access.",
        }, { status: 402 });
      }
    }
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
      email,
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

  // ── Update usage tracking (server-side) ─────────────────────────────
  if (isSupabaseConfigured()) {
    const trackSupabase = getSupabaseAdmin()!;

    const { data: usage } = await trackSupabase
      .from("svi_analysis_usage")
      .select("free_used, credits_remaining, total_analyses")
      .eq("email", email)
      .maybeSingle();

    if (usage) {
      if (!usage.free_used) {
        // Mark free analysis as used
        await trackSupabase.from("svi_analysis_usage")
          .update({ free_used: true, total_analyses: (usage.total_analyses ?? 0) + 1, last_analysis_at: new Date().toISOString() })
          .eq("email", email);
      } else if (usage.credits_remaining > 0) {
        // Decrement credits
        await trackSupabase.from("svi_analysis_usage")
          .update({ credits_remaining: usage.credits_remaining - 1, total_analyses: (usage.total_analyses ?? 0) + 1, last_analysis_at: new Date().toISOString() })
          .eq("email", email);
      }
    } else {
      // Create and mark free as used
      await trackSupabase.from("svi_analysis_usage").insert({
        email,
        free_used: true,
        total_analyses: 1,
        credits_remaining: 0,
        last_analysis_at: new Date().toISOString(),
      });
    }
  }

  // After persisting, send report email (fire-and-forget)
  void sendSVIReport({ to: email, slug, analysis }).catch(() => {});

  return NextResponse.json({
    ok: true,
    slug,
    totalSVI: analysis.totalSVI,
    analysis,
    persisted: isSupabaseConfigured() && !slug.startsWith("svi-demo-"),
  });
}

export const dynamic = "force-dynamic";
