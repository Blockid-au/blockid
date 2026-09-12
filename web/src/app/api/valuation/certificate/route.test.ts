// Colocated tests for /api/valuation/certificate (S22-A).
//
//   POST — cost preview first (`confirm` absent → 200 preview, no spend),
//          confirm → spend then insert; Growth+ / Startup Package → included
//          (cost 0, no spend); editor allowed, viewer 403, no project 404;
//          no SVI analysis → 409; insufficient credits → 402 before preview;
//          insert failure after a spend → refund.
//   GET  — viewer+ list for the active project.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_free" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const credits = vi.hoisted(() => ({
  canAfford: vi.fn(),
  spendCredits: vi.fn(),
  grantCredits: vi.fn(),
}));
vi.mock("@/lib/credits", async () => {
  const real = await vi.importActual<typeof import("@/lib/credits")>("@/lib/credits");
  return {
    FEATURE_COSTS: real.FEATURE_COSTS,
    canAfford: (...a: unknown[]) => credits.canAfford(...a),
    spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
    grantCredits: (...a: unknown[]) => credits.grantCredits(...a),
  };
});

const growth = vi.hoisted(() => ({ has: vi.fn<() => Promise<boolean>>(async () => false) }));
vi.mock("@/lib/funding/growth-extras", () => ({ hasGrowthExtras: () => growth.has() }));

vi.mock("@/lib/connected-revenue", () => ({ loadConnectedRevenueSignals: async () => [] }));

const issue = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/valuation-certificate/server", async () => {
  const real = await vi.importActual<typeof import("@/lib/valuation-certificate/server")>("@/lib/valuation-certificate/server");
  return {
    ...real,
    issueCertificate: async (input: Parameters<typeof real.issueCertificate>[0]) =>
      issue.fail ? { ok: false, error: "insert_failed" } : real.issueCertificate(input),
  };
});

import { GET, POST } from "./route";

const ANALYSIS = {
  version: "v3.6.8",
  totalSVI: 138,
  stage: 3,
  stageLabel: "Seed",
  sector: "saas",
  signals: { marketSize: "medium" },
  subs: [
    { key: "ftv", value: 72 },
    { key: "mpc", value: 64 },
    { key: "tre", value: 41 },
  ],
};

function seed(over: Record<string, Array<Record<string, unknown>>> = {}) {
  db.sb = fakeSupabase({
    svi_analyses: [{ id: "an-1", analysis_json: ANALYSIS, total_svi: 138, raw_input: "B2B SaaS", created_at: "2026-09-01" }],
    startup_score_history: [{ id: "sh-1", startup_name: "P", inputs: { abn: "79659615111" }, svi_analysis: null, total_score: 138, score_version: "v3.6.8" }],
    startup_metrics: [{ mrr_aud: 8_200, revenue_growth_pct: 8 }],
    svi_snapshots: [{ dimension_scores: {}, input_text: "saas" }],
    svi_accounts: [{ id: "acct-1", current_svi: 138, current_stage: 3 }],
    svi_evidence: [
      { evidence_type: "document_uploaded", dimension: "tre", verified_at: "2026-09-10T00:00:00Z" },
      { evidence_type: "public_url", dimension: "mpc", verified_at: null },
    ],
    valuation_certificates: [],
    ...over,
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState({ account: { id: "acct-1" } }));
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 12, cost: 5 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 7 });
  credits.grantCredits.mockReset().mockResolvedValue({ ok: true, balance: 12 });
  growth.has.mockReset().mockResolvedValue(false);
  issue.fail = false;
}

