/**
 * POST /api/term-sheet
 *
 * Body: { termSheet: string, capTable?: Holder[] | null, round?: Round | null }
 *
 * Returns the structured Term Sheet AI v2 analysis plus an optional dilution
 * diff (computed locally via @/lib/cap-table — we never ask the model to
 * compute share counts; it's worse at arithmetic than computeDiff()).
 *
 * v2: saves the analysis to `term_sheet_analyses` when the user is
 * authenticated and Supabase is configured. Returns `analysis_id` in the
 * response payload.
 *
 * The route degrades to demo mode if ANTHROPIC_API_KEY is missing or the
 * SDK throws — the founder funnel must not block on transient API issues.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";
import { createHash } from "crypto";
import { analyzeTermSheet } from "@/lib/term-sheet/analyze";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
import { generateLawyerQuestions } from "@/lib/term-sheet-lawyer-questions";

const HolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  shares: z.number(),
  shareClass: z.enum(["common", "preferred", "esop", "safe"]),
  isFounder: z.boolean().optional(),
});

const RoundSchema = z.object({
  preMoneyAud: z.number(),
  raiseAud: z.number(),
  esopTopUpPct: z.number(),
  esopTimingPreMoney: z.boolean(),
  leadInvestorName: z.string(),
});

const BodySchema = z.object({
  termSheet: z
    .string()
    .min(100, "Term sheet too short — paste the full text (min 100 chars).")
    .max(30000, "Term sheet too long — paste up to 30,000 characters."),
  capTable: z.array(HolderSchema).nullable().optional(),
  round: RoundSchema.nullable().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }

  const { termSheet, capTable, round } = parsed.data;

  // ── Credit check ────────────────────────────────────────────────────
  const affordCheck = await canAfford(user.id, "term_sheet");
  if (!affordCheck.allowed) {
    return NextResponse.json({
      ok: false,
      error: "Insufficient credits",
      balance: affordCheck.balance,
      cost: affordCheck.cost,
    }, { status: 402 });
  }

  try {
    const result = await analyzeTermSheet({
      termSheet,
      capTable: capTable ?? null,
      round: round ?? null,
    });

    // ── Spend credits after successful analysis ─────────────────────
    const spend = await spendCredits(user.id, "term_sheet");

    const lawyerQuestionsV2 = generateLawyerQuestions(result.analysis);
    const companyName = extractCompanyName(termSheet);
    const headlineValuation =
      result.analysis?.keyTerms.valuationCapAud ??
      result.analysis?.keyTerms.postMoneyAud ??
      result.analysis?.keyTerms.preMoneyAud ??
      null;

    // ── Persist analysis to Supabase (best-effort, never blocks response) ──
    let analysisId: string | null = null;
    const projectId = await getProjectIdFromRequest();
    const supabase = getSupabaseAdmin();
    if (supabase && result.analysis) {
      try {
        const textHash = createHash("sha256").update(termSheet).digest("hex");

        // Derive top-level summary fields from the analysis for fast queries.
        const riskLevels = result.analysis.redline.map((r) => r.risk_level);
        const riskPriority: Record<string, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        };
        const worstRisk = riskLevels.reduce<string | null>((acc, lvl) => {
          if (!acc) return lvl;
          return (riskPriority[lvl] ?? 0) > (riskPriority[acc] ?? 0) ? lvl : acc;
        }, null);

        const { data: inserted, error: insertErr } = await supabase
          .from("term_sheet_analyses")
          .insert({
            user_id: user.id,
            email: user.email,
            project_id: projectId,
            term_sheet_text_hash: textHash,
            raw_text: termSheet,
            result_json: result.analysis,
            analysis_json: result.analysis,
            risk_level_summary: worstRisk,
            valuation_cap: result.analysis.keyTerms.valuationCapAud,
            valuation_aud: headlineValuation,
            discount_rate: result.analysis.keyTerms.discountPct,
            pro_rata: result.analysis.keyTerms.proRataRights,
            company_name: companyName,
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("[blockid:termsheet] Failed to persist analysis", insertErr.message);
        } else {
          analysisId = (inserted as { id: string }).id;
        }
      } catch (persistErr) {
        // Non-fatal — the user still gets their analysis.
        console.error("[blockid:termsheet] Unexpected persist error", persistErr);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        mode: result.mode,
        analysis: result.analysis,
        dilution: result.dilution,
        balance: spend.balance,
        creditsUsed: FEATURE_COSTS.term_sheet,
        analysis_id: analysisId,
        lawyer_questions_v2: lawyerQuestionsV2,
        company_name: companyName,
        headline_valuation_aud: headlineValuation,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (err) {
    console.error("[blockid:termsheet] Unhandled error in POST", err);
    return NextResponse.json(
      { ok: false, error: "Analysis failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Storage unavailable" },
      { status: 503 },
    );
  }

  // Scope the delete to the owner so a compromised session can only touch its own rows.
  const { error } = await supabase
    .from("term_sheet_analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[blockid:termsheet] DELETE failed", error.message);
    return NextResponse.json({ ok: false, error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function extractCompanyName(raw: string): string | null {
  // Match "ACME PTY LTD", "Acme Inc", "Foo Bar Limited" at any position on the first
  // 400 chars — good enough to seed the SVI deep-link CTA.
  const head = raw.slice(0, 400);
  const m = head.match(
    /\b([A-Z][A-Za-z0-9&'.\- ]{2,80}?)\s+(PTY\s+LTD|PTY\.\s+LTD\.?|LIMITED|LTD\.?|INC\.?|CORP\.?|LLC|CO\.?)\b/,
  );
  if (!m) return null;
  const name = `${m[1].trim()} ${m[2].trim()}`.replace(/\s+/g, " ");
  return name.length > 120 ? name.slice(0, 120) : name;
}

export const dynamic = "force-dynamic";
