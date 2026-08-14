/**
 * src/lib/agents/cfo-financial-projection.ts
 *
 * Generates a 3-year P&L + cash-burn + runway schedule for the Startup
 * Package "Financial projection" deliverable. Deterministic math for the
 * number tables, `callAI()` for the narrative sections (assumptions,
 * commentary, investor takeaways). Falls back to a template narrative on
 * LLM failure so the PDF always renders.
 *
 * Roadmap: "Financial projection + GTM auto-fill deliverables (dedicated
 * CFO/CMO agent flow)".
 */

import { callAI } from "@/lib/ai-client";

// ── Types ────────────────────────────────────────────────────────────────

export type ProjectionStage = "pre-seed" | "seed" | "series-a" | "series-b";

export interface FinancialProjectionInput {
  startupName: string;
  stage: ProjectionStage;
  sector?: string;
  /** Monthly recurring revenue in AUD (0 for pre-revenue). */
  mrrAud?: number;
  /** Monthly cash burn in AUD (positive number). */
  monthlyBurnAud?: number;
  /** Cash-in-bank in AUD at t0. */
  cashAud?: number;
  /** Optional gross margin % override. */
  grossMarginPct?: number;
  /** Optional monthly growth % override. */
  monthlyGrowthPct?: number;
}

export interface QuarterRow {
  quarter: string; // e.g. "Y1Q1"
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  netIncome: number;
  cashBalance: number;
}

export interface FinancialProjectionOutput {
  startupName: string;
  stage: ProjectionStage;
  currency: "AUD";
  assumptions: {
    startingMrr: number;
    monthlyGrowthPct: number;
    grossMarginPct: number;
    monthlyBurn: number;
    startingCash: number;
    quarterlyOpexGrowthPct: number;
  };
  quarters: QuarterRow[];
  totals: {
    revenueY1: number;
    revenueY2: number;
    revenueY3: number;
    netY1: number;
    netY2: number;
    netY3: number;
    /** Months of runway from t0 given current burn (∞ marker = 999). */
    runwayMonths: number;
  };
  narrative: {
    assumptions: string;
    commentary: string;
    investorTakeaway: string;
  };
  sources: string[];
}

// ── Benchmarks ───────────────────────────────────────────────────────────

const STAGE_DEFAULTS: Record<
  ProjectionStage,
  {
    monthlyGrowthPct: number;
    grossMarginPct: number;
    monthlyBurnAud: number;
    startingCashAud: number;
    quarterlyOpexGrowthPct: number;
  }
> = {
  "pre-seed": {
    monthlyGrowthPct: 15,
    grossMarginPct: 55,
    monthlyBurnAud: 25_000,
    startingCashAud: 150_000,
    quarterlyOpexGrowthPct: 8,
  },
  seed: {
    monthlyGrowthPct: 12,
    grossMarginPct: 65,
    monthlyBurnAud: 80_000,
    startingCashAud: 1_200_000,
    quarterlyOpexGrowthPct: 10,
  },
  "series-a": {
    monthlyGrowthPct: 8,
    grossMarginPct: 72,
    monthlyBurnAud: 350_000,
    startingCashAud: 6_000_000,
    quarterlyOpexGrowthPct: 7,
  },
  "series-b": {
    monthlyGrowthPct: 5,
    grossMarginPct: 76,
    monthlyBurnAud: 900_000,
    startingCashAud: 15_000_000,
    quarterlyOpexGrowthPct: 5,
  },
};

const SOURCES = [
  "AVCAL / Cut Through Venture — Australian Venture Capital Report 2025",
  "OpenView — SaaS Benchmarks 2024",
  "Bessemer Venture Partners — State of the Cloud 2024",
  "SaaS Capital — Spending Benchmarks for Private B2B SaaS 2024",
];

const CFO_SYSTEM_PROMPT =
  "You are the CFO agent for BlockID.au. You explain 3-year P&L projections " +
  "to Australian founders in clear, conservative language. Ground every claim " +
  "in the numbers provided. No emoji, no hype, plain business English.";

// ── Math ─────────────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n);
}

