import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { extractSignals, computeSVI, type SVITextInput } from "@/lib/svi-analysis";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { newSlug } from "@/lib/slug";
import { sendSVIReport, sendWelcomeWithReport } from "@/lib/email";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { autoCreateUserWithTempPassword } from "@/lib/auth";
import { detectInputType, scrapeUrl, deepTechAudit } from "@/lib/rnd-input";
import { analyzeWebsiteCI, computeHeuristicSCI } from "@/lib/competitive-intelligence";
import { extractProjectName } from "@/lib/project-name-extractor";
import { buildDeepValuationAnalysis } from "@/lib/agents/deep-valuation";
import { buildScnActionPlan } from "@/lib/agents/scn-action-plan";
import { detectMaturity, maturityValuationGuard } from "@/lib/agents/maturity-detector";
import { computeCohortPercentile } from "@/lib/agents/cohort-percentile";
import { evaluateAntlerSignals } from "@/lib/agents/antler-signals";
import { loadFounderProfileByEmail, profileToSviInputText } from "@/lib/founder-profile";

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
      // Unauthenticated — allow 1 free analysis per day per email
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentAnalyses } = await gateSupabase
        .from("svi_analyses")
        .select("id")
        .eq("email", email)
        .gte("created_at", oneDayAgo)
        .limit(1);

      if (recentAnalyses && recentAnalyses.length > 0) {
        return NextResponse.json({
          ok: false,
          error: "You've used your free daily analysis. Come back tomorrow or sign in to continue.",
          needsAuth: true,
        }, { status: 402 });
      }
      // No analysis in the last 24h — allow for free
    }
  }

  // ── Locale detection ──────────────────────────────────────────────────
  const localeStore = await cookies();
  const locale = localeStore.get("blockid_lang")?.value === "vi" ? "vi" as const : "en" as const;

  // ── Website detection & competitive intelligence ────────────────────
  // If the raw input is a URL, scrape the website and run deep analysis
  // before the SVI computation so signals can be enriched by the audit.
  let techAudit = null;
  let competitiveIntelligence = null;
  let websiteUrl: string | null = null;
  let enrichedText = parsed.input.rawText;
  // Persist scraped metadata so the input-summary step can reuse it (avoid a 2nd HTTP fetch).
  let scrapedMeta: { title: string; description: string; text: string; techHints: string[] } | null = null;

  const inputType = detectInputType(parsed.input.rawText, parsed.input.fileName);
  if (inputType === "url") {
    websiteUrl = parsed.input.rawText.trim();
    if (!websiteUrl.startsWith("http")) websiteUrl = `https://${websiteUrl}`;

    try {
      // Run tech audit + content scrape in parallel
      const [auditResult, scraped] = await Promise.all([
        deepTechAudit(websiteUrl).catch(() => null),
        scrapeUrl(websiteUrl).catch(() => ({ title: "", description: "", text: "", techHints: [] })),
      ]);
      techAudit = auditResult;
      scrapedMeta = scraped;

      // Enrich text with scraped content for better signal extraction
      if (scraped.text) {
        enrichedText = [
          websiteUrl,
          scraped.title,
          scraped.description,
          scraped.text,
        ].filter(Boolean).join(" ");
      }

      // Run AI competitive intelligence
      const { detectSector } = await import("@/lib/svi-analysis");
      const detectedSector = detectSector(enrichedText);

      const aiCI = await analyzeWebsiteCI(
        websiteUrl,
        { title: scraped.title, description: scraped.description, text: scraped.text },
        techAudit,
        detectedSector,
      ).catch(() => null);

      if (aiCI) {
        competitiveIntelligence = aiCI;
      } else if (techAudit) {
        // Heuristic only — cast to null so we don't attach incomplete CI
        void computeHeuristicSCI(techAudit, detectedSector);
        competitiveIntelligence = null;
      }
    } catch {
      // Non-blocking: if website analysis fails, proceed with text-only SVI
    }
  }

  const enrichedInput: SVITextInput = { ...parsed.input, rawText: enrichedText };
  const signals = extractSignals(enrichedInput, parsed.input.fileName, undefined, techAudit ?? undefined);

  // Build CI boosts from competitive intelligence when website was analyzed
  const ciBoosts = competitiveIntelligence ? {
    sciScore: competitiveIntelligence.sciScore,
    blueOceanScore: competitiveIntelligence.blueOceanScore,
    marketMaturity: competitiveIntelligence.marketMaturity,
    competitionLevel: competitiveIntelligence.competitionLevel,
    industry: competitiveIntelligence.industry,
    ebitdaMetrics: competitiveIntelligence.ebitdaMetrics,
  } : undefined;

  let analysis = computeSVI(signals, undefined, undefined, undefined, undefined, ciBoosts);

  // Attach competitive intelligence and website URL to the analysis result
  if (competitiveIntelligence) {
    analysis = { ...analysis, competitiveIntelligence, websiteUrl: websiteUrl ?? undefined };
  }

  // ── v2.3: Enriched input summary + multi-perspective valuation ────────
  // Auto-extract project name so the founder doesn't have to type one, and
  // build a 4-lens deep valuation so the report shows more than one number.
  const scrapedTitle = scrapedMeta?.title || undefined;
  const scrapedDescription = scrapedMeta?.description || undefined;

  const nameResult = extractProjectName({
    rawText: parsed.input.rawText,
    fileName: parsed.input.fileName,
    scraped: { title: scrapedTitle, description: scrapedDescription },
    url: websiteUrl ?? undefined,
  });

  const inputSnippet = (scrapedDescription || enrichedText.replace(/\s+/g, " "))
    .trim()
    .slice(0, 280);

  const keyFindings: string[] = [];
  if (scrapedTitle) keyFindings.push(`Page title: "${scrapedTitle}"`);
  if (techAudit?.techStack?.frameworks?.length) keyFindings.push(`Tech stack: ${techAudit.techStack.frameworks.slice(0, 4).join(", ")}`);
  if (competitiveIntelligence?.industry) keyFindings.push(`Industry: ${competitiveIntelligence.industry} (${competitiveIntelligence.subSector ?? "general"})`);
  if (competitiveIntelligence?.targetCustomer) keyFindings.push(`Target customer: ${competitiveIntelligence.targetCustomer}`);
  if (competitiveIntelligence?.uniquePositioning) keyFindings.push(`Positioning: ${competitiveIntelligence.uniquePositioning}`);
  if (analysis.sector && !competitiveIntelligence?.industry) keyFindings.push(`Detected sector: ${analysis.sectorLabel ?? analysis.sector}`);

  // ── Maturity guard: flag established companies so we don't over-value them ──
  const maturitySignal = detectMaturity({
    url: websiteUrl ?? undefined,
    scrapedTitle,
    scrapedDescription,
    scrapedText: scrapedMeta?.text,
    rawText: parsed.input.rawText,
  });
  const maturityGuard = maturityValuationGuard(maturitySignal);

  let deepValuation = buildDeepValuationAnalysis({
    sviAnalysis: analysis,
    rawText: parsed.input.rawText,
    scrapedText: enrichedText !== parsed.input.rawText ? enrichedText : undefined,
    competitiveIntelligence: competitiveIntelligence ?? null,
  });

  // When the input is clearly an established company (Stripe, Atlassian, etc.)
  // overwrite the blended-valuation confidence to "low" and prepend a risk flag
  // so the partner reading the PDF knows our number is directional only.
  if (maturityGuard.override && maturityGuard.confidenceOverride) {
    deepValuation = {
      ...deepValuation,
      blendedValuation: {
        ...deepValuation.blendedValuation,
        confidence: maturityGuard.confidenceOverride,
      },
      riskFlags: [
        maturityGuard.reason ?? "Established company detected — valuation directional only.",
        ...deepValuation.riskFlags,
      ],
    };
  }

  // ── Real cohort percentile (T0102) ────────────────────────────────────
  // Replaces the band-based estimate with an actual cohort calculation when
  // we have ≥20 same-stage snapshots in the SVI Index.
  const cohort = await computeCohortPercentile({
    sviScore: analysis.totalSVI,
    stage: analysis.stage ?? 0,
    fallbackPercentile: analysis.percentileRank ?? 50,
  });
  if (cohort.source === "real_cohort") {
    analysis = { ...analysis, percentileRank: cohort.percentile };
  }

  analysis = {
    ...analysis,
    inputSummary: {
      projectName: nameResult.name,
      projectNameSource: nameResult.source,
      projectNameConfidence: nameResult.confidence,
      sourceType: inputType,
      snippet: inputSnippet,
      keyFindings: keyFindings.slice(0, 5),
      scrapedTitle,
      scrapedDescription,
    },
    deepValuation,
  };

  // Attach maturity + cohort to analysis so PDF/dashboard can surface them.
  analysis = {
    ...analysis,
    maturitySignal,
    cohortPercentile: cohort,
  };

  // SCN action plan — deterministic, references the deep valuation we just built
  analysis = {
    ...analysis,
    scnActionPlan: buildScnActionPlan({ analysis, deepValuation }),
  };

  // Antler-style stage-progression signals (5 criteria, deterministic).
  // Concatenate the founder profile (if filled in) into the rawText so Team
  // signal scoring can see "ex-Stripe / 10-year domain expert / co-founder X".
  // The profile lives in the founder_profiles table and is loaded by email.
  const founderProfile = await loadFounderProfileByEmail(email);
  const profileText = profileToSviInputText(founderProfile);
  const antlerRawText = profileText ? `${enrichedText} ${profileText}` : enrichedText;

  analysis = {
    ...analysis,
    antlerSignals: evaluateAntlerSignals({
      analysis,
      signals,
      rawText: antlerRawText,
      ci: competitiveIntelligence,
    }),
  };

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
          // Auto-fill startup_name from the extracted project name when it's
          // currently empty — so the founder doesn't see "Untitled" everywhere
          // after their first analysis. High-confidence extractions only.
          const updates: Record<string, unknown> = {
            current_svi: analysis.totalSVI,
            current_stage: analysis.stage ?? 0,
            last_active_at: new Date().toISOString(),
          };
          if (analysis.inputSummary && analysis.inputSummary.projectNameConfidence === "high") {
            const { data: acc } = await supabase
              .from("svi_accounts")
              .select("startup_name")
              .eq("id", accountId)
              .maybeSingle();
            if (!acc?.startup_name) {
              updates.startup_name = analysis.inputSummary.projectName;
            }
          }
          await supabase.from("svi_accounts").update(updates).eq("id", accountId);
        }
      } catch { /* non-blocking */ }
    }
  }

  // Write anonymised snapshot to SVI Index (fire-and-forget)
  if (supabase && authenticatedUserId) {
    void (async () => {
      try {
        const { findOrCreateSVIAccount } = await import("@/lib/projects");
        const { getProjectIdFromRequest } = await import("@/lib/projects");
        const projectId = await getProjectIdFromRequest();
        const accountId = await findOrCreateSVIAccount(email, projectId);

        if (accountId) {
          // Extract anonymised metrics from analysis
          // Only include fields that are available in SVIAnalysis type
          const sviSnapshot = {
            account_id: accountId,
            svi: analysis.totalSVI,
            revenue_estimate: null, // Will be populated from startup_metrics table in future
            runway_months: null,    // Will be populated from startup_metrics table in future
            burn_rate: null,        // Will be populated from startup_metrics table in future
            cap_table_entries: null, // Will be populated from cap_table entries in future
            sector: null,           // Will be populated from startup_metrics table in future
            state: null,            // Will be populated from startup_metrics table in future
            stage: analysis.stage ?? null,
          };

          // Insert snapshot (ignore duplicates for same day)
          await supabase
            .from("svi_index_snapshots")
            .insert([sviSnapshot])
            .select("id")
            .maybeSingle();
        }
      } catch { /* snapshot write non-blocking — doesn't affect user */ }
    })();
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
