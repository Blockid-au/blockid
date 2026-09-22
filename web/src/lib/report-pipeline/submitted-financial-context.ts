import { createHash } from "node:crypto";

/** Input-source record, not a qualified revenue observation. No amount is
 * parsed, annualised, converted or admitted to a valuation calculation. */
export interface SubmittedFinancialContext {
  sourceId: string;
  scope: { ownerUserId: string; projectId: string | null; businessName: string };
  verification: "reported_not_independently_verified";
  valuationEligible: false;
  observations: Array<{
    quote: string;
    start: number;
    end: number;
    metric: "mrr" | "arr" | "revenue" | "gmv";
    currencyMarkers: string[];
    periodMarker: string | null;
    businessNamedOnLine: boolean;
    projected: boolean;
    unit: "as_reported_no_conversion";
  }>;
  missingInputs: string[];
  explanation: string;
}

export function submittedFinancialContext(input: {
  text: string;
  ownerUserId: string;
  projectId: string | null;
  businessName: string;
  locale?: "en" | "vi";
}): SubmittedFinancialContext {
  const sourceId = `submitted-input:sha256:${createHash("sha256").update(input.text).digest("hex")}`;
  const name = input.businessName.trim();
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Only explicitly labelled financial lines, optionally prefixed by this
  // business's exact name. Never search URL digits, arbitrary nearby money or
  // competitor paragraphs and attribute the number to this business.
  const prefix = name ? `(?:${escapedName}\\s*[:|—-]\\s*)?` : "";
  const labelled = new RegExp(`^\\s*(?:[-*•]\\s*)?${prefix}(monthly recurring revenue|annual recurring revenue|MRR|ARR|revenue|GMV)\\b`, "i");
  const observations: SubmittedFinancialContext["observations"] = [];
  const lines = input.text.matchAll(/[^\r\n]+/g);
  for (const match of lines) {
    const quote = match[0];
    if (quote.length > 600 || observations.length >= 3) continue;
    const field = labelled.exec(quote);
    if (!field || /https?:\/\//i.test(quote) || !/[0-9]/.test(quote)) continue;
    const token = field[1].toLowerCase();
    const metric = token === "mrr" || token === "monthly recurring revenue" ? "mrr" : token === "arr" || token === "annual recurring revenue" ? "arr" : token === "gmv" ? "gmv" : "revenue";
    const currencyMarkers = [...new Set((quote.match(/\b(?:AUD|USD|NZD|EUR|GBP|SGD|JPY)\b|(?:A|US|NZ)\$/g) ?? []))];
    const periodMarker = quote.match(/\b(?:as of|period ended|month ended|year ended|for)\s+\d{4}-\d{2}(?:-\d{2})?\b|\bFY\s?\d{4}\b/i)?.[0] ?? null;
    observations.push({ quote, start: match.index!, end: match.index! + quote.length,
      metric, currencyMarkers, periodMarker,
      businessNamedOnLine: Boolean(name && new RegExp(`^\\s*(?:[-*•]\\s*)?${escapedName}\\s*[:|—-]`, "i").test(quote)),
      projected: /\b(?:forecast|projected|projection|target|expected|estimate|planned)\b/i.test(quote), unit: "as_reported_no_conversion" });
  }
  const missingInputs = ["independent_financial_validation", "source_completeness_and_recurring_basis"];
  if (!observations.length) missingInputs.push("dated_business_revenue_records");
  if (observations.some(o => !o.businessNamedOnLine) || !input.projectId) missingInputs.push("financial_source_business_binding");
  if (observations.some(o => new Set(o.currencyMarkers.map(marker => (marker === "A$" ? "AUD" : marker === "US$" ? "USD" : marker === "NZ$" ? "NZD" : marker))).size !== 1)) missingInputs.push("explicit_currency_and_unit");
  if (observations.some(o => !o.periodMarker || o.projected)) missingInputs.push("actual_reporting_period");
  const vi = input.locale === "vi";
  let explanation = observations.length
    ? (vi
      ? `Chưa thể định giá đáng tin cậy. Thông tin được cung cấp có ${observations.length} dòng tài chính được ghi nhận, chưa được kiểm chứng độc lập. Cần đối chiếu hồ sơ gốc của đúng doanh nghiệp, loại doanh thu, tiền tệ và kỳ báo cáo. Số liệu dự báo, GMV và doanh thu một lần không tự trở thành doanh thu định kỳ.`
      : `A reliable valuation is unavailable. This input check retained ${observations.length} explicitly labelled financial line${observations.length === 1 ? "" : "s"}, not independently verified. Reconcile the original records to this business, revenue basis, currency and reporting period. Forecasts, GMV and one-off sales do not automatically establish recurring revenue.`)
    : (vi ? "Chưa thể định giá đáng tin cậy. Chưa xác định được dòng doanh thu có nhãn rõ trong thông tin được cung cấp. Cần hồ sơ doanh thu có ngày, tên doanh nghiệp, tiền tệ, kỳ báo cáo và cơ sở doanh thu định kỳ; không coi thiếu dữ liệu là doanh thu bằng không."
      : "A reliable valuation is unavailable. No explicitly labelled revenue statement was identified in the submitted input. Provide dated revenue records identifying the business, currency, reporting period and recurring-revenue basis; missing information is not zero revenue.");
  if (observations.length) {
    explanation += vi ? "\n\nTrích nguyên văn thông tin được cung cấp (chưa kiểm chứng):\n" : "\n\nExact quotations from the submitted input (unverified):\n";
    explanation += observations.map(o => `“${o.quote}”`).join("\n");
    const gaps: string[] = [];
    if (missingInputs.includes("financial_source_business_binding")) gaps.push(vi ? "Liên kết từng hồ sơ với đúng pháp nhân/doanh nghiệp." : "Bind each record to the correct business/legal entity.");
    if (missingInputs.includes("explicit_currency_and_unit")) gaps.push(vi ? "Làm rõ tiền tệ và đơn vị; ký hiệu $ đơn lẻ chưa đủ." : "Clarify currency and units; a bare $ is insufficient.");
    if (missingInputs.includes("actual_reporting_period")) gaps.push(vi ? "Cung cấp kỳ đo thực tế, tách riêng dự báo và mục tiêu." : "Provide the actual measurement period, separating forecasts and targets.");
    explanation += "\n\n" + gaps.join(" ");
  }
  return { sourceId, scope: { ownerUserId: input.ownerUserId, projectId: input.projectId, businessName: input.businessName }, verification: "reported_not_independently_verified", valuationEligible: false, observations, missingInputs, explanation };
}
