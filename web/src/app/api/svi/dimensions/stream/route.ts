import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI } from "@/lib/ai-client";
import { getCriteriaByDimension, CRITERIA } from "@/lib/evaluation-criteria";

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

// ── Criterion synthesis result ────────────────────────────────────────────────

export interface CriterionResult {
  key: string;
  title: string;
  primary_dimension: string;
  weight: number;
  score: number;          // 0-100, derived from dimension scores
  verdict: string;        // 2-3 sentences with evidence grounding
  strengths: string[];    // 2 items ≤20 words each
  gaps: string[];         // 2 items ≤20 words each
  next_action: string;    // 1 concrete this-week action ≤20 words
}

// ── Dimension result type ─────────────────────────────────────────────────────

interface DimensionResult {
  dimension: string;
  label: string;
  score: number;
  markdown: string;
  insights: string[];
  priority: "high" | "medium" | "low";
  /** 1-2 sentence AU/NZ market benchmark for this dimension — e.g.
   *  "AU seed median TRE score: 42. Top-quartile startups show MoM
   *  revenue growth ≥15% and ≥10 paying customers." Omitted when the AI
   *  can't give a reliable benchmark for the sector. */
  market_benchmark?: string;
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
  "priority": "high"|"medium"|"low",
  "market_benchmark": string  // 1-2 sentences: AU/NZ median for this dim at this stage/sector.
                              // Include a specific data point (e.g. "AU seed median TRE: 42").
                              // Use PitchBook AU 2024-2026, ACS, ABS, KPMG AU VC Survey 2026.
                              // Omit invented figures — say "benchmark data unavailable" if unsure.
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

  const result = await callAI({ system, user, maxTokens: 600, timeoutMs: 45_000 });

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
  if (typeof parsed.market_benchmark !== "string" || parsed.market_benchmark.trim().length < 5) {
    parsed.market_benchmark = undefined;
  }

  return parsed;
}

// ── Criteria synthesis: one AI call → 13 criterion assessments ───────────────

async function synthesizeCriteria(
  dimResults: DimensionResult[],
  ctx: StartupContext,
): Promise<CriterionResult[]> {
  const dimSummary = dimResults
    .map((r) => `${r.dimension.toUpperCase()} (${r.label}): score=${r.score}, priority=${r.priority}. Insights: ${r.insights.join(" / ")}`)
    .join("\n");

  const criteriaList = CRITERIA.map((c) =>
    `- key="${c.key}" title="${c.title}" primaryDim="${c.primaryDimension}" weight=${c.weight} subtitle="${c.subtitle}"`
  ).join("\n");

  const system = `You are a startup investment analyst synthesising dimension-level SVI scores into granular criterion assessments.

You will receive:
1. 8 SVI dimension scores + insights for a startup
2. 13 evaluation criteria definitions (each maps to a primary SVI dimension)

Your job: output a JSON array of exactly 13 CriterionResult objects — one per criterion key, in the SAME ORDER as the input list.

JSON schema per item (strict — no extra fields):
{
  "key": string,           // exact criterion key from input
  "title": string,         // exact title from input
  "primary_dimension": string,  // exact primaryDim from input
  "weight": number,        // exact weight from input
  "score": number,         // 0-100. Derive from the primary dimension score ±15 based on how well this specific criterion fits the dimension evidence. Do NOT invent numbers.
  "verdict": string,       // 2-3 sentences. Ground in dimension insights. Be specific — no generic filler.
  "strengths": string[],   // exactly 2 items, each ≤20 words, cite dimension evidence
  "gaps": string[],        // exactly 2 items, each ≤20 words, specific missing signal
  "next_action": string    // 1 concrete this-week action ≤20 words
}

Return ONLY the JSON array. No markdown fences, no prose outside the JSON.`;

  const user = `Startup: ${ctx.startupName} | Industry: ${ctx.industry} | Stage: ${ctx.stage}

DIMENSION RESULTS:
${dimSummary}

CRITERIA TO ASSESS (13 total):
${criteriaList}

Output the JSON array of 13 CriterionResult objects now.`;

  const result = await callAI({ system, user, maxTokens: 3000, timeoutMs: 60_000 });

  let raw = result.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
  }

  try {
    const parsed = JSON.parse(raw) as CriterionResult[];
    if (!Array.isArray(parsed)) throw new Error("not array");
    return parsed.map((item, idx) => {
      const def = CRITERIA[idx] ?? CRITERIA[0];
      return {
        key: String(item.key ?? def.key),
        title: String(item.title ?? def.title),
        primary_dimension: String(item.primary_dimension ?? def.primaryDimension),
        weight: Number.isFinite(Number(item.weight)) ? Number(item.weight) : def.weight,
        score: Math.max(0, Math.min(100, Number(item.score) || 50)),
        verdict: String(item.verdict ?? ""),
        strengths: Array.isArray(item.strengths) ? item.strengths.slice(0, 2) : [],
        gaps: Array.isArray(item.gaps) ? item.gaps.slice(0, 2) : [],
        next_action: String(item.next_action ?? ""),
      };
    });
  } catch {
    // Fallback: derive scores deterministically from dim results, no AI text
    const dimScoreMap: Record<string, number> = {};
    for (const r of dimResults) dimScoreMap[r.dimension] = r.score;
    return CRITERIA.map((c) => ({
      key: c.key,
      title: c.title,
      primary_dimension: c.primaryDimension,
      weight: c.weight,
      score: Math.round(
        (dimScoreMap[c.primaryDimension] ?? 50) * 0.7 +
        c.secondaryDimensions.reduce((acc, d) => acc + (dimScoreMap[d] ?? 50), 0) /
          Math.max(1, c.secondaryDimensions.length) * 0.3,
      ),
      verdict: `Derived from ${c.primaryDimension.toUpperCase()} dimension analysis.`,
      strengths: ["Refer to dimension analysis for strengths"],
      gaps: ["Evidence collection needed for this criterion"],
      next_action: `Gather ${c.minEvidence}+ evidence items for ${c.title}`,
    }));
  }
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
        const dimResults: DimensionResult[] = [];

        const runOne = async (dim: string) => {
          send({
            type: "dimension_start",
            dimension: dim,
            label: DIM_META[dim].label,
          });
          try {
            const result = await analyzeOneDimension(dim, ctx);
            dimResults.push(result);
            send({
              type: "dimension_complete",
              dimension: result.dimension,
              label: result.label,
              score: result.score,
              markdown: result.markdown,
              insights: result.insights,
              priority: result.priority,
              ...(result.market_benchmark
                ? { market_benchmark: result.market_benchmark }
                : {}),
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

        // Wave 24: after all 8 dims complete, synthesise 13 per-criterion
        // assessments in one batched AI call. Only runs when we have a full
        // 8-dim set (not on partial retry runs) so the synthesis prompt has
        // enough context to be meaningful.
        if (!dimsFilter && dimResults.length > 0) {
          send({ type: "criteria_synthesis_start", total: 13 });
          try {
            const criteriaResults = await synthesizeCriteria(dimResults, ctx);
            send({ type: "criteria_synthesis", criteria: criteriaResults });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[svi-stream] criteria synthesis failed: ${msg}`);
            // Non-fatal — business report falls back to derived scores
          }
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
