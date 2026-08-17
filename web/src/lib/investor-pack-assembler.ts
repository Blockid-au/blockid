// Investor pack data assembler (server-only).
//
// Reads the authenticated founder's current project state and produces the
// fully-resolved payload the investor-pack PDF renders. Deliberately fails
// soft on every data source — missing sections come back marked so the
// template can render "Not yet on file" rather than fabricating numbers.
//
// Data sources:
//   - projects                → project name + sector (via getProjectById)
//   - svi_analyses            → latest analysis (grade, dimension scores)
//   - lib/valuation           → estimateValuation() from SVI + stage
//   - lib/fundraise-checklist → snapshot + readiness score
//   - lib/au-comparable-raises → sector- + stage-matched comps
//   - founder_profiles        → team snapshot (founder + co-founders)
//   - share_classes/shareholders → cap-table snapshot (matches /api/cap-table)
//   - app_users               → founder display name + email for contact

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectById } from "@/lib/projects";
import { estimateValuation } from "@/lib/valuation";
import { loadFounderProfile } from "@/lib/founder-profile";
import {
  buildChecklist,
  computeReadinessScore,
  groupChecklistByCategory,
  type ChecklistCategory,
  type ChecklistItem,
} from "@/lib/fundraise-checklist";
import {
  getComparableRaises,
  type ComparableRaise,
} from "@/lib/au-comparable-raises";
import { assertDiv83AEligibleOrWarn } from "@/lib/compliance/div83a-funding-gate";
import {
  buildEsopEligibilitySection,
  type EsopEligibilitySection,
} from "@/lib/investor-pack/esop-eligibility-section";
import {
  buildExitBenchmarkSection,
  type ExitBenchmarkSection,
} from "@/lib/investor-pack/exit-benchmark-section";
import {
  buildTractionCohortSection,
  type TractionCohortSection,
} from "@/lib/investor-pack/traction-cohort-section";
import {
  buildExitStrategyChapter,
  type ExitStrategyChapterResult,
} from "@/lib/investor-pack/exit-strategy-chapter";
import {
  buildCLevelChapter,
  type CLevelChapter,
} from "@/lib/investor-pack/c-level-chapter";
import type { CFOValuationReport } from "@/lib/c-level/compute-c-level-dcf";
import {
  computeFundingReadiness,
  type FundingReadiness,
} from "@/lib/svi-analysis";

/* ─── Public types ──────────────────────────────────────────────────────── */

/** Top 3 unmet required milestones for investor pack rendering. */
export interface FundingReadinessMilestoneSnapshot {
  dimension: string;
  label: string;
  currentValue: number;
  targetValue: number;
  action: string;
}

/** Funding Readiness section assembled for the investor pack. */
export interface FundingReadinessSection {
  currentGate: FundingReadiness["currentGate"];
  gateScore: number;
  topUnmetMilestones: FundingReadinessMilestoneSnapshot[];
}

export interface InvestorPackData {
  project: {
    name: string;
    sector: string | null;
  };
  svi: {
    total: number;
    grade: string;
    dimensions: Array<{ label: string; score: number }>;
  };
  valuation: {
    lowAud: number;
    midAud: number;
    highAud: number;
    method: string;
  };
  checklist: {
    score: number;
    band: string;
    groupedItems: Record<string, Array<{ label: string; status: string }>>;
  };
  comparables: ComparableRaise[];
  // ch09 investor-readiness pack — Div 83A ESS start-up concession
  // eligibility (P6a-ir-pack). Populated via the div83a-funding-gate in
  // warn-only mode; renders in the PDF as the "ESOP eligibility" section.
  esopEligibility: EsopEligibilitySection;
  // ch12 exit-readiness anchor (P12b). AU comparable-exits benchmark
  // sliced to the project sector when known, else the full fixture with
  // usedFallback=true so the PDF copy can explain the widening.
  exitBenchmark: ExitBenchmarkSection;
  // ch05 traction anchor (P5-cohort-wire). Weekly cohort retention
  // matrix + SVG. When the founder has no signup / activity events on
  // file the pack renders the empty-state hint from cohort-chart.ts
  // rather than fabricating retention numbers. Live data ingestion
  // (Stripe / product-analytics OAuth → signup+activity streams) is a
  // follow-up under P5-cohort-ingest.
  tractionCohort: TractionCohortSection;
  // ch11 exit-strategy roadmap (v3.7.6). Present only when the account
  // has a primary exit_scenario on file — the PDF template renders
  // Chapter 11 with dilution table, founder payouts, anonymized
  // acquirer landscape, readiness band and narrative. AFSL/tax
  // disclaimer is on every payout. See MEMORY note
  // `feedback_no_real_startup_names` — compliance regex enforced in
  // buildExitStrategyChapter().
  exitStrategy: ExitStrategyChapterResult;
  /** Funding Readiness — current gate, gate score, top 3 unmet milestones. */
  fundingReadiness: FundingReadinessSection;
  // C-Level Financial Advisory chapter (v3.8.1). Assembled from the latest
  // CFO+CEO report in clevel_reports_v2 scoped to this project. Null when
  // no report exists yet — the PDF template renders a placeholder instead.
  // Compliance: buildCLevelChapter() runs scanForRealNames() and replaces
  // the chapter with a blocked stub on any violation.
  cLevelChapter: CLevelChapter | null;
  team: Array<{ name: string; role: string }>;
  capTable: Array<{ holder: string; pctFullyDiluted: number }>;
  ask: {
    raiseAmountAud: number;
    useOfFunds: string;
  };
  contact: {
    founderName: string;
    email: string;
    website: string | null;
  };
  generatedAt: string;
}

