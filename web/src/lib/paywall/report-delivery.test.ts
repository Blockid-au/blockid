/**
 * Colocated vitest for report-delivery.ts — the pure delivery policy
 * behind GET /api/reports/[orderId].
 *
 * The route test covers the HTTP wiring; this one pins the policy itself
 * so a change to the status table, the whitelists or the section-slicing
 * fails here first, with a much smaller blast radius to read.
 */

import { describe, it, expect } from "vitest";
import { REPORT_ORDER_STATES } from "./report-order-state";
import {
  ORDER_SELECT_COLUMNS,
  REPORT_POLL_RETRY_SECONDS,
  REPORT_SELECT_COLUMNS,
  dispositionForStatus,
  exportFilename,
  extractSectionContent,
  parseExportFormat,
  parseOrderStatus,
  reconstructAssembledReport,
  reportOrderPath,
  sanitiseFailureReason,
  toOrderView,
  toReportView,
} from "./report-delivery";

// ─────────────────────────────────────────────────────────────────────────
// Disposition table
// ─────────────────────────────────────────────────────────────────────────

describe("dispositionForStatus", () => {
  it("has an entry for every state in the machine", () => {
    for (const state of REPORT_ORDER_STATES) {
      expect(dispositionForStatus(state), state).toBeDefined();
    }
  });

  it("maps the delivery states to 200", () => {
    for (const state of ["READY", "SHARED"] as const) {
      const d = dispositionForStatus(state);
      expect(d.kind).toBe("deliver");
      expect(d.httpStatus).toBe(200);
    }
  });

  it("maps paid-but-unfinished states to a pollable 202", () => {
    for (const state of ["PAID", "GENERATING"] as const) {
      const d = dispositionForStatus(state);
      expect(d.kind).toBe("pending");
      expect(d.httpStatus).toBe(202);
      expect(d.retryInSeconds).toBe(REPORT_POLL_RETRY_SECONDS);
    }
  });

  it("maps unpaid states to 402 with no retry hint", () => {
    for (const state of ["CHECKOUT_INITIATED", "PAYMENT_PENDING", "NOT_PURCHASED"] as const) {
      const d = dispositionForStatus(state);
      expect(d.kind).toBe("unpaid");
      expect(d.httpStatus).toBe(402);
      expect(d.retryInSeconds).toBeUndefined();
    }
  });

  it("maps terminal states to 410 and flags whether the money came back", () => {
    expect(dispositionForStatus("FAILED").httpStatus).toBe(410);
    expect(dispositionForStatus("FAILED").refunded).toBe(false);

    expect(dispositionForStatus("REFUNDED").httpStatus).toBe(410);
    expect(dispositionForStatus("REFUNDED").refunded).toBe(true);

    expect(dispositionForStatus("EXPIRED").httpStatus).toBe(410);
    expect(dispositionForStatus("EXPIRED").regenerable).toBe(true);
  });

  it("writes buyer-facing messages, not operator jargon", () => {
    for (const state of REPORT_ORDER_STATES) {
      const { message } = dispositionForStatus(state);
      expect(message.length).toBeGreaterThan(10);
      // No snake_case internals, no table names.
      expect(message).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });

  it("never invents a poll hint for a non-pending state", () => {
    for (const state of REPORT_ORDER_STATES) {
      const d = dispositionForStatus(state);
      if (d.kind !== "pending") expect(d.retryInSeconds).toBeUndefined();
    }
  });
});

describe("parseOrderStatus", () => {
  it("accepts every real state", () => {
    for (const state of REPORT_ORDER_STATES) {
      expect(parseOrderStatus(state)).toBe(state);
    }
  });

  it("rejects drift, casing games and non-strings", () => {
    expect(parseOrderStatus("ready")).toBeNull();
    expect(parseOrderStatus("TIME_TRAVELLING")).toBeNull();
    expect(parseOrderStatus(null)).toBeNull();
    expect(parseOrderStatus(42)).toBeNull();
    // Prototype keys must not resolve through the `in` check.
    expect(parseOrderStatus("toString")).toBeNull();
    expect(parseOrderStatus("constructor")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Select-column whitelists
// ─────────────────────────────────────────────────────────────────────────

describe("select column whitelists", () => {
  const FORBIDDEN_ORDER_COLUMNS = [
    "user_id",
    "business_id",
    "stripe_session_id",
    "stripe_payment_intent_id",
    "metadata",
    "product_sku",
    "retry_count",
  ];

  it("never even fetches the sensitive order columns", () => {
    for (const col of FORBIDDEN_ORDER_COLUMNS) {
      expect(ORDER_SELECT_COLUMNS.split(/,\s*/)).not.toContain(col);
    }
  });

  it("never fetches pipeline internals from assembled_reports", () => {
    const cols = REPORT_SELECT_COLUMNS.split(/,\s*/);
    for (const col of [
      "account_id",
      "user_id",
      "project_id",
      "agent_contributions",
      "consistency_issues",
      "error_message",
      "credits_cost",
    ]) {
      expect(cols, col).not.toContain(col);
    }
  });

  it("does fetch what the view needs", () => {
    const orderCols = ORDER_SELECT_COLUMNS.split(/,\s*/);
    for (const col of ["id", "status", "paid_at", "generated_at", "expires_at", "amount_aud", "credits_used", "report_id"]) {
      expect(orderCols, col).toContain(col);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Views
// ─────────────────────────────────────────────────────────────────────────

describe("toOrderView", () => {
  it("copies only the whitelisted fields, even from a fat row", () => {
    const view = toOrderView(
      {
        id: "order-1",
        status: "READY",
        paid_at: "2026-07-01T00:00:00.000Z",
        generated_at: "2026-07-01T00:05:00.000Z",
        expires_at: "2026-09-29T00:00:00.000Z",
        amount_aud: 550,
        credits_used: 0,
        // Fat-row noise that must not survive.
        stripe_session_id: "cs_test_x",
        user_id: "someone-else",
        metadata: { bid_promo_code: "SECRET" },
      },
      "READY",
    );

    expect(Object.keys(view).sort()).toEqual(
      ["orderId", "status", "paidAt", "generatedAt", "expiresAt", "amountAud", "creditsUsed"].sort(),
    );
    expect(JSON.stringify(view)).not.toContain("cs_test_x");
    expect(JSON.stringify(view)).not.toContain("SECRET");
  });

  it("normalises missing timestamps to null and bad numbers to 0", () => {
    const view = toOrderView({ id: "o", amount_aud: "not-a-number" }, "PAID");
    expect(view.paidAt).toBeNull();
    expect(view.generatedAt).toBeNull();
    expect(view.expiresAt).toBeNull();
    expect(view.amountAud).toBe(0);
    expect(view.creditsUsed).toBe(0);
  });
});

describe("sanitiseFailureReason", () => {
  it("keeps the first line only", () => {
    expect(sanitiseFailureReason("boom: upstream\nstack frame 1\nstack frame 2")).toBe(
      "boom: upstream",
    );
  });

  it("caps the length so a provider dump cannot ride along", () => {
    const reason = sanitiseFailureReason("x".repeat(1000));
    expect(reason).toHaveLength(200);
  });

  it("returns null for blank or non-string input", () => {
    expect(sanitiseFailureReason(null)).toBeNull();
    expect(sanitiseFailureReason("")).toBeNull();
    expect(sanitiseFailureReason("   \n  ")).toBeNull();
    expect(sanitiseFailureReason(7)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Reconstruction
// ─────────────────────────────────────────────────────────────────────────

const MARKDOWN = [
  "# Acme Pty Ltd",
  "",
  "## Market Opportunity",
  "",
  "TAM is A$4.2b in Australia.",
  "",
  "## Team",
  "",
  "Two technical founders.",
  "",
].join("\n");

const ROW = {
  id: "rpt-1",
  tier: "premium",
  locale: "en",
  title: "SVI Enhanced Report: Acme Pty Ltd",
  executive_summary: "Acme scores 142.",
  full_markdown: MARKDOWN,
  total_words: 5200,
  sections_count: 2,
  sections_json: [
    { id: "market", title: "Market Opportunity", agentRole: "cmo", criterion: "market_size", score: 78, wordCount: 900 },
    { id: "team", title: "Team", agentRole: "chro", score: 64, wordCount: 700 },
  ],
  charts_json: [],
  quality_score: 88.5,
  created_at: "2026-07-01T00:05:00.000Z",
};

describe("reconstructAssembledReport", () => {
  it("slices each section body back out of the full markdown", () => {
    const report = reconstructAssembledReport(ROW);
    expect(report.sections).toHaveLength(2);
    expect(report.sections[0].content).toBe("TAM is A$4.2b in Australia.");
    expect(report.sections[1].content).toBe("Two technical founders.");
  });

  it("keeps the stored markdown intact for the renderers", () => {
    expect(reconstructAssembledReport(ROW).markdown).toBe(MARKDOWN);
  });

  it("survives a row with no sections at all", () => {
    const report = reconstructAssembledReport({ id: "r", full_markdown: "" });
    expect(report.sections).toEqual([]);
    expect(report.title).toBe("SVI Report");
    expect(report.tier).toBe("standard");
  });
});

describe("extractSectionContent", () => {
  it("returns empty string when the heading is absent", () => {
    expect(extractSectionContent(MARKDOWN, "Nonexistent")).toBe("");
  });

  it("treats regex metacharacters in a title as literal text", () => {
    const md = "## Risk (P0) [urgent]\n\nBody here.\n";
    expect(extractSectionContent(md, "Risk (P0) [urgent]")).toBe("Body here.");
  });

  it("stops at the next h2, not at the end of the document", () => {
    expect(extractSectionContent(MARKDOWN, "Market Opportunity")).not.toContain(
      "Two technical founders",
    );
  });

  it("is a no-op on empty inputs", () => {
    expect(extractSectionContent("", "Team")).toBe("");
    expect(extractSectionContent(MARKDOWN, "")).toBe("");
  });
});

describe("toReportView", () => {
  it("exposes exactly the whitelisted report shape", () => {
    const view = toReportView(reconstructAssembledReport(ROW), ROW);
    expect(Object.keys(view).sort()).toEqual(
      [
        "reportId",
        "title",
        "tier",
        "locale",
        "executiveSummary",
        "markdown",
        "totalWords",
        "sectionsCount",
        "qualityScore",
        "createdAt",
        "sections",
        "charts",
      ].sort(),
    );
    for (const section of view.sections) {
      expect(Object.keys(section).sort()).toEqual(
        ["id", "title", "agentRole", "criterion", "score", "wordCount", "content"].sort(),
      );
    }
  });

  it("drops agentContributions and consistencyIssues (pipeline internals)", () => {
    const report = reconstructAssembledReport({
      ...ROW,
      agent_contributions: { cfo: { prompt: "SYSTEM PROMPT LEAK" } },
      consistency_issues: [{ note: "INTERNAL QA LEAK" }],
    });
    const raw = JSON.stringify(toReportView(report, ROW));
    expect(raw).not.toContain("SYSTEM PROMPT LEAK");
    expect(raw).not.toContain("INTERNAL QA LEAK");
  });

  it("normalises a missing criterion to null rather than dropping the key", () => {
    const view = toReportView(reconstructAssembledReport(ROW), ROW);
    const team = view.sections.find((s) => s.id === "team");
    expect(team?.criterion).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Format + filename helpers
// ─────────────────────────────────────────────────────────────────────────

describe("parseExportFormat", () => {
  it("defaults to json", () => {
    expect(parseExportFormat(null)).toBe("json");
    expect(parseExportFormat("")).toBe("json");
  });

  it("accepts the three supported formats, case-insensitively", () => {
    expect(parseExportFormat("pdf")).toBe("pdf");
    expect(parseExportFormat("DOCX")).toBe("docx");
    expect(parseExportFormat("Json")).toBe("json");
  });

  it("rejects anything else so the route can 400", () => {
    expect(parseExportFormat("xlsx")).toBeNull();
    expect(parseExportFormat("../../etc/passwd")).toBeNull();
    expect(parseExportFormat("constructor")).toBeNull();
  });
});

describe("exportFilename", () => {
  const day = new Date("2026-07-30T12:00:00.000Z");

  it("strips the pipeline title prefix and slugs the business name", () => {
    expect(exportFilename("SVI Enhanced Report: Acme Pty Ltd", "pdf", day)).toBe(
      "BlockID-Trust-Report-Acme-Pty-Ltd-2026-07-30.pdf",
    );
  });

  it("strips characters that could break a Content-Disposition header", () => {
    const name = exportFilename('Acme "Evil" \\ Ltd\r\nX-Injected: 1', "docx", day);
    expect(name).not.toMatch(/["\\\r\n]/);
    expect(name.endsWith(".docx")).toBe(true);
  });

  it("falls back to a stem when the title slugs away to nothing", () => {
    expect(exportFilename("★★★", "pdf", day)).toBe(
      "BlockID-Trust-Report-Report-2026-07-30.pdf",
    );
  });
});

describe("reportOrderPath", () => {
  it("points at the delivery page", () => {
    expect(reportOrderPath("abc-123")).toBe("/dashboard/reports/order?order=abc-123");
  });

  it("encodes the id so a hostile value cannot append query params", () => {
    expect(reportOrderPath("a&next=//evil.example")).toBe(
      "/dashboard/reports/order?order=a%26next%3D%2F%2Fevil.example",
    );
  });
});
