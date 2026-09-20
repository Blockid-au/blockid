// svi-lift — THE one "+N SVI" model (G19-S43, decision D2).
//
// Before S43 four different numbers claimed to be the lift of adding a piece
// of evidence: `SVIAnalysis.evidenceGaps[].impact`, `nextActions[].impact`,
// the dashboard's `EVIDENCE_CATALOG.estimatedSviImpact` and the TBR's
// `expectedLift = weight × (70 − score) / 100` (which rounded to "+1" on
// every chapter). The catalogue is now the only source:
//
//   • `catalogueLift(code)`            — the catalogue number for a code;
//   • `liftForSource(dim, source)`     — a connector / upload / url mapped to
//                                        the catalogue item it evidences;
//   • `derivedLift(weight, score)`     — the fallback for an action that is
//                                        not an evidence item (a criterion
//                                        card's own next step): criterion
//                                        weight × gap to the next band, put
//                                        on the catalogue's 1–10 scale so the
//                                        two never read as different units.
//
// Pure, client-safe, no I/O. `svi-analysis.ts`, `report-v2/adapter.ts`,
// `report-pipeline/agent-dispatcher.ts` and `dashboard/evidence-gaps.ts`
// all read this module (colocated test: svi-completeness.test.ts pins that
// dashboard, chapter and evidenceGaps agree for the demo fixture).

import { EVIDENCE_CATALOG, type EvidenceType } from "@/lib/svi-completeness";

/** The catalogue's own range — every lift the report quotes lives inside it. */
export const LIFT_MIN = 1;
export const LIFT_MAX = 10;

/** The 8 SVI dimension keys as the catalogue spells them (matches `DimKey`). */
export type LiftDim = "tre" | "mpc" | "ftv" | "ptd" | "cgh" | "iri" | "lco" | "svm";

/** The evidence sources the report contract knows (mirrors `EvidenceSource` in dimension-owners.ts — kept as strings here to avoid the import cycle). */
export type LiftSource = "stripe" | "ga4" | "github" | "xero" | "linkedin" | "upload" | "url" | "self_declared" | "founder_profile" | "connector_other" | "external";

/**
 * Which catalogue item a source evidences on a dimension. A missing cell
 * means "no catalogue item" → `derivedLift` (never a silent "+1").
 */
export const SOURCE_CATALOGUE_CODE: Record<LiftDim, Partial<Record<LiftSource, string>>> = {
  tre: { stripe: "mrr_dashboard", xero: "revenue_proof", ga4: "user_growth_chart", upload: "customer_list", url: "logo_customers", connector_other: "churn_rate" },
  mpc: { upload: "customer_loi", url: "market_benchmarks", ga4: "market_benchmarks", self_declared: "problem_statement" },
  ftv: { linkedin: "founder_linkedin", founder_profile: "founder_bio", upload: "advisor_bios", url: "founder_press", external: "asic_founder_history", github: "team_org_chart" },
  ptd: { github: "github_repo", url: "website", upload: "product_demo_video", connector_other: "mobile_app" },
  cgh: { upload: "cap_table_spreadsheet", connector_other: "esop_pool", xero: "board_minutes" },
  iri: { upload: "pitch_deck", xero: "financial_model", url: "data_room", connector_other: "data_room" },
  lco: { external: "abn_registration", upload: "ip_assignment", url: "terms_of_service", connector_other: "abn_registration" },
  svm: { upload: "moat_analysis", url: "vision_statement", external: "patent_applications" },
};

const BY_CODE: Map<string, { dim: LiftDim; item: EvidenceType }> = (() => {
  const m = new Map<string, { dim: LiftDim; item: EvidenceType }>();
  for (const [dim, items] of Object.entries(EVIDENCE_CATALOG)) for (const item of items) if (!m.has(item.code)) m.set(item.code, { dim: dim as LiftDim, item });
  return m;
})();