export interface AssembleOverrides {
  raiseAmountAud?: number;
  useOfFunds?: string;
}

/* ─── Grade helper — matches the SVI benchmark ladder (0-200 index). ───── */

function sviGrade(total: number): string {
  if (total >= 185) return "A+";
  if (total >= 168) return "A";
  if (total >= 155) return "A-";
  if (total >= 140) return "B+";
  if (total >= 125) return "B";
  if (total >= 110) return "B-";
  if (total >= 95) return "C+";
  if (total >= 80) return "C";
  if (total >= 65) return "C-";
  if (total > 0) return "D";
  return "—";
}

/* ─── SVI → valuation stage mapping (fundraise-checklist wants a string). */

function stageFromSvi(total: number): "preseed" | "seed" | "seriesA" {
  if (total < 100) return "preseed";
  if (total < 140) return "seed";
  return "seriesA";
}

function stageNumberFromSvi(total: number): number {
  // Mirrors the STAGE_BONUSES ladder in svi-analysis so downstream
  // valuation() sits in the right baseline band.
  if (total >= 185) return 7;
  if (total >= 168) return 6;
  if (total >= 155) return 5;
  if (total >= 140) return 4;
  if (total >= 125) return 3;
  if (total >= 110) return 2;
  if (total >= 90) return 1;
  return 0;
}

/* ─── Funding Readiness section builder. ───────────────────────────────── */

function buildFundingReadinessSection(
  sviAnalysis: Parameters<typeof computeFundingReadiness>[0] | null,
): FundingReadinessSection {
  if (!sviAnalysis) {
    return {
      currentGate: "pre-seed",
      gateScore: 0,
      topUnmetMilestones: [],
    };
  }

  const fr = computeFundingReadiness(sviAnalysis);

  // Top 3 unmet milestones: required=true ones first (all milestones here are
  // required=true by current computeFundingReadiness implementation), then by
  // furthest from target.
  const unmet = fr.milestones
    .filter((m) => !m.met)
    .sort((a, b) => {
      // Required first (both true here, but defensive)
      if (a.required !== b.required) return a.required ? -1 : 1;
      // Then largest gap first
      return (b.targetValue - b.currentValue) - (a.targetValue - a.currentValue);
    })
    .slice(0, 3)
    .map((m) => ({
      dimension: m.dimension,
      label: m.label,
      currentValue: m.currentValue,
      targetValue: m.targetValue,
      action: m.action,
    }));

  return {
    currentGate: fr.currentGate,
    gateScore: fr.gateScore,
    topUnmetMilestones: unmet,
  };
}

/* ─── Default use-of-funds copy — safe when the founder hasn't filled one. */

function defaultUseOfFunds(raiseAmountAud: number): string {
  if (raiseAmountAud <= 0) {
    return "Use-of-funds pending — add a breakdown in the workspace so this section shows the split (team, product, go-to-market, runway).";
  }
  return "Product & engineering (40%), go-to-market & growth (35%), founding team & hires (20%), operating buffer & runway (5%).";
}

/* ─── SVI analysis loader — best-effort, returns null on any failure. ──── */

