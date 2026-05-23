import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";

function detectLanguage(text: string): "en" | "vi" | "auto" {
  // Simple heuristic: check for Vietnamese diacritical marks
  const viPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  const viCount = (text.match(viPattern) || []).length;
  // If more than 3% of chars are Vietnamese diacritics, it's Vietnamese
  if (viCount > 0 && viCount / text.length > 0.03) return "vi";
  // Check for common Vietnamese words without diacritics
  const viWords = /\b(cua|cong|ty|ung|dung|khach|hang|thi|truong|san|pham|kinh|doanh|phat|trien)\b/gi;
  const viWordCount = (text.match(viWords) || []).length;
  if (viWordCount >= 3) return "vi";
  return "en";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  // ── Locale detection ────────────────────────────────────────────────
  const store = await cookies();
  const locale = store.get("blockid_lang")?.value === "vi" ? "vi" : "en";

  // ── Credit check ────────────────────────────────────────────────────
  const affordCheck = await canAfford(user.id, "svi_report");
  if (!affordCheck.allowed) {
    return NextResponse.json({
      ok: false,
      error: "Insufficient credits",
      balance: affordCheck.balance,
      cost: affordCheck.cost,
    }, { status: 402 });
  }

  try {
    const body = await request.json() as {
      rawText: string;
      analysis: SVIAnalysis;
      email: string;
    };

    if (!body.rawText?.trim() || !body.analysis) {
      return NextResponse.json({ ok: false, error: "rawText and analysis required" }, { status: 400 });
    }

    // Auto-detect input language (overrides cookie if input is clearly Vietnamese)
    const inputLang = detectLanguage(body.rawText);
    const effectiveLocale = inputLang === "vi" ? "vi" : locale;

    const { analysis } = body;
    const stageLabel = SVI_STAGE_LABELS[analysis.stage ?? 0] ?? "Unknown";

    const dimSummary = (analysis.subs ?? []).map(s =>
      `- ${s.label}: ${s.value}/100 (${s.adjustment >= 0 ? "+" : ""}${s.adjustment})`
    ).join("\n");

    const riskSummary = (analysis.riskPenalties ?? []).map(r =>
      `- ${r.label}: -${r.points} points (${r.reason})`
    ).join("\n");

    const gapSummary = (analysis.evidenceGaps ?? []).map(g =>
      `- [${g.priority}] ${g.label}: ${g.action} (+${g.impact} SVI potential)`
    ).join("\n");

    const langInstruction = effectiveLocale === "vi"
      ? `QUAN TRONG: Viet TOAN BO bao cao bang tieng Viet. Su dung giong van chuyen nghiep nhung gan gui, de hieu cho cac nha sang lap Viet Nam tai Uc. Giu nguyen cac thuat ngu ky thuat bang tieng Anh khi can thiet (vi du: "cap table", "SVI", "pitch deck") nhung giai thich bang tieng Viet.\n\n`
      : "";

    const systemPrompt = `${langInstruction}You are a friendly, experienced startup mentor writing a personalised report for a founder. Your tone is warm, encouraging, and practical — like a trusted advisor who genuinely wants this founder to succeed.

Writing Style:
- Write as if you're talking to the founder over coffee — warm, direct, no jargon
- When you must use a technical term, explain it simply in brackets: "cap table (the document showing who owns what percentage)"
- Celebrate what's going well FIRST, then address gaps gently
- Every criticism must come with a specific, actionable fix
- Use "you" and "your" — make it personal
- Use encouraging phrases: "Great start!", "You're on the right track", "Here's your next win"

Structure (progressive — basic to advanced):
- Start with what the founder has done RIGHT (build confidence)
- Then introduce the NEXT logical step (not 10 steps — just the next one)
- Gradually reveal more advanced concepts as the founder is ready
- End with a clear, motivating call-to-action

Report Length:
- Minimum 800 words, no maximum — write as much as needed to be genuinely helpful
- Each section should be thorough enough that the founder knows exactly what to do
- Include specific examples, templates, or frameworks when relevant
- Don't pad with fluff, but don't cut corners on explanations either

Format:
- Markdown with H2 (##) and H3 (###) headings
- Use bullet points sparingly — prefer short paragraphs that read naturally
- Bold key terms and action items
- Use > blockquotes for "Pro Tips" that add extra value`;

    const sectionHeaders = effectiveLocale === "vi" ? {
      scoreExplained: "1. Giai Thich Diem So Cua Ban",
      doingRight: "2. Nhung Dieu Ban Dang Lam Dung",
      biggestOpportunity: "3. Co Hoi Lon Nhat Cua Ban Ngay Bay Gio",
      growthPlan: "4. Ke Hoach Phat Trien 30 Ngay",
      dimensions: "5. Hieu Cac Chieu Danh Gia",
      investorReadiness: "6. Kiem Tra San Sang Goi Von",
      nextStep: "7. Buoc Tiep Theo",
    } : {
      scoreExplained: "1. Your Score Explained",
      doingRight: "2. What You're Doing Right",
      biggestOpportunity: "3. Your Biggest Opportunity Right Now",
      growthPlan: "4. Your 30-Day Growth Plan",
      dimensions: "5. Understanding Your Dimensions",
      investorReadiness: "6. Investor Readiness Check",
      nextStep: "7. Your Next Step",
    };

    const userMessage = `Write a personalised startup report for this founder.${effectiveLocale === "vi" ? " Write the ENTIRE report in Vietnamese." : ""}

## Their Startup:
${body.rawText.slice(0, 4000)}

## Current Score: ${analysis.totalSVI} out of 300 (starting baseline is 100)
## Journey Stage: ${analysis.stage ?? 0} — "${stageLabel}"
## Evidence Confidence: ${Math.round(analysis.confidenceMultiplier * 100)}%

## What's Working:
${dimSummary}

## Risk Areas:
${riskSummary || "None — clean profile!"}

## Evidence Gaps:
${gapSummary || "None identified yet"}

## AI Summary: ${analysis.summary}

---

Write the report with these sections (in this order — basic to advanced):

## ${sectionHeaders.scoreExplained}
Explain what ${analysis.totalSVI} means in plain language. Is this good for their stage? What does Stage ${analysis.stage} ("${stageLabel}") mean for them practically? Compare to typical startups at this stage. Be honest but encouraging.

## ${sectionHeaders.doingRight}
Celebrate their strengths. Be specific — point to actual things from their description. This builds confidence and motivates them to continue. At least 3 specific things.

## ${sectionHeaders.biggestOpportunity}
Don't list 10 things. Identify THE ONE thing that would make the biggest difference if they did it this week. Explain WHY it matters, HOW to do it step-by-step, and what impact it would have on their score. Be very specific — like a mentor giving homework.

## ${sectionHeaders.growthPlan}
A progressive roadmap, NOT a flat list. Structure it as a journey:
- **Week 1**: The quick win (something they can do today)
- **Week 2**: Building the foundation (setting up the basics)
- **Week 3**: Adding credibility (evidence and proof)
- **Week 4**: Levelling up (more advanced moves)
Each week should build on the previous one. Include specific tools, templates, or resources.

## ${sectionHeaders.dimensions}
For each of their 8 scores, give a plain-English explanation:
- What this dimension measures (in simple terms)
- Why it matters for fundraising/growth
- Their score and what it means
- ONE specific thing to improve it
Keep each dimension to 2-3 sentences — don't overwhelm.

## ${sectionHeaders.investorReadiness}
An honest but kind assessment. If they're not ready yet, frame it as "here's what you need before approaching investors" rather than "you're not ready." Include specific milestones.

## ${sectionHeaders.nextStep}
End with ONE clear call-to-action. The single most impactful thing they should do RIGHT NOW. Make it feel achievable and exciting, not overwhelming.

> **Pro Tip**: Include a motivational closing that reminds them every successful startup started exactly where they are.

Write naturally, be thorough, and remember: this founder is trusting you with their dream. Make the report worth their investment.`;

    // Retry up to 2 times with reduced tokens on failure
    let text = "";
    let lastError: Error | null = null;
    const attempts = [
      { maxTokens: 4096, label: "full" },
      { maxTokens: 2048, label: "compact" },
      { maxTokens: 1024, label: "minimal" },
    ];

    for (const attempt of attempts) {
      try {
        const result = await callAI({
          system: systemPrompt,
          user: attempt.label === "full"
            ? userMessage
            : userMessage.replace("Minimum 800 words", "Minimum 400 words").replace("be thorough", "be concise"),
          maxTokens: attempt.maxTokens,
        });
        text = result.text;
        break; // Success
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[blockid:report] Attempt ${attempt.label} failed: ${lastError.message}`);
      }
    }

    if (!text) {
      console.error("[blockid:report] All attempts failed:", lastError);
      return NextResponse.json({ ok: false, error: "Report generation failed. Please try again in a moment." }, { status: 500 });
    }

    // ── Spend credits after successful generation ───────────────────
    const spend = await spendCredits(user.id, "svi_report", {
      email: body.email,
    });

    return NextResponse.json({
      ok: true,
      report: text,
      wordCount: text.split(/\s+/).length,
      generatedAt: new Date().toISOString(),
      balance: spend.balance,
      creditsUsed: FEATURE_COSTS.svi_report,
    });

  } catch (err) {
    console.error("[blockid:report]", err);
    return NextResponse.json({ ok: false, error: "Report generation failed. Please try again." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 2 minutes for long AI reports
