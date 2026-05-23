import { cookies } from "next/headers";
import { extractSignals, computeSVI, type SVITextInput } from "@/lib/svi-analysis";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAIConfigured } from "@/lib/ai-client";
import { newSlug } from "@/lib/slug";
import { detectInputType, scrapeUrl, deepTechAudit, type TechAuditResult } from "@/lib/rnd-input";
import { generateRndReport, type ReportTier, type CompetitiveResearchData } from "@/lib/rnd-analysis";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getProjectIdFromRequest } from "@/lib/projects";
import { sendSVIReport, sendWelcomeWithReport } from "@/lib/email";
import { autoCreateUserWithTempPassword } from "@/lib/auth";
import { createReportGoogleDoc } from "@/lib/google-drive";

/** Map tier to the credit feature key used for billing. */
function tierToFeature(tier: ReportTier): string {
  switch (tier) {
    case "deep_dive": return "rnd_deep_dive";
    case "preview": return "rnd_preview";     // 0 credits — free summary
    default: return "rnd_report";             // 1 credit — standard 10-page
  }
}

// POST /api/rnd
// Body: { email, rawText, fileName?, tier? }
// Returns SSE stream with status updates, then final complete event.
//
// AUTH NOTE: This endpoint intentionally does NOT require session auth.
// It supports a guest checkout flow where unauthenticated users can run
// a single free analysis with email-based credit gating. Authenticated
// users are identified via session cookie and charged credits; guests
// are limited to one free analysis per email (checked against
// svi_analysis_usage). This is by design — requiring auth would block
// the top-of-funnel free trial experience.