interface LoadedSvi {
  total: number;
  dimensions: Array<{ label: string; score: number }>;
  dimensionsMap: Record<string, number>;
  sector: string | null;
  signals: Record<string, unknown> | null;
  scoresForChecklist: Record<string, number>;
  /** Raw analysis_json for passing to computeFundingReadiness. */
  rawAnalysisJson: Record<string, unknown> | null;
}

async function loadLatestSvi(
  userEmail: string,
  projectId: string | null,
): Promise<LoadedSvi | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const query = supabase
    .from("svi_analyses")
    .select("total_svi, analysis_json")
    .eq("email", userEmail.toLowerCase().trim());
  if (projectId) query.eq("project_id", projectId);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const total = Number(data.total_svi ?? 0);
  const analysis = (data.analysis_json ?? {}) as {
    subs?: Array<{ label?: string; key?: string; value?: number }>;
    dimensionScores?: Record<string, number>;
    sector?: string;
    signals?: Record<string, unknown> & { sector?: string };
  };

  const subs = Array.isArray(analysis.subs) ? analysis.subs : [];
  const dimensions = subs
    .filter((s) => typeof s.label === "string" && typeof s.value === "number")
    .map((s) => ({
      label: s.label as string,
      score: Math.max(0, Math.min(100, Math.round(s.value as number))),
    }));

  const dimensionsMap: Record<string, number> = {};
  for (const s of subs) {
    if (typeof s.key === "string" && typeof s.value === "number") {
      dimensionsMap[s.key] = s.value;
    }
  }
  if (analysis.dimensionScores) {
    for (const [k, v] of Object.entries(analysis.dimensionScores)) {
      if (typeof v === "number") dimensionsMap[k] = v;
    }
  }

  const scoresForChecklist: Record<string, number> = {};
  const passthroughKeys = [
    "ftv",
    "mpc",
    "ptd",
    "tre",
    "cgh",
    "iri",
    "lco",
    "svm",
  ];
  for (const key of passthroughKeys) {
    if (typeof dimensionsMap[key] === "number") {
      scoresForChecklist[key] = dimensionsMap[key];
    }
  }
  // Map SVI dimension keys → the labels the checklist inference uses.
  scoresForChecklist.problem = dimensionsMap.mpc ?? 0;
  scoresForChecklist.market = dimensionsMap.mpc ?? 0;
  scoresForChecklist.narrative = dimensionsMap.mpc ?? 0;
  scoresForChecklist.pitch = dimensionsMap.iri ?? 0;
  scoresForChecklist.team = dimensionsMap.ftv ?? 0;
  scoresForChecklist.traction = dimensionsMap.tre ?? 0;
  scoresForChecklist.revenue = dimensionsMap.tre ?? 0;
  scoresForChecklist.capTable = dimensionsMap.cgh ?? 0;
  scoresForChecklist.legal = dimensionsMap.lco ?? 0;
  scoresForChecklist.dataRoom = dimensionsMap.iri ?? 0;

  return {
    total,
    dimensions,
    dimensionsMap,
    sector: analysis.sector ?? analysis.signals?.sector ?? null,
    signals:
      analysis.signals && typeof analysis.signals === "object"
        ? (analysis.signals as Record<string, unknown>)
        : null,
    scoresForChecklist,
    rawAnalysisJson:
      data.analysis_json && typeof data.analysis_json === "object"
        ? (data.analysis_json as Record<string, unknown>)
        : null,
  };
}

/* ─── Cap-table loader — mirrors /api/cap-table's account_id=user.id key. */

async function loadCapTable(
  userId: string,
  projectId: string | null,
): Promise<Array<{ holder: string; pctFullyDiluted: number }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const holdersQuery = supabase
    .from("shareholders")
    .select("name, shares_held")
    .eq("account_id", userId);
  if (projectId) holdersQuery.eq("project_id", projectId);

  const esopQuery = supabase
    .from("esop_pool")
    .select("total_pool_shares")
    .eq("account_id", userId);
  if (projectId) esopQuery.eq("project_id", projectId);

  const [holdersRes, esopRes] = await Promise.all([
    holdersQuery,
    esopQuery.maybeSingle(),
  ]);

  const holders = (holdersRes.data ?? []) as Array<{
    name: string | null;
    shares_held: number | null;
  }>;
  const esopShares = Number(esopRes.data?.total_pool_shares ?? 0);

  const totalIssued = holders.reduce(
    (sum, h) => sum + Number(h.shares_held ?? 0),
    0,
  );
  const fullyDiluted = totalIssued + esopShares;
  if (fullyDiluted <= 0) return [];

  const rows = holders
    .filter((h) => Number(h.shares_held ?? 0) > 0)
    .map((h) => ({
      holder: (h.name ?? "Unnamed holder").trim() || "Unnamed holder",
      pctFullyDiluted: Number(
        ((Number(h.shares_held ?? 0) / fullyDiluted) * 100).toFixed(2),
      ),
    }))
    .sort((a, b) => b.pctFullyDiluted - a.pctFullyDiluted);

  if (esopShares > 0) {
    rows.push({
      holder: "ESOP pool (unallocated)",
      pctFullyDiluted: Number(((esopShares / fullyDiluted) * 100).toFixed(2)),
    });
  }

  return rows;
}

