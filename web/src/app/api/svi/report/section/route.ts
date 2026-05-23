import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { callAI, isAIConfigured } from "@/lib/ai-client";

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

export const dynamic = "force-dynamic";

const SECTIONS = {
  score: {
    title: "Your Score Explained",
    prompt: (a: SVIAnalysis, raw: string) => `Explain what SVI score ${a.totalSVI} means for a "${SVI_STAGE_LABELS[a.stage ?? 0]}" stage startup in plain language. Be encouraging. 150 words max.`,
  },
  strengths: {
    title: "What You're Doing Right",
    prompt: (a: SVIAnalysis, raw: string) => `Based on this startup description, celebrate 3 specific strengths:\n\n${raw.slice(0, 1500)}\n\nDimension scores: ${a.subs?.map(s => `${s.label}: ${Math.round(s.value)}/100`).join(", ")}. 200 words max.`,
  },
  opportunity: {
    title: "Your Biggest Opportunity",
    prompt: (a: SVIAnalysis, raw: string) => `The top evidence gap is: ${a.evidenceGaps?.[0]?.label ?? "unknown"} — ${a.evidenceGaps?.[0]?.action ?? "improve evidence"}. Explain WHY this matters, HOW to do it step-by-step, and the impact. 200 words max.`,
  },
  plan: {
    title: "30-Day Growth Plan",
    prompt: (a: SVIAnalysis, raw: string) => `Create a 4-week progressive growth plan for a "${SVI_STAGE_LABELS[a.stage ?? 0]}" stage startup with SVI ${a.totalSVI}. Week 1: quick win. Week 2: foundation. Week 3: credibility. Week 4: level up. 250 words max.`,
  },
  dimensions: {
    title: "Understanding Your Dimensions",
    prompt: (a: SVIAnalysis, raw: string) => `For each dimension, give 1-2 sentence plain-English explanation and one improvement tip:\n${a.subs?.map(s => `- ${s.label}: ${Math.round(s.value)}/100`).join("\n")}. 300 words max.`,
  },
  investor: {
    title: "Investor Readiness Check",
    prompt: (a: SVIAnalysis, raw: string) => `Assess investor readiness for a "${SVI_STAGE_LABELS[a.stage ?? 0]}" stage startup with SVI ${a.totalSVI}. Has pitch deck: ${a.signals?.hasPitchDeck ?? false}. Has data room: ${a.signals?.hasDataRoom ?? false}. Be kind but honest. 150 words max.`,
  },
  nextstep: {
    title: "Your Next Step",
    prompt: (a: SVIAnalysis, raw: string) => `Give ONE clear, achievable call-to-action for this founder. Their top gap: ${a.evidenceGaps?.[0]?.label ?? "Add evidence"}. Make it exciting. 100 words max.`,
  },
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });
  if (!isAIConfigured()) return NextResponse.json({ ok: false, error: "AI not configured" }, { status: 503 });

  try {
    const { section, rawText, analysis } = await request.json() as {
      section: keyof typeof SECTIONS;
      rawText: string;
      analysis: SVIAnalysis;
    };

    const sectionDef = SECTIONS[section];
    if (!sectionDef) {
      return NextResponse.json({ ok: false, error: `Unknown section: ${section}` }, { status: 400 });
    }

    const lang = detectLanguage(rawText);
    const langNote = lang === "vi" ? " Write your response in Vietnamese." : "";

    const { text } = await callAI({
      system: `You are a friendly startup mentor.${langNote} Write in plain language, be encouraging. Use markdown formatting.`,
      user: sectionDef.prompt(analysis, rawText),
      maxTokens: 1024, // Small per section — avoids timeout
    });

    return NextResponse.json({
      ok: true,
      section,
      title: sectionDef.title,
      content: text,
    });
  } catch (err) {
    console.error(`[report-section]`, err);
    return NextResponse.json({ ok: false, error: "Section generation failed" }, { status: 500 });
  }
}
