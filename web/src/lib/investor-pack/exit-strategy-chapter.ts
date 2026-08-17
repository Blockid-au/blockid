// Investor Pack Chapter 11 — "Exit Strategy & Cap Table Roadmap"
//
// Renders the founder's primary exit scenario into a chapter of the
// investor pack: dilution progression table, per-founder gross/CGT/net
// payouts, anonymized acquirer landscape, readiness score band, and a
// narrative summary. AFSL + tax disclaimer is included on every payout.
//
// Data sources (all scoped by account_id → RLS-safe):
//   - exit_scenarios (is_primary=true, one per account)
//   - cap_table_projections (round_num order)
//   - exit_readiness_assessments (per scenario)
//
// Compliance (CRITICAL): No real company names appear in the generated
// output. Acquirer profiles are anonymized to sector/type/year-range
// labels ("AU SaaS Strategic Acquirer (2018–2024)"). See
// feedback_no_real_startup_names in MEMORY.md — a regex sanitizer runs
// on the final markdown before it is returned.
//
// Server-only — imports Supabase admin. Never bundle into client code.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  CapTableProjection,
  ExitReadinessAssessment,
  ExitScenario,
} from "@/types/exit-strategy";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ExitStrategyChapterFounderPayout {
  founderName: string;
  stakeAtExitPct: number;
  grossAud: number;
  cgtEstimateAud: number;
  netAud: number;
}

export interface ExitStrategyChapterAcquirerRow {
  /** Anonymized label — sector + buyer type + year range. Never a real name. */
  label: string;
  buyerType: string;
  valuationRangeAud: { low: number; high: number };
  medianRevenueMultiple: number | null;
  dealCount: number;
}

export interface ExitStrategyChapter {
  present: true;
  scenarioName: string;
  exitType: ExitScenario["exit_type"];
  timelineYears: number;
  targetExitValuationAud: number;
  dilutionTable: Array<{
    round: string;
    preMoneyAud: number | null;
    postMoneyAud: number | null;
    founderPct: number;
    investorPct: number;
    esopPct: number;
  }>;
  founderPayouts: ExitStrategyChapterFounderPayout[];
  acquirerLandscape: ExitStrategyChapterAcquirerRow[];
  readinessScore: number;
  readinessBand: ExitReadinessAssessment["readiness_band"];
  criticalGaps: string[];
  narrative: string;
  markdown: string;
  disclaimer: string;
}

export interface ExitStrategyChapterAbsent {
  present: false;
  reason: "no_primary_scenario" | "no_db" | "query_error";
}

export type ExitStrategyChapterResult =
  | ExitStrategyChapter
  | ExitStrategyChapterAbsent;

// ─── Compliance regex — real names that must never appear in output ──────
//
// Word-boundary matched, case-insensitive. Any hit is scrubbed with
// [redacted] before returning so a bug in an upstream data source can
// never leak a real acquirer name into the investor pack.

const REAL_COMPANY_NAMES = [
  "canva",
  "atlassian",
  "afterpay",
  "airtree",
  "blackbird",
  "square peg",
  "safetyculture",
  "culture amp",
  "linktree",
  "envato",
  "seek",
  "rea group",
  "carsales",
  "wisetech",
  "xero",
  "megaport",
  "nearmap",
  "altium",
  "iress",
  "computershare",
  "prospa",
  "zip co",
  "sezzle",
  "brighte",
  "airwallex",
];

