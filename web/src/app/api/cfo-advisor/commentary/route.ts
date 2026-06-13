import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

export interface CFOCommentaryRequest {
  mrr: number;
  burn_rate: number;
  cash_balance: number;
  team_size: number;
  stage: string;
  startup_name?: string;
}

export interface CFOCommentaryResponse {
  ok: true;
  health_score: number;
  commentary: string[];
  alerts: string[];
}

export interface CFOCommentaryError {
  ok: false;
  error: string;
}

function computeHealthScore({
  mrr,
  burn_rate,
  cash_balance,
  stage,
}: CFOCommentaryRequest): number {
  const runway_months = burn_rate > 0 ? cash_balance / burn_rate : 99;
  let score = 100;

  if (runway_months < 3) score -= 40;
  else if (runway_months < 6) score -= 20;

  const mvpStages = ["mvp", "launch", "growth", "scale", "series_a", "series_b"];
  if (mrr === 0 && mvpStages.includes(stage.toLowerCase())) score -= 15;

  if (burn_rate > 0 && burn_rate > mrr * 3) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function computeAlerts({
  mrr,
  burn_rate,
  cash_balance,
  stage,
}: CFOCommentaryRequest): string[] {
  const alerts: string[] = [];
  const runway_months = burn_rate > 0 ? cash_balance / burn_rate : 99;

  if (runway_months < 6 && runway_months >= 3) {
    alerts.push(`Runway is ${runway_months.toFixed(1)} months — start fundraising now to avoid a cash crisis.`);
  }
  if (runway_months < 3) {
    alerts.push(`Critical: Runway is under 3 months. Immediate action required — cut burn or close a bridge round.`);
  }
  if (mrr === 0) {
    const mvpStages = ["mvp", "launch", "growth", "scale", "series_a", "series_b"];
    if (mvpStages.includes(stage.toLowerCase())) {
      alerts.push("No revenue recorded despite being post-idea stage. Prioritise your first paying customer.");
    }
  }
  if (burn_rate > 0 && burn_rate > mrr * 3) {
    alerts.push(`Burn rate is ${((burn_rate / Math.max(mrr, 1)) * 100).toFixed(0)}% of MRR — unit economics are unsustainable.`);
  }
  if (cash_balance === 0 && burn_rate > 0) {
    alerts.push("Cash balance is zero. Operations cannot continue without immediate capital injection.");
  }

  return alerts;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const toNum = (v: unknown): number => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 0;
  };

  const input: CFOCommentaryRequest = {
    mrr: toNum(body.mrr),
    burn_rate: toNum(body.burn_rate),
    cash_balance: toNum(body.cash_balance),
    team_size: toNum(body.team_size),
    stage: typeof body.stage === "string" ? body.stage : "idea",
    startup_name: typeof body.startup_name === "string" ? body.startup_name : undefined,
  };

  const health_score = computeHealthScore(input);
  const alerts = computeAlerts(input);

  const runway_months = input.burn_rate > 0 ? input.cash_balance / input.burn_rate : null;
  const arr = input.mrr * 12;

  const prompt = `You are a seasoned CFO advisor for early-stage startups. Analyse this financial snapshot and return EXACTLY 4 bullet-point insights (no headers, no preamble, just the 4 bullets). Each bullet should be concise (1-2 sentences), actionable, and honest.

Startup: ${input.startup_name ?? "the startup"}
Stage: ${input.stage}
Team size: ${input.team_size}
MRR: A$${input.mrr.toLocaleString()}
ARR: A$${arr.toLocaleString()}
Monthly burn: A$${input.burn_rate.toLocaleString()}
Cash balance: A$${input.cash_balance.toLocaleString()}
Runway: ${runway_months != null ? `${runway_months.toFixed(1)} months` : "N/A (no burn)"}
Financial health score: ${health_score}/100

Provide 4 bullet points as plain text starting with "• ":`;

  try {
    const result = await callAI({
      system: "You are a CFO advisor providing financial health insights for startups. Be direct, honest, and actionable. Return exactly 4 bullet points starting with •.",
      user: prompt,
      maxTokens: 400,
      timeoutMs: 30_000,
    });

    const raw = result.text.trim();
    const bullets = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("•"))
      .map((l) => l.replace(/^•\s*/, "").trim())
      .slice(0, 4);

    // Fallback: split by newline and take first 4 non-empty lines
    const commentary: string[] =
      bullets.length >= 2
        ? bullets
        : raw
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 4);

    const response: CFOCommentaryResponse = {
      ok: true,
      health_score,
      commentary,
      alerts,
    };

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "CFO advisor failed" },
      { status: 500 },
    );
  }
}
