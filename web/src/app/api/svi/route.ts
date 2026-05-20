import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { extractSignals, computeSVI, type SVITextInput } from "@/lib/svi-analysis";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { newSlug } from "@/lib/slug";
import { sendSVIReport, sendMagicLink } from "@/lib/email";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { requestMagicLink, MAGIC_LINK_TTL_MIN } from "@/lib/auth";

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

  // ── Credit-based analysis gate ────────────────────────────────────────
  // Authenticated users: check credit balance via the credit system.
  // Unauthenticated (email-only): allow 1 free analysis, then require auth.
  let authenticatedUserId: string | null = null;

  if (isSupabaseConfigured()) {
    const gateSupabase = getSupabaseAdmin()!;

    // Attempt to read session cookie to see if user is authenticated
    const store = await cookies();
    const sessionToken = store.get("blockid_session")?.value;
    if (sessionToken) {
      const { data: session } = await gateSupabase
        .from("sessions")
        .select("user_id")
        .eq("token", sessionToken)
        .maybeSingle();
      if (session) {
        authenticatedUserId = session.user_id as string;
      }
    }

    if (authenticatedUserId) {
      // Authenticated user — check credit balance
      const affordCheck = await canAfford(authenticatedUserId, "svi_analysis");
      if (!affordCheck.allowed) {
        return NextResponse.json({
          ok: false,
          error: "Insufficient credits",
          balance: affordCheck.balance,
          cost: affordCheck.cost,
        }, { status: 402 });
      }
    } else {
      // Unauthenticated — check if this email already used their 1 free analysis
      const { data: existingAnalyses } = await gateSupabase
        .from("svi_analyses")
        .select("id")
        .eq("email", email)
        .limit(1);

      if (existingAnalyses && existingAnalyses.length > 0) {
        return NextResponse.json({
          ok: false,
          error: "Free analysis used. Sign in and purchase credits to continue.",
          needsAuth: true,
        }, { status: 402 });
      }
      // First time for this email — allow for free (don't spend credits)
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

  // ── Spend credit (authenticated users only) ─────────────────────────
  let creditBalance: number | undefined;
  let creditsUsed = 0;
  if (authenticatedUserId) {
    const spend = await spendCredits(authenticatedUserId, "svi_analysis", {
      slug,
      email,
    });
    creditBalance = spend.balance;
    creditsUsed = FEATURE_COSTS.svi_analysis;
  }

  // After persisting, send report email (fire-and-forget)
  void sendSVIReport({ to: email, slug, analysis }).catch(() => {});

  // ── Auto-send magic link for frictionless signup (unauthenticated only) ──
  // If the user doesn't already have an account, send them a magic link so
  // they can sign in with one click and auto-create their account.
  if (!authenticatedUserId && supabase) {
    void (async () => {
      try {
        const { data: existingUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (!existingUser) {
          const result = await requestMagicLink({
            email,
            intent: "login",
            pendingPayload: {},
          });
          if (result.ok) {
            void sendMagicLink({
              to: email,
              token: result.token,
              intent: "login",
              ttlMinutes: MAGIC_LINK_TTL_MIN,
            }).catch(() => {});
          }
        }
      } catch {
        // Fire-and-forget — don't block the SVI response
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    slug,
    totalSVI: analysis.totalSVI,
    analysis,
    persisted: isSupabaseConfigured() && !slug.startsWith("svi-demo-"),
    ...(creditBalance !== undefined && { balance: creditBalance }),
    creditsUsed,
  });
}

export const dynamic = "force-dynamic";
