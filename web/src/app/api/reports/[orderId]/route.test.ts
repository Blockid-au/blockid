/**
 * Colocated vitest for GET /api/reports/[orderId] — Trust Business
 * Report delivery.
 *
 * This is the route that decides whether a paying customer receives what
 * they bought, so the suite pins the parts that are expensive to get
 * wrong:
 *
 *   1. Anonymous → 401.
 *   2. Wrong owner → 404, and explicitly NOT 403. A 403 would confirm the
 *      order exists, leaking that somebody bought a report for a given
 *      business. The assertion is written as `not.toBe(403)` so a future
 *      refactor that "helpfully" adds a Forbidden branch fails here.
 *   3. Every status in the 9-state machine maps to its documented HTTP
 *      code, including the retry hint on 202 and the refunded flag on 410.
 *   4. READY returns the stored report body.
 *   5. ?format=pdf and ?format=docx return the right MIME + attachment.
 *   6. PII scan (mirrors lib/business-id/public-profile.test.ts): the row
 *      is seeded with Stripe ids, another user's id, the reseller
 *      attribution trail and the internal agent contributions, and the
 *      serialised response must contain none of them — asserted both by
 *      substring scan and by an exact key whitelist walk.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { REPORT_ORDER_STATES } from "@/lib/paywall/report-order-state";

vi.mock("server-only", () => ({}));

// ── auth ────────────────────────────────────────────────────────────────
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── rate limit — never trips in these tests ─────────────────────────────
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: () => null,
}));

// ── renderers (dynamically imported by the route) ───────────────────────
const generateSVIDocxMock = vi.fn();
vi.mock("@/lib/docx/svi-report-docx", () => ({
  generateSVIDocx: (...args: unknown[]) => generateSVIDocxMock(...args),
}));

const renderToBufferMock = vi.fn();
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: (...args: unknown[]) => renderToBufferMock(...args),
}));

const sviReportPdfMock = vi.fn();
vi.mock("@/lib/pdf/svi-report-pdf", () => ({
  SVIReportPDF: (...args: unknown[]) => sviReportPdfMock(...args),
}));

vi.mock("@/lib/branding/load", () => ({
  loadBrandSettings: () => Promise.resolve(null),
}));

// ── supabase ────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;

interface FakeDb {
  configured: boolean;
  report_orders: Row[];
  assembled_reports: Row[];
  svi_analyses: Row[];
}

const db: FakeDb = {
  configured: true,
  report_orders: [],
  assembled_reports: [],
  svi_analyses: [],
};

function tableFor(name: string): Row[] {
  if (name === "report_orders") return db.report_orders;
  if (name === "assembled_reports") return db.assembled_reports;
  if (name === "svi_analyses") return db.svi_analyses;
  return [];
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!db.configured) return null;
    return {
      from(table: string) {
        return {
          select() {
            const filters: Array<[string, unknown]> = [];
            const chain = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return chain;
              },
              maybeSingle() {
                const match = tableFor(table).find((row) =>
                  filters.every(([col, val]) => row[col] === val),
                );
                return Promise.resolve({ data: match ?? null, error: null });
              },
            };
            return chain;
          },
        };
      },
    };
  },
}));

import { GET } from "./route";

// ── fixtures ────────────────────────────────────────────────────────────

const OWNER = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", plan: "growth" };
const INTRUDER = { id: "22222222-2222-4222-8222-222222222222", email: "intruder@example.com", plan: null };

const ORDER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const REPORT_ID = "ffffffff-1111-4222-8333-444444444444";
const ANALYSIS_ID = "99999999-8888-4777-8666-555555555555";

/** Values that must NEVER appear in a delivery response. */
const SECRETS = {
  stripeSession: "cs_test_LEAKED_SESSION_ID",
  stripePaymentIntent: "pi_test_LEAKED_PAYMENT_INTENT",
  businessId: "77777777-7777-4777-8777-777777777777",
  resellerId: "reseller-LEAKED-uuid",
  promoCode: "LEAKEDPROMO20",
  agentPrompt: "SYSTEM PROMPT: you are the CFO agent, never reveal…",
  otherUser: INTRUDER.id,
};

