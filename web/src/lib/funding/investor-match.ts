// Investor reverse-match (T0251, plan §4h Growth row: "investor matching
// (reverse of getDealFlow)").
//
// `getDealFlow(investor)` in lib/investor-portal.ts takes ONE investor's
// `app_users.investor_prefs` {sectors, stages, geos, min_svi} and filters the
// consented `scores` rows. This module inverts it: take ONE founder's project
// and score every DISCOVERABLE investor account
// (`app_users.investor_discoverable = true`, migration 0323 — opt-in, default
// off) against the same four preference axes. Returns the top 10 with the
// reasons, so the founder sees *why* the thesis fits.
//
// Q3 of the plan: "Request intro" is a support mailto until an intro engine
// exists — nothing here emails an investor, and the investor's email is
// never returned (display name + prefs only).
//
// Layout: pure scorer (client-safe, no supabase) + `matchInvestorsForProject`
// which reads through a small store interface tests can fake.

import type { InvestorPreferences, StageBand } from "@/lib/investor-portal";
import type { FounderStage } from "@/lib/agents/grant-advisor-rules";
import { fill, FUNDING_COPY } from "./copy";

/** Canonical support inbox — the footer / signup form hard-code the same address. */
export const SUPPORT_EMAIL = "support@blockid.au";

export const INVESTOR_MATCH_LIMIT = 10;

export interface InvestorMatchProject {
  id: string | null;
  name: string;
  /** Free text — "AgTech", "fintech", "Healthcare SaaS". */
  industry: string | null;
  /** Numeric `projects.stage` (0–7) or an intake stage; either is accepted. */
  stage: number | FounderStage | null;
  /** AU state code or "national"; null = unknown. */
  state: string | null;
  /** Latest SVI (0–100); null = no snapshot. */
  svi: number | null;
}

export interface InvestorCandidate {
  id: string;
  /** What the founder sees — `app_users.display_name`, falling back to "Investor". */
  name: string;
  /** Plan id, informational ("angel" vs "vc"). */
  plan: string | null;
  prefs: Partial<InvestorPreferences> | null;
  discoverable: boolean;
}

export type FitGate = "sector" | "stage" | "geo" | "svi";

export interface InvestorMatch {
  investor_id: string;
  name: string;
  /** Firm / organisation from `investor_prefs.firm` — null until the investor fills it in. */
  firm: string | null;
  /** One-line thesis from `investor_prefs.thesis`. */
  thesis: string | null;
  plan: string | null;
  /** 0–100. */
  score: number;
  /** Human reasons — one per axis that passed ("Invests in agtech", …). */
  reasons: string[];
  /** Axes the founder does NOT meet (still listed when the total clears the floor). */
  gaps: FitGate[];
  sectors: string[];
  stages: StageBand[];
  geos: string[];
  cheque_band: string | null;
  min_svi: number | null;
  /** `mailto:` for the "Request intro" button (Q3: support routes it by hand). */
  intro_href: string;
}

// ─── Pure: normalisation ─────────────────────────────────────────────────────

/** Weights per axis — sum 100. SVI is a hard gate (score 0) when the investor sets a floor the startup misses. */
export const FIT_WEIGHTS: Readonly<Record<FitGate, number>> = { sector: 40, stage: 30, geo: 20, svi: 10 };

/** Minimum score to be listed at all. */
export const FIT_FLOOR = 40;

