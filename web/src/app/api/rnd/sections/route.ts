// Modular Section Report — per-section purchasing with depth selection
//
// POST /api/rnd/sections
// Body: {
//   email: string,
//   rawText: string,
//   sections: Array<{ sectionId: string, depth: SectionDepth }>,
//   fileName?: string,
// }
//
// Returns SSE stream with status updates, then complete event with
// only the purchased sections at their chosen depth.
//
// Credit flow:
//   1. Calculate total cost from sections × depth
//   2. Pre-flight canAfford check
//   3. Generate sections
//   4. Charge credits only after successful generation
//
// Transparent pricing: cost is calculated before generation and
// returned in the SSE "pricing" event so the frontend can show
// a confirmation dialog. The frontend must send a follow-up
// "confirmed: true" to proceed — but for API simplicity we
// charge on success (frontend handles pre-confirmation UX).

import { cookies } from "next/headers";
import { extractSignals, computeSVI, type SVITextInput } from "@/lib/svi-analysis";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAIConfigured } from "@/lib/ai-client";
import { newSlug } from "@/lib/slug";
import { detectInputType, scrapeUrl, deepTechAudit, type TechAuditResult } from "@/lib/rnd-input";
import { generateSectionReport, type SectionRequest } from "@/lib/rnd-analysis";
import { canAfford, spendCredits, calculateSectionCost, SECTION_DEPTH_CONFIG, type SectionDepth } from "@/lib/credits";

export const dynamic = "force-dynamic";

const VALID_DEPTHS: SectionDepth[] = ["scan", "summary", "standard", "deep", "expert", "maximum"];
const VALID_SECTIONS = [
  "executive", "market", "product", "business", "competition",
  "traction", "team", "financial", "risk", "recommendations",
];

export async function POST(request: Request) {
  let body: {
    email?: string;
    rawText?: string;
    fileName?: string;
    sections?: Array<{ sectionId?: string; depth?: string }>;
  } | null = null;

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
  if (!body.rawText?.trim()) {
    return new Response(
      JSON.stringify({ error: "Input text is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!Array.isArray(body.sections) || body.sections.length === 0) {
    return new Response(
      JSON.stringify({ error: "At least one section must be selected" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate sections
  const validatedSections: SectionRequest[] = [];
  for (const s of body.sections) {
    if (!s.sectionId || !VALID_SECTIONS.includes(s.sectionId)) {
      return new Response(
        JSON.stringify({ error: `Invalid sectionId: ${s.sectionId}. Valid: ${VALID_SECTIONS.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const depth = (s.depth ?? "standard") as SectionDepth;
    if (!VALID_DEPTHS.includes(depth)) {
      return new Response(
        JSON.stringify({ error: `Invalid depth: ${s.depth}. Valid: ${VALID_DEPTHS.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    validatedSections.push({ sectionId: s.sectionId, depth });
  }

  if (!isAIConfigured()) {
    return new Response(
      JSON.stringify({ error: "AI service not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Calculate cost upfront (transparent pricing)
  const costBreakdown = calculateSectionCost(validatedSections);

  // Auth + credit check
  let authenticatedUserId: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const store = await cookies();
    const sessionToken = store.get("blockid_session")?.value;
    if (sessionToken) {
      const { data: session } = await supabase
        .from("sessions")
        .select("user_id")
        .eq("token", sessionToken)
        .maybeSingle();
      if (session) authenticatedUserId = session.user_id as string;
    }

    if (authenticatedUserId) {
      // Check if user can afford the total
      const balance = await canAfford(authenticatedUserId, "section_standard"); // Just to get balance
      if (balance.balance < costBreakdown.totalCredits) {
        return new Response(
          JSON.stringify({
            error: "Insufficient credits",
            balance: balance.balance,
            cost: costBreakdown.totalCredits,
            breakdown: costBreakdown.items,
            bestBundle: costBreakdown.bestBundle,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Authentication required for section purchases" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const email = body.email.toLowerCase().trim();
  const rawText = body.rawText.trim();
  const fileName = body.fileName;

  // SSE stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  function sendEvent(event: string, data: unknown) {
    writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  }

  (async () => {
    try {
      // Step 1: Show pricing breakdown
      sendEvent("pricing", {
        sections: costBreakdown.items,
        totalCredits: costBreakdown.totalCredits,
        totalWords: costBreakdown.totalWords,
        bestBundle: costBreakdown.bestBundle,
        message: `${validatedSections.length} section${validatedSections.length > 1 ? "s" : ""} selected — ${costBreakdown.totalCredits} credits (A$${costBreakdown.totalCredits.toFixed(2)})`,
      });

      // Step 2: Input detection + scrape + tech audit
      sendEvent("status", { step: "analyzing", message: "Analyzing your input..." });
      const inputType = detectInputType(rawText, fileName);

      let scrapedData: Awaited<ReturnType<typeof scrapeUrl>> | undefined;
      let techAudit: TechAuditResult | undefined;

      if (inputType === "url") {
        sendEvent("status", { step: "scraping", message: "Scraping website + tech audit..." });
        const [scrapeResult, auditResult] = await Promise.allSettled([
          scrapeUrl(rawText),
          deepTechAudit(rawText),
        ]);
        if (scrapeResult.status === "fulfilled") scrapedData = scrapeResult.value;
        if (auditResult.status === "fulfilled") techAudit = auditResult.value;
      }

      // Step 3: SVI computation
      sendEvent("status", { step: "svi", message: "Computing SVI score..." });
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
        message: `SVI: ${analysis.totalSVI} | Stage: ${analysis.stageLabel}`,
      });

      // Step 4: Generate selected sections at chosen depths
      sendEvent("status", {
        step: "generating",
        message: `Generating ${validatedSections.length} section${validatedSections.length > 1 ? "s" : ""}...`,
      });

      const pages = await generateSectionReport(
        rawText,
        analysis,
        inputType,
        validatedSections,
        scrapedData,
        (msg) => sendEvent("status", { step: "progress", message: msg }),
        techAudit,
      );

      // Step 5: Charge credits (only after successful generation)
      if (authenticatedUserId) {
        for (const section of validatedSections) {
          const featureKey = `section_${section.depth}` as string;
          await spendCredits(authenticatedUserId, featureKey, {
            sectionId: section.sectionId,
            depth: section.depth,
            words: SECTION_DEPTH_CONFIG[section.depth].words,
          });
        }
      }

      // Step 6: Persist
      const supabase = getSupabaseAdmin();
      let slug = newSlug();
      if (supabase) {
        await supabase.from("svi_analyses").insert({
          id: slug,
          email,
          raw_input: rawText,
          file_name: fileName ?? null,
          total_svi: analysis.totalSVI,
          net_adjustment: analysis.netAdjustment,
          confidence_multiplier: analysis.confidenceMultiplier,
          analysis_json: analysis,
          svi_version: analysis.version,
          rnd_report_json: { version: "1.0.0", inputType, pages, tier: "modular", createdAt: new Date().toISOString() },
          input_type: inputType,
          scraped_url: inputType === "url" ? rawText : null,
        });
      }

      // Step 7: Complete
      sendEvent("complete", {
        slug,
        pages,
        analysis,
        totalSVI: analysis.totalSVI,
        creditsCharged: costBreakdown.totalCredits,
        sectionsGenerated: pages.length,
      });
    } catch (err) {
      console.error("[rnd:sections] Pipeline error:", err);
      sendEvent("error", {
        error: err instanceof Error ? err.message : "Section generation failed.",
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
