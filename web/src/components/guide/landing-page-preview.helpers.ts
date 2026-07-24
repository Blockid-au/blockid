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