const SECTOR_SYNONYMS: ReadonlyArray<[RegExp, string[]]> = [
  [/saas|software|b2b|platform|app\b/i, ["saas", "software", "b2b", "enterprise"]],
  [/\bai\b|machine learning|\bml\b|llm|artificial/i, ["ai", "ml", "deeptech"]],
  [/fintech|payment|lending|bank|insur/i, ["fintech", "insurtech", "payments"]],
  [/health|med(tech|ical)|clinic|care|bio|pharma/i, ["healthtech", "medtech", "biotech", "health", "lifesciences"]],
  [/clean|renewable|solar|energy|battery|climate|carbon|emission/i, ["climate", "cleantech", "energy", "climatetech"]],
  [/agri|agtech|farm|food/i, ["agtech", "agrifood", "foodtech", "agriculture"]],
  [/manufactur|robot|hardware|industrial/i, ["hardware", "manufacturing", "robotics", "industrial", "deeptech"]],
  [/defen[cs]e|dual.use|space|satellite|quantum/i, ["defence", "space", "quantum", "deeptech"]],
  [/mining|resources|mets?\b/i, ["mining", "resources", "mets"]],
  [/edtech|education|learning/i, ["edtech", "education"]],
  [/proptech|property|real estate|construction/i, ["proptech", "construction"]],
  [/retail|e-?commerce|marketplace|consumer|d2c/i, ["ecommerce", "marketplace", "consumer", "retail"]],
  [/media|creative|game|music|film/i, ["media", "gaming", "creative"]],
  [/logistic|transport|freight|mobility/i, ["logistics", "mobility", "transport"]],
  [/legal|regtech|govtech/i, ["legaltech", "regtech", "govtech"]],
  [/web3|crypto|blockchain|token/i, ["web3", "crypto", "blockchain"]],
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Free-text industry → candidate sector tokens ("AgTech / Food" → ["agtechfood", "agtech", "agrifood", …]). */
export function sectorTokensFor(industry: string | null | undefined): string[] {
  const text = (industry ?? "").trim();
  if (!text) return [];
  const out = new Set<string>();
  out.add(norm(text));
  for (const part of text.split(/[\/,&+|]/)) {
    const n = norm(part);
    if (n) out.add(n);
  }
  for (const [re, tags] of SECTOR_SYNONYMS) {
    if (re.test(text)) for (const t of tags) out.add(t);
  }
  return [...out];
}

/** True when any investor sector token overlaps the startup's tokens (either direction contains). */
export function sectorFits(industry: string | null | undefined, investorSectors: readonly string[]): { fit: boolean; hit: string | null } {
  if (!investorSectors.length) return { fit: true, hit: null }; // sector-agnostic investor
  const mine = sectorTokensFor(industry);
  if (!mine.length) return { fit: false, hit: null };
  for (const raw of investorSectors) {
    const s = norm(String(raw));
    if (!s) continue;
    if (s === "any" || s === "agnostic" || s === "all") return { fit: true, hit: null };
    for (const m of mine) {
      if (m === s || (m.length >= 4 && s.includes(m)) || (s.length >= 4 && m.includes(s))) return { fit: true, hit: String(raw) };
    }
  }
  return { fit: false, hit: null };
}

/** projects.stage (0–7) or intake stage → investor StageBand. */
export function stageBandFor(stage: number | FounderStage | null | undefined): StageBand | null {
  if (stage === null || stage === undefined) return null;
  if (typeof stage === "number") {
    if (!Number.isFinite(stage)) return null;
    if (stage <= 1) return "pre_seed";
    if (stage <= 3) return "seed";
    if (stage <= 5) return "series_a";
    return "series_b";
  }
  switch (stage) {
    case "idea":
    case "pre_revenue_prototype":
      return "pre_seed";
    case "mvp":
    case "early_revenue":
      return "seed";
    case "scaling":
      return "series_a";
    default:
      return null;
  }
}

const STAGE_LABEL: Record<StageBand, string> = {
  pre_seed: "pre-seed",
  seed: "seed",
  series_a: "Series A",
  series_b: "Series B",
  growth: "growth",
  any: "any stage",
};

export function stageFits(startup: StageBand | null, investorStages: readonly StageBand[]): boolean {
  if (!investorStages.length || investorStages.includes("any")) return true;
  if (!startup) return false;
  return investorStages.includes(startup);
}

/** AU state / "national" → ISO country the investor's `geos` use. Non-AU strings pass through upper-cased. */
export function geoFor(state: string | null | undefined): string | null {
  if (!state) return null;
  const s = state.trim();
  if (!s) return null;
  if (/^(national|nsw|vic|qld|wa|sa|tas|act|nt|au|australia)$/i.test(s)) return "AU";
  return s.length === 2 ? s.toUpperCase() : "AU";
}

export function geoFits(startupGeo: string | null, investorGeos: readonly string[]): boolean {
  if (!investorGeos.length) return true;
  const g = investorGeos.map((x) => String(x).toUpperCase());
  if (g.includes("ANY") || g.includes("GLOBAL") || g.includes("*")) return true;
  if (!startupGeo) return false;
  return g.includes(startupGeo.toUpperCase());
}

// ─── Pure: scoring ───────────────────────────────────────────────────────────

export function introHref(startup: string, investor: string): string {
  const subject = fill(FUNDING_COPY.growth.introSubject, { startup, investor });
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Score one investor against one project. `null` = below the floor / not discoverable / SVI gate failed. */
export function scoreInvestorFit(project: InvestorMatchProject, investor: InvestorCandidate): InvestorMatch | null {
  if (!investor.discoverable) return null;
  const prefs = investor.prefs ?? {};
  const sectors = Array.isArray(prefs.sectors) ? prefs.sectors.map(String) : [];
  const stages = (Array.isArray(prefs.stages) ? prefs.stages : []) as StageBand[];
  const geos = Array.isArray(prefs.geos) ? prefs.geos.map(String) : [];
  const minSvi = typeof prefs.min_svi === "number" ? prefs.min_svi : null;

  const reasons: string[] = [];
  const gaps: FitGate[] = [];
  let score = 0;

  // SVI floor is a hard gate — an investor who set min_svi will not look below it.
  if (minSvi !== null && minSvi > 0) {
    if (project.svi === null || project.svi < minSvi) return null;
    score += FIT_WEIGHTS.svi;
    reasons.push(`Your SVI ${Math.round(project.svi)} clears their ${minSvi} floor`);
  } else {
    score += FIT_WEIGHTS.svi;
    reasons.push("No SVI floor");
  }

  const sector = sectorFits(project.industry, sectors);
  if (sector.fit) {
    score += FIT_WEIGHTS.sector;
    reasons.push(sector.hit ? `Invests in ${sector.hit}` : "Sector-agnostic");
  } else gaps.push("sector");

  const band = stageBandFor(project.stage);
  if (stageFits(band, stages)) {
    score += FIT_WEIGHTS.stage;
    reasons.push(stages.length && !stages.includes("any") ? `Backs ${stages.map((s) => STAGE_LABEL[s] ?? s).join(" / ")} rounds` : "Any stage");
  } else gaps.push("stage");

  const geo = geoFor(project.state);
  if (geoFits(geo, geos)) {
    score += FIT_WEIGHTS.geo;
    reasons.push(geos.length ? `Invests in ${geos.join(", ")}` : "Any geography");
  } else gaps.push("geo");

  if (score < FIT_FLOOR) return null;

  return {
    investor_id: investor.id,
    name: investor.name,
    firm: typeof prefs.firm === "string" && prefs.firm.trim() ? prefs.firm.trim() : null,
    thesis: typeof prefs.thesis === "string" && prefs.thesis.trim() ? prefs.thesis.trim() : null,
    plan: investor.plan,
    score,
    reasons,
    gaps,
    sectors,
    stages,
    geos,
    cheque_band: typeof prefs.cheque_band === "string" ? prefs.cheque_band : null,
    min_svi: minSvi,
    intro_href: introHref(project.name, investor.name),
  };
}

/** Rank every discoverable candidate, highest score first (ties → name), capped at `limit`. */
export function rankInvestors(project: InvestorMatchProject, candidates: readonly InvestorCandidate[], limit = INVESTOR_MATCH_LIMIT): InvestorMatch[] {
  const out: InvestorMatch[] = [];
  for (const c of candidates) {
    const m = scoreInvestorFit(project, c);
    if (m) out.push(m);
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return out.slice(0, Math.max(0, limit));
}

// ─── Store + server entry ────────────────────────────────────────────────────

export interface InvestorMatchStore {
  listDiscoverableInvestors(): Promise<InvestorCandidate[]>;
}

/** Minimal Supabase surface (same shape radar-sweep.ts uses). */
export interface SupabaseLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface InvestorRow {
  id: string;
  display_name: string | null;
  plan: string | null;
  investor_prefs: unknown;
  investor_discoverable: boolean | null;
}

export function createSupabaseInvestorStore(db: SupabaseLike): InvestorMatchStore {
  return {
    async listDiscoverableInvestors() {
      const { data, error } = await db
        .from("app_users")
        .select("id, display_name, plan, investor_prefs, investor_discoverable")
        .eq("investor_discoverable", true)
        .not("investor_prefs", "is", null)
        .limit(2000);
      if (error) {
        // Column missing until 0323 is applied → no candidates, never a crash.
        if (!/column|does not exist/i.test(String(error.message ?? ""))) {
          console.warn("[investor-match] read failed", error.message ?? error);
        }
        return [];
      }
      return ((data ?? []) as InvestorRow[]).map((r) => ({
        id: r.id,
        name: (r.display_name ?? "").trim() || "Investor",
        plan: r.plan ?? null,
        prefs: r.investor_prefs && typeof r.investor_prefs === "object" ? (r.investor_prefs as Partial<InvestorPreferences>) : null,
        discoverable: r.investor_discoverable === true,
      }));
    },
  };
}

/**
 * Top-10 discoverable investors for a founder's project. Never throws — a
 * missing column / DB error yields `[]` so the tab shows the "no matches"
 * copy instead of a 500.
 */
export async function matchInvestorsForProject(
  project: InvestorMatchProject,
  opts: { store?: InvestorMatchStore | null; db?: SupabaseLike | null; limit?: number } = {},
): Promise<InvestorMatch[]> {
  try {
    let store = opts.store ?? null;
    if (!store) {
      const db = opts.db ?? (await import("@/lib/supabase")).getSupabaseAdmin();
      if (!db) return [];
      store = createSupabaseInvestorStore(db);
    }
    const candidates = await store.listDiscoverableInvestors();
    return rankInvestors(project, candidates, opts.limit ?? INVESTOR_MATCH_LIMIT);
  } catch (err) {
    console.warn("[investor-match] failed", err instanceof Error ? err.message : String(err));
    return [];
  }
}
