// CMO landing-page draft builder — Phase 4 P1 gap follow-up ("landing-page
// one-click publisher — Chapter 4 CTA references it but no
// `/api/landing-page/publish` route"), spun off as P4a-cmo-draft.
//
// Sibling ticks: P4a-landing-page-preview (pure render lib), P4a-publish-route
// (POST /api/landing-page/preview), P4a-preview-ui (guide-page panel). This
// tick ships the pure draft builder — deterministic text-in / text-out that
// turns a Chapter 3 CMO deep-pass output (ICP persona name + objections + top
// benefits) into a starter `LandingPageInput` a founder can then edit through
// the existing panel. No LLM call — the sibling report-pipeline agent already
// owns the LLM step; this module is the deterministic fallback so a founder
// can hit "auto-draft" without paying for a fresh CMO run.
//
// Boundary: no financial or personal-data output — the resulting
// LandingPageInput carries the same "founder-owned marketing copy" posture as
// preview.ts (no AFSL / APP hedge needed).

import {
  LANDING_PAGE_MAX_BULLET_LENGTH,
  LANDING_PAGE_MAX_BULLETS,
  LANDING_PAGE_MAX_HEADLINE_LENGTH,
  LANDING_PAGE_MAX_SUBHEADLINE_LENGTH,
  type LandingPageInput,
} from "./preview";

export interface CmoLandingDraftInput {
  /** Company / product name, e.g. "BlockID". Required. */
  productName?: string;
  /** One-line pitch, e.g. "The dataroom that assembles itself". Required. */
  oneLiner?: string;
  /** ICP label from Chapter 3, e.g. "Australian pre-seed founder". Optional. */
  personaName?: string;
  /** Persona pain points from CMO deep-pass. Each becomes a "No more X" bullet
   *  if the caller didn't already supply positive-frame `benefits[]`. */
  personaObjections?: string[];
  /** Positive-frame benefits from CMO deep-pass. Preferred over objections
   *  because they read better on a landing page. */
  benefits?: string[];
  ctaLabel?: string;
  ctaHref?: string;
  brandName?: string;
  ga4MeasurementId?: string;
  plausibleDomain?: string;
}

const DEFAULT_CTA_LABEL = "Start free";
const DEFAULT_CTA_HREF = "/signup";

/**
 * Turn a CMO deep-pass output into a starter LandingPageInput. Deterministic
 * and pure — the same input always produces the same LandingPageInput.
 *
 * The result is designed to pass `validateLandingPageInput()` when both
 * `productName` and `oneLiner` are supplied. If either is blank the result
 * will fail validation with `headline_empty` / `subheadline_empty` so the
 * caller sees the gap rather than a manufactured lie.
 */
export function buildCmoLandingDraft(input: CmoLandingDraftInput): LandingPageInput {
  const productName = (input.productName ?? "").trim();
  const oneLiner = (input.oneLiner ?? "").trim();
  const personaName = (input.personaName ?? "").trim();
  const objections = normaliseList(input.personaObjections);
  const benefits = normaliseList(input.benefits);

  return {
    headline: deriveHeadline(productName, oneLiner),
    subheadline: deriveSubheadline(oneLiner, personaName, objections),
    bullets: deriveBullets(benefits, objections),
    cta_label: pickCtaLabel(input.ctaLabel),
    cta_href: pickCtaHref(input.ctaHref),
    ...optionalString("brand_name", input.brandName ?? productName),
    ...optionalString("ga4_measurement_id", input.ga4MeasurementId),
    ...optionalString("plausible_domain", input.plausibleDomain),
  };
}

/**
 * Headline rule: prefer `oneLiner` verbatim when it fits; otherwise fall back
 * to `productName — oneLiner` and truncate to the max length. Blank oneLiner
 * returns "" so the validator surfaces `headline_empty`.
 */
export function deriveHeadline(productName: string, oneLiner: string): string {
  const trimmed = oneLiner.trim();
  if (!trimmed) return "";
  if (trimmed.length <= LANDING_PAGE_MAX_HEADLINE_LENGTH) return trimmed;
  const prefix = productName.trim();
  const combined = prefix ? `${prefix} — ${trimmed}` : trimmed;
  return clampWithEllipsis(combined, LANDING_PAGE_MAX_HEADLINE_LENGTH);
}

/**
 * Subheadline rule: lead with the persona so the reader instantly self-selects,
 * then hand back a promise-shaped restatement of the one-liner. Falls back to
 * the raw one-liner when persona / objections are absent so the surface still
 * renders something coherent. Blank oneLiner returns "" so the validator
 * surfaces `subheadline_empty`.
 */
export function deriveSubheadline(
  oneLiner: string,
  personaName: string,
  objections: string[],
): string {
  const trimmed = oneLiner.trim();
  if (!trimmed) return "";
  const persona = personaName.trim();
  const primaryObjection = objections[0];
  let composed: string;
  if (persona && primaryObjection) {
    composed = `Built for ${persona}. ${trimmed} — without ${lowercaseFirst(primaryObjection)}.`;
  } else if (persona) {
    composed = `Built for ${persona}. ${trimmed}.`;
  } else if (primaryObjection) {
    composed = `${trimmed} — without ${lowercaseFirst(primaryObjection)}.`;
  } else {
    composed = trimmed;
  }
  return clampWithEllipsis(composed, LANDING_PAGE_MAX_SUBHEADLINE_LENGTH);
}

/**
 * Bullet rule: positive-frame `benefits[]` first (they read better on a
 * landing page than negations), then invert any leftover `objections[]` into
 * "No more X" bullets. Cap at LANDING_PAGE_MAX_BULLETS, truncate each to
 * LANDING_PAGE_MAX_BULLET_LENGTH. Returns [] on empty input so the validator
 * surfaces `bullet_count_too_low`.
 */
export function deriveBullets(benefits: string[], objections: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const capped = clampWithEllipsis(trimmed, LANDING_PAGE_MAX_BULLET_LENGTH);
    const key = capped.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(capped);
  };
  for (const b of benefits) {
    if (out.length >= LANDING_PAGE_MAX_BULLETS) break;
    push(b);
  }
  for (const o of objections) {
    if (out.length >= LANDING_PAGE_MAX_BULLETS) break;
    push(objectionToBullet(o));
  }
  return out;
}

/**
 * Turn a persona objection ("The dataroom takes 3 weeks to set up") into a
 * positive-frame bullet ("No more 3-week dataroom setup"). Falls back to the
 * raw objection when the "No more " prefix would collide with an existing
 * negation to avoid double-negatives like "No more no signal".
 */
export function objectionToBullet(objection: string): string {
  const trimmed = objection.trim().replace(/[.!?]+$/, "");
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("no more ") || lower.startsWith("no ") || lower.startsWith("never ")) {
    return trimmed;
  }
  return `No more ${lowercaseFirst(trimmed)}`;
}

function pickCtaLabel(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  return trimmed || DEFAULT_CTA_LABEL;
}

function pickCtaHref(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  return trimmed || DEFAULT_CTA_HREF;
}

function optionalString(key: string, value: string | undefined): Record<string, string> {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return {};
  return { [key]: trimmed };
}

function normaliseList(raw: string[] | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => (typeof s === "string" ? s : "")).map((s) => s.trim()).filter(Boolean);
}

function lowercaseFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function clampWithEllipsis(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return `${s.slice(0, max - 1).trimEnd()}…`;
}
