// Evidence checklist — per SVI dimension: what is claimed (rows on file),
// what is missing (EVIDENCE_CATALOG items not yet supplied), what raises
// confidence (the next confidence rung and the plain-language cap rule that
// governs who can set it), one CTA (→ the dimension's evidence page).
// G21 P1-C; mounted on the founder landing and the Evidence hub.
//
// Pure: takes the project's `svi_dimension_evidence` rows (dimension,
// evidence_type, confidence_level, is_verified) and returns one row per
// dimension in report order. No I/O — the page loads the rows the same
// way `loadEvidenceReads` does and passes them in.

import { EVIDENCE_CATALOG, type EvidenceType } from "@/lib/svi-completeness";
import { CAP_RULES_PLAIN, CONFIDENCE_LEVELS, type ConfidenceLevel } from "@/lib/evidence/confidence-cap";
import { DIMENSION_OWNERS, DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";

export interface EvidenceRowLite {
  dimension: string | null;
  evidence_type: string | null;
  confidence_level?: string | null;
  is_verified?: boolean | null;
}

export interface ConfidenceStep {
  /** The rung the founder can reach next. */
  level: ConfidenceLevel;
  /** "connected source" */
  label: string;
  /** Who can set it — `CAP_RULES_PLAIN.who`. */
  who: string;
  /** The plain rule — `CAP_RULES_PLAIN.rule`. */
  rule: string;
  /** What to do in one line. */
  action: string;
}

export interface EvidenceChecklistRow {
  dimension: DimKey;
  title: string;
  shortLabel: string;
  /** Catalogue items on file for this dimension. */
  claimed: number;
  /** Catalogue items still missing, highest estimated impact first. */
  missing: Array<Pick<EvidenceType, "code" | "label" | "confidenceLevel" | "estimatedSviImpact">>;
  /** Total catalogue items for this dimension. */
  total: number;
  /** Highest confidence rung reached by any row on file (null when nothing is on file). */
  highest: ConfidenceLevel | null;
  /** The next rung and its plain rule — null once third_party_verified is reached. */
  raise: ConfidenceStep | null;
  /** One CTA: the dimension's evidence page. */
  cta: { href: string; label: string };
  /** Summary sentence for the card. */
  summary: string;
}

export const LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  self_declared: "self-declared",
  public_url: "public URL",
  document_uploaded: "document uploaded",
  connected_source: "connected source",
  transaction_data: "transaction data",
  third_party_verified: "third-party verified",
};

const LEVEL_ACTION: Record<ConfidenceLevel, string> = {
  self_declared: "Describe it in your own words.",
  public_url: "Link a public page we can open (site, listing, register).",
  document_uploaded: "Upload the document itself (contract, statement, deck page).",
  connected_source: "Connect the source of record (GitHub, GA4, Stripe, Xero).",
  transaction_data: "Connect Stripe or Xero so revenue and payouts are read as transactions.",
  third_party_verified: "Request review — a named BlockID reviewer checks the evidence against its source.",
};

/** The origin that may set a rung (the cap table in confidence-cap.ts). */
function ruleFor(level: ConfidenceLevel): { who: string; rule: string } {
  const rule =
    level === "self_declared" || level === "public_url"
      ? CAP_RULES_PLAIN.find((r) => r.origin === "founder_text")
      : level === "document_uploaded"
        ? CAP_RULES_PLAIN.find((r) => r.origin === "founder_upload")
        : level === "connected_source" || level === "transaction_data"
          ? CAP_RULES_PLAIN.find((r) => r.origin === "connector")
          : CAP_RULES_PLAIN.find((r) => r.origin === "reviewer");
  return { who: rule?.who ?? "", rule: rule?.rule ?? "" };
}

const rank = (l: ConfidenceLevel): number => CONFIDENCE_LEVELS.indexOf(l);

export function nextConfidenceStep(highest: ConfidenceLevel | null): ConfidenceStep | null {
  const next = highest === null ? "public_url" : CONFIDENCE_LEVELS[rank(highest) + 1];
  if (!next) return null;
  // The founder's own next step skips self_declared: prose is already what the score reads.
  const level: ConfidenceLevel = next === "self_declared" ? "public_url" : next;
  const { who, rule } = ruleFor(level);
  return { level, label: LEVEL_LABEL[level], who, rule, action: LEVEL_ACTION[level] };
}

function isLevel(v: unknown): v is ConfidenceLevel {
  return typeof v === "string" && (CONFIDENCE_LEVELS as readonly string[]).includes(v);
}

export function buildEvidenceChecklist(rows: ReadonlyArray<EvidenceRowLite>): EvidenceChecklistRow[] {
  const byDim = new Map<string, EvidenceRowLite[]>();
  for (const r of rows) {
    const d = (r.dimension ?? "").toLowerCase();
    if (!d) continue;
    (byDim.get(d) ?? byDim.set(d, []).get(d)!).push(r);
  }

  return DIM_ORDER.map((dim: DimKey) => {
    const owner = DIMENSION_OWNERS[dim];
    const catalog = EVIDENCE_CATALOG[dim] ?? [];
    const mine = byDim.get(dim) ?? [];
    const present = new Set(mine.map((r) => r.evidence_type ?? "").filter(Boolean));
    const claimed = catalog.filter((c) => present.has(c.code)).length;
    const missing = catalog
      .filter((c) => !present.has(c.code))
      .sort((a, b) => b.estimatedSviImpact - a.estimatedSviImpact)
      .map((c) => ({ code: c.code, label: c.label, confidenceLevel: c.confidenceLevel, estimatedSviImpact: c.estimatedSviImpact }));

    let highest: ConfidenceLevel | null = null;
    for (const r of mine) {
      const lvl: ConfidenceLevel | null = r.is_verified ? "third_party_verified" : isLevel(r.confidence_level) ? r.confidence_level : mine.length ? "self_declared" : null;
      if (lvl && (highest === null || rank(lvl) > rank(highest))) highest = lvl;
    }
    const raise = nextConfidenceStep(highest);
    const summary =
      claimed === 0
        ? `Nothing on file yet — ${catalog.length} items can back this dimension.`
        : `${claimed} of ${catalog.length} on file · strongest evidence: ${highest ? LEVEL_LABEL[highest] : "self-declared"}.`;

    return {
      dimension: dim,
      title: owner.title,
      shortLabel: owner.shortLabel,
      claimed,
      missing,
      total: catalog.length,
      highest,
      raise,
      cta: { href: `/workspace/evidence/gaps?dim=${dim}`, label: claimed === 0 ? `Add ${owner.shortLabel} evidence` : `Strengthen ${owner.shortLabel}` },
      summary,
    };
  });
}
