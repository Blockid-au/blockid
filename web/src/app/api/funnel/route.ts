import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const STEPS = [
  "landing_visit",
  "signup_start",
  "signup_complete",
  "onboarding_start",
  "idea_submitted",
  "svi_complete",
  "valuation_viewed",
  "upgrade_prompt_seen",
  "checkout_started",
  "payment_complete",
];

const MOCK = [1000, 340, 180, 165, 120, 89, 72, 45, 18, 8];

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { step, metadata } = await req.json() as { step: string; metadata?: Record<string, unknown> };
    const user = await getCurrentUser();
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("funnel_events").insert({
        user_email: user?.email ?? null,
        step,
        metadata: metadata ?? {},
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // return mock data
    const steps = STEPS.map((s, i) => ({ step: s, count: MOCK[i] }));
    return NextResponse.json({ steps, mock: true });
  }

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const results = await Promise.all(
    STEPS.map(async (step) => {
      const { count } = await supabase
        .from("funnel_events")
        .select("id", { count: "exact", head: true })
        .eq("step", step)
        .gte("created_at", since);
      return { step, count: count ?? 0 };
    })
  );
  return NextResponse.json({ steps: results });
}
