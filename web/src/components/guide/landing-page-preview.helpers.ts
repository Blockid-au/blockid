// P4a-preview-ui — pure form + copy helpers for the landing-page draft
// preview panel mounted on Chapter 4 (MVP / Product Discovery). The panel
// calls the existing public POST /api/landing-page/preview route (P4a-publish-route)
// with a founder-supplied {headline, subheadline, bullets, cta_label, cta_href,
// ga4_measurement_id?, plausible_domain?, brand_name?} JSON body.
//
// Kept in a separate module so the form-state builder, bullet parser, request
// builder, and invalid-reason copy pack can be unit-tested without spinning up
// jsdom or fetch mocks.

import type {
  LandingPageInput,
  LandingPageInvalidReason,
} from "@/lib/landing-page/preview";
import {
  buildCmoLandingDraft,
  type CmoLandingDraftInput,
} from "@/lib/landing-page/cmo-draft";

export interface LandingPagePreviewFormState {
  headline: string;
  subheadline: string;
  /** One bullet per line so a founder can paste from a doc without CSV mangling. */
  bulletsText: string;
  cta_label: string;
  cta_href: string;
  ga4_measurement_id: string;
  plausible_domain: string;
  brand_name: string;
}

export function makeEmptyLandingPagePreviewFormState(): LandingPagePreviewFormState {
  return {
    headline: "",
    subheadline: "",
    bulletsText: "",
    cta_label: "",
    cta_href: "",
    ga4_measurement_id: "",
    plausible_domain: "",
    brand_name: "",
  };
}

/** Split a newline / semicolon separated block of bullets into a trimmed
 * non-empty array. Comma separation is deliberately NOT supported — real
 * benefit-bullet copy often contains commas ("Cut onboarding from 3 weeks
 * to 3 days, without extra sales headcount"). */
export function parseBullets(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n;]+/g)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

/** Convert form state into the LandingPageInput body the POST route expects.
 * Blank optional fields are omitted (not sent as empty strings) so the route
 * validator's `!== undefined && !== ""` guard treats them as "not supplied"
 * rather than "supplied but invalid". */
export function toLandingPageInput(
  state: LandingPagePreviewFormState,
): LandingPageInput {
  const body: LandingPageInput = {
    headline: state.headline.trim(),
    subheadline: state.subheadline.trim(),
    bullets: parseBullets(state.bulletsText),
    cta_label: state.cta_label.trim(),
    cta_href: state.cta_href.trim(),
  };
  const ga4 = state.ga4_measurement_id.trim();
  if (ga4) body.ga4_measurement_id = ga4;
  const plausible = state.plausible_domain.trim();
  if (plausible) body.plausible_domain = plausible;
  const brand = state.brand_name.trim();
  if (brand) body.brand_name = brand;
  return body;
}

/** True when the form has enough content for the submit button to fire.
 * The route surfaces validation reasons for a partial input too, but there
 * is no point sending an entirely-blank body just to get back "everything is
 * empty" — the panel's inline empty-state copy already says that. */
export function canSubmitPreview(state: LandingPagePreviewFormState): boolean {
  return state.headline.trim().length > 0 || state.subheadline.trim().length > 0;
}

/** Response shape from POST /api/landing-page/preview 200. Mirrors route.ts. */
export interface LandingPagePreviewSuccess {
  markdown: string;
  html: string;
  validation: {
    valid: boolean;
    reasons: LandingPageInvalidReason[];
  };
}

export interface LandingPagePreviewError {
  error: string;
  message: string;
}

const REASON_COPY_EN: Record<LandingPageInvalidReason, string> = {
  headline_empty: "Headline is required.",
  headline_too_long: "Headline is over 120 characters — tighten to a single promise.",
  subheadline_empty: "Sub-headline is required.",
  subheadline_too_long: "Sub-headline is over 240 characters — cut supporting detail.",
  bullet_missing: "One of your bullets is blank — remove or fill it.",
  bullet_too_long: "One bullet is over 160 characters — split it.",
  bullet_count_too_low: "Add at least one benefit bullet.",
  bullet_count_too_high: "Six bullets max — pick the strongest.",
  cta_label_empty: "CTA label is required.",
  cta_href_empty: "CTA link is required.",
  cta_href_invalid:
    "CTA link is unsafe — use https://, /, #, mailto:, or tel: (not javascript:).",
  ga4_measurement_id_invalid: "GA4 ID must look like G-XXXXXXX.",
  plausible_domain_invalid: "Plausible domain must be a bare hostname (no https://).",
};