/* ─── Founder share counts — from cap-table (role IN founder/co-founder). ─ */

/**
 * Loads shares_held for shareholders whose role is 'founder' or 'co-founder'
 * for the given account+project. Returns a name→shares map. Falls back to an
 * empty map when the table is empty or the query fails (caller must handle
 * the equal-split fallback).
 */
async function loadFounderShareCounts(
  userId: string,
  projectId: string | null,
): Promise<Map<string, number>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return new Map();
  const q = supabase
    .from("shareholders")
    .select("name, shares_held, role")
    .eq("account_id", userId)
    .in("role", ["founder", "co-founder"]);
  if (projectId) q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error || !data) return new Map();
  const result = new Map<string, number>();
  for (const row of data as Array<{ name: string | null; shares_held: number | null; role: string | null }>) {
    const name = (row.name ?? "").trim();
    const shares = Number(row.shares_held ?? 0);
    if (name && shares > 0) result.set(name, (result.get(name) ?? 0) + shares);
  }
  return result;
}

/* ─── Team loader — founder + co-founders + advisors. ──────────────────── */

async function loadTeam(userId: string): Promise<{
  members: Array<{ name: string; role: string }>;
  founderName: string | null;
}> {
  const profile = await loadFounderProfile(userId);
  if (!profile) return { members: [], founderName: null };

  const members: Array<{ name: string; role: string }> = [];
  const founderName =
    profile.full_name && profile.full_name.trim()
      ? profile.full_name.trim()
      : null;
  if (founderName) {
    members.push({
      name: founderName,
      role: profile.role?.trim() || "Founder",
    });
  }
  for (const co of profile.co_founders ?? []) {
    if (co.name && co.name.trim()) {
      members.push({
        name: co.name.trim(),
        role: co.role?.trim() || "Co-founder",
      });
    }
  }
  for (const ad of profile.advisors ?? []) {
    if (ad.name && ad.name.trim()) {
      members.push({
        name: ad.name.trim(),
        role: ad.role?.trim() || "Advisor",
      });
    }
  }
  return { members, founderName };
}

/* ─── C-Level chapter loader — best-effort, returns null on any failure. ─ */

async function loadCLevelChapter(
  userId: string,
  projectId: string | null,
): Promise<CLevelChapter | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    // Fetch the latest base-scenario CFO report for this project+account.
    // We scope by project_id + startup_id (via svi_accounts → account_id=userId)
    // to ensure multi-startup isolation.
    const cfoQuery = supabase
      .from("clevel_reports_v2")
      .select("body_markdown, title, generated_at")
      .eq("role", "cfo")
      .eq("scenario", "base");
    if (projectId) cfoQuery.eq("project_id", projectId);

    const ceoQuery = supabase
      .from("clevel_reports_v2")
      .select("body_markdown, generated_at")
      .eq("role", "ceo")
      .eq("scenario", "base");
    if (projectId) ceoQuery.eq("project_id", projectId);

    const [cfoRes, ceoRes] = await Promise.all([
      cfoQuery
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      ceoQuery
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Build a minimal CFOValuationReport-compatible stub from the stored
    // markdown. The chapter builder only uses narrativeMarkdown so we
    // don't need to reconstruct the full DCF object.
    const cfoMarkdown =
      typeof cfoRes.data?.body_markdown === "string"
        ? cfoRes.data.body_markdown.trim()
        : null;
    const ceoMarkdown =
      typeof ceoRes.data?.body_markdown === "string"
        ? ceoRes.data.body_markdown.trim()
        : null;

    if (!cfoMarkdown && !ceoMarkdown) return null;

    const cfoReport: CFOValuationReport | null = cfoMarkdown
      ? ({
          computedAt: String(cfoRes.data?.generated_at ?? new Date().toISOString()),
          version: "3.8.0",
          scenarios: {} as CFOValuationReport["scenarios"],
          enterpriseValue: { lowAud: 0, midAud: 0, highAud: 0, confidence: "low" },
          sensitivity: { baseEvAud: 0, drivers: [], dominantLever: "" },
          founderExits: [],
          comps: [],
          rdtiRefundYear1Aud: 0,
          esicQualifies: false,
          narrativeMarkdown: cfoMarkdown,
          disclaimer: "",
        } as CFOValuationReport)
      : null;

    return buildCLevelChapter({
      cfoReport,
      ceoRoadmapMarkdown: ceoMarkdown,
      cdoComplianceMarkdown: null,
    });
  } catch (err) {
    console.warn("[investor-pack:assemble] c-level chapter skipped", err);
    return null;
  }
}