export async function POST(request: Request) {
  // ── Parse body ─────────────────────────────────────────────────────────
  let body: { email?: string; rawText?: string; fileName?: string; tier?: ReportTier } | null = null;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!body?.email || !body.email.includes("@")) {
    return new Response(
      JSON.stringify({ error: "Valid email is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!body.rawText?.trim() && !body.fileName) {
    return new Response(
      JSON.stringify({ error: "Input text or file name is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate and default tier
  const validTiers: ReportTier[] = ["preview", "standard", "deep_dive"];
  const tier: ReportTier = body.tier && validTiers.includes(body.tier) ? body.tier : "standard";

  if (!isAIConfigured()) {
    return new Response(
      JSON.stringify({ error: "AI service not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const email = body.email.toLowerCase().trim();
  const rawText = body.rawText?.trim() ?? "";
  const fileName = body.fileName;

  // ── Credit-based analysis gate (mirrors /api/svi pattern) ──────────────
  let authenticatedUserId: string | null = null;

  if (isSupabaseConfigured()) {
    const gateSupabase = getSupabaseAdmin()!;

    // Check session cookie for authenticated user
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
      // Authenticated user — check credit balance based on tier
      const creditFeature = tierToFeature(tier);
      const affordCheck = await canAfford(authenticatedUserId, creditFeature);
      if (!affordCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: "Insufficient credits",
            balance: affordCheck.balance,
            cost: affordCheck.cost,
            tier,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        );
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
        return new Response(
          JSON.stringify({
            error: "You've used your free daily analysis. Come back tomorrow or sign in to continue.",
            needsAuth: true,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        );
      }
    }
  }

  // ── Cache check (standard + preview only) ──────────────────────────────
  // If an identical analysis exists for this email within 30 days, return it
  // immediately without charging credits or running the AI pipeline.
  if (tier !== "deep_dive" && isSupabaseConfigured()) {
    const cacheSupabase = getSupabaseAdmin()!;
    const inputPrefix = rawText.slice(0, 200);

    const { data: cached } = await cacheSupabase
      .from("svi_analyses")
      .select("id, total_svi, analysis_json, rnd_report_json, created_at")
      .eq("email", email)
      .eq("raw_input", rawText)              // full match first
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback: prefix match (first 200 chars) if no exact match
    const hit = cached ?? (inputPrefix.length >= 20 ? (await cacheSupabase
      .from("svi_analyses")
      .select("id, total_svi, analysis_json, rnd_report_json, created_at")
      .eq("email", email)
      .like("raw_input", `${inputPrefix.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()).data : null);

    if (hit?.analysis_json && hit?.rnd_report_json) {
      console.log("[rnd] Cache hit for", email, "slug:", hit.id);

      // Return cached result as SSE stream with a single complete event
      const { readable: cachedReadable, writable: cachedWritable } = new TransformStream();
      const cachedWriter = cachedWritable.getWriter();
      const cachedEncoder = new TextEncoder();

      (async () => {
        try {
          const statusData = JSON.stringify({
            step: "cached",
            message: "Found a recent identical analysis — returning cached result.",
          });
          cachedWriter.write(cachedEncoder.encode(`event: status\ndata: ${statusData}\n\n`));

          const completeData = JSON.stringify({
            slug: hit.id,
            report: hit.rnd_report_json,
            analysis: hit.analysis_json,
            totalSVI: hit.total_svi,
            tier,
            cached: true,
          });
          cachedWriter.write(cachedEncoder.encode(`event: complete\ndata: ${completeData}\n\n`));
        } finally {
          cachedWriter.close();
        }
      })();

      return new Response(cachedReadable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
  }

  // ── SSE stream setup ───────────────────────────────────────────────────
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  function sendEvent(event: string, data: unknown) {
    writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  }

  // Start async pipeline (non-blocking — response streams immediately)
  (async () => {
    try {
      // Step 1: Detect input type
      sendEvent("status", { step: "detecting", message: "Analyzing your input..." });
      const inputType = detectInputType(rawText, fileName);

      // Step 2: Scrape URL + Deep Tech Audit (parallel) if applicable
      let scrapedData: Awaited<ReturnType<typeof scrapeUrl>> | undefined;
      let techAudit: TechAuditResult | undefined;
      if (inputType === "url") {
        sendEvent("status", { step: "scraping", message: "Scraping website + running deep tech audit..." });
        // Run scrape and deep tech audit in parallel for speed
        const [scrapeResult, auditResult] = await Promise.allSettled([
          scrapeUrl(rawText),
          deepTechAudit(rawText),
        ]);

        if (scrapeResult.status === "fulfilled") {
          scrapedData = scrapeResult.value;
          sendEvent("status", {
            step: "scraped",
            message: `Found: ${scrapedData.title || "Untitled"}. Tech: ${scrapedData.techHints.join(", ") || "none detected"}.`,
          });
        } else {
          console.error("[rnd] Scrape failed:", scrapeResult.reason);
          sendEvent("status", { step: "scrape_failed", message: "Could not scrape URL. Continuing with text analysis..." });
        }

        if (auditResult.status === "fulfilled") {
          techAudit = auditResult.value;
          sendEvent("status", {
            step: "tech_audit_complete",
            message: `Tech Audit: Grade ${techAudit.overallGrade} | Security: ${techAudit.security.grade} | Perf: ${techAudit.performance.grade} | Stack: ${techAudit.techStack.frameworks.join(", ") || "standard"}`,
          });
        } else {
          console.error("[rnd] Tech audit failed:", auditResult.reason);
        }
      }

      // Step 3: Run SVI computation (enhanced with tech audit data)
      sendEvent("status", { step: "svi", message: "Computing Startup Value Index..." });
      const sviInput: SVITextInput = {
        rawText: scrapedData
          ? `${rawText}\n\n${scrapedData.title}\n${scrapedData.description}\n${scrapedData.text}`
          : rawText,
        fileName,
      };
      const signals = extractSignals(sviInput, undefined, undefined, techAudit);
      const analysis = computeSVI(signals, undefined, techAudit?.signalBoosts);

      sendEvent("status", {
        step: "svi_complete",
        message: `SVI Score: ${analysis.totalSVI}. Stage: ${analysis.stageLabel}. Generating R&D report...`,
      });

      // Step 3b: Competitive research (for paid tiers, runs in background)
      let research: CompetitiveResearchData | undefined;
      if (tier !== "preview") {
        try {
          sendEvent("status", { step: "research", message: "Researching market & competitors..." });
          const researchUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au"}/api/svi/research`;
          const reqCookie = request.headers.get("cookie") ?? "";
          const researchRes = await fetch(researchUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: reqCookie },
            body: JSON.stringify({ description: rawText.slice(0, 500) }),
            signal: AbortSignal.timeout(15000),
          });
          if (researchRes.ok) {
            const researchData = await researchRes.json();
            if (researchData.ok) {
              research = {
                competitors: researchData.competitors,
                marketInsights: researchData.marketInsights,
                competitiveInsights: researchData.competitiveInsights,
                summary: researchData.summary,
              };
              sendEvent("status", {
                step: "research_complete",
                message: `Found ${researchData.competitors?.length ?? 0} competitors. Market score: ${researchData.marketScore ?? "N/A"}/100`,
              });
            }
          }
        } catch {
          // Research is best-effort — don't block report generation
          sendEvent("status", { step: "research_skipped", message: "Competitive research skipped (timeout or unavailable)" });
        }
      }

      // Step 4: Generate R&D report (page-by-page AI calls + optional extended sections)
      const streamLabel = tier === "deep_dive"
        ? "Starting Deep Dive R&D analysis (3 parallel research streams + extended analysis)..."
        : "Starting R&D analysis (3 parallel research streams)...";
      sendEvent("status", { step: "rnd_start", message: streamLabel });
      const locale = (await cookies()).get("blockid_lang")?.value === "vi" ? "vi" as const : "en" as const;
      const report = await generateRndReport(
        rawText,
        analysis,
        inputType,
        scrapedData,
        (msg) => sendEvent("status", { step: "rnd_progress", message: msg }),
        tier,
        techAudit,
        locale,
        research,
      );

      // Step 5: Persist to database
      sendEvent("status", { step: "persisting", message: "Saving your report..." });
      const supabase = getSupabaseAdmin();
      let slug = newSlug();

      if (supabase) {
        // Embed tech audit inside analysis_json for persistence
        const analysisWithAudit = techAudit
          ? { ...analysis, techAudit }
          : analysis;
        // Get project_id for data isolation (each startup gets its own analysis)
        let projectId: string | null = null;
        try { projectId = await getProjectIdFromRequest(); } catch { /* guest user */ }

        const { error } = await supabase.from("svi_analyses").insert({
          id: slug,
          email,
          raw_input: rawText,
          file_name: fileName ?? null,
          total_svi: analysis.totalSVI,
          net_adjustment: analysis.netAdjustment,
          confidence_multiplier: analysis.confidenceMultiplier,
          analysis_json: analysisWithAudit,
          svi_version: analysis.version,
          rnd_report_json: report,
          input_type: inputType,
          scraped_url: inputType === "url" ? rawText.trim() : null,
          project_id: projectId,
        }).select("id").single();

        if (error) {
          console.error("[rnd] Supabase insert failed:", error);
          slug = `rnd-demo-${slug.slice(0, 6)}`;
        }
      } else {
        slug = `rnd-demo-${slug.slice(0, 6)}`;
      }

      // Step 5b: Ensure per-project svi_account exists and update score
      let rndProjectId: string | null = null;
      try { rndProjectId = await getProjectIdFromRequest(); } catch { /* guest */ }
      if (authenticatedUserId && supabase) {
        try {
          const { findOrCreateSVIAccount } = await import("@/lib/projects");
          const accountId = await findOrCreateSVIAccount(email, rndProjectId);
          if (accountId) {
            await supabase.from("svi_accounts").update({
              current_svi: analysis.totalSVI,
              current_stage: analysis.stage ?? 0,
              last_active_at: new Date().toISOString(),
            }).eq("id", accountId);
          }
        } catch { /* non-blocking */ }
      }

      // Step 5c: Generate Google Doc (fire-and-forget, authenticated users only)
      if (authenticatedUserId && supabase) {
        void createReportGoogleDoc(email, slug, report, analysis)
          .then(async (docResult) => {
            if (docResult && supabase) {
              // Persist the doc URL in analysis_json alongside existing data
              const { data: existing } = await supabase
                .from("svi_analyses")
                .select("analysis_json")
                .eq("id", slug)
                .maybeSingle();
              if (existing?.analysis_json) {
                await supabase.from("svi_analyses").update({
                  analysis_json: {
                    ...(existing.analysis_json as Record<string, unknown>),
                    driveDocId: docResult.docId,
                    driveDocUrl: docResult.docUrl,
                  },
                }).eq("id", slug);
              }
            }
          })
          .catch(() => {});
      }

      // Step 6: Spend credits (authenticated users only)
      if (authenticatedUserId) {
        const creditFeature = tierToFeature(tier);
        await spendCredits(authenticatedUserId, creditFeature, { slug, email, tier });
      }

      // Step 6b: Increment total_analyses for every analysis (free + paid)
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

      // Step 7: Auto-create account + send welcome OR just report email
      if (!authenticatedUserId) {
        void (async () => {
          try {
            const acct = await autoCreateUserWithTempPassword(email);
            if (acct.ok && acct.isNewUser && acct.tempPassword) {
              void sendWelcomeWithReport({ to: email, slug, rawInput: rawText, analysis, tempPassword: acct.tempPassword }).catch(() => {});
            } else {
              void sendSVIReport({ to: email, slug, analysis }).catch(() => {});
            }
          } catch {
            void sendSVIReport({ to: email, slug, analysis }).catch(() => {});
          }
        })();
      } else {
        sendSVIReport({ to: email, slug, analysis }).catch(() => {});
      }

      // Step 8: Send complete event
      sendEvent("complete", {
        slug,
        report,
        analysis,
        totalSVI: analysis.totalSVI,
        tier,
        ...(techAudit ? { techAudit } : {}),
      });
    } catch (err) {
      console.error("[rnd] Pipeline error:", err);
      sendEvent("error", {
        error: err instanceof Error ? err.message : "Analysis failed. Please try again.",
      });
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const dynamic = "force-dynamic";
