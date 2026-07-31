/**
 * report-delivery.ts — pure delivery policy for the Trust Business Report.
 *
 * Master Upgrade Plan §8.4 / §8.7. The paywall could take money
 * (`/api/reports/checkout`, `/api/reports/redeem`) and the worker could
 * generate the artifact (`report-order-worker` → `report-generator`), but
 * nothing mapped a *paid order* back to a *fetchable report*. This module
 * holds the parts of that mapping that are pure functions, so the route
 * handler (`/api/reports/[orderId]`) stays a thin shell around auth +
 * database I/O and the policy itself is unit-testable without Next.
 *
 * Three responsibilities:
 *
 *   1. `dispositionForStatus()` — the single source of truth for
 *      "order status → HTTP status". Exhaustive over the 9-state enum in
 *      report-order-state.ts (plus NOT_PURCHASED, which the DB CHECK
 *      forbids but the enum carries), so adding a state is a compile
 *      error here rather than a silent 500 in production.
 *
 *   2. `toOrderView()` — whitelists the order columns a buyer may see.
 *      report_orders carries Stripe session/payment-intent ids, the
 *      reseller attribution trail, and the internal credit quote in
 *      `metadata`. None of that belongs in a customer response, so the
 *      view is built by *listing what goes in*, never by deleting keys
 *      from the row (a spread would leak every column a future
 *      migration adds).
 *
 *   3. `toReportView()` / `reconstructAssembledReport()` — the same
 *      whitelist discipline for `assembled_reports`, plus the row →
 *      `AssembledReport` reconstruction the DOCX and PDF renderers
 *      already expect. `reconstructAssembledReport` was lifted verbatim
 *      out of /api/svi/docx so both surfaces share one implementation.
 *
 * Non-enumeration note: this module never distinguishes "no such order"
 * from "someone else's order". That decision lives in the route (a single
 * `.eq(id).eq(user_id)` query), and the reason is stated there.
 */

import type {
  AssembledReport,
  ReportSection,
  VisualSpec,
} from "@/lib/report-pipeline/types";
import type { ReportOrderState } from "./report-order-state";

type Row = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Disposition — status → HTTP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long a polling client should wait before asking again. The drain
 * cron runs on a minute cadence and a standard-tier report takes ~4 min
 * (the number the paywall modal quotes), so 15s keeps the progress UI
 * feeling alive without hammering the route.
 */
export const REPORT_POLL_RETRY_SECONDS = 15;

export type DeliveryKind =
  /** Report exists and the caller has paid for it — serve the artifact. */
  | "deliver"
  /** Paid, generation in flight — the client should poll. */
  | "pending"
  /** Checkout started but money never landed. */
  | "unpaid"
  /** Terminal, nothing will ever be delivered under this order. */
  | "gone";

export interface DeliveryDisposition {
  kind: DeliveryKind;
  httpStatus: 200 | 202 | 402 | 410;
  /** Stable machine-readable code the client can branch on. */
  reason: string;
  /** Sentence shown to the buyer. Plain English, no jargon, no ids. */
  message: string;
  /** Only set for `pending` — seconds until the client should re-poll. */
  retryInSeconds?: number;
  /** Only set for `gone` — whether the buyer's money has been returned. */
  refunded?: boolean;
  /** Only set for `gone` — whether a fresh order would succeed. */
  regenerable?: boolean;
}

/**
 * Map an order status onto the response the buyer gets.
 *
 * The `satisfies` on the table makes the mapping exhaustive: delete a
 * state from the record and TypeScript fails the build rather than
 * letting the route fall through to a default branch.
 */
