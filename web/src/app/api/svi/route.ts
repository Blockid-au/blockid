import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { extractSignals, computeSVI, type SVITextInput } from "@/lib/svi-analysis";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { newSlug } from "@/lib/slug";
import { sendSVIReport, sendWelcomeWithReport } from "@/lib/email";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { autoCreateUserWithTempPassword } from "@/lib/auth";

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

  // ── Locale detection ──────────────────────────────────────────────────
  const localeStore = await cookies();
  const locale = localeStore.get("blockid_lang")?.value === "vi" ? "vi" as const : "en" as const;

  const signals = extractSignals(parsed.input);
  const analysis = computeSVI(signals);

  const supabase = getSupabaseAdmin();
  let slug = newSlug();

  if (!supabase) {
    slug = `svi-demo-${slug.slice(0, 6)}`;
  } else {
    // Scope to active project for data isolation
    let projectId: string | null = null;
    if (authenticatedUserId) {
      try {
        const { getProjectIdFromRequest } = await import("@/lib/projects");
        projectId = await getProjectIdFromRequest();
      } catch { /* guest user — no project */ }
    }

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
      project_id: projectId,
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

  // ── Increment total_analyses for every analysis (free + paid) ──────
  if (isSupabaseConfigured()) {
    const usageSupabase = getSupabaseAdmin()!;
    const lowerEmail = email.toLowerCase().trim();
    const { data: existingUsage } = await usageSupabase
      .from("svi_analysis_usage")
      .select("total_analyses, free_used")
      .eq("email", lowerEmail)
      .maybeSingle();

    if (existingUsage) {
      await usageSupabase
        .from("svi_analysis_usage")
        .update({
          total_analyses: (Number(existingUsage.total_analyses) || 0) + 1,
          free_used: true,
          last_analysis_at: new Date().toISOString(),
        })
        .eq("email", lowerEmail);
    } else {
      await usageSupabase
        .from("svi_analysis_usage")
        .insert({
          email: lowerEmail,
          total_analyses: 1,
          free_used: true,
          last_analysis_at: new Date().toISOString(),
        });
    }
  }

  // ── Auto-create account + send welcome OR just report email ─────────
  // New users: auto-create app_users with temp password, send combined
  // welcome+report email with credentials. Existing users: send report only.
  if (!authenticatedUserId && supabase) {
    void (async () => {
      try {
        const result = await autoCreateUserWithTempPassword(email);
        if (result.ok && result.isNewUser && result.tempPassword) {
          // New user — send combined welcome + report + credentials
          void sendWelcomeWithReport({
            to: email, slug, rawInput: parsed.input?.rawText,
            analysis, tempPassword: result.tempPassword, locale,
          }).catch(() => {});
        } else {
          // Existing user — send report only
          void sendSVIReport({ to: email, slug, rawInput: parsed.input?.rawText, analysis, locale }).catch(() => {});
        }
      } catch {
        // Fallback: send report without account creation
        void sendSVIReport({ to: email, slug, rawInput: parsed.input?.rawText, analysis, locale }).catch(() => {});
      }
    })();
  } else {
    // Authenticated user — just send report
    void sendSVIReport({ to: email, slug, rawInput: parsed.input?.rawText, analysis, locale }).catch(() => {});
  }

  // ── Ensure per-project svi_account exists (data isolation) ──────────
  // Each (email, project_id) pair gets its own svi_account row.
  // This prevents overwriting startup_name, current_svi, etc. across projects.
  if (supabase) {
    let projectId: string | null = null;
    if (authenticatedUserId) {
      try {
        const { getProjectIdFromRequest, findOrCreateSVIAccount } = await import("@/lib/projects");
        projectId = await getProjectIdFromRequest();
        const accountId = await findOrCreateSVIAccount(email, projectId);
        if (accountId) {
          // Update ONLY this project's svi_account with the new score
          await supabase.from("svi_accounts").update({
            current_svi: analysis.totalSVI,
            current_stage: analysis.stage ?? 0,
            last_active_at: new Date().toISOString(),
          }).eq("id", accountId);
        }
      } catch { /* non-blocking */ }
    }
  }

  // Create per-project Drive folder and link to analysis (fire-and-forget)
  if (supabase) {
    void (async () => {
      try {
        const { getOrCreateUserFolder } = await import("@/lib/google-drive");
        // Get project name for Drive folder naming
        let projName: string | null = null;
        let projId: string | null = null;
        if (authenticatedUserId) {
          try {
            const { getProjectIdFromRequest, getProjectById } = await import("@/lib/projects");
            projId = await getProjectIdFromRequest();
            if (projId) {
              const proj = await getProjectById(projId);
              projName = proj?.name ?? null;
            }
          } catch { /* no project */ }
        }
        const { folderId: userFolderId, folderUrl } = await getOrCreateUserFolder(email, null, projName);
        await supabase.from("svi_analyses").update({
          drive_folder_id: userFolderId,
          drive_folder_url: folderUrl,
        }).eq("id", slug);
      } catch { /* Drive not configured or failed — non-blocking */ }
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
