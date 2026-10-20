// G35 Pricing v5 — the evaluator report preview carries a CARD offer
// (POST /api/evaluations/[id]/report, preview only, flag ON only).
//
//   flag OFF → the preview has no `payg` key at all (byte-for-byte today's);
//   flag ON  → `cost.payg.card = { business_id, offer }` — the founder
//              paywall's buildPaygOffer over the EVALUATOR's own orders for
//              this project (so their delivered Snapshot shows its upgrade),
//              Verified hidden when the open count cannot be read;
//   a re-score, a confirmed run, or unreadable orders → no card offer.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/ai-client", () => ({ isAIConfigured: () => true }));
vi.mock("@/lib/credits", () => ({ spendCredits: vi.fn(), grantCredits: vi.fn() }));

vi.mock("@/lib/evaluations", () => ({
  getEvaluationForUser: async () => ({ id: "e-1", projectId: "p-1", evaluatorUserId: "u-1" }),
  canAccessProjectAsEvaluator: async () => ({ allowed: true, via: "evaluator" }),
}));

const previewMock = vi.fn();
vi.mock("@/lib/evaluations/report-quota", () => ({
  reportKindFeature: () => "report_full",
  previewReportCharge: (u: unknown, k: string, o: unknown) => previewMock(u, k, o),
  recordEvaluationReport: vi.fn(),
  findRecentEvaluationReport: async () => null,
  normaliseIdempotencyKey: () => null,
  reportUrlForToken: () => null,
  pdfUrlForToken: () => null,
}));
vi.mock("@/lib/report-pipeline/run-for-project", () => ({ runTrustReportForProject: vi.fn(), runRescoreForProject: vi.fn() }));
vi.mock("@/lib/webhooks/registry", () => ({ enqueueWebhook: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));

const paygConfig = { current: { payg_enabled: false } as Record<string, unknown> };
vi.mock("@/lib/pricing/payg-flag", async () => {
  const { PAYG_CONFIG_DEFAULTS } = await import("@/lib/pricing/v5-payg");
  const read = async () => ({ ...PAYG_CONFIG_DEFAULTS, ...paygConfig.current });
  return { readPaygConfig: read, isPaygEnabled: async () => (await read()).payg_enabled === true };
});

const listBuyerOrdersMock = vi.fn();
const countOpenVerifiedMock = vi.fn();
vi.mock("@/lib/pricing/payg-orders", () => ({
  listBuyerOrders: (...a: unknown[]) => listBuyerOrdersMock(...a),
  countOpenVerifiedOrders: (...a: unknown[]) => countOpenVerifiedMock(...a),
}));

import { POST } from "./route";

const USER = { id: "u-1", email: "scout@fund.vc", plan: "evaluator_scout" };
const ctx = { params: Promise.resolve({ id: "e-1" }) };
const post = (body: unknown) =>
  new Request("http://localhost/api/evaluations/e-1/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const creditsCost = { kind: "full", via: "credits", credits: 49, list_credits: 49, balance: 100, quota: { limit: 10, used: 10, remaining: 0, unlimited: false }, remaining_quota: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  previewMock.mockResolvedValue(creditsCost);
  listBuyerOrdersMock.mockResolvedValue([]);
  countOpenVerifiedMock.mockResolvedValue(0);
  paygConfig.current = { payg_enabled: false };
});

describe("flag OFF", () => {
  it("the preview carries no payg / card key and reads no orders", async () => {
    const body = await (await POST(post({ kind: "full" }), ctx)).json();
    expect(body).toMatchObject({ ok: true, preview: true });
    expect(body.cost).not.toHaveProperty("payg");
    expect(listBuyerOrdersMock).not.toHaveBeenCalled();
  });
});

describe("flag ON", () => {
  beforeEach(() => {
    paygConfig.current = { payg_enabled: true };
  });

  it("full preview → card offer over the evaluator's own orders for this startup", async () => {
    const body = await (await POST(post({ kind: "full" }), ctx)).json();
    expect(listBuyerOrdersMock).toHaveBeenCalledWith(expect.anything(), "u-1", "p-1");
    const card = body.cost.payg.card;
    expect(body.cost.payg).toMatchObject({ enabled: true, full_price_label: "A$49", full_credits: 49 });
    expect(card.business_id).toBe("p-1");
    expect(card.offer.enabled).toBe(true);
    expect(card.offer.tiers.map((t: { tier: string; amountCents: number; available: boolean }) => [t.tier, t.amountCents, t.available])).toEqual([
      ["snapshot", 1900, true],
      ["full", 4900, true],
      ["verified", 14900, true],
    ]);
    expect(card.offer.billingNote).toBe("One-off, inc. GST.");
    expect(card.offer.tiers.find((t: { tier: string }) => t.tier === "verified").delivery).toContain("business day");
  });

  it("a delivered Snapshot the evaluator bought shows its upgrade", async () => {
    listBuyerOrdersMock.mockResolvedValue([{ id: "o-1", status: "READY", product_sku: "report_snapshot", report_id: null, created_at: null }]);
    const body = await (await POST(post({ kind: "full" }), ctx)).json();
    expect(body.cost.payg.card.offer.upgrades).toEqual([expect.objectContaining({ from: "snapshot", to: "full", orderId: "o-1", sku: "upgrade_snapshot_full" })]);
  });

  it("Verified hidden when the open count cannot be read; no card when orders cannot be read", async () => {
    countOpenVerifiedMock.mockResolvedValue(null);
    let body = await (await POST(post({ kind: "full" }), ctx)).json();
    expect(body.cost.payg.card.offer.tiers.find((t: { tier: string }) => t.tier === "verified").available).toBe(false);

    listBuyerOrdersMock.mockResolvedValue(null);
    body = await (await POST(post({ kind: "full" }), ctx)).json();
    expect(body.cost.payg.card ?? null).toBeNull();
  });

  it("a re-score never gets a card offer", async () => {
    previewMock.mockResolvedValue({ ...creditsCost, kind: "rescore", credits: 1, list_credits: 1 });
    const body = await (await POST(post({ kind: "rescore" }), ctx)).json();
    expect(body.cost.payg.card ?? null).toBeNull();
    expect(listBuyerOrdersMock).not.toHaveBeenCalled();
  });
});
