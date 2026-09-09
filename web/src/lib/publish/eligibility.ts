// Who is allowed to become a public page, and what they must write first.
//
// Pure — no I/O — so the API route and the founder-facing panel can never
// disagree about what is publishable, and so every rule below is unit
// testable.
//
// Two independent gates:
//
//   1. DEPTH. Google treats near-duplicate low-value pages as doorway pages
//      and can penalise the whole domain for them, so "publish everything" is
//      not the neutral option it looks like — a directory of thin profiles is
//      worse for blockid.au than an empty one. `checkAnalysisDepth` decides
//      whether a given run has enough behind it to be worth a URL.
//
//   2. AUTHORSHIP. `normalisePublishFields` takes the name, one-liner and
//      sector the founder typed *for publication*. Nothing public is derived
//      from what they pasted or uploaded, so a published page cannot leak an
//      email address, a filename or a line of their deck. The 60-character
//      floor on the one-liner is also the cheapest available guard against
//      templated pages: every URL carries at least one paragraph nobody else
//      wrote.

import type { CompactSvi } from "@/lib/analyses/payload";
import { EVIDENCE_CONFIDENCE, SECTOR_LABELS } from "@/lib/svi-analysis";

/** The eight dimensions a profile must carry to be worth reading. */
export const SVI_DIMENSION_KEYS = [
  "ftv",
  "mpc",
  "ptd",
  "tre",
  "cgh",
  "iri",
  "lco",
  "svm",
] as const;

export type SviDimensionKey = (typeof SVI_DIMENSION_KEYS)[number];

/** Plain-English labels, matching what the founder already saw on /analyze. */
export const SVI_DIMENSION_LABELS: Record<SviDimensionKey, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Technical",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

/**
 * The thinness threshold.
 *
 * An analysis scored from typed text alone carries an evidence confidence of
 * 0.20 (`self_declared`). One scored against a live website, an uploaded deck,
 * a connected source or transaction data starts at 0.35 (`public_url`) and
 * climbs. Requiring 0.35 means every public profile rests on something a
 * reader could go and check for themselves — which is the difference between
 * a page worth indexing and a paragraph somebody typed into a box.
 */
export const MIN_EVIDENCE_CONFIDENCE = EVIDENCE_CONFIDENCE.public_url;

/** A profile with fewer than this many stage-appropriate steps is filler. */
export const MIN_NEXT_ACTIONS = 3;

export const MIN_COMPANY_NAME_CHARS = 2;
export const MAX_COMPANY_NAME_CHARS = 80;
export const MIN_ONE_LINER_CHARS = 60;
export const MAX_ONE_LINER_CHARS = 240;
export const MAX_SLUG_CHARS = 48;

