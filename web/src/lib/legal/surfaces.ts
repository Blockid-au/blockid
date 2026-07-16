// Legal disclaimer surface registry.
//
// A "surface" is a place in the product where a disclaimer must render —
// SVI report footer, valuation output, equity-offer page, tokenised-share
// view, and a generic all-pages footer. Each surface maps to a canonical
// disclaimer `kind` (see DISCLAIMER_VERSIONS) plus the jurisdictions it
// applies to and the raw EN body_md text.
//
// EN copies are drafted from the CLO spec dated 2026-07-16. VI copies are
// placeholders — mark [TODO-VI] until translation-memory pass is done. Do
// NOT ship VI without counsel-reviewed translation; the disclaimer_hash
// must match the shown text byte-for-byte.
//
// Adding a surface: append to DISCLAIMER_SURFACES, mint a new version in
// versions.ts, then insert a matching row into disclaimer_registry via a
// new migration. Never mutate an existing entry's body_md in place.

import { DISCLAIMER_VERSIONS, type DisclaimerKind } from "./versions";

export type DisclaimerSurface = {
  kind: DisclaimerKind;
  jurisdictions: string[]; // ISO 3166-1 alpha-2; ['*'] for all
  label: string;
  body_md: string;
  body_md_vi?: string; // Vietnamese translation; falls back to en if missing
};

export const DISCLAIMER_SURFACES: Record<string, DisclaimerSurface> = {
  svi_report: {
    kind: "not_financial_advice",
    jurisdictions: ["*"],
    label: "SVI Report Footer",
    body_md: `**Not financial advice.** The Startup Value Index (SVI) is an information service produced by BlockID.au (Auschain PTY LTD, ACN 659 615 111, ABN 79 659 615 111). The SVI score is a heuristic composite of publicly available and user-supplied signals and is **not** a securities valuation, credit rating, or investment recommendation. Nothing in this report constitutes financial product advice under the Corporations Act 2001 (Cth). You should obtain independent professional advice from a licensed AFSL holder before making any investment decision. All figures shown in AUD unless otherwise noted; prices include GST where applicable.`,
    body_md_vi: `[TODO-VI] **Không phải tư vấn tài chính.** Chỉ số Giá trị Startup (SVI) do BlockID.au cung cấp là công cụ thông tin, không phải định giá chứng khoán hay khuyến nghị đầu tư.`,
  },

  valuation_output: {
    kind: "general_advice_warning",
    jurisdictions: ["AU"],
    label: "Valuation Output — General Advice Warning",
    body_md: `**General Advice Warning (Corporations Act s949A).** The valuation output shown here has been prepared without taking into account your objectives, financial situation, or needs. Before acting on it you should consider whether it is appropriate for you, having regard to those factors, and seek independent financial advice from an Australian Financial Services Licence (AFSL) holder. BlockID.au does not hold an AFSL and does not provide personal financial product advice. The valuation model uses public comparables, user-declared inputs, and probabilistic assumptions — actual market outcomes may differ materially.`,
    body_md_vi: `[TODO-VI] **Cảnh báo tư vấn chung.** Kết quả định giá này không xét đến hoàn cảnh cá nhân của bạn — hãy tham vấn chuyên gia tài chính có giấy phép trước khi hành động.`,
  },

  equity_offer_page: {
    kind: "equity_offer_disclaimer",
    jurisdictions: ["AU"],
    label: "Equity Offer / Equity-for-Solution Page",
    body_md: `**Not an offer to issue securities.** This page describes a *request-a-call* intake for a possible equity-for-solution engagement. No securities are being offered, issued, or transferred through this interface. Any subsequent issuance would only occur (a) after execution of a written agreement between the startup and the recipient, (b) under an available exemption in the Corporations Act 2001 (Cth) such as s708 (small-scale personal offers) or s708(8)/(11) (sophisticated / professional investor), and (c) after BlockID.au's internal legal review has been passed. BlockID.au does not act as an intermediary, dealer, or advisor for securities transactions and does not hold an Australian Financial Services Licence. Prospective participants must independently satisfy any wholesale-investor requirements and obtain their own legal, tax, and financial advice.`,
    body_md_vi: `[TODO-VI] **Không phải đề nghị phát hành chứng khoán.** Trang này chỉ để đăng ký gọi lại — không có chứng khoán nào được chào bán tại đây.`,
  },

  tokenised_share_view: {
    kind: "equity_offer_disclaimer",
    jurisdictions: ["AU"],
    label: "Tokenised Share Display",
    body_md: `**Display-only, not tradable.** The tokenised representation of shares shown here is a **read-only visualisation** of the underlying share register maintained off-chain. It is **not** a security token, financial product, or transferable instrument, and no secondary-market trading, transfer, or redemption is available through this interface. On-chain synchronisation, where enabled, is a mirror for auditability only and does not confer legal title. Legal title to shares remains governed by the company's share register and constitution. Any future issuance, transfer, or redemption of tokenised shares would require a separate compliance review, counsel sign-off, and — where applicable — an AFSL or reliance on a specific Corporations Act exemption.`,
    body_md_vi: `[TODO-VI] **Chỉ hiển thị — không giao dịch được.** Cổ phần được token hóa chỉ là bản mô phỏng để kiểm toán; quyền sở hữu pháp lý vẫn do sổ đăng ký cổ đông của công ty quyết định.`,
  },

  general_all: {
    kind: "not_financial_advice",
    jurisdictions: ["*"],
    label: "General Site Footer",
    body_md: `BlockID.au is operated by Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111), Sydney NSW. Content on this site is for general information only and does not constitute financial, legal, or tax advice. BlockID.au does not hold an Australian Financial Services Licence (AFSL) and does not provide personal financial product advice. Seek professional advice before acting on any information. See our Terms (${DISCLAIMER_VERSIONS.tos}) and Privacy Policy (${DISCLAIMER_VERSIONS.privacy}).`,
    body_md_vi: `[TODO-VI] BlockID.au do Auschain PTY LTD vận hành. Nội dung chỉ mang tính thông tin chung, không phải tư vấn tài chính, pháp lý hay thuế.`,
  },
};

export type SurfaceId = keyof typeof DISCLAIMER_SURFACES;

export function getSurface(id: string): DisclaimerSurface | null {
  return (DISCLAIMER_SURFACES as Record<string, DisclaimerSurface | undefined>)[id] ?? null;
}

export function getSurfaceIds(): string[] {
  return Object.keys(DISCLAIMER_SURFACES);
}

/**
 * Returns true if the surface applies in the given jurisdiction (ISO 3166-1 alpha-2).
 * A surface with `['*']` applies everywhere.
 */
export function surfaceAppliesTo(surface: DisclaimerSurface, jurisdiction: string): boolean {
  if (surface.jurisdictions.includes("*")) return true;
  return surface.jurisdictions.includes(jurisdiction.toUpperCase());
}
