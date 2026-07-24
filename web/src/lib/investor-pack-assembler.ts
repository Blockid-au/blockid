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

/* ─── Public types ──────────────────────────────────────────────────────── */

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