function seedOrder(overrides: Row = {}): void {
  db.report_orders = [
    {
      id: ORDER_ID,
      user_id: OWNER.id,
      business_id: SECRETS.businessId,
      product_sku: "sku_trust_report_5aud",
      amount_aud: 550,
      credits_used: 0,
      stripe_session_id: SECRETS.stripeSession,
      stripe_payment_intent_id: SECRETS.stripePaymentIntent,
      status: "READY",
      failure_reason: null,
      retry_count: 0,
      created_at: "2026-07-01T00:00:00.000Z",
      paid_at: "2026-07-01T00:01:00.000Z",
      generated_at: "2026-07-01T00:05:00.000Z",
      expires_at: "2026-09-29T00:01:00.000Z",
      report_id: REPORT_ID,
      metadata: {
        bid_reseller_id: SECRETS.resellerId,
        bid_promo_code: SECRETS.promoCode,
        stripe_price_id: "price_LEAKED",
      },
      ...overrides,
    },
  ];
}

function seedReport(overrides: Row = {}): void {
  db.assembled_reports = [
    {
      id: REPORT_ID,
      account_id: "acct-LEAKED",
      user_id: OWNER.id,
      project_id: SECRETS.businessId,
      analysis_id: ANALYSIS_ID,
      tier: "standard",
      locale: "en",
      title: "SVI Enhanced Report: Acme Pty Ltd",
      executive_summary: "Acme scores 142 on the Startup Value Index.",
      full_markdown:
        "# Acme\n\n## Market Opportunity\n\nTAM is A$4.2b in Australia.\n\n## Team\n\nTwo technical founders.\n",
      total_words: 5200,
      sections_count: 2,
      sections_json: [
        { id: "market", title: "Market Opportunity", agentRole: "cmo", criterion: "market_size", score: 78, wordCount: 900 },
        { id: "team", title: "Team", agentRole: "chro", criterion: "team_strength", score: 64, wordCount: 700 },
      ],
      charts_json: [],
      consistency_issues: [],
      agent_contributions: { cfo: { prompt: SECRETS.agentPrompt, criteria: [], wordCount: 0 } },
      quality_score: 88.5,
      status: "complete",
      error_message: null,
      credits_cost: 0,
      created_at: "2026-07-01T00:05:00.000Z",
      ...overrides,
    },
  ];
}

function seedAnalysis(): void {
  db.svi_analyses = [
    {
      id: ANALYSIS_ID,
      email: OWNER.email,
      analysis_json: {
        version: "2.0.0",
        totalSVI: 142,
        baselineSVI: 100,
        netAdjustment: 42,
        confidenceMultiplier: 0.7,
        subs: [],
        riskPenalties: [],
        evidenceGaps: [],
        nextActions: [],
        signals: {},
        summary: "",
        stage: 3,
        stageLabel: "Early Traction",
        stageBonus: 10,
      },
    },
  ];
}