function buildSchedule(
  input: FinancialProjectionInput,
): {
  quarters: QuarterRow[];
  totals: FinancialProjectionOutput["totals"];
  assumptions: FinancialProjectionOutput["assumptions"];
} {
  const defaults = STAGE_DEFAULTS[input.stage];
  const startingMrr = Math.max(0, input.mrrAud ?? 0);
  const monthlyGrowthPct = input.monthlyGrowthPct ?? defaults.monthlyGrowthPct;
  const grossMarginPct = input.grossMarginPct ?? defaults.grossMarginPct;
  const monthlyBurn = Math.max(0, input.monthlyBurnAud ?? defaults.monthlyBurnAud);
  const startingCash = Math.max(0, input.cashAud ?? defaults.startingCashAud);
  const quarterlyOpexGrowthPct = defaults.quarterlyOpexGrowthPct;

  const monthlyGrowth = monthlyGrowthPct / 100;
  const gm = grossMarginPct / 100;

  // 12 quarters — Y1Q1 … Y3Q4.
  const quarters: QuarterRow[] = [];
  let cash = startingCash;
  let mrr = startingMrr;
  let opex = monthlyBurn * 3; // quarterly opex baseline

  for (let year = 1; year <= 3; year++) {
    for (let q = 1; q <= 4; q++) {
      // Compound MRR for 3 months, then quarterly revenue = sum of months.
      const m1 = mrr * Math.pow(1 + monthlyGrowth, 1);
      const m2 = mrr * Math.pow(1 + monthlyGrowth, 2);
      const m3 = mrr * Math.pow(1 + monthlyGrowth, 3);
      const revenue = m1 + m2 + m3;
      const cogs = revenue * (1 - gm);
      const grossProfit = revenue - cogs;
      const netIncome = grossProfit - opex;
      cash = cash + netIncome;
      quarters.push({
        quarter: `Y${year}Q${q}`,
        revenue: round(revenue),
        cogs: round(cogs),
        grossProfit: round(grossProfit),
        opex: round(opex),
        netIncome: round(netIncome),
        cashBalance: round(cash),
      });
      // Advance MRR to end-of-quarter for the next iteration.
      mrr = m3;
      // Opex ramps quarterly.
      opex = opex * (1 + quarterlyOpexGrowthPct / 100);
    }
  }

  const yearTotal = (year: number, key: keyof QuarterRow): number => {
    return quarters
      .filter((r) => r.quarter.startsWith(`Y${year}`))
      .reduce((acc, r) => acc + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
  };

  // Runway: months until cash <= 0 at current monthly burn assuming zero
  // revenue growth. Deterministic sanity check — the schedule can be more
  // optimistic if revenue is growing, but this bounds the downside.
  const runwayMonths =
    monthlyBurn > 0
      ? Math.floor(startingCash / monthlyBurn)
      : 999;

  return {
    quarters,
    totals: {
      revenueY1: round(yearTotal(1, "revenue")),
      revenueY2: round(yearTotal(2, "revenue")),
      revenueY3: round(yearTotal(3, "revenue")),
      netY1: round(yearTotal(1, "netIncome")),
      netY2: round(yearTotal(2, "netIncome")),
      netY3: round(yearTotal(3, "netIncome")),
      runwayMonths: Math.min(999, Math.max(0, runwayMonths)),
    },
    assumptions: {
      startingMrr,
      monthlyGrowthPct,
      grossMarginPct,
      monthlyBurn,
      startingCash,
      quarterlyOpexGrowthPct,
    },
  };
}

// ── Narrative (LLM + fallback) ───────────────────────────────────────────

function templateNarrative(
  input: FinancialProjectionInput,
  totals: FinancialProjectionOutput["totals"],
  assumptions: FinancialProjectionOutput["assumptions"],
): FinancialProjectionOutput["narrative"] {
  const sector = input.sector ?? "startup";
  return {
    assumptions:
      `Assumes ${assumptions.monthlyGrowthPct.toFixed(1)}% MoM revenue growth, ` +
      `${assumptions.grossMarginPct.toFixed(0)}% gross margin, A$${assumptions.monthlyBurn.toLocaleString()} ` +
      `monthly opex growing ${assumptions.quarterlyOpexGrowthPct.toFixed(0)}% per quarter, ` +
      `starting from A$${assumptions.startingMrr.toLocaleString()} MRR and A$${assumptions.startingCash.toLocaleString()} in the bank.`,
    commentary:
      `${input.startupName} projects A$${totals.revenueY1.toLocaleString()} in Year 1 revenue, ` +
      `growing to A$${totals.revenueY3.toLocaleString()} by Year 3. Year 1 net result is A$${totals.netY1.toLocaleString()}; ` +
      `Year 3 net is A$${totals.netY3.toLocaleString()}. At the stated burn the founder has ` +
      `${totals.runwayMonths} months of runway before a raise is required.`,
    investorTakeaway:
      `For a ${input.stage} ${sector} in Australia, the projection reflects sector-standard ` +
      `growth assumptions and a conservative opex ramp. Investors will stress-test the growth ` +
      `assumption first — be ready with a bottoms-up build for at least one Y1 quarter.`,
  };
}

async function llmNarrative(
  input: FinancialProjectionInput,
  totals: FinancialProjectionOutput["totals"],
  assumptions: FinancialProjectionOutput["assumptions"],
): Promise<FinancialProjectionOutput["narrative"]> {
  const user =
    `Startup: ${input.startupName}\n` +
    `Stage: ${input.stage}\n` +
    (input.sector ? `Sector: ${input.sector}\n` : "") +
    `\nAssumptions:\n` +
    `- Starting MRR: A$${assumptions.startingMrr.toLocaleString()}\n` +
    `- Monthly growth: ${assumptions.monthlyGrowthPct.toFixed(1)}%\n` +
    `- Gross margin: ${assumptions.grossMarginPct.toFixed(0)}%\n` +
    `- Monthly opex: A$${assumptions.monthlyBurn.toLocaleString()} (+${assumptions.quarterlyOpexGrowthPct.toFixed(0)}%/qtr)\n` +
    `- Starting cash: A$${assumptions.startingCash.toLocaleString()}\n` +
    `\n3-year totals:\n` +
    `- Y1 revenue: A$${totals.revenueY1.toLocaleString()}\n` +
    `- Y2 revenue: A$${totals.revenueY2.toLocaleString()}\n` +
    `- Y3 revenue: A$${totals.revenueY3.toLocaleString()}\n` +
    `- Runway from t0: ${totals.runwayMonths} months\n` +
    `\nReturn a JSON object with three string keys:\n` +
    `- assumptions: one paragraph, ≤ 500 chars, restating the key assumptions.\n` +
    `- commentary: one paragraph, ≤ 800 chars, explaining what the numbers mean.\n` +
    `- investorTakeaway: one paragraph, ≤ 600 chars, framing the story for an AU investor.\n` +
    `JSON only.`;

  try {
    const result = await callAI({
      system: CFO_SYSTEM_PROMPT,
      user,
      maxTokens: 1500,
      temperature: 0.3,
    });
    // Attempt JSON extraction.
    const raw = result.text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return templateNarrative(input, totals, assumptions);
    const parsed = JSON.parse(match[0]) as Partial<FinancialProjectionOutput["narrative"]>;
    if (
      typeof parsed.assumptions !== "string" ||
      typeof parsed.commentary !== "string" ||
      typeof parsed.investorTakeaway !== "string"
    ) {
      return templateNarrative(input, totals, assumptions);
    }
    return {
      assumptions: parsed.assumptions.slice(0, 800),
      commentary: parsed.commentary.slice(0, 1200),
      investorTakeaway: parsed.investorTakeaway.slice(0, 900),
    };
  } catch {
    return templateNarrative(input, totals, assumptions);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export async function generateFinancialProjection(
  input: FinancialProjectionInput,
): Promise<FinancialProjectionOutput> {
  const { quarters, totals, assumptions } = buildSchedule(input);
  const narrative = await llmNarrative(input, totals, assumptions);
  return {
    startupName: input.startupName,
    stage: input.stage,
    currency: "AUD",
    assumptions,
    quarters,
    totals,
    narrative,
    sources: SOURCES,
  };
}