const DISPOSITIONS = {
  READY: {
    kind: "deliver",
    httpStatus: 200,
    reason: "ready",
    message: "Your Trust Business Report is ready.",
  },
  SHARED: {
    kind: "deliver",
    httpStatus: 200,
    reason: "ready",
    message: "Your Trust Business Report is ready.",
  },
  PAID: {
    kind: "pending",
    httpStatus: 202,
    reason: "queued",
    message:
      "Payment received. Your report is queued for generation — this usually takes about four minutes.",
    retryInSeconds: REPORT_POLL_RETRY_SECONDS,
  },
  GENERATING: {
    kind: "pending",
    httpStatus: 202,
    reason: "generating",
    message:
      "Your report is being written by the C-Level agent team right now. This usually takes about four minutes.",
    retryInSeconds: REPORT_POLL_RETRY_SECONDS,
  },
  CHECKOUT_INITIATED: {
    kind: "unpaid",
    httpStatus: 402,
    reason: "payment_required",
    message:
      "This order has not been paid yet. Complete checkout to generate the report.",
  },
  PAYMENT_PENDING: {
    kind: "unpaid",
    httpStatus: 402,
    reason: "payment_pending",
    message:
      "Your payment has not settled yet. Some payment methods take a few minutes — this page will unlock as soon as the bank confirms.",
  },
  NOT_PURCHASED: {
    kind: "unpaid",
    httpStatus: 402,
    reason: "payment_required",
    message:
      "This order has not been paid yet. Complete checkout to generate the report.",
  },
  FAILED: {
    kind: "gone",
    httpStatus: 410,
    reason: "generation_failed",
    message:
      "We could not finish this report. You have not been left out of pocket — a refund is issued automatically for failed generations.",
    refunded: false,
    regenerable: true,
  },
  REFUNDED: {
    kind: "gone",
    httpStatus: 410,
    reason: "refunded",
    message:
      "This order was refunded — the money has been returned to your original payment method (or your credits put back). No report was delivered.",
    refunded: true,
    regenerable: true,
  },
  EXPIRED: {
    kind: "gone",
    httpStatus: 410,
    reason: "expired",
    message:
      "This report expired 90 days after purchase and is no longer available. Generate a fresh report to get an up-to-date analysis.",
    refunded: false,
    regenerable: true,
  },
} as const satisfies Record<ReportOrderState, DeliveryDisposition>;

export function dispositionForStatus(
  status: ReportOrderState,
): DeliveryDisposition {
  return DISPOSITIONS[status];
}