export const EXIT_STRATEGY_REAL_NAME_REGEX = new RegExp(
  `\\b(${REAL_COMPANY_NAMES.map((n) => n.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "gi",
);

const AFSL_DISCLAIMER =
  "General information only — not personal financial product advice under s766B Corporations Act 2001 (Cth). " +
  "CGT figures assume 50% discount on long-term (>12mo) holdings and 47% top marginal rate (45% + 2% Medicare levy). " +
  "Acquirer values are anonymized medians from AU comparable exits. Consult a qualified tax advisor and licensed adviser before acting.";

function scrubRealNames(text: string): string {
  return text.replace(EXIT_STRATEGY_REAL_NAME_REGEX, "[redacted]");
}

function fmtAud(aud: number | null | undefined): string {
  if (aud == null || aud <= 0) return "—";
  if (aud >= 1_000_000) return `A$${(aud / 1_000_000).toFixed(1)}M`;
  if (aud >= 1_000) return `A$${(aud / 1_000).toFixed(0)}k`;
  return `A$${aud.toFixed(0)}`;
}

// ─── DB loaders — scoped by account_id ────────────────────────────────────

async function loadPrimaryScenario(
  accountId: string,
): Promise<ExitScenario | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("exit_scenarios")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_primary", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ExitScenario | null) ?? null;
}

async function loadProjections(
  scenarioId: string,
): Promise<CapTableProjection[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("cap_table_projections")
    .select("*")
    .eq("exit_scenario_id", scenarioId)
    .order("round_num", { ascending: true });
  return (data as CapTableProjection[] | null) ?? [];
}

async function loadReadiness(
  scenarioId: string,
): Promise<ExitReadinessAssessment | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("exit_readiness_assessments")
    .select("*")
    .eq("exit_scenario_id", scenarioId)
    .maybeSingle();
  return (data as ExitReadinessAssessment | null) ?? null;
}

// ─── Pure builders (exported for tests) ───────────────────────────────────

/**
 * Anonymize an acquirer landscape from anywhere upstream (au-benchmark,
 * suggestAcquirers, custom seed) into pack rows. Real company names are
 * scrubbed and any missing sector/type is defensively labelled.
 */
export function buildAcquirerRows(
  sector: string | null,
  candidates: Array<{
    buyerType?: string;
    valuationRangeMin?: number;
    valuationRangeMax?: number;
    medianRevenueMultiple?: number | null;
    countOfDeals?: number;
    yearRange?: [number, number];
  }>,
): ExitStrategyChapterAcquirerRow[] {
  const rows: ExitStrategyChapterAcquirerRow[] = [];
  const sectorLabel = sector
    ? sector.charAt(0).toUpperCase() + sector.slice(1)
    : "Multi-sector";
  for (const c of candidates.slice(0, 3)) {
    const type = (c.buyerType ?? "strategic").toLowerCase();
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    const [yStart, yEnd] = c.yearRange ?? [2016, 2024];
    const rawLabel = `AU ${sectorLabel} ${typeLabel} Acquirer (${yStart}–${yEnd})`;
    rows.push({
      label: scrubRealNames(rawLabel),
      buyerType: type,
      valuationRangeAud: {
        low: Math.max(0, Math.round(c.valuationRangeMin ?? 0)),
        high: Math.max(0, Math.round(c.valuationRangeMax ?? 0)),
      },
      medianRevenueMultiple: c.medianRevenueMultiple ?? null,
      dealCount: Math.max(0, Math.round(c.countOfDeals ?? 0)),
    });
  }
  return rows;
}

/**
 * Estimate founder payouts from cap-table projections + exit valuation.
 * Pure — call sites pass in the founders list from the assembler.
 */
export function buildFounderPayouts(
  founders: Array<{ name: string; sharesAtSeed: number }>,
  projections: CapTableProjection[],
  exitValuationAud: number,
): ExitStrategyChapterFounderPayout[] {
  const exitProj =
    projections.find((p) => p.round_type === "exit") ??
    projections[projections.length - 1];
  const totalFounderPctAtExit = exitProj?.founder_stake_pct_after ?? 0;
  const totalSeedShares = founders.reduce((a, f) => a + f.sharesAtSeed, 0) || 1;

  const CGT_DISCOUNT = 0.5;
  const MARGINAL_RATE = 0.47;

  return founders.map((f) => {
    const founderShareOfFoundersBlock = f.sharesAtSeed / totalSeedShares;
    const stakeAtExitPct = totalFounderPctAtExit * founderShareOfFoundersBlock;
    const grossAud = (stakeAtExitPct / 100) * exitValuationAud;
    // Cost base for founders is negligible; conservative $0 assumption.
    const cgtEstimateAud = grossAud * CGT_DISCOUNT * MARGINAL_RATE;
    const netAud = grossAud - cgtEstimateAud;
    return {
      founderName: f.name,
      stakeAtExitPct: Math.round(stakeAtExitPct * 100) / 100,
      grossAud: Math.round(grossAud),
      cgtEstimateAud: Math.round(cgtEstimateAud),
      netAud: Math.round(netAud),
    };
  });
}

/**
 * Render markdown for the chapter (pure, testable). Applies real-name
 * scrub as the last step so any downstream leakage is caught.
 */
export function renderExitStrategyMarkdown(input: {
  scenarioName: string;
  exitType: string;
  timelineYears: number;
  targetExitValuationAud: number;
  dilutionTable: ExitStrategyChapter["dilutionTable"];
  founderPayouts: ExitStrategyChapterFounderPayout[];
  acquirerLandscape: ExitStrategyChapterAcquirerRow[];
  readinessScore: number;
  readinessBand: string;
  criticalGaps: string[];
  narrative: string;
}): string {
  let md = "";
  md += `## Chapter 11 — Exit Strategy & Cap Table Roadmap\n\n`;
  md += `**Scenario:** ${input.scenarioName}\n`;
  md += `**Exit type:** ${input.exitType} · **Timeline:** ${input.timelineYears} years · **Target:** ${fmtAud(input.targetExitValuationAud)}\n\n`;

  md += `### Dilution Progression\n\n`;
  md += `| Round | Pre-money | Post-money | Founder % | Investor % | ESOP % |\n`;
  md += `|-------|-----------|-----------|-----------|------------|--------|\n`;
  for (const r of input.dilutionTable) {
    md += `| ${r.round} | ${fmtAud(r.preMoneyAud)} | ${fmtAud(r.postMoneyAud)} | ${r.founderPct.toFixed(1)}% | ${r.investorPct.toFixed(1)}% | ${r.esopPct.toFixed(1)}% |\n`;
  }
  md += `\n`;

  md += `### Founder Payout Estimates\n\n`;
  md += `| Founder | Stake at exit | Gross | CGT est. | Net |\n`;
  md += `|---------|--------------|-------|----------|-----|\n`;
  for (const p of input.founderPayouts) {
    md += `| ${p.founderName} | ${p.stakeAtExitPct.toFixed(2)}% | ${fmtAud(p.grossAud)} | ${fmtAud(p.cgtEstimateAud)} | ${fmtAud(p.netAud)} |\n`;
  }
  md += `\n_${AFSL_DISCLAIMER}_\n\n`;

  md += `### Acquirer Landscape (Anonymized)\n\n`;
  if (input.acquirerLandscape.length === 0) {
    md += `No direct AU comparables matched this sector at the target valuation range.\n\n`;
  } else {
    for (const a of input.acquirerLandscape) {
      md += `- **${a.label}** — ${a.dealCount} deals · ${fmtAud(a.valuationRangeAud.low)}–${fmtAud(a.valuationRangeAud.high)}`;
      if (a.medianRevenueMultiple != null) {
        md += ` · median ${a.medianRevenueMultiple.toFixed(1)}x revenue`;
      }
      md += `\n`;
    }
    md += `\n`;
  }

  md += `### Exit Readiness\n\n`;
  md += `**${input.readinessScore}/100 — ${input.readinessBand.replace(/_/g, " ")}**\n\n`;
  if (input.criticalGaps.length > 0) {
    md += `Critical gaps:\n`;
    for (const g of input.criticalGaps) md += `- ${g}\n`;
    md += `\n`;
  }

  if (input.narrative.trim().length > 0) {
    md += `### Narrative\n\n${input.narrative.trim()}\n\n`;
  }

  return scrubRealNames(md);
}

