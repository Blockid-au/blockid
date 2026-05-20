import { cookies } from "next/headers";
import { extractSignals, computeSVI, type SVITextInput } from "@/lib/svi-analysis";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAIConfigured } from "@/lib/ai-client";
import { newSlug } from "@/lib/slug";
import { detectInputType, scrapeUrl } from "@/lib/rnd-input";
import { generateRndReport, type ReportTier } from "@/lib/rnd-analysis";
import { canAfford, spendCredits } from "@/lib/credits";

/** Map tier to the credit feature key used for billing. */
function tierToFeature(tier: ReportTier): string {
  switch (tier) {
    case "deep_dive": return "rnd_deep_dive";
    case "preview": return "rnd_preview";     // 0 credits — free summary
    default: return "rnd_report";             // 1 credit — standard 10-page
  }
}

// POST /api/rnd
// Body: { email, rawText, fileName? }
// Returns SSE stream with status updates, then final complete event.

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
      // Unauthenticated — check if this email already used their free analysis
      const { data: existingAnalyses } = await gateSupabase
        .from("svi_analyses")
        .select("id")
        .eq("email", email)
        .limit(1);

      if (existingAnalyses && existingAnalyses.length > 0) {
        return new Response(
          JSON.stringify({
            error: "Free analysis used. Sign in and purchase credits to continue.",
            needsAuth: true,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        );
      }
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

      // Step 2: Scrape URL if applicable
      let scrapedData: Awaited<ReturnType<typeof scrapeUrl>> | undefined;
      if (inputType === "url") {
        sendEvent("status", { step: "scraping", message: "Scraping website data..." });
        try {
          scrapedData = await scrapeUrl(rawText);
          sendEvent("status", {
            step: "scraped",
            message: `Found: ${scrapedData.title || "Untitled"}. Tech: ${scrapedData.techHints.join(", ") || "none detected"}.`,
          });
        } catch (err) {
          console.error("[rnd] Scrape failed:", err);
          sendEvent("status", { step: "scrape_failed", message: "Could not scrape URL. Continuing with text analysis..." });
        }
      }

      // Step 3: Run SVI computation
      sendEvent("status", { step: "svi", message: "Computing Startup Value Index..." });
      const sviInput: SVITextInput = {
        rawText: scrapedData
          ? `${rawText}\n\n${scrapedData.title}\n${scrapedData.description}\n${scrapedData.text}`
          : rawText,
        fileName,
      };
      const signals = extractSignals(sviInput);
      const analysis = computeSVI(signals);

      sendEvent("status", {
        step: "svi_complete",
        message: `SVI Score: ${analysis.totalSVI}. Stage: ${analysis.stageLabel}. Generating R&D report...`,
      });

      // Step 4: Generate R&D report (3 batched AI calls + optional Batch D for deep_dive)
      const streamLabel = tier === "deep_dive"
        ? "Starting Deep Dive R&D analysis (3 parallel research streams + extended analysis)..."
        : "Starting R&D analysis (3 parallel research streams)...";
      sendEvent("status", { step: "rnd_start", message: streamLabel });
      const report = await generateRndReport(
        rawText,
        analysis,
        inputType,
        scrapedData,
        (msg) => sendEvent("status", { step: "rnd_progress", message: msg }),
        tier,
      );

      // Step 5: Persist to database
      sendEvent("status", { step: "persisting", message: "Saving your report..." });
      const supabase = getSupabaseAdmin();
      let slug = newSlug();

      if (supabase) {
        const { error } = await supabase.from("svi_analyses").insert({
          id: slug,
          email,
          raw_input: rawText,
          file_name: fileName ?? null,
          total_svi: analysis.totalSVI,
          net_adjustment: analysis.netAdjustment,
          confidence_multiplier: analysis.confidenceMultiplier,
          analysis_json: analysis,
          svi_version: analysis.version,
          rnd_report_json: report,
          input_type: inputType,
          scraped_url: inputType === "url" ? rawText.trim() : null,
        }).select("id").single();

        if (error) {
          console.error("[rnd] Supabase insert failed:", error);
          slug = `rnd-demo-${slug.slice(0, 6)}`;
        }
      } else {
        slug = `rnd-demo-${slug.slice(0, 6)}`;
      }

      // Step 6: Spend credits (authenticated users only)
      if (authenticatedUserId) {
        const creditFeature = tierToFeature(tier);
        await spendCredits(authenticatedUserId, creditFeature, { slug, email, tier });
      }

      // Step 7: Send complete event
      sendEvent("complete", {
        slug,
        report,
        analysis,
        totalSVI: analysis.totalSVI,
        tier,
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