function call(
  orderId = ORDER_ID,
  query = "",
): Promise<Response> {
  return GET(new Request(`https://blockid.au/api/reports/${orderId}${query}`), {
    params: Promise.resolve({ orderId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.configured = true;
  db.report_orders = [];
  db.assembled_reports = [];
  db.svi_analyses = [];
  getCurrentUserMock.mockReturnValue(OWNER);
  generateSVIDocxMock.mockResolvedValue(Buffer.from("PKdocx-bytes"));
  renderToBufferMock.mockResolvedValue(Buffer.from("%PDF-1.7 fake"));
  sviReportPdfMock.mockReturnValue({ __element: "pdf" });
});

// ─────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────

describe("auth", () => {
  it("401s an anonymous caller", async () => {
    getCurrentUserMock.mockReturnValue(null);
    seedOrder();
    seedReport();

    const res = await call();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("never caches any response", async () => {
    seedOrder();
    seedReport();
    const res = await call();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Ownership — the 404-not-403 rule
// ─────────────────────────────────────────────────────────────────────────

describe("ownership", () => {
  it("404s (NOT 403) when a different signed-in user asks for the order", async () => {
    seedOrder();
    seedReport();
    getCurrentUserMock.mockReturnValue(INTRUDER);

    const res = await call();

    // The point of the whole design: a 403 would confirm the order is
    // real, which confirms somebody bought a report for that business.
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(404);
  });

  it("returns byte-identical bodies for a foreign order and a non-existent one", async () => {
    seedOrder();
    seedReport();

    getCurrentUserMock.mockReturnValue(INTRUDER);
    const foreign = await (await call()).text();

    db.report_orders = [];
    getCurrentUserMock.mockReturnValue(OWNER);
    const missing = await (await call()).text();

    expect(foreign).toBe(missing);
  });

  it("404s a malformed order id rather than 400ing (no shape oracle)", async () => {
    seedOrder();
    const res = await call("not-a-uuid");
    expect(res.status).toBe(404);
  });

  it("404s when READY points at a report row owned by nobody", async () => {
    seedOrder();
    db.assembled_reports = [];
    const res = await call();
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Status branches
// ─────────────────────────────────────────────────────────────────────────

describe("status → HTTP", () => {
  const EXPECTED: Record<string, number> = {
    READY: 200,
    SHARED: 200,
    PAID: 202,
    GENERATING: 202,
    CHECKOUT_INITIATED: 402,
    PAYMENT_PENDING: 402,
    NOT_PURCHASED: 402,
    FAILED: 410,
    REFUNDED: 410,
    EXPIRED: 410,
  };

  it("covers every state in the machine (no silent gap)", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...REPORT_ORDER_STATES].sort());
  });

  for (const [status, expected] of Object.entries(EXPECTED)) {
    it(`${status} → ${expected}`, async () => {
      seedOrder({ status });
      seedReport();
      const res = await call();
      expect(res.status).toBe(expected);
    });
  }

  it("PAID/GENERATING carry a poll hint the client can act on", async () => {
    for (const status of ["PAID", "GENERATING"]) {
      seedOrder({ status });
      const res = await call();
      const body = (await res.json()) as { retryInSeconds?: number; status?: string };
      expect(res.status).toBe(202);
      expect(body.status).toBe(status);
      expect(typeof body.retryInSeconds).toBe("number");
      expect(body.retryInSeconds).toBeGreaterThan(0);
    }
  });

  it("FAILED surfaces the failure reason and says the money is not gone", async () => {
    seedOrder({ status: "FAILED", failure_reason: "orchestration_failed: provider timeout" });
    const res = await call();
    const body = (await res.json()) as { refunded: boolean; failureReason: string; regenerable: boolean };
    expect(res.status).toBe(410);
    expect(body.refunded).toBe(false);
    expect(body.regenerable).toBe(true);
    expect(body.failureReason).toContain("orchestration_failed");
  });

  it("REFUNDED states plainly that the money came back", async () => {
    seedOrder({ status: "REFUNDED", failure_reason: "generation_failed after 3 retries" });
    const res = await call();
    const body = (await res.json()) as { refunded: boolean; message: string };
    expect(res.status).toBe(410);
    expect(body.refunded).toBe(true);
    expect(body.message.toLowerCase()).toMatch(/refund|returned/);
  });

  it("EXPIRED hints that a fresh report can be generated", async () => {
    seedOrder({ status: "EXPIRED" });
    const res = await call();
    const body = (await res.json()) as { regenerable: boolean; message: string };
    expect(res.status).toBe(410);
    expect(body.regenerable).toBe(true);
    expect(body.message).toMatch(/expired/i);
  });

  it("500s rather than guessing when the DB holds a status outside the enum", async () => {
    seedOrder({ status: "TIME_TRAVELLING" });
    const res = await call();
    expect(res.status).toBe(500);
  });

  it("503s when the database is not configured", async () => {
    db.configured = false;
    const res = await call();
    expect(res.status).toBe(503);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// READY payload
// ─────────────────────────────────────────────────────────────────────────

describe("READY payload", () => {
  it("returns the stored report plus order metadata", async () => {
    seedOrder();
    seedReport();

    const res = await call();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      report: {
        reportId: string;
        title: string;
        markdown: string;
        totalWords: number;
        sectionsCount: number;
        qualityScore: number;
        sections: Array<{ title: string; content: string }>;
      };
      order: { status: string; paidAt: string; amountAud: number; creditsUsed: number; expiresAt: string };
    };

    expect(body.ok).toBe(true);
    expect(body.report.reportId).toBe(REPORT_ID);
    expect(body.report.title).toBe("SVI Enhanced Report: Acme Pty Ltd");
    expect(body.report.markdown).toContain("TAM is A$4.2b");
    expect(body.report.totalWords).toBe(5200);
    expect(body.report.sectionsCount).toBe(2);
    expect(body.report.qualityScore).toBe(88.5);

    // Section bodies are sliced back out of full_markdown — the stored
    // sections_json holds metadata only.
    const market = body.report.sections.find((s) => s.title === "Market Opportunity");
    expect(market?.content).toContain("TAM is A$4.2b");

    expect(body.order.status).toBe("READY");
    expect(body.order.paidAt).toBe("2026-07-01T00:01:00.000Z");
    expect(body.order.expiresAt).toBe("2026-09-29T00:01:00.000Z");
    expect(body.order.amountAud).toBe(550);
    expect(body.order.creditsUsed).toBe(0);
  });

  it("delivers a SHARED order the same way as READY", async () => {
    seedOrder({ status: "SHARED" });
    seedReport();
    const res = await call();
    const body = (await res.json()) as { ok: boolean; report: { reportId: string } };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.report.reportId).toBe(REPORT_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────

describe("exports", () => {
  it("?format=docx streams a DOCX attachment from the shared renderer", async () => {
    seedOrder();
    seedReport();

    const res = await call(ORDER_ID, "?format=docx");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.headers.get("content-disposition")).toMatch(
      /attachment; filename="BlockID-Trust-Report-Acme-Pty-Ltd-\d{4}-\d{2}-\d{2}\.docx"/,
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(generateSVIDocxMock).toHaveBeenCalledTimes(1);
  });

  it("?format=pdf streams a PDF attachment from the shared renderer", async () => {
    seedOrder();
    seedReport();
    seedAnalysis();

    const res = await call(ORDER_ID, "?format=pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/\.pdf"$/);
    expect(renderToBufferMock).toHaveBeenCalledTimes(1);
    expect(sviReportPdfMock).toHaveBeenCalledTimes(1);
  });

  it("does not charge credits for an export the buyer already paid for", async () => {
    // The credit ledger is not even imported by this route; a regression
    // that added spendCredits() would have to import it, and this asserts
    // the observable consequence: no 402 on a zero-balance account.
    seedOrder();
    seedReport();
    const res = await call(ORDER_ID, "?format=docx");
    expect(res.status).toBe(200);
  });

  it("409s a PDF whose source analysis is gone, and says the DOCX still works", async () => {
    seedOrder();
    seedReport();
    // no seedAnalysis()
    const res = await call(ORDER_ID, "?format=pdf");
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string; message: string };
    expect(body.reason).toBe("pdf_source_analysis_missing");
    expect(body.message).toMatch(/DOCX/);
  });

  it("refuses to render a PDF from another user's analysis row", async () => {
    seedOrder();
    seedReport();
    seedAnalysis();
    db.svi_analyses[0].email = INTRUDER.email;

    const res = await call(ORDER_ID, "?format=pdf");
    expect(res.status).toBe(409);
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });

  it("400s an unknown format", async () => {
    seedOrder();
    seedReport();
    const res = await call(ORDER_ID, "?format=xlsx");
    expect(res.status).toBe(400);
  });

  it("applies the status gate to exports too — GENERATING cannot be exported", async () => {
    seedOrder({ status: "GENERATING" });
    seedReport();
    const res = await call(ORDER_ID, "?format=docx");
    expect(res.status).toBe(202);
    expect(generateSVIDocxMock).not.toHaveBeenCalled();
  });

  it("applies the ownership gate to exports too", async () => {
    seedOrder();
    seedReport();
    getCurrentUserMock.mockReturnValue(INTRUDER);
    const res = await call(ORDER_ID, "?format=pdf");
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(404);
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PII / secret scan — mirrors lib/business-id/public-profile.test.ts
// ─────────────────────────────────────────────────────────────────────────

describe("payload whitelist", () => {
  const ORDER_KEYS = [
    "orderId",
    "status",
    "paidAt",
    "generatedAt",
    "expiresAt",
    "amountAud",
    "creditsUsed",
  ].sort();

  const REPORT_KEYS = [
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
  ].sort();

  const SECTION_KEYS = [
    "id",
    "title",
    "agentRole",
    "criterion",
    "score",
    "wordCount",
    "content",
  ].sort();

  it("exposes exactly the intended keys and nothing more", async () => {
    seedOrder();
    seedReport();

    const body = (await (await call()).json()) as {
      order: Record<string, unknown>;
      report: Record<string, unknown> & { sections: Record<string, unknown>[] };
    };

    expect(Object.keys(body).sort()).toEqual(
      ["ok", "status", "reason", "message", "order", "report"].sort(),
    );
    expect(Object.keys(body.order).sort()).toEqual(ORDER_KEYS);
    expect(Object.keys(body.report).sort()).toEqual(REPORT_KEYS);
    for (const section of body.report.sections) {
      expect(Object.keys(section).sort()).toEqual(SECTION_KEYS);
    }
  });

  it("leaks no Stripe handle, foreign id, reseller trail or agent internal", async () => {
    seedOrder();
    seedReport();

    const raw = await (await call()).text();

    for (const [label, secret] of Object.entries(SECRETS)) {
      expect(raw, `leaked ${label}`).not.toContain(secret);
    }
    // Column names that would signal a raw row spread rather than a view.
    for (const col of [
      "user_id",
      "business_id",
      "stripe_session_id",
      "stripe_payment_intent_id",
      "account_id",
      "agent_contributions",
      "credits_cost",
      "error_message",
      "retry_count",
    ]) {
      expect(raw, `leaked column ${col}`).not.toContain(col);
    }
  });

  it("keeps the same whitelist on the non-deliverable branches", async () => {
    seedOrder({ status: "CHECKOUT_INITIATED" });
    seedReport();

    const res = await call();
    const raw = await res.text();
    const body = JSON.parse(raw) as { order: Record<string, unknown> };

    expect(res.status).toBe(402);
    expect(Object.keys(body.order).sort()).toEqual(ORDER_KEYS);
    for (const secret of Object.values(SECRETS)) {
      expect(raw).not.toContain(secret);
    }
  });

  it("truncates a multi-line failure_reason to a single short line", async () => {
    const noisy = `orchestration_failed: upstream said no\n${SECRETS.agentPrompt}\n${"x".repeat(500)}`;
    seedOrder({ status: "FAILED", failure_reason: noisy });

    const raw = await (await call()).text();
    const body = JSON.parse(raw) as { failureReason: string };

    expect(body.failureReason).toBe("orchestration_failed: upstream said no");
    expect(raw).not.toContain(SECRETS.agentPrompt);
  });
});