// ─── Public entry — used by investor-pack-assembler ──────────────────────

/**
 * Build Chapter 11 for the investor pack. Returns `present:false` when
 * the account has no primary scenario — the assembler should skip the
 * chapter gracefully in that case.
 *
 * Scoped by account_id — never returns data for another founder.
 */
export async function buildExitStrategyChapter(
  accountId: string,
  founders: Array<{ name: string; sharesAtSeed: number }>,
  acquirerCandidates: Parameters<typeof buildAcquirerRows>[1] = [],
  sector: string | null = null,
): Promise<ExitStrategyChapterResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { present: false, reason: "no_db" };

  const scenario = await loadPrimaryScenario(accountId);
  if (!scenario) return { present: false, reason: "no_primary_scenario" };

  const [projections, readiness] = await Promise.all([
    loadProjections(scenario.id),
    loadReadiness(scenario.id),
  ]);

  const dilutionTable = projections.map((p) => ({
    round: p.round_type.replace(/_/g, " "),
    preMoneyAud: p.pre_money_valuation_aud ?? null,
    postMoneyAud: p.post_money_valuation_aud ?? null,
    founderPct: Number(p.founder_stake_pct_after ?? 0),
    investorPct: Number(p.investor_stake_pct ?? 0),
    esopPct: Number(p.esop_stake_pct ?? 0),
  }));

  const founderPayouts = buildFounderPayouts(
    founders,
    projections,
    scenario.target_exit_valuation_aud,
  );

  const acquirerLandscape = buildAcquirerRows(sector, acquirerCandidates);

  const readinessScore = readiness?.overall_readiness_score ?? 0;
  const readinessBand = readiness?.readiness_band ?? "not_ready";
  const criticalGaps = (readiness?.critical_gaps ?? []).map(scrubRealNames);
  const narrative = scrubRealNames(scenario.narrative ?? "");

  const markdown = renderExitStrategyMarkdown({
    scenarioName: scrubRealNames(scenario.scenario_name),
    exitType: scenario.exit_type,
    timelineYears: scenario.exit_timeline_years,
    targetExitValuationAud: scenario.target_exit_valuation_aud,
    dilutionTable,
    founderPayouts,
    acquirerLandscape,
    readinessScore,
    readinessBand,
    criticalGaps,
    narrative,
  });

  return {
    present: true,
    scenarioName: scrubRealNames(scenario.scenario_name),
    exitType: scenario.exit_type,
    timelineYears: scenario.exit_timeline_years,
    targetExitValuationAud: scenario.target_exit_valuation_aud,
    dilutionTable,
    founderPayouts,
    acquirerLandscape,
    readinessScore,
    readinessBand,
    criticalGaps,
    narrative,
    markdown,
    disclaimer: AFSL_DISCLAIMER,
  };
}
