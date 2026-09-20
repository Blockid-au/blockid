// evidence-cta — G19-S43: every missing input becomes a CTA row with a link.
//
// A `missing` EvidenceRow used to carry its hint in `value` ("Connect GitHub
// (Settings → Connectors) …"), which no surface rendered. This module mints
// the `cta` block for such rows — a founder-facing label, the internal page
// where the input is added, and the "+N SVI" from the one lift model
// (lib/svi-lift.ts, decision D2) — so the chapter evidence table, the
// appendix register, the pending line of an unassessed chapter, the 90-day
// plan and the PDF / DOCX twins all say the same thing.
//
// Pure, client-safe (no I/O; the adapter and the pipeline both import it).

import type { CriterionKey } from "@/lib/evaluation-criteria";
import { CRITERIA } from "@/lib/evaluation-criteria";
import type { DimKey, EvidenceSource } from "@/lib/report-pipeline/dimension-owners";
import { catalogueCodeForSource, catalogueItem, catalogueLift, derivedLift, liftForSource } from "@/lib/svi-lift";
import type { EvidenceCta, EvidenceRow } from "./schema";
import { CONNECTORS_HREF } from "./valuation-view";

/**
 * Where each kind of input is added — the only internal hrefs a CTA row may
 * carry. Every value is a live page under app/(app)/(founder)/workspace/**
 * (the deploy's gate-8 link check fails on a dead internal href).
 */
export const CTA_HREFS = {
  /** Stripe / Xero / GA4 / GitHub OAuth connectors — the S42 constant (`/workspace/settings/connectors` never existed). */
  connectors: CONNECTORS_HREF,
  /** The 13-criteria intake. */
  criteria: "/workspace/score/criteria",
  /** The Evidence Hub (`svi_dimension_evidence` uploads per dimension). */
  evidence: "/workspace/evidence",
  /** Structured founder profile (execution rubric) + LinkedIn export. */
  founder: "/workspace/settings/founder",
  /** Shareholders + ESOP pool register. */
  equity: "/workspace/equity",
  /** Grant profile intake (grant / program matching). */
  funding: "/workspace/funding",
  /** Project settings — ABN verification. */
  project: "/workspace/settings/project",
} as const;

export type CtaHref = (typeof CTA_HREFS)[keyof typeof CTA_HREFS];

/** Founder-facing name for an evidence source (replaces the raw enum "evidence: stripe"). */
export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
  stripe: "Stripe (revenue)",
  ga4: "Google Analytics 4",
  github: "GitHub repository",
  xero: "Xero (accounts)",
  linkedin: "LinkedIn export",
  upload: "Document upload",
  url: "Public URL",
  self_declared: "Self-declared input",
  founder_profile: "Founder profile",
  connector_other: "Data connector",
  external: "Verified ABN (public registers)",
};

const CONNECT_LABELS: Partial<Record<EvidenceSource, string>> = {
  stripe: "Connect Stripe",
  ga4: "Connect Google Analytics",
  github: "Connect GitHub",
  xero: "Connect Xero",
  linkedin: "Upload your LinkedIn export",
  founder_profile: "Complete your founder profile",
  external: "Verify your ABN",
};

/** The page a source is added on. */
export function hrefForSource(source: EvidenceSource): CtaHref {
  switch (source) {
    case "stripe":
    case "ga4":
    case "github":
    case "xero":
    case "connector_other":
      return CTA_HREFS.connectors;
    case "linkedin":
    case "founder_profile":
      return CTA_HREFS.founder;
    case "external":
      return CTA_HREFS.project;
    case "upload":
    case "url":
    case "self_declared":
    default:
      return CTA_HREFS.evidence;
  }
}

/** The page a catalogue code is added on (register / founder / connectors / ABN / hub). */
export function hrefForCode(code: string): CtaHref {
  switch (code) {
    case "github_repo":
    case "code_commits":
    case "test_coverage":
    case "mrr_dashboard":
    case "churn_rate":
    case "user_growth_chart":
      return CTA_HREFS.connectors;
    case "abn_registration":
    case "asic_founder_history":
      return CTA_HREFS.project;
    case "cap_table_spreadsheet":
    case "vesting_schedule":
    case "esop_pool":
    case "shareholder_agreement":
    case "founder_agreements":
      return CTA_HREFS.equity;
    case "founder_linkedin":
    case "founder_bio":
    case "previous_exits":
      return CTA_HREFS.founder;
    default:
      return CTA_HREFS.evidence;
  }
}

/**
 * The CTA for adding `source` on `dim`: the catalogue item's label when one
 * exists ("Add cap table (current equity register)"), else a connect /
 * upload verb; lift from the catalogue (undefined when it has no item).
 */
export function ctaForSource(dim: DimKey, source: EvidenceSource, overrides: Partial<EvidenceCta> = {}): EvidenceCta {
  const code = catalogueCodeForSource(dim, source);
  const item = catalogueItem(code)?.item;
  const label = overrides.label ?? CONNECT_LABELS[source] ?? (item ? `Add ${item.label.toLowerCase()}` : `Add ${EVIDENCE_SOURCE_LABELS[source].toLowerCase()}`);
  const href = overrides.href ?? (code ? hrefForCode(code) : hrefForSource(source));
  const lift = overrides.lift ?? liftForSource(dim, source);
  return { label, href, ...(typeof lift === "number" ? { lift } : {}) };
}

