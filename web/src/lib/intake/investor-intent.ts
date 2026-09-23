import { createHash } from "node:crypto";

export const INVESTOR_INTENT_VERSION = "investor-intent-v1" as const;

export const INVESTOR_OUTPUTS = [
  "investment_view",
  "valuation",
  "strengths",
  "weaknesses",
  "risks",
  "points_to_clarify",
  "competitors",
  "market",
] as const;

export type InvestorOutput = (typeof INVESTOR_OUTPUTS)[number];
export type IntentProvenance = "explicit" | "inferred" | "unknown";

export interface IntentSpan {
  start: number;
  end: number;
  text: string;
}

export interface IntentValue<T> {
  value: T | null;
  provenance: IntentProvenance;
  spans: IntentSpan[];
}

export interface InvestorIntentSnapshot {
  version: typeof INVESTOR_INTENT_VERSION;
  submittedAt: string;
  locale: "en" | "vi" | "unknown";
  perspective: IntentValue<"investor">;
  requestedOutputs: Array<{
    output: InvestorOutput;
    provenance: Exclude<IntentProvenance, "unknown">;
    spans: IntentSpan[];
  }>;
  userQuestions: IntentSpan[];
  stage: IntentValue<string>;
  geography: IntentValue<string[]>;
  digestSha256: string;
}

const OUTPUT_PATTERNS: Record<InvestorOutput, RegExp> = {
  investment_view: /\b(invest(?:or|ment)?|due diligence|go[\s/-]?no[\s/-]?go)\b|nhà đầu tư|đầu tư|thẩm định/i,
  valuation: /\b(valuation|value|worth|pre[\s-]?money|post[\s-]?money)\b|định giá|giá trị doanh nghiệp/i,
  strengths: /\b(strengths?|advantages?|bull case)\b|điểm mạnh|lợi thế/i,
  weaknesses: /\b(weakness(?:es)?|gaps?|bear case)\b|điểm yếu|hạn chế/i,
  risks: /\b(risks?|red flags?|downside)\b|rủi ro|cảnh báo/i,
  points_to_clarify: /\b(clarif(?:y|ication)|questions? to ask|unknowns?|points? to clarify)\b|làm rõ|câu hỏi cần hỏi|chưa rõ/i,
  competitors: /\b(competitors?|competition|alternatives?|compare)\b|đối thủ|cạnh tranh|so sánh/i,
  market: /\b(market|tam|sam|som|market size)\b|thị trường|quy mô thị trường/i,
};

const STAGES: Array<[string, RegExp]> = [
  ["pre_seed", /\bpre[\s-]?seed\b/i],
  ["seed", /\bseed\b/i],
  ["series_a", /\bseries\s*a\b/i],
  ["series_b", /\bseries\s*b\b/i],
  ["series_c_plus", /\bseries\s*[cdef]\b/i],
  ["growth", /\bgrowth[\s-]?stage\b|\bgrowth business\b/i],
  ["established", /\bestablished business\b|\bdoanh nghiệp (?:đã hoạt động|trưởng thành)\b/i],
  ["idea", /\bidea[\s-]?stage\b|\bpre[\s-]?revenue\b|\bgiai đoạn ý tưởng\b/i],
];

const GEOGRAPHIES: Array<[string, RegExp]> = [
  ["Australia", /\b(?:australia|australian|au market|úc|thị trường úc)\b/i],
  ["New Zealand", /\b(?:new zealand|nz market)\b/i],
  ["United States", /\b(?:united states|u\.s\.|us market)\b/i],
  ["United Kingdom", /\b(?:united kingdom|u\.k\.|uk market)\b/i],
  ["Southeast Asia", /\b(?:southeast asia|south-east asia|sea market|đông nam á)\b/i],
  ["Global", /\b(?:global|worldwide|toàn cầu)\b/i],
];

const REQUEST_LEAD = /^(?:please\s+)?(?:analyse|analyze|assess|evaluate|review|compare|explain|identify|check|research|phân tích|đánh giá|so sánh|kiểm tra|nghiên cứu|làm rõ)\b/i;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function spansFor(text: string, pattern: RegExp): IntentSpan[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const spans: IntentSpan[] = [];
  for (const match of text.matchAll(matcher)) {
    const start = match.index ?? 0;
    const value = match[0];
    spans.push({ start, end: start + value.length, text: value });
  }
  return spans;
}

function questionSpans(text: string): IntentSpan[] {
  const spans: IntentSpan[] = [];
  const matcher = /[^\n.!?]+[?]|[^\n.!?]+(?:[.!]|$)/g;
  for (const match of text.matchAll(matcher)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (!value) continue;
    if (!value.endsWith("?") && !REQUEST_LEAD.test(value)) continue;
    const start = (match.index ?? 0) + leading;
    spans.push({ start, end: start + value.length, text: value });
  }
  return spans;
}

function intentValue<T>(value: T | null, provenance: IntentProvenance, spans: IntentSpan[]): IntentValue<T> {
  return { value, provenance, spans };
}

/**
 * Captures only the user's own request. Fetched pages and uploaded documents
 * must never be passed here: they are untrusted business evidence, not user
 * authority or instructions.
 */
export function captureInvestorIntent(input: {
  userText: string;
  submittedAt: string;
  locale?: "en" | "vi" | "unknown";
}): InvestorIntentSnapshot {
  const userText = input.userText.replace(/\r\n?/g, "\n");
  const explicit = INVESTOR_OUTPUTS.flatMap((output) => {
    const spans = spansFor(userText, OUTPUT_PATTERNS[output]);
    return spans.length ? [{ output, provenance: "explicit" as const, spans }] : [];
  });
  const requestedOutputs = explicit.length
    ? explicit
    : [{ output: "investment_view" as const, provenance: "inferred" as const, spans: [] }];

  const perspectiveSpans = spansFor(userText, OUTPUT_PATTERNS.investment_view);
  const stageMatch = STAGES.map(([value, pattern]) => ({ value, spans: spansFor(userText, pattern) })).find((x) => x.spans.length > 0);
  const geographyMatches = GEOGRAPHIES.map(([value, pattern]) => ({ value, spans: spansFor(userText, pattern) })).filter((x) => x.spans.length > 0);
  const geographySpans = geographyMatches.flatMap((x) => x.spans);

  const withoutDigest = {
    version: INVESTOR_INTENT_VERSION,
    submittedAt: input.submittedAt,
    locale: input.locale ?? "unknown",
    perspective: intentValue<"investor">("investor", perspectiveSpans.length ? "explicit" : "inferred", perspectiveSpans),
    requestedOutputs,
    userQuestions: questionSpans(userText),
    stage: stageMatch ? intentValue(stageMatch.value, "explicit", stageMatch.spans) : intentValue<string>(null, "unknown", []),
    geography: geographyMatches.length
      ? intentValue(geographyMatches.map((x) => x.value), "explicit", geographySpans)
      : intentValue<string[]>(null, "unknown", []),
  };
  return { ...withoutDigest, digestSha256: sha256(JSON.stringify(withoutDigest)) };
}