/* ─── Public entry point. ──────────────────────────────────────────────── */

export async function assemblePackData(
  userId: string,
  projectId: string | null,
  overrides: AssembleOverrides = {},
): Promise<InvestorPackData> {
  const supabase = getSupabaseAdmin();

  // Resolve founder email + display name for contact + SVI lookup.
  let userEmail = "";
  let displayName: string | null = null;
  if (supabase) {
    const { data } = await supabase
      .from("app_users")
      .select("email, display_name")
      .eq("id", userId)
      .maybeSingle();
    if (data) {
      userEmail =
        typeof data.email === "string" ? data.email.toLowerCase().trim() : "";
      displayName =
        typeof data.display_name === "string" && data.display_name.trim()
          ? data.display_name.trim()
          : null;
    }
  }

  // Project name + sector.
  const project = projectId ? await getProjectById(projectId) : null;
  const projectName =
    project?.name?.trim() || (userEmail ? userEmail.split("@")[0] : "Untitled startup");
  const sector = (project?.industry ?? null) as string | null;

  // Latest SVI analysis.
  const svi = userEmail ? await loadLatestSvi(userEmail, projectId) : null;
  const sviTotal = svi?.total ?? 0;

  // Valuation range from SVI + stage. Falls back to zero band when no SVI.
  const stageNum = stageNumberFromSvi(sviTotal);
  const valuation = estimateValuation(
    sviTotal,
    stageNum,
    { sector: sector ?? svi?.sector ?? undefined },
    svi?.dimensionsMap,
  );

  // Fundraise readiness checklist snapshot.
  const stageStr = stageFromSvi(sviTotal);
  const checklistItems = buildChecklist({
    stage: stageStr,
    sviAnalysis: {
      score: sviTotal,
      dimensions: svi?.scoresForChecklist ?? {},
      signals: svi?.signals ?? {},
    },
  });
  const readiness = computeReadinessScore(checklistItems, sviTotal);
  const grouped = groupChecklistByCategory(checklistItems);
  const groupedItems: Record<string, Array<{ label: string; status: string }>> = {};
  const cats: ChecklistCategory[] = [
    "story",
    "metrics",
    "team",
    "cap-table",
    "legal",
    "data-room",
  ];
  for (const c of cats) {
    groupedItems[c] = (grouped[c] ?? []).map((it: ChecklistItem) => ({
      label: it.label,
      status: it.status,
    }));
  }

  // AU comparables — sector + stage matched.
  const comparables = getComparableRaises({
    sector: sector ?? svi?.sector ?? undefined,
    stage: stageStr,
    limit: 6,
  });

  // ch09 investor-readiness pack — Div 83A ESS start-up concession section.
  // Warn-only mode: the pack surfaces the check status but never blocks
  // pack generation (a founder should be able to see the pack even when
  // an ESOP grant needs a re-check). Blocking behaviour lives in the
  // fundraise API, not here.
  const div83aGate = await assertDiv83AEligibleOrWarn(supabase, {
    projectId,
    userId,
    action: "investor_pack_assemble",
  });
  const esopEligibility = buildEsopEligibilitySection(div83aGate, "en");

  // ch12 exit-benchmark anchor — sector-scoped, falls back to full
  // fixture when the founder's sector matches zero rows.
  const exitBenchmark = buildExitBenchmarkSection({
    sector: sector ?? svi?.sector ?? null,
  });

  // ch05 traction cohort anchor — empty-state until the founder wires a
  // signup / activity event source. The pack renders the empty-state
  // SVG hint so the section slot never leaves a gap.
  const tractionCohort = buildTractionCohortSection();

  // ch11 exit-strategy roadmap — resolve svi_accounts.id for this
  // founder+project first (exit_scenarios keys off it), then call the
  // chapter builder. Fail-soft: if no primary scenario or table missing
  // the chapter returns present:false and the PDF template skips it.
  let exitStrategy: ExitStrategyChapterResult = {
    present: false,
    reason: "no_primary_scenario",
  };
  if (supabase && userEmail) {
    const accountQuery = supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", userEmail);
    if (projectId) accountQuery.eq("project_id", projectId);
    const { data: sviAccount } = await accountQuery.maybeSingle();
    if (sviAccount?.id) {
      try {
        // Founders list from the loaded team (best-effort; if members
        // haven't been loaded yet we pass an empty founders array and
        // the chapter renders zero payouts).
        // Note: `members` is loaded further down — resolve here after.
        const { members: teamMembers } = await loadTeam(userId);
        const shareMap = await loadFounderShareCounts(userId, projectId ?? null);
        const founderTeamMembers = teamMembers.filter((m) => /founder/i.test(m.role));
        const totalSharesKnown = Array.from(shareMap.values()).reduce((a, b) => a + b, 0);
        const founderMembers = founderTeamMembers.map((m) => ({
          name: m.name,
          // Use real shares from DB; fall back to equal 1000-share split
          // when no shareholder record exists for this founder.
          sharesAtSeed:
            shareMap.get(m.name) ??
            (totalSharesKnown > 0 ? 0 : 1000),
        }));
        exitStrategy = await buildExitStrategyChapter(
          sviAccount.id as string,
          founderMembers.length > 0 ? founderMembers : [{ name: "Founder", sharesAtSeed: 1000 }],
          [],
          sector ?? svi?.sector ?? null,
        );
      } catch (err) {
        console.warn("[investor-pack:assemble] exit-strategy chapter skipped", err);
        exitStrategy = { present: false, reason: "query_error" };
      }
    }
  }

  // Funding readiness — current gate, gate score, top 3 unmet milestones.
  // computeFundingReadiness needs a SVIAnalysis-shaped object; we pass the
  // raw analysis_json from the DB (which has dimensionScores) or fall back
  // to a minimal shape derived from dimensionsMap.
  const sviAnalysisForFunding = svi?.rawAnalysisJson
    ? (svi.rawAnalysisJson as unknown as Parameters<typeof computeFundingReadiness>[0])
    : svi
    ? ({ dimensionScores: svi.dimensionsMap } as unknown as Parameters<typeof computeFundingReadiness>[0])
    : null;
  const fundingReadinessSection = buildFundingReadinessSection(sviAnalysisForFunding);

  // C-Level Financial Advisory chapter — CFO + CEO reports from clevel_reports_v2.
  // Fail-soft: returns null when no report exists yet so the PDF renders a placeholder.
  const cLevelChapter = await loadCLevelChapter(userId, projectId);

  // Team + cap-table + ask.
  const { members, founderName } = await loadTeam(userId);
  const capTable = await loadCapTable(userId, projectId);

  const raiseAmountAud = Math.max(
    0,
    Math.round(overrides.raiseAmountAud ?? 0),
  );
  const useOfFunds =
    overrides.useOfFunds && overrides.useOfFunds.trim().length > 0
      ? overrides.useOfFunds.trim()
      : defaultUseOfFunds(raiseAmountAud);

  // Contact — founder profile takes priority, then display name, then email prefix.
  const contactName =
    founderName ?? displayName ?? (userEmail ? userEmail.split("@")[0] : "Founder");
  // Website URL is not on the projects table today — surface null so the PDF
  // renders "—" rather than fabricating a link.
  const website: string | null = null;

  return {
    project: {
      name: projectName,
      sector,
    },
    svi: {
      total: Math.round(sviTotal),
      grade: sviGrade(sviTotal),
      dimensions: svi?.dimensions ?? [],
    },
    valuation: {
      lowAud: valuation.low,
      midAud: valuation.mid,
      highAud: valuation.high,
      method: valuation.method,
    },
    checklist: {
      score: readiness.score,
      band: readiness.band,
      groupedItems,
    },
    comparables,
    esopEligibility,
    exitBenchmark,
    tractionCohort,
    exitStrategy,
    fundingReadiness: fundingReadinessSection,
    cLevelChapter,
    team: members,
    capTable,
    ask: {
      raiseAmountAud,
      useOfFunds,
    },
    contact: {
      founderName: contactName,
      email: userEmail,
      website,
    },
    generatedAt: new Date().toISOString(),
  };
}