/** A CTA for a catalogue code (Evidence Hub gap): "Add <label>" → the code's page, catalogue lift. */
export function ctaForCode(code: string, overrides: Partial<EvidenceCta> = {}): EvidenceCta | undefined {
  const entry = catalogueItem(code);
  if (!entry) return undefined;
  const lift = overrides.lift ?? entry.item.estimatedSviImpact;
  return { label: overrides.label ?? `Add ${entry.item.label.toLowerCase()}`, href: overrides.href ?? hrefForCode(code), lift };
}

/** A CTA for an empty 13-criteria input: fill it on the intake page; lift = criterion weight × the 50 → 70 gap. */
export function ctaForCriterion(key: CriterionKey): EvidenceCta {
  const def = CRITERIA.find((c) => c.key === key);
  return { label: `Fill in ${def?.title ?? key}`, href: CTA_HREFS.criteria, lift: derivedLift(def?.weight ?? 6, 50) };
}

/** The CTAs for the GATHER `missing` rows (repo audit / cap table / founder signals / founder profile / grant profile). */
export const GATHER_MISSING_CTAS = {
  repo_audit: { label: "Connect GitHub to audit the repository", href: CTA_HREFS.connectors, lift: catalogueLift("github_repo") },
  cap_table: { label: "Add shareholders to the cap table", href: CTA_HREFS.equity, lift: catalogueLift("cap_table_spreadsheet") },
  founder_signals: { label: "Upload your LinkedIn export", href: CTA_HREFS.founder, lift: catalogueLift("founder_linkedin") },
  founder_profile: { label: "Complete your founder profile", href: CTA_HREFS.founder, lift: catalogueLift("founder_bio") },
  // No catalogue item behind the grant profile — it unlocks Money on the Table, not a dimension score.
  grants: { label: "Complete your grant profile", href: CTA_HREFS.funding },
  abn: { label: "Verify your ABN", href: CTA_HREFS.project, lift: catalogueLift("abn_registration") },
} as const satisfies Record<string, EvidenceCta>;

export type GatherMissingKind = keyof typeof GATHER_MISSING_CTAS;

/** Attach a CTA to a `missing` row (identity for any other status). */
export function withCta(row: EvidenceRow, cta: EvidenceCta | undefined): EvidenceRow {
  if (row.status !== "missing" || !cta) return row;
  return { ...row, cta };
}

/** The best next CTA among a chapter's missing rows (highest lift first, then label). */
export function bestMissingCta(rows: readonly EvidenceRow[]): EvidenceRow | undefined {
  return rows
    .filter((r) => r.status === "missing" && r.cta)
    .sort((a, b) => (b.cta?.lift ?? 0) - (a.cta?.lift ?? 0) || a.label.localeCompare(b.label))[0];
}

/** Sources already evidenced (a connector present → never "Connect X"). */
export function evidencedSources(rows: readonly EvidenceRow[]): Set<EvidenceSource> {
  return new Set(rows.filter((r) => r.status === "evidenced" || r.status === "partial").map((r) => r.source));
}

/** Structural subset of `svi-analysis.ts:SVIEvidenceGap` (P0 / P1 / P2 gaps the engine found). */
export interface EvidenceGapLike {
  priority: "P0" | "P1" | "P2";
  label: string;
  action: string;
  impact: number;
  evidenceType: string;
  code?: string;
}

const GAP_SOURCE: Record<string, EvidenceSource> = { transaction_data: "stripe", connected_source: "connector_other", public_url: "url", document_uploaded: "upload", self_declared: "self_declared" };

/** Deterministic id for an engine gap row (stable across runs, like the GATHER rows). */
function gapId(label: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i += 1) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  return `gap-${h.toString(16).padStart(8, "0")}`;
}

/**
 * The engine's P0 / P1 evidence gaps as linked CTA rows for
 * `actionPlan.evidenceToAdd` — the catalogue code (when the gap names one)
 * gives the page and the lift; otherwise the Evidence Hub and the gap's own
 * `impact` (already catalogue-derived in svi-analysis.ts).
 */
export function evidenceGapRows(gaps: readonly EvidenceGapLike[], observedAt: string, priorities: ReadonlyArray<"P0" | "P1" | "P2"> = ["P0", "P1"]): EvidenceRow[] {
  return gaps
    .filter((g) => priorities.includes(g.priority))
    .map((g) => {
      const entry = catalogueItem(g.code);
      const dims: DimKey[] = entry ? [entry.dim] : [];
      const cta: EvidenceCta = g.code && entry ? { label: g.label, href: hrefForCode(g.code), lift: entry.item.estimatedSviImpact } : { label: g.label, href: CTA_HREFS.evidence, lift: g.impact };
      return {
        evidence_id: gapId(`${g.priority}|${g.label}`),
        source: GAP_SOURCE[g.evidenceType] ?? "self_declared",
        label: `${g.priority}: ${g.label}`,
        status: "missing" as const,
        observedAt,
        value: g.action,
        dims,
        cta,
      };
    });
}

/** "+N SVI" for a CTA, or "" when the row carries no lift. */
export function ctaLiftLabel(cta: EvidenceCta | undefined): string {
  return typeof cta?.lift === "number" ? `+${cta.lift} SVI` : "";
}