/** Narrow an untrusted DB string onto the state enum. */
export function parseOrderStatus(raw: unknown): ReportOrderState | null {
  if (typeof raw !== "string") return null;
  return raw in DISPOSITIONS ? (raw as ReportOrderState) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order view — whitelist
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportOrderView {
  orderId: string;
  status: ReportOrderState;
  paidAt: string | null;
  generatedAt: string | null;
  expiresAt: string | null;
  /** Cents, inc-GST (Stripe convention). Zero on the credit path. */
  amountAud: number;
  creditsUsed: number;
}

/**
 * The exact column list `/api/reports/[orderId]` selects. Kept next to
 * the view type so a reviewer can see in one place that nothing else is
 * even fetched — Stripe ids and `metadata` never leave the database.
 */
export const ORDER_SELECT_COLUMNS =
  "id, status, paid_at, generated_at, expires_at, amount_aud, credits_used, failure_reason, report_id";

function isoOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function intOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toOrderView(
  row: Row,
  status: ReportOrderState,
): ReportOrderView {
  return {
    orderId: String(row.id ?? ""),
    status,
    paidAt: isoOrNull(row.paid_at),
    generatedAt: isoOrNull(row.generated_at),
    expiresAt: isoOrNull(row.expires_at),
    amountAud: intOrZero(row.amount_aud),
    creditsUsed: intOrZero(row.credits_used),
  };
}

/**
 * `failure_reason` is written by the worker and the refund job from
 * internal strings ("orchestration_failed: …", "assembled_reports_insert
 * _failed: …"). Those are operator breadcrumbs, not customer copy: they
 * name internal tables and can carry provider error text. We surface a
 * short, truncated form so support can correlate a ticket, but never the
 * raw multi-line provider payload.
 */
export function sanitiseFailureReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) return null;
  return firstLine.slice(0, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Report view — whitelist
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportSectionView {
  id: string;
  title: string;
  /** Which C-Level agent authored the section — advertised product copy. */
  agentRole: string;
  criterion: string | null;
  score: number | null;
  wordCount: number;
  content: string;
}

export interface ReportView {
  reportId: string;
  title: string;
  tier: string;
  locale: string;
  executiveSummary: string;
  markdown: string;
  totalWords: number;
  sectionsCount: number;
  qualityScore: number | null;
  createdAt: string | null;
  sections: ReportSectionView[];
  charts: unknown[];
}

/**
 * Columns fetched from `assembled_reports`. Deliberately omits
 * `account_id`, `user_id`, `project_id`, `analysis_id` (internal joins),
 * `agent_contributions` + `consistency_issues` (pipeline QA internals),
 * `error_message` (operator text) and `credits_cost` (billing internals
 * already covered by the order view).
 */
export const REPORT_SELECT_COLUMNS =
  "id, status, tier, locale, title, executive_summary, full_markdown, total_words, " +
  "sections_count, sections_json, charts_json, quality_score, created_at, analysis_id";

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toReportView(report: AssembledReport, row: Row): ReportView {
  return {
    reportId: report.id,
    title: report.title,
    tier: report.tier,
    locale: typeof row.locale === "string" ? row.locale : "en",
    executiveSummary: report.executiveSummary,
    markdown: report.markdown,
    totalWords: report.totalWords,
    sectionsCount: intOrZero(row.sections_count ?? report.sections.length),
    qualityScore: numberOrNull(row.quality_score),
    createdAt: isoOrNull(row.created_at),
    sections: report.sections.map((section) => ({
      id: section.id,
      title: section.title,
      agentRole: String(section.agentRole),
      criterion: section.criterion ? String(section.criterion) : null,
      score: typeof section.score === "number" ? section.score : null,
      wordCount: section.wordCount,
      content: section.content,
    })),
    charts: Array.isArray(report.charts) ? report.charts : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → AssembledReport (shared with /api/svi/docx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuild the in-memory `AssembledReport` the DOCX/PDF renderers take
 * from a stored `assembled_reports` row.
 *
 * `sections_json` stores only section *metadata* (the generator strips
 * bodies to keep the row small); the prose lives once in `full_markdown`.
 * So each section's content is sliced back out of the markdown by
 * heading match — same approach the DOCX route has always used.
 */
export function reconstructAssembledReport(row: Row): AssembledReport {
  const sectionsJson = row.sections_json as Array<Row> | null;
  const fullMarkdown = String(row.full_markdown ?? "");

  const sections: ReportSection[] = (sectionsJson ?? []).map((s) => {
    const sectionTitle = String(s.title ?? "");
    const sectionContent = extractSectionContent(fullMarkdown, sectionTitle);

    return {
      id: String(s.id ?? ""),
      title: sectionTitle,
      agentRole: String(s.agentRole ?? "ceo") as ReportSection["agentRole"],
      criterion: (s.criterion as ReportSection["criterion"]) ?? undefined,
      content: sectionContent,
      score: typeof s.score === "number" ? s.score : undefined,
      visuals: [] as VisualSpec[],
      wordCount: Number(s.wordCount ?? sectionContent.split(/\s+/).length),
    };
  });

  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "SVI Report"),
    tier: String(row.tier ?? "standard") as AssembledReport["tier"],
    sections,
    charts: (row.charts_json as VisualSpec[]) ?? [],
    executiveSummary: String(row.executive_summary ?? ""),
    qualityScore: Number(row.quality_score ?? 0),
    totalWords: Number(row.total_words ?? 0),
    consistencyIssues:
      (row.consistency_issues as AssembledReport["consistencyIssues"]) ?? [],
    agentContributions:
      (row.agent_contributions as AssembledReport["agentContributions"]) ?? {},
    markdown: fullMarkdown,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

/** Slice the body of a `## <title>` section out of the full markdown. */
export function extractSectionContent(
  markdown: string,
  sectionTitle: string,
): string {
  if (!markdown || !sectionTitle) return "";

  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^##\\s+${escaped}\\s*$`, "mi");

  const match = headingPattern.exec(markdown);
  if (!match) return "";

  const startIdx = match.index + match[0].length;
  const nextHeading = markdown.indexOf("\n## ", startIdx);
  const endIdx = nextHeading === -1 ? markdown.length : nextHeading;

  return markdown.slice(startIdx, endIdx).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Export formats
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_EXPORT_FORMATS = ["json", "pdf", "docx"] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

/** `?format=` parser. Unset → json. Unknown → null (caller 400s). */
export function parseExportFormat(raw: string | null): ReportExportFormat | null {
  if (raw === null || raw.length === 0) return "json";
  const lowered = raw.toLowerCase();
  return (REPORT_EXPORT_FORMATS as readonly string[]).includes(lowered)
    ? (lowered as ReportExportFormat)
    : null;
}

/** Filesystem-safe download name derived from the report title. */
export function exportFilename(
  title: string,
  format: Exclude<ReportExportFormat, "json">,
  today = new Date(),
): string {
  const safe = title
    .replace(/^SVI Enhanced Report:\s*/i, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const stem = safe.length > 0 ? safe : "Report";
  return `BlockID-Trust-Report-${stem}-${today.toISOString().slice(0, 10)}.${format}`;
}

/** Canonical in-app path where a buyer views a finished order. */
export function reportOrderPath(orderId: string): string {
  return `/dashboard/reports/order?order=${encodeURIComponent(orderId)}`;
}
