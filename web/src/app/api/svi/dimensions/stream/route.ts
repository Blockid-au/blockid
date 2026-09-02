import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI } from "@/lib/ai-client";
import { getCriteriaByDimension } from "@/lib/evaluation-criteria";

export const dynamic = "force-dynamic";

// ── Dimension metadata ────────────────────────────────────────────────────────

const DIM_META: Record<string, { label: string; weight: number; description: string }> = {
  ftv: {
    label: "Founder & Team Value",
    weight: 15,
    description:
      "Founding team credibility, domain expertise, execution track record, and team completeness",
  },
  mpc: {
    label: "Market & Problem Clarity",
    weight: 18,
    description:
      "Market size (TAM/SAM/SOM), problem severity, customer segment definition, and timing",
  },
  ptd: {
    label: "Product & Tech Depth",
    weight: 12,
    description:
      "Product differentiation, technical moat, IP, build stage, and scalability",
  },
  tre: {
    label: "Traction & Revenue Evidence",
    weight: 20,
    description:
      "Revenue, MoM growth, DAU/MAU, retention, paying customers, and pipeline",
  },
  cgh: {
    label: "Cap Table & Governance",
    weight: 12,
    description:
      "Equity structure, vesting schedules, board composition, and investor governance",
  },
  iri: {
    label: "Investor Readiness Index",
    weight: 10,
    description:
      "Data room completeness, pitch deck quality, due diligence readiness, and prior raises",
  },
  lco: {
    label: "Legal & Compliance",
    weight: 8,
    description:
      "Legal incorporation, IP protection, regulatory compliance, and contract hygiene",
  },
  svm: {
    label: "Strategic Vision & Moat",
    weight: 5,
    description:
      "Long-term defensibility, network effects, brand positioning, and exit potential",
  },
};

// ── Startup context type ──────────────────────────────────────────────────────

interface StartupContext {
  startupName: string;
  industry: string;
  stage: string;
  currentSvi: number;
  analysisSnippet: string;
}

// ── Dimension result type ─────────────────────────────────────────────────────

interface DimensionResult {
  dimension: string;
  label: string;
  score: number;
  markdown: string;
  insights: string[];
  priority: "high" | "medium" | "low";
}

// ── Fetch startup context from Supabase ───────────────────────────────────────

async function fetchStartupContext(
  userId: string,
  projectId: string | null,
): Promise<StartupContext> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {
      startupName: "Your Startup",
      industry: "Technology",
      stage: "Seed",
      currentSvi: 0,
      analysisSnippet: "",
    };
  }

  // Resolve project if not provided
  let resolvedProjectId = projectId;
  if (!resolvedProjectId) {
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("project_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    resolvedProjectId = (account?.project_id as string | null) ?? null;
  }

  // Fetch the latest snapshot for context
  let currentSvi = 0;
  let analysisSnippet = "";

  if (resolvedProjectId) {
    const { data: snapshot } = await supabase
      .from("svi_snapshots")
      .select("overall_score, analysis_text")
      .eq("project_id", resolvedProjectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshot) {
      currentSvi = (snapshot.overall_score as number) ?? 0;
      const rawText = (snapshot.analysis_text as string) ?? "";
      analysisSnippet = rawText.slice(0, 800);
    }
  }

  // Fetch user/account details
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("startup_name, industry, current_stage, current_svi")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    startupName: (account?.startup_name as string) ?? "Your Startup",
    industry: (account?.industry as string) ?? "Technology",
    stage: (account?.current_stage as string) ?? "Seed",
    currentSvi: currentSvi || ((account?.current_svi as number) ?? 0),
    analysisSnippet,
  };
}

// ── Analyse one SVI dimension via AI ─────────────────────────────────────────

