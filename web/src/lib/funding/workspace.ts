// Data for /workspace/funding (T0244, plan §4i D-2 "full Radar page").
//
//   latestFundingReportForUser(userId, projectId?)  newest `funding_reports` row
//   intakePrefillFor(user, project)                 projects + project_grant_profiles + latest svi_snapshots → form prefill
//   listCapitalMapRows()                            au_programs angel_group / vc / rd_advance_loan / advisory
//   listEventPrograms(capital?)                     au_programs program_type = 'event'
//   CAPITAL_MAP_SECTIONS · CAPITAL_MAP_ARTICLES     static copy for the Capital map tab
//
// Pure mapping helpers (`stageFromNumeric`, `industryTagsFor`) are exported
// for the colocated test (workspace.test.ts).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AppUser } from "@/lib/auth";
import type { Project } from "@/lib/projects";
import type { FounderStage } from "@/lib/agents/grant-advisor";
import type { FundingIntakePrefill } from "@/components/funding/funding-intake";
import { INDUSTRY_OPTIONS, INTAKE_STATES, type IntakeState } from "./intake";
import { listPrograms, type AuProgram } from "./data";
import type { FundingReportRow } from "./reports";

// ─── Latest report ───────────────────────────────────────────────────────────

export async function latestFundingReportForUser(userId: string, projectId?: string | null): Promise<FundingReportRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return null;
  try {
    let q = supabase.from("funding_reports").select("*").eq("user_id", userId).eq("status", "ready");
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) {
      if (error.code !== "42P01") console.warn("[funding/workspace] latest report", error.message);
      return null;
    }
    if (data) return data as FundingReportRow;
    // No report for this project yet — fall back to the user's newest one so
    // the tabs are never empty for a founder who bought as a guest first.
    if (projectId) {
      const { data: any } = await supabase
        .from("funding_reports")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (any as FundingReportRow | null) ?? null;
    }
    return null;
  } catch (err) {
    console.warn("[funding/workspace] latest report", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── Prefill ─────────────────────────────────────────────────────────────────

/** Legacy SVI / projects.stage (0–7) → intake stage. */
export function stageFromNumeric(n: number | null | undefined): FounderStage | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  if (n <= 0) return "idea";
  if (n === 1) return "pre_revenue_prototype";
  if (n === 2) return "mvp";
  if (n === 3) return "early_revenue";
  return "scaling";
}

const INDUSTRY_KEYWORDS: ReadonlyArray<[RegExp, string]> = [
  [/saas|software|b2b|platform|app\b/i, "software_saas"],
  [/\bai\b|machine learning|\bml\b|llm/i, "ai_ml"],
  [/fintech|payment|lending|bank/i, "fintech"],
  [/health|med(tech|ical)|clinic|care/i, "healthtech_medtech"],
  [/bio|pharma|therap/i, "biotech_pharma"],
  [/clean|renewable|solar|energy|battery/i, "cleantech_renewables"],
  [/climate|carbon|emission/i, "climate"],
  [/agri|agtech|farm|food/i, "agtech_food"],
  [/manufactur|robot|hardware/i, "advanced_manufacturing"],
  [/defen[cs]e|dual.use/i, "defence_dualuse"],
  [/space|satellite/i, "space"],
  [/quantum/i, "quantum"],
  [/mining|resources|mets?\b/i, "mining_resources_tech"],
  [/edtech|education|learning/i, "edtech"],
  [/proptech|property|real estate/i, "proptech"],
  [/retail|e-?commerce|marketplace/i, "retail_ecommerce"],
  [/media|creative|game|music|film/i, "creative_media"],
  [/tourism|hospitality|travel/i, "tourism_hospitality"],
  [/construction|building/i, "construction"],
  [/logistic|transport|freight|mobility/i, "transport_logistics"],
  [/consult|professional|legal|account/i, "professional_services"],
  [/social enterprise|impact|non.?profit/i, "social_enterprise"],
];

/** Free-text industry ("AgTech / Food") → §5d tags, max 3. */
export function industryTagsFor(industry: string | null | undefined): string[] {
  const text = (industry ?? "").trim();
  if (!text) return [];
  const exact = INDUSTRY_OPTIONS.find((o) => o.value === text.toLowerCase() || o.label.toLowerCase() === text.toLowerCase());
  if (exact) return [exact.value];
  const out: string[] = [];
  for (const [re, tag] of INDUSTRY_KEYWORDS) {
    if (re.test(text) && !out.includes(tag)) out.push(tag);
    if (out.length >= 3) break;
  }
  return out;
}

interface GrantProfileRow {
  state: string | null;
  city: string | null;
  turnover_aud: number | null;
  rd_spend_aud: number | null;
  headcount: number | null;
  incorporated_at: string | null;
  founder_demographics: string[] | null;
  export_intent: boolean | null;
}

/**
 * Prefill the workspace intake: project name + description, `projects.stage`
 * / `projects.industry`, the saved `project_grant_profiles` row (state and
 * the "improve my match" figures) and the latest `svi_snapshots.stage` for
 * this project's SVI account. Any missing source is skipped — never throws.
 */
export async function intakePrefillFor(user: Pick<AppUser, "id" | "email">, project: Project | null): Promise<FundingIntakePrefill> {
  const prefill: FundingIntakePrefill = {};
  if (!project) return prefill;

  const desc = [project.name, project.description].filter(Boolean).join(" — ").trim();
  if (desc) prefill.description = desc.slice(0, 2000);
  const tags = industryTagsFor(project.industry);
  if (tags.length) prefill.industry_tags = tags;
  const projectStage = stageFromNumeric(project.stage);
  if (projectStage) prefill.stage = projectStage;

  const supabase = getSupabaseAdmin();
  if (!supabase) return prefill;

  try {
    const [{ data: profile }, snapshotStage] = await Promise.all([
      supabase
        .from("project_grant_profiles")
        .select("state, city, turnover_aud, rd_spend_aud, headcount, incorporated_at, founder_demographics, export_intent")
        .eq("project_id", project.id)
        .maybeSingle(),
      latestSnapshotStage(supabase, user.email ?? null, project.id),
    ]);
    const p = (profile as GrantProfileRow | null) ?? null;
    if (p) {
      if (p.state && (INTAKE_STATES as readonly string[]).includes(p.state)) prefill.state = p.state as IntakeState;
      if (typeof p.turnover_aud === "number") prefill.turnover_aud = String(p.turnover_aud);
      if (typeof p.rd_spend_aud === "number") prefill.rd_spend_aud = String(p.rd_spend_aud);
      if (typeof p.headcount === "number") prefill.headcount = String(p.headcount);
      if (p.incorporated_at) prefill.incorporated_year = p.incorporated_at.slice(0, 4);
      if (typeof p.export_intent === "boolean") prefill.export_intent = p.export_intent;
      const demo = new Set(p.founder_demographics ?? []);
      prefill.toggles = {
        women_led: demo.has("women_led"),
        indigenous_owned: demo.has("indigenous_owned"),
        regional: demo.has("regional"),
        under_30: demo.has("under_30"),
      };
    }
    // The SVI snapshot is the most recent read on stage — it wins over projects.stage.
    const sviStage = stageFromNumeric(snapshotStage);
    if (sviStage) prefill.stage = sviStage;
  } catch (err) {
    console.warn("[funding/workspace] prefill", err instanceof Error ? err.message : String(err));
  }
  return prefill;
}

type Supabase = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function latestSnapshotStage(supabase: Supabase, email: string | null, projectId: string): Promise<number | null> {
  if (!email) return null;
  try {
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", email)
      .eq("project_id", projectId)
      .order("last_active_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!account?.id) return null;
    const { data: snap } = await supabase
      .from("svi_snapshots")
      .select("stage")
      .eq("account_id", account.id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return typeof snap?.stage === "number" ? snap.stage : null;
  } catch {
    return null;
  }
}

// ─── Events + capital map ────────────────────────────────────────────────────

export async function listEventPrograms(capital?: string | null): Promise<AuProgram[]> {
  const rows = await listPrograms(capital ? { capital } : {});
  return rows.filter((r) => r.program_type === "event");
}

export const CAPITAL_MAP_TYPES = ["angel_group", "vc", "rd_advance_loan", "advisory"] as const;
export type CapitalMapType = (typeof CAPITAL_MAP_TYPES)[number];

export const CAPITAL_MAP_SECTIONS: ReadonlyArray<{
  type: CapitalMapType | "rbf" | "export_loan";
  label: string;
  blurb: string;
  article: { href: string; label: string };
}> = [
  {
    type: "angel_group",
    label: "Angel groups",
    blurb: "A$25k–A$500k cheques from syndicates that meet monthly. Cold approaches take 6–12 weeks; a warm intro halves it.",
    article: { href: "/insights/angel-investor-vs-vc-australia", label: "Angel investor vs VC in Australia" },
  },
  {
    type: "vc",
    label: "Venture capital",
    blurb: "Pre-seed to Series A funds. Most want A$20k+ MRR or a technical moat; ESVCLP funds must invest in Australian companies.",
    article: { href: "/insights/australian-vc-landscape-2026-who-is-investing", label: "Australian VC landscape 2026" },
  },
  {
    type: "rd_advance_loan",
    label: "R&D advance loans",
    blurb: "Borrow against next year's R&D Tax Incentive refund — typically 80% of the expected offset, repaid when the ATO pays.",
    article: { href: "/insights/esic-and-rnd-tax-incentive-guide-2026", label: "ESIC and R&D Tax Incentive guide" },
  },
  {
    type: "rbf",
    label: "Revenue-based finance",
    blurb: "Non-dilutive capital repaid as a share of monthly revenue. Suits SaaS and e-commerce with 12+ months of receipts.",
    article: { href: "/insights/non-dilutive-funding-strategies-australia", label: "Non-dilutive funding strategies" },
  },
  {
    type: "export_loan",
    label: "Export finance",
    blurb: "Export Finance Australia loans and guarantees for companies with an export contract or pipeline the banks will not back yet.",
    article: { href: "/insights/venture-debt-vs-equity-funding-australia", label: "Venture debt vs equity" },
  },
  {
    type: "advisory",
    label: "Advisory and capital raising services",
    blurb: "Government-funded advisors and accelerator-style capital programs that prepare you for the rounds above.",
    article: { href: "/insights/startup-funding-stages-explained-australia", label: "Startup funding stages explained" },
  },
];

export async function listCapitalMapRows(): Promise<Record<CapitalMapType, AuProgram[]>> {
  const rows = await listPrograms({});
  const out: Record<CapitalMapType, AuProgram[]> = { angel_group: [], vc: [], rd_advance_loan: [], advisory: [] };
  for (const r of rows) {
    if ((CAPITAL_MAP_TYPES as readonly string[]).includes(r.program_type)) out[r.program_type as CapitalMapType].push(r);
  }
  return out;
}

/** Notification kinds Money Radar will emit (T0245 wires the data). */
export const MONEY_RADAR_ALERT_KINDS: ReadonlyArray<{ kind: string; label: string; detail: string }> = [
  { kind: "deadline_30d", label: "Deadline in 30 days", detail: "A grant or program you fit closes in a month — start the application." },
  { kind: "deadline_14d", label: "Deadline in 14 days", detail: "Two weeks out: lodge the EOI or book the info session." },
  { kind: "deadline_3d", label: "Last call (3 days)", detail: "Final reminder before a window you matched closes." },
  { kind: "new_match", label: "New match", detail: "The weekly refresh found a scheme you now qualify for." },
  { kind: "status_change", label: "Status change", detail: "A matched scheme opened, paused or closed since your report." },
  { kind: "rdti_registration", label: "R&D registration due", detail: "The 10-month AusIndustry registration deadline is approaching." },
  { kind: "weekly_digest", label: "Weekly digest", detail: "One email a week with everything above, nothing in between." },
];