export interface DepthResult {
  ok: boolean;
  /** Founder-readable. These strings are rendered in the publish panel. */
  reasons: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Is this run substantial enough to deserve a public, indexable page?
 *
 * Returns every failing reason, not just the first, so a founder is told
 * once what to fix rather than discovering the next rule on each retry.
 */
export function checkAnalysisDepth(
  svi: CompactSvi | null | undefined,
): DepthResult {
  const reasons: string[] = [];

  if (!svi) {
    return {
      ok: false,
      reasons: [
        "This run finished without a score, so there is nothing to show on a public page. Run the analysis again.",
      ],
    };
  }

  const dims = svi.dimensions ?? {};
  const missing = SVI_DIMENSION_KEYS.filter((k) => !isFiniteNumber(dims[k]));
  if (missing.length > 0) {
    reasons.push(
      `The score is missing ${missing.length} of the eight dimensions, so the profile would be half-empty. Re-run the analysis.`,
    );
  }

  if (!isFiniteNumber(svi.totalSVI) || svi.totalSVI <= 0) {
    reasons.push("This run has no overall index value to publish.");
  }

  const val = svi.valuation;
  const valuationOk =
    val &&
    isFiniteNumber(val.low) &&
    isFiniteNumber(val.mid) &&
    isFiniteNumber(val.high) &&
    val.mid > 0 &&
    val.low <= val.mid &&
    val.mid <= val.high &&
    typeof val.method === "string" &&
    val.method.trim().length > 0;
  if (!valuationOk) {
    reasons.push(
      "This run has no valuation range, which is half of what a reader comes to a profile for.",
    );
  }

  const actions = (svi.nextActions ?? []).filter(
    (a) =>
      a &&
      typeof a.title === "string" &&
      a.title.trim().length > 0 &&
      typeof a.detail === "string" &&
      a.detail.trim().length >= 20,
  );
  if (actions.length < MIN_NEXT_ACTIONS) {
    reasons.push(
      `A public profile needs at least ${MIN_NEXT_ACTIONS} stage-appropriate next steps; this run produced ${actions.length}.`,
    );
  }

  if (!svi.stageLabel || svi.stageLabel.trim().length === 0) {
    reasons.push("This run did not settle on a stage, so there is no context to publish it in.");
  }

  const confidence = isFiniteNumber(svi.confidenceMultiplier)
    ? svi.confidenceMultiplier
    : 0;
  if (confidence < MIN_EVIDENCE_CONFIDENCE) {
    reasons.push(
      "This score came from typed text alone. Run the analysis against your website or upload your deck, then publish that run — a profile built on nothing verifiable is not worth a page.",
    );
  }

  return { ok: reasons.length === 0, reasons };
}

// ── Founder-authored fields ──────────────────────────────────────────────

export interface PublishFieldsInput {
  companyName?: unknown;
  oneLiner?: unknown;
  sector?: unknown;
  websiteUrl?: unknown;
}

export interface PublishFields {
  companyName: string;
  oneLiner: string;
  sector: string;
  websiteUrl: string | null;
}

export type FieldsResult =
  | { ok: true; fields: PublishFields }
  | { ok: false; reasons: string[] };

/** Sector keys a founder may pick, in the order the picker shows them. */
export const PUBLISH_SECTORS = Object.keys(SECTOR_LABELS).sort((a, b) =>
  SECTOR_LABELS[a].localeCompare(SECTOR_LABELS[b], "en-AU"),
);

function collapse(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}

/**
 * Reject a website that points back at us. The seeded sample listings all
 * did exactly that, and a directory whose every outbound link is self-
 * referential is a doorway signal in its own right.
 */
function normaliseWebsite(raw: unknown): { url: string | null; error?: string } {
  const value = collapse(raw);
  if (!value) return { url: null };
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { url: null, error: "That website address is not a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url: null, error: "The website must be an http or https address." };
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "blockid.au" || host.endsWith(".blockid.au")) {
    return {
      url: null,
      error: "Link your own website, not a BlockID page.",
    };
  }
  if (!host.includes(".")) {
    return { url: null, error: "That website address is not a valid URL." };
  }
  return { url: parsed.toString() };
}

export function normalisePublishFields(input: PublishFieldsInput): FieldsResult {
  const reasons: string[] = [];

  const companyName = collapse(input.companyName);
  if (companyName.length < MIN_COMPANY_NAME_CHARS) {
    reasons.push("Add the company name you want shown publicly.");
  } else if (companyName.length > MAX_COMPANY_NAME_CHARS) {
    reasons.push(
      `Keep the company name to ${MAX_COMPANY_NAME_CHARS} characters or fewer.`,
    );
  }

  const oneLiner = collapse(input.oneLiner);
  if (oneLiner.length < MIN_ONE_LINER_CHARS) {
    reasons.push(
      `Write at least ${MIN_ONE_LINER_CHARS} characters describing what the company does — it is the only part of the page in your own words.`,
    );
  } else if (oneLiner.length > MAX_ONE_LINER_CHARS) {
    reasons.push(
      `Keep the description to ${MAX_ONE_LINER_CHARS} characters or fewer.`,
    );
  }

  const sector = collapse(input.sector).toLowerCase();
  if (!sector || !Object.prototype.hasOwnProperty.call(SECTOR_LABELS, sector)) {
    reasons.push("Choose the sector the company operates in.");
  }

  const website = normaliseWebsite(input.websiteUrl);
  if (website.error) reasons.push(website.error);

  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    fields: { companyName, oneLiner, sector, websiteUrl: website.url },
  };
}

// ── Slugs ────────────────────────────────────────────────────────────────

/**
 * Paths under /listings that are (or could become) real routes, plus the
 * words a scraped company name might innocently produce.
 */
export const RESERVED_SLUGS = new Set([
  "new",
  "index",
  "listings",
  "sitemap",
  "robots",
  "api",
  "submit",
  "search",
  "all",
  "sector",
  "stage",
]);

/**
 * Company name → URL slug. Lowercase kebab only, which keeps the namespace
 * disjoint from the uppercase ticker namespace /listings used to serve.
 * Returns "" when the name has no Latin-alphabet content to slug (a
 * name written entirely in a non-Latin script, say); the caller then falls
 * back to a generated slug rather than minting an empty URL.
 */
export function slugify(raw: string): string {
  const base = (raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_CHARS)
    .replace(/-+$/g, "");
  if (base.length < 3) return "";
  if (RESERVED_SLUGS.has(base)) return `${base}-startup`;
  return base;
}

/** True when a string is safe to serve as a /listings/[slug] segment. */
export function isValidSlug(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 64 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)
  );
}

/**
 * Pick the first free slug, given the ones already taken. Suffixes -2, -3 …
 * before falling back to a short deterministic tail supplied by the caller,
 * so this stays pure.
 */
export function pickFreeSlug(
  desired: string,
  taken: Iterable<string>,
  fallbackTail: string,
): string {
  const used = new Set(taken);
  const base = desired || `startup-${fallbackTail}`;
  if (!used.has(base)) return base;
  for (let n = 2; n <= 50; n += 1) {
    const candidate = `${base.slice(0, MAX_SLUG_CHARS - 3)}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, MAX_SLUG_CHARS - 7)}-${fallbackTail}`;
}