function post(body: unknown = {}) {
  return POST(new Request("http://localhost/api/valuation/certificate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

beforeEach(reset);

describe("POST /api/valuation/certificate — cost preview / confirm", () => {
  it("401 without a session", async () => {
    auth.user = null;
    expect((await post()).status).toBe(401);
  });

  it("previews the 5-credit cost and spends nothing when confirm is absent", async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toBe(true);
    expect(body.cost).toBe(5);
    expect(body.included).toBe(false);
    expect(body.balance).toBe(12);
    expect(body.creditNote).toBe("Charged to your credits.");
    expect(body.subject.startupName).toBe("P");
    expect(body.subject.sviScore).toBe(138);
    expect(body.subject.valuation.lowAud).toBeGreaterThan(0);
    expect(body.subject.evidence).toEqual({ total: 2, verified: 1 });
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("valuation_certificates", "insert").length).toBe(0);
  });

  it("confirm → spends 5 credits FIRST, then inserts a sealed certificate", async () => {
    const res = await post({ confirm: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.creditsCharged).toBe(5);
    expect(body.balance).toBe(7);
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "valuation_certificate", { project_id: "proj-1" });
    const inserts = db.sb!.find("valuation_certificates", "insert");
    expect(inserts.length).toBe(1);
    const row = inserts[0].args[0] as Record<string, unknown>;
    expect(row.project_id).toBe("proj-1");
    expect(row.user_id).toBe("user-caller");
    expect(row.certificate_no).toMatch(/^VC-[0-9A-HJ-NP-Z]{5}-[0-9A-HJ-NP-Z]{5}$/);
    expect(row.content_hash).toMatch(/^blockid:v1:[0-9a-f]{64}$/);
    expect(row.credits_charged).toBe(5);
    expect(row.startup_name).toBe("P");
    expect(row.svi_score).toBe(138);
    expect(row.score_history_id).toBe("sh-1");
    const payload = row.payload as Record<string, unknown>;
    expect(payload.abn).toBe("79 659 615 111");
    expect(payload.stageLabel).toBe("Seed");
    expect((payload.dimensions as unknown[]).length).toBe(8);
    expect(body.certificate.certificateNo).toBe(row.certificate_no);
    expect(body.certificate.verifyUrl).toContain(`/verify/valuation/${row.certificate_no}`);
    expect(body.certificate.pdfUrl).toMatch(/^\/api\/valuation\/certificate\/.*\/pdf$/);
  });

  it("402 before the preview when the caller cannot afford it", async () => {
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 1, cost: 5, reason: "insufficient_credits" });
    const res = await post({});
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("insufficient_credits");
    expect(body.creditsRequired).toBe(5);
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

  it("402 and nothing stored when the spend loses the race", async () => {
    credits.spendCredits.mockResolvedValue({ ok: false, balance: 0 });
    const res = await post({ confirm: true });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("credit_spend_failed");
    expect(db.sb!.find("valuation_certificates", "insert").length).toBe(0);
  });

  it("refunds the spend when the insert fails", async () => {
    issue.fail = true;
    const res = await post({ confirm: true });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("certificate_insert_failed");
    expect(credits.grantCredits).toHaveBeenCalledWith("user-caller", 5, "refund", expect.objectContaining({ feature: "valuation_certificate", reason: "certificate_insert_failed" }));
  });
});

describe("POST /api/valuation/certificate — plan gating", () => {
  it("Growth / Startup Package → included: cost 0, no canAfford, no spend, issued", async () => {
    growth.has.mockResolvedValue(true);
    const preview = await (await post({})).json();
    expect(preview.preview).toBe(true);
    expect(preview.cost).toBe(0);
    expect(preview.included).toBe(true);
    expect(preview.listedCost).toBe(5);
    expect(credits.canAfford).not.toHaveBeenCalled();

    const res = await post({ confirm: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsCharged).toBe(0);
    expect(body.included).toBe(true);
    expect(credits.spendCredits).not.toHaveBeenCalled();
    const row = db.sb!.find("valuation_certificates", "insert")[0].args[0] as Record<string, unknown>;
    expect(row.credits_charged).toBe(0);
  });

  it("409 no_svi_analysis when the project has neither an analysis nor a score snapshot", async () => {
    seed({ svi_analyses: [], startup_score_history: [] });
    const res = await post({ confirm: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_svi_analysis");
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });
});

describe("POST /api/valuation/certificate — member access", () => {
  it("editor may issue; credits are the editor's own and the subject is the OWNER's record", async () => {
    scopeState.role = "editor";
    const res = await post({ confirm: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditNote).toBe("Charged to your own credits — not the project owner's.");
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "valuation_certificate", expect.anything());
    const keyCall = scopeState.calls.find((c) => c.fn === "findSVIAccountWithFallback");
    expect(keyCall?.email).toBe("owner@x.test");
    expect(db.sb!.hasEq("svi_analyses", "email", "owner@x.test")).toBe(true);
    expect(db.sb!.hasEq("startup_score_history", "user_id", "user-owner")).toBe(true);
    const row = db.sb!.find("valuation_certificates", "insert")[0].args[0] as Record<string, unknown>;
    expect(row.user_id).toBe("user-caller");
  });

  it("viewer → 403 and nothing is read or spent", async () => {
    scopeState.role = "viewer";
    const res = await post({ confirm: true });
    expect(res.status).toBe(403);
    expect(scopeState.lastMinRole).toBe("editor");
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.calls.length).toBe(0);
  });

  it("no project → 404 project_required", async () => {
    scopeState.projectId = null;
    const res = await post({ confirm: true });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("project_required");
  });
});

describe("GET /api/valuation/certificate", () => {
  it("lists the active project's certificates for a viewer with the cost + included flags", async () => {
    scopeState.role = "viewer";
    seed({
      valuation_certificates: [
        {
          id: "c-1",
          project_id: "proj-1",
          user_id: "user-owner",
          certificate_no: "VC-AAAAA-BBBBB",
          content_hash: "blockid:v1:" + "0".repeat(64),
          payload: { version: "vc-1", valuation: { lowAud: 1, midAud: 2, highAud: 3, method: "svi", methodNote: null } },
          startup_name: "P",
          svi_score: 138,
          credits_charged: 5,
          issued_at: "2026-09-12T00:00:00Z",
          revoked_at: null,
          revoked_reason: null,
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("viewer");
    expect(body.cost).toBe(5);
    expect(body.included).toBe(false);
    expect(body.certificates.length).toBe(1);
    expect(body.certificates[0].certificateNo).toBe("VC-AAAAA-BBBBB");
    expect(body.certificates[0].method).toBe("svi");
    expect(body.certificates[0].verifyUrl).toContain("/verify/valuation/VC-AAAAA-BBBBB");
    expect(db.sb!.hasEq("valuation_certificates", "project_id", "proj-1")).toBe(true);
  });

  it("401 without a session; empty list without a project", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    reset();
    scopeState.projectId = null;
    const body = await (await GET()).json();
    expect(body.certificates).toEqual([]);
  });
});