async function analyzeOneDimension(
  dim: string,
  ctx: StartupContext,
): Promise<DimensionResult> {
  const meta = DIM_META[dim];

  const system = `You are a strict, evidence-first startup investment analyst for the BlockID Startup Value Index (SVI).

HARD RULES (violating any = score becomes untrustworthy):
1. Base your score ONLY on what the deck excerpt below actually says. If the deck is silent on this dimension, default toward the low end (30-45) and say so.
2. Every strength/gap must quote a fragment of the deck (≤15 words per quote) or explicitly note "not stated in deck".
3. Never invent numbers — TAM, revenue, growth, hires, funding — that aren't in the deck. If they're missing, mark them as gaps.
4. Reference AU market context where relevant (PitchBook AU 2024-2026 seed medians, ACS AU salary bands, ABS sector data) but never fabricate specific figures.
5. Score honestly: a great-looking deck with unverifiable claims = ~50, not 80.

Return ONLY valid JSON — no markdown fences, no prose outside the JSON.

JSON schema (strict):
{
  "dimension": string,       // e.g. "ftv"
  "label": string,
  "score": number,           // 0-100, evidence-anchored
  "markdown": string,        // ≤300 words. Structure EXACTLY:
                             // **Strengths (with deck evidence):**
                             // - "quoted fragment" → why it matters
                             // **Gaps (what's missing or unverifiable):**
                             // - Specific missing signal → what to add
                             // **Next Step (concrete, this-week action):**
                             // - Do X to lift this dim by ~Y points
  "insights": string[],      // exactly 2, each ≤15 words, each cites deck or explicitly says "not in deck"
  "priority": "high"|"medium"|"low"
}`;

  // Attach the specific investor criteria that map to this SVI dimension
  // (from lib/evaluation-criteria — 13 canonical criteria). Gives the LLM
  // a focused checklist to grade against instead of a generic dimension
  // definition, which improves consistency + traceability of scores.
  const criteria = getCriteriaByDimension(dim);
  const criteriaSection = criteria.length > 0
    ? `\n\nGrade against these specific criteria (each maps to this dimension):\n${criteria
        .map((c) => `- **${c.title}** — ${c.subtitle}. Ask: ${c.guidingQuestions.slice(0, 2).join(" / ")}`)
        .join("\n")}`
    : "";

  const deckSection = ctx.analysisSnippet
    ? `\n\nDECK EXCERPT (this is your only source of truth for this startup — do NOT invent facts beyond it):\n"""\n${ctx.analysisSnippet.slice(0, 4000)}\n"""`
    : `\n\nDECK EXCERPT: (none supplied — score should reflect the absence of evidence, likely 30-45).`;

  const user = `Startup: ${ctx.startupName}
Industry: ${ctx.industry}
Stage: ${ctx.stage}
Overall SVI score: ${ctx.currentSvi}/100

Dimension to analyse: ${dim.toUpperCase()} — ${meta.label}
Weight: ${meta.weight}% of total SVI
Focus: ${meta.description}${criteriaSection}${deckSection}

Score this dimension (0-100) grounded in the deck excerpt. Quote fragments as evidence.
Respond with ONLY the JSON object.`;

  const result = await callAI({ system, user, maxTokens: 500, timeoutMs: 45_000 });

  // Parse — strip any accidental markdown fences
  let raw = result.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
  }

  let parsed: DimensionResult;
  try {
    parsed = JSON.parse(raw) as DimensionResult;
  } catch {
    // Fallback: construct a minimal valid result
    parsed = {
      dimension: dim,
      label: meta.label,
      score: 50,
      markdown: result.text.slice(0, 500),
      insights: ["Analysis completed", "Review the full report for details"],
      priority: "medium",
    };
  }

  // Ensure required fields are present
  parsed.dimension = dim;
  parsed.label = meta.label;
  parsed.score = Math.max(0, Math.min(100, Number(parsed.score) || 50));
  if (!Array.isArray(parsed.insights) || parsed.insights.length === 0) {
    parsed.insights = ["See analysis for details"];
  }
  if (!["high", "medium", "low"].includes(parsed.priority)) {
    parsed.priority = "medium";
  }

  return parsed;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Auth check
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let projectId: string | null = null;
  let dimsFilter: string[] | null = null;
  let deckText: string | null = null;
  let mode: "parallel" | "sequential" = "parallel";
  try {
    const body = (await request.json()) as {
      projectId?: string;
      dims?: string[];
      deckText?: string;
      mode?: "parallel" | "sequential";
    };
    projectId = body.projectId ?? null;
    if (body.mode === "sequential") mode = "sequential";
    // Optional per-dimension retry: only run the dims the client asks for.
    // Unknown keys are dropped silently — the UI passes valid keys.
    if (Array.isArray(body.dims)) {
      const valid = body.dims.filter((k) => typeof k === "string" && k in DIM_META);
      dimsFilter = valid.length > 0 ? valid : null;
    }
    // Pitchdeck flow (Wave 11): caller supplies the extracted deck text as
    // the primary context source. Capped at 8 KiB to stay in the fast tier's
    // context window on top of the per-dim prompt template.
    if (typeof body.deckText === "string" && body.deckText.trim().length > 0) {
      deckText = body.deckText.slice(0, 8_000);
    }
  } catch {
    // body is optional
  }

  const encoder = new TextEncoder();
  const startMs = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller may have been closed if client disconnected
        }
      };

      try {
        // Fetch startup context once for all dimensions
        const ctx = await fetchStartupContext(user.id, projectId);

        // If a pitchdeck text was supplied, prefer it over the snapshot
        // snippet — this is a fresh-deck analysis, not a re-score of the
        // last stored analysis.
        if (deckText) {
          ctx.analysisSnippet = deckText;
        }

        // Surface the founder's industry + stage to the client so the done
        // panel can render a cohort comparison ("your SVI vs SaaS median").
        send({ type: "context", industry: ctx.industry, stage: ctx.stage });

        const dims = dimsFilter ?? Object.keys(DIM_META);
        let completed = 0;
        const total = dims.length;

        const runOne = async (dim: string) => {
          send({
            type: "dimension_start",
            dimension: dim,
            label: DIM_META[dim].label,
          });
          try {
            const result = await analyzeOneDimension(dim, ctx);
            send({
              type: "dimension_complete",
              dimension: result.dimension,
              label: result.label,
              score: result.score,
              markdown: result.markdown,
              insights: result.insights,
              priority: result.priority,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[svi-stream] dimension ${dim} failed: ${msg}`);
            send({
              type: "error",
              dimension: dim,
              message: msg.includes("rate") ? "Rate limited, skipped" : "Analysis failed",
            });
          } finally {
            completed += 1;
            send({ type: "progress", completed, total });
          }
        };

        if (mode === "sequential") {
          // Sequential mode — one dim at a time with a 300ms breather between
          // requests. Slower wall-clock but avoids the provider rate-limit
          // bursts we hit in parallel mode, and lets the founder see steady
          // progress. Used by the pitchdeck flow by default.
          for (const dim of dims) {
            await runOne(dim);
            if (completed < total) {
              await new Promise((r) => setTimeout(r, 300));
            }
          }
        } else {
          // Parallel — original behaviour: fan out all dims via allSettled,
          // fastest total time when the AI providers have headroom.
          await Promise.allSettled(dims.map((dim) => runOne(dim)));
        }

        send({ type: "done", totalMs: Date.now() - startMs });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "fatal_error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering for SSE
    },
  });
}