const REASON_COPY_VI: Record<LandingPageInvalidReason, string> = {
  headline_empty: "Bắt buộc có tiêu đề chính.",
  headline_too_long: "Tiêu đề quá 120 ký tự — rút gọn thành một lời hứa.",
  subheadline_empty: "Bắt buộc có tiêu đề phụ.",
  subheadline_too_long: "Tiêu đề phụ quá 240 ký tự — cắt chi tiết bổ sung.",
  bullet_missing: "Có gạch đầu dòng trống — xoá hoặc bổ sung.",
  bullet_too_long: "Một gạch đầu dòng quá 160 ký tự — tách ra.",
  bullet_count_too_low: "Thêm ít nhất một lợi ích.",
  bullet_count_too_high: "Tối đa 6 gạch đầu dòng — chọn cái mạnh nhất.",
  cta_label_empty: "Bắt buộc có nhãn CTA.",
  cta_href_empty: "Bắt buộc có link CTA.",
  cta_href_invalid:
    "Link CTA không an toàn — dùng https://, /, #, mailto:, hoặc tel: (không dùng javascript:).",
  ga4_measurement_id_invalid: "GA4 ID phải có dạng G-XXXXXXX.",
  plausible_domain_invalid: "Plausible domain phải là tên miền thuần (không có https://).",
};

export function reasonCopy(
  reason: LandingPageInvalidReason,
  locale: "en" | "vi",
): string {
  const table = locale === "vi" ? REASON_COPY_VI : REASON_COPY_EN;
  return table[reason];
}

// -- P4a-cmo-draft-wire -----------------------------------------------------
// UI-side glue for the pure `buildCmoLandingDraft(...)` builder from
// `web/src/lib/landing-page/cmo-draft.ts` (P4a-cmo-draft). Lets a founder feed
// the panel a Chapter 3 seed (product name + one-liner + persona + objections +
// benefits) and pre-fills the main form via `applyCmoDraft(...)` — non-
// destructive: only empty form fields get overwritten so a founder who already
// started typing does not lose their work.

export interface CmoDraftFormState {
  productName: string;
  oneLiner: string;
  personaName: string;
  /** One objection per line — same split rule as `parseBullets`. */
  personaObjectionsText: string;
  /** One benefit per line — same split rule as `parseBullets`. */
  benefitsText: string;
}

export function makeEmptyCmoDraftFormState(): CmoDraftFormState {
  return {
    productName: "",
    oneLiner: "",
    personaName: "",
    personaObjectionsText: "",
    benefitsText: "",
  };
}

/** Split a newline / semicolon separated block into a trimmed non-empty array.
 * Reuses `parseBullets` so objections + benefits round-trip identically to the
 * main bullets textarea (commas inside a single line are preserved). */
export function parseCmoDraftLines(raw: string): string[] {
  return parseBullets(raw);
}

/** Convert the CMO-draft form state into the `CmoLandingDraftInput` shape the
 * pure builder consumes. Blank optional fields collapse to omitted keys so
 * `buildCmoLandingDraft` sees them as unsupplied (same convention as
 * `toLandingPageInput` above). */
export function toCmoDraftInput(state: CmoDraftFormState): CmoLandingDraftInput {
  const input: CmoLandingDraftInput = {};
  const productName = state.productName.trim();
  if (productName) input.productName = productName;
  const oneLiner = state.oneLiner.trim();
  if (oneLiner) input.oneLiner = oneLiner;
  const personaName = state.personaName.trim();
  if (personaName) input.personaName = personaName;
  const objections = parseCmoDraftLines(state.personaObjectionsText);
  if (objections.length > 0) input.personaObjections = objections;
  const benefits = parseCmoDraftLines(state.benefitsText);
  if (benefits.length > 0) input.benefits = benefits;
  return input;
}

/** True when the founder has typed enough into the CMO-draft form to produce
 * a usable starter draft — needs at least a one-liner OR a benefit / objection
 * line, otherwise `buildCmoLandingDraft` would return an all-blank draft. */
export function canApplyCmoDraft(state: CmoDraftFormState): boolean {
  if (state.oneLiner.trim().length > 0) return true;
  if (state.productName.trim().length > 0) return true;
  if (parseCmoDraftLines(state.benefitsText).length > 0) return true;
  if (parseCmoDraftLines(state.personaObjectionsText).length > 0) return true;
  return false;
}

/** Non-destructive merge: run `buildCmoLandingDraft(...)` and overwrite only
 * the empty fields on the existing preview form state. Keeps whatever the
 * founder has already typed so hitting "Auto-draft" never stomps their work.
 * Bullets are joined with newlines so the textarea keeps its line-per-bullet
 * shape. */
export function applyCmoDraft(
  existing: LandingPagePreviewFormState,
  draftState: CmoDraftFormState,
): LandingPagePreviewFormState {
  const draft = buildCmoLandingDraft(toCmoDraftInput(draftState));
  const bulletsText = (draft.bullets ?? []).join("\n");
  const fill = (current: string, next: string | undefined): string => {
    if (current.trim().length > 0) return current;
    return typeof next === "string" ? next : "";
  };
  return {
    headline: fill(existing.headline, draft.headline),
    subheadline: fill(existing.subheadline, draft.subheadline),
    bulletsText: fill(existing.bulletsText, bulletsText),
    cta_label: fill(existing.cta_label, draft.cta_label),
    cta_href: fill(existing.cta_href, draft.cta_href),
    ga4_measurement_id: fill(existing.ga4_measurement_id, draft.ga4_measurement_id),
    plausible_domain: fill(existing.plausible_domain, draft.plausible_domain),
    brand_name: fill(existing.brand_name, draft.brand_name),
  };
}