/** The catalogue item behind a code (any dimension); undefined for an unknown code. */
export function catalogueItem(code: string | null | undefined): { dim: LiftDim; item: EvidenceType } | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

/** `EVIDENCE_CATALOG[*][code].estimatedSviImpact` — the one lift number for an evidence item. */
export function catalogueLift(code: string | null | undefined): number | undefined {
  return catalogueItem(code)?.item.estimatedSviImpact;
}

/** The catalogue code a source evidences on a dimension (undefined = no catalogue item). */
export function catalogueCodeForSource(dim: string, source: string | null | undefined): string | undefined {
  if (!source) return undefined;
  return SOURCE_CATALOGUE_CODE[dim as LiftDim]?.[source as LiftSource];
}

/** The catalogue lift for adding `source` on `dim`; undefined when the catalogue has no such item. */
export function liftForSource(dim: string, source: string | null | undefined): number | undefined {
  return catalogueLift(catalogueCodeForSource(dim, source));
}

/** The next band boundary a score is working towards (70 strong, 85 exceptional). */
export function nextBandTarget(score: number): number {
  return score < 70 ? 70 : 85;
}

/**
 * Fallback for actions that are not catalogue items: criterion (or dimension)
 * weight × the gap to the next band, scaled onto the catalogue's 1–10 range
 * (weight 8 × gap 20 → 6; weight 6 × gap 1 → 1). Never the pre-S43
 * `weight × (70 − score) / 100` that printed "+1" on every chapter.
 */
export function derivedLift(weight: number, score: number): number {
  const w = Number.isFinite(weight) ? Math.max(0, weight) : 0;
  const s = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const gap = Math.max(0, nextBandTarget(s) - s);
  return clampLift(Math.round((w * gap) / 25));
}

/** Clamp any LLM-proposed or derived lift onto the catalogue range. */
export function clampLift(n: number): number {
  if (!Number.isFinite(n)) return LIFT_MIN;
  return Math.max(LIFT_MIN, Math.min(LIFT_MAX, Math.round(n)));
}

/**
 * D2: an LLM `expected_lift` is clamped to the catalogue value when the action
 * adds evidence (`evidenceToAdd`), otherwise onto the catalogue range.
 */
export function reconcileLift(proposed: number | null | undefined, dim: string, evidenceToAdd: string | null | undefined, fallback: () => number): number {
  const fromCatalogue = liftForSource(dim, evidenceToAdd);
  if (typeof fromCatalogue === "number") return fromCatalogue;
  if (typeof proposed === "number" && Number.isFinite(proposed) && proposed > 0) return clampLift(proposed);
  return fallback();
}

/**
 * `SVIAnalysis.evidenceGaps` / `nextActions` keyed to catalogue codes so the
 * engine quotes the same "+N" as the dashboard and the report. A gap with no
 * catalogue equivalent ("Upgrade evidence level" — the ladder step, not an
 * item) sums the two cheapest ladder items it names instead of a literal.
 */
export const ENGINE_GAP_CODES = {
  revenue_proof: "revenue_proof",
  cap_table: "cap_table_spreadsheet",
  abn: "abn_registration",
  source_code: "github_repo",
  website: "website",
  pitch_deck: "pitch_deck",
  ip: "ip_assignment",
  financial_model: "financial_model",
  analytics: "user_growth_chart",
  advisors: "advisor_bios",
  ai_moat: "moat_analysis",
  market_size: "market_research",
  demo: "product_demo_video",
  first_customer: "revenue_proof",
} as const;

export type EngineGapKey = keyof typeof ENGINE_GAP_CODES;

/** The one lift for an engine gap; `evidence_ladder` = website + founder_linkedin (the two public-URL steps off self-declared). */
export function engineGapLift(key: EngineGapKey | "evidence_ladder"): number {
  if (key === "evidence_ladder") return clampLift((catalogueLift("website") ?? 0) + (catalogueLift("founder_linkedin") ?? 0));
  return catalogueLift(ENGINE_GAP_CODES[key]) ?? LIFT_MIN;
}
