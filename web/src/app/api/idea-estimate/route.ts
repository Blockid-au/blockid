import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { detectSector, SECTOR_LABELS } from "@/lib/svi-analysis";

// Sector-aware idea value estimator.
// Returns AUD range based on text signals + industry vertical.
// Different sectors have materially different valuation baselines,
// so the same "maturity level" of idea is worth different amounts
// depending on whether it's fintech, healthtech, SaaS, etc.

const SECTOR_BASES: Record<string, number> = {
  fintech:     600_000,   // High regulatory moat, AU fintech premium
  healthtech:  700_000,   // TGA/clinical pathway adds defensibility
  deeptech:    800_000,   // IP + R&D assets justify higher pre-revenue value
  marketplace: 400_000,   // Network effects but chicken-and-egg risk
  saas:        500_000,   // Strong recurring revenue model premium
  edtech:      300_000,   // Lower multiples, longer sales cycles
  ecommerce:   250_000,   // Commoditised unless strong brand/D2C angle
  default:     150_000,   // Generic idea base
};

const SECTOR_MULTIPLIERS: Record<string, number> = {
  fintech:     1.40,
  healthtech:  1.50,
  deeptech:    1.60,
  marketplace: 1.25,
  saas:        1.35,
  edtech:      1.15,
  ecommerce:   1.10,
  default:     1.00,
};

function estimateFromText(text: string): {
  lowAud: number;
  highAud: number;
  strengths: string[];
  gaps: string[];
  nextStep: string;
  sector?: string;
  sectorLabel?: string;
} {
  const t = text.toLowerCase();
  const has = (...terms: string[]) => terms.some(w => t.includes(w));

  // Detect sector for differentiated baseline
  const sector = detectSector(text);
  const sectorBase = SECTOR_BASES[sector ?? "default"] ?? SECTOR_BASES.default!;
  const sectorMult = SECTOR_MULTIPLIERS[sector ?? "default"] ?? 1.0;

  let base = sectorBase;

  // Market size signals — weighted by sector context
  if (has("billion", "trillion", "$1b", "$10b", "$100b")) {
    base += sector === "deeptech" || sector === "healthtech" ? 500_000 : 300_000;
  } else if (has("million", "$100m", "$500m", "tam", "sam", "som")) {
    base += sector === "saas" || sector === "fintech" ? 200_000 : 150_000;
  } else if (has("market", "industry", "sector", "vertical")) {
    base += 50_000;
  }

  // Founder signals
  if (has("serial", "exit", "previously founded", "sold company", "acquired")) {
    base += 200_000;
  } else if (has("experienced", "years in", "10 year", "15 year", "background in", "domain expert")) {
    base += sector ? 120_000 : 100_000; // sector specialists worth more
  }

  // Traction signals — differentiated by what "traction" means per sector
  if (sector === "healthtech" && has("clinical", "hospital", "gp", "patient", "trial")) {
    base += 250_000; // clinical validation is huge in healthtech
  } else if (sector === "fintech" && has("afsl", "licence", "licensed", "regulated", "aml")) {
    base += 200_000; // regulatory compliance is a moat
  } else if (sector === "deeptech" && has("patent", "provisional patent", "ip filed", "granted")) {
    base += 300_000; // filed IP is a hard asset
  } else if (has("revenue", "paying customer", "mrr", "arr")) {
    base += 250_000;
  } else if (has("customer", "user", "beta", "waitlist", "loi", "letter of intent", "pilot")) {
    base += 100_000;
  } else if (has("prototype", "demo", "mvp", "product", "live")) {
    base += 75_000;
  }

  // Team signals
  if (has("co-founder", "cofounder", "two founders", "three founders")) {
    base += 90_000;
  } else if (has("team", "hire", "cto", "coo", "cmo")) {
    base += 50_000;
  }

  // Moat signals — weighted per sector
  if (sector === "marketplace" && has("network effect", "two-sided", "liquidity")) {
    base += 200_000;
  } else if (sector === "saas" && has("integration", "api", "switching cost", "lock-in")) {
    base += 150_000;
  } else if (has("patent", "proprietary", "exclusive", "network effect", "data advantage", "data moat")) {
    base += 100_000;
  }

  // Investor readiness
  if (has("pitch deck", "data room", "financial model", "safe", "raising", "term sheet")) {
    base += 80_000;
  }

  // Apply sector multiplier on top of signals
  const adjusted = Math.round(base * sectorMult);

  // Cap at A$5M for this quick estimate (full SVI report goes higher)
  const mid = Math.min(adjusted, 5_000_000);

  // Tighter band for higher-confidence ideas (more signals = tighter range)
  const signalCount = [
    has("revenue", "mrr", "arr", "paying"),
    has("patent", "proprietary", "moat"),
    has("team", "co-founder"),
    has("market", "billion", "tam"),
    has("demo", "mvp", "product"),
  ].filter(Boolean).length;

  const bandPct = signalCount >= 4 ? 0.30 : signalCount >= 2 ? 0.45 : 0.55;
  const low = Math.round((mid * (1 - bandPct)) / 50_000) * 50_000;
  const high = Math.round((mid * (1 + bandPct)) / 50_000) * 50_000;

  const strengths: string[] = [];
  const gaps: string[] = [];

  if (has("revenue", "paying", "mrr", "arr")) {
    strengths.push("Revenue or paying customer traction detected");
  } else {
    gaps.push("Add first paying customer or revenue signal to significantly lift value");
  }

  if (has("team", "co-founder", "cofounder")) {
    strengths.push("Co-founder team reduces execution risk");
  } else {
    gaps.push("Add co-founder or strong team details to improve investor confidence");
  }

  if (has("market", "tam", "billion", "million")) {
    strengths.push("Market size context provided");
  } else {
    gaps.push("Define your TAM/SAM/SOM to anchor the valuation");
  }

  if (sector === "deeptech" && has("patent", "ip", "research")) {
    strengths.push("IP / R&D signals present — strong moat for DeepTech");
  } else if (sector === "fintech" && has("regulated", "afsl", "licence", "aml")) {
    strengths.push("Regulatory compliance signal — valuable FinTech moat");
  } else if (sector === "healthtech" && has("clinical", "patient", "hospital", "tga")) {
    strengths.push("Clinical validation signal — high-value HealthTech signal");
  } else if (has("patent", "proprietary", "network effect", "data advantage")) {
    strengths.push("Competitive moat or defensibility signal present");
  } else {
    gaps.push("Identify your competitive moat: IP, data, network effects, or switching costs");
  }

  const nextStep = has("revenue", "paying", "mrr")
    ? "You have revenue signals — get your full Startup Value Index to track evidence-backed progress toward funding."
    : has("product", "mvp", "demo", "live")
    ? "You have a product signal — add customer traction to unlock a higher range."
    : "Validate your idea with 5 customer interviews and document the problem clearly.";

  return {
    lowAud: Math.max(low, 50_000),
    highAud: high,
    strengths: strengths.slice(0, 3),
    gaps: gaps.slice(0, 2),
    nextStep,
    sector: sector ?? undefined,
    sectorLabel: sector ? (SECTOR_LABELS[sector] ?? sector) : undefined,
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

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
