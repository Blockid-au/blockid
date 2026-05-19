import { NextResponse } from "next/server";

// Simple keyword-based idea value estimator
// Returns AUD range based on text signals

function estimateFromText(text: string): {
  lowAud: number;
  highAud: number;
  strengths: string[];
  gaps: string[];
  nextStep: string;
} {
  const t = text.toLowerCase();
  const has = (...terms: string[]) => terms.some(w => t.includes(w));

  let base = 150000; // AUD $150k base

  // Market size signals
  if (has("billion", "trillion", "$1b", "$10b")) base += 300000;
  else if (has("million", "$100m", "$500m")) base += 150000;
  else if (has("market", "industry", "sector")) base += 50000;

  // Founder signals
  if (has("serial", "exit", "previously founded", "sold company")) base += 200000;
  else if (has("experienced", "years in", "10 year", "background in")) base += 100000;

  // Product signals
  if (has("revenue", "paying customer", "mrr", "arr", "$")) base += 250000;
  else if (has("customer", "user", "beta", "waitlist")) base += 100000;
  else if (has("prototype", "demo", "mvp", "product")) base += 75000;

  // Team signals
  if (has("team", "co-founder", "cofounder")) base += 75000;

  // Moat signals
  if (has("patent", "proprietary", "exclusive", "network effect", "data advantage")) base += 100000;

  // Cap it
  const mid = Math.min(base, 2000000);
  const low = Math.round(mid * 0.65 / 50000) * 50000;
  const high = Math.round(mid * 1.35 / 50000) * 50000;

  const strengths: string[] = [];
  const gaps: string[] = [];

  if (has("revenue", "paying", "customer")) strengths.push("Revenue or customer traction signals detected");
  else gaps.push("Add first paying customer or revenue signal to lift value significantly");

  if (has("team", "co-founder", "founder")) strengths.push("Team mentioned — reduces execution risk");
  else gaps.push("Add founder background and team details to improve valuation range");

  if (has("market", "tam", "industry", "billion", "million")) strengths.push("Market context provided");
  else gaps.push("Define your addressable market size (TAM/SAM) to anchor valuation");

  if (has("moat", "patent", "proprietary", "network", "data")) strengths.push("Defensibility signal present");
  else gaps.push("Identify a competitive moat or unfair advantage");

  const nextStep = has("revenue", "paying")
    ? "Get your full Startup Value Index to track evidence-backed progress toward funding."
    : has("product", "mvp", "demo")
    ? "You have a product signal — add customer traction to unlock a higher range."
    : "Validate your idea with 5 customer interviews and document the problem clearly.";

  return { lowAud: low, highAud: high, strengths: strengths.slice(0, 2), gaps: gaps.slice(0, 2), nextStep };
}

export async function POST(request: Request) {
  try {
    const { text, email } = await request.json() as { text?: string; email?: string };

    if (!text?.trim() || !email?.includes("@")) {
      return NextResponse.json({ ok: false, error: "text and email required" }, { status: 400 });
    }

    const result = estimateFromText(text);

    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "Estimation failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
