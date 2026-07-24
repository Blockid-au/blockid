// Div 83A start-up concession — 8-point qualifying-tests fixture (shared).
//
// The eight-point checklist below is the source-of-truth copy for the ATO
// Employee Share Scheme (ESS) start-up concession under ITAA 1997
// Subdivision 83A-B / 83A-C. It was previously duplicated inside the
// Chapter 8 body (`web/src/lib/guide/startup-journey.ts:662-682`) and
// echoed in ad-hoc form by the Div 83A checker
// (`web/src/lib/div83a-checker.ts`).
//
// Exposing it as a shared module lets:
//   - the funding gate (`div83a-funding-gate.ts`) surface the same wording
//     the founder read in Chapter 8;
//   - the Chapter 8 body import the fixture instead of re-declaring it, so
//     copy drift becomes a type error not a silent divergence;
//   - the ESS scheme-rules doc (auto-generated) render the identical list
//     for the "why we structured the pool this way" appendix.
//
// General information only. Not legal or tax advice. Every consumer must
// re-render the DIV83A_QUALIFYING_TESTS_DISCLAIMER alongside the list.

export interface Div83AQualifyingTest {
  /** Stable key — safe for URL fragments + analytics event params. */
  key: string;
  /** Primary ITAA 1997 section anchoring the test. */
  section: string;
  /** English plain-language description. */
  en: string;
  /** Vietnamese mirror — matches Chapter 8 EN/VI parity. */
  vi: string;
}

/** ITAA 1997 Subdivision 83A-B / 83A-C — start-up concession, 8 tests. */
export const DIV83A_QUALIFYING_TESTS: readonly Div83AQualifyingTest[] = [
  {
    key: "esic_eligible",
    section: "ITAA 1997 s83A-33(1) (start-up gateway)",
    en: "Company is an ESIC-eligible start-up (s83A-33 tests met) — confirm via ATO ESIC self-assessment or private ruling.",
    vi: "Công ty là start-up đủ điều kiện ESIC (các test s83A-33 đạt) — xác nhận qua ATO ESIC tự đánh giá hoặc private ruling.",
  },
  {
    key: "unlisted",
    section: "ITAA 1997 s83A-33(1)(b)",
    en: "Company (and any holding entity) is unlisted at the grant date — no class of shares quoted on an approved stock exchange (s83A-33(1)(b)).",
    vi: "Công ty (và bất kỳ đơn vị mẹ nào) chưa niêm yết tại ngày grant — không có loại cổ phần nào niêm yết trên sàn giao dịch được công nhận (s83A-33(1)(b)).",
  },
  {
    key: "turnover_cap",
    section: "ITAA 1997 s83A-33(1)(a)",
    en: "Aggregated turnover of the company group for the financial year of the grant is A$50 million or less (s83A-33(1)(a)).",
    vi: "Doanh thu hợp nhất của cả nhóm công ty cho năm tài chính có ngày grant ≤ A$50 triệu (s83A-33(1)(a)).",
  },
  {
    key: "age_lt_10y",
    section: "ITAA 1997 s83A-33(1)(c)",
    en: "Company was incorporated less than 10 years before the grant date (s83A-33(1)(c)).",
    vi: "Công ty được thành lập chưa đến 10 năm trước ngày grant (s83A-33(1)(c)).",
  },
  {
    key: "grantee_is_employee",
    section: "ITAA 1997 s83A-105(1)(a)",
    en: "Grantee is an employee (PAYG, not a contractor invoicing via ABN) of the issuing entity at the grant date (s83A-105(1)(a)).",
    vi: "Người nhận grant là nhân viên (PAYG, không phải nhà thầu xuất hoá đơn qua ABN) của đơn vị phát hành tại ngày grant (s83A-105(1)(a)).",
  },
  {
    key: "market_value",
    section: "ITAA 1997 s83A-33(4)",
    en: "Options are issued with a strike price at or above market value at grant, established under a s960-410 safe-harbour method or independent valuation (s83A-33(4)).",
    vi: "Option phát hành với giá thực hiện bằng hoặc cao hơn giá thị trường tại ngày grant, xác định bằng phương pháp safe-harbour s960-410 hoặc định giá độc lập (s83A-33(4)).",
  },
  {
    key: "ownership_cap",
    section: "ITAA 1997 s83A-45(4)",
    en: "Grantee's post-grant beneficial ownership and voting power in the company is 10% or less (s83A-45(4)).",
    vi: "Tỷ lệ sở hữu hưởng lợi và quyền biểu quyết sau grant của người nhận trong công ty ≤ 10% (s83A-45(4)).",
  },
  {
    key: "holding_or_forfeiture",
    section: "ITAA 1997 s83A-45(5) / s83A-105(6)",
    en: "Grant satisfies the ≥ 3-year holding period OR carries a real risk of forfeiture (e.g. a 12-month or longer cliff) (s83A-45(5) / s83A-105(6)).",
    vi: "Grant thoả điều kiện giữ ≥ 3 năm HOẶC có rủi ro mất quyền thực sự (ví dụ cliff từ 12 tháng trở lên) (s83A-45(5) / s83A-105(6)).",
  },
] as const;

/**
 * Compact locale-aware accessor — returns just the plain-language strings
 * for the requested locale, preserving list order. Chapter 8 uses this to
 * feed its existing `qualifyingTests: {en, vi}` shape without leaking the
 * key/section metadata into the body copy.
 */
export function div83aQualifyingTestsFor(locale: "en" | "vi"): readonly string[] {
  return DIV83A_QUALIFYING_TESTS.map((t) => (locale === "vi" ? t.vi : t.en));
}

export const DIV83A_QUALIFYING_TESTS_DISCLAIMER =
  "General information only. Not legal or tax advice. Confirm eligibility with a registered tax agent before relying on the Div 83A start-up concession in an investor pack or ESS scheme-rules doc.";
