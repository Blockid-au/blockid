// Unit tests for POST /api/data-room/auto-fill — P9-auto-fill-route-test.
//
// Covers the AI Template Auto-Fill (T0098) route — the founder-facing entry
// point that spends 0.25 credits to fill a data-room document template with
// real startup context. Route was previously untested; this pins every branch
// the auto-fill loop depends on to keep a founder's data-room advancing.
//
// Silent regressions this pins against:
//   - dropping the "share_management" gate on POST (would leak paid auto-fill
//     to anonymous / unpaid callers — 0.25 credits per fill);
//   - flipping the isSupabaseConfigured guard order (would 500 in the DB call
//     instead of 503-ing cleanly on an unconfigured deploy);
//   - dropping the (documentId ∨ templateSlug) requirement — either would
//     let a caller spend credits on a no-op call;
//   - dropping the account_id filter on the data_room_documents fetch or
//     update — the ONLY tenancy boundary preventing a founder from filling
//     someone else's document (silent cross-tenant write / read otherwise);
//   - dropping the spendCredits call — the fill would be free;
//   - flipping the spendCredits feature key off "data_room_auto_fill" — the
//     0.25 static cost lives on that key;
//   - losing the AI-throws → placeholder-map fallback — a founder would see
//     an unfilled template and still be charged;
//   - dropping the update to status='complete' + completed_at on save — the
//     data-room readiness score reads status='complete' to count filled docs.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ── Feature-gate mock (share_management) ───────────────────────────────
const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

// ── Supabase mock — a small chain-builder fake with a FIFO response queue.
// The route calls the following chains in order (per branch):
//   1) .from("data_room_documents").select().eq().eq().maybeSingle()
//   2) .from("svi_accounts").select().eq().maybeSingle()
//   3) .from("svi_analyses").select().eq().order().limit(1).maybeSingle()
//   4) .from("startup_metrics").select().eq().order().limit(1).maybeSingle()
//   5) .from("shareholders").select().eq().order()                    (thenable)
//   6) .from("svi_evidence").select().eq().order().limit(30)          (thenable)
//   7) .from("data_room_documents").update().eq().eq()                (thenable, returns {error})
type Response = { data: unknown; error: { message: string } | null };
interface FakeState {
  fromCalls: string[];
  eqCalls: Array<{ col: string; val: unknown }>;
  updatePayload: Record<string, unknown> | null;
  updateEqAfter: Array<{ col: string; val: unknown }>;
  responses: Response[];
  afterUpdate: boolean;
}
const state: FakeState = freshState();
function freshState(): FakeState {
  return {
    fromCalls: [],
    eqCalls: [],
    updatePayload: null,
    updateEqAfter: [],
    responses: [],
    afterUpdate: false,
  };
}
function resetState() { Object.assign(state, freshState()); }
function nextResponse(): Response {
  return state.responses.shift() ?? { data: null, error: null };
}
function makeFakeSupabase() {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select(_cols?: string) { return chain; },
    eq(col: string, val: unknown) {
      state.eqCalls.push({ col, val });
      if (state.afterUpdate) state.updateEqAfter.push({ col, val });
      return chain;
    },
    order(_col: string, _opts?: unknown) { return chain; },
    limit(_n: number) { return chain; },
    update(payload: Record<string, unknown>) {
      state.updatePayload = payload;
      state.afterUpdate = true;
      return chain;
    },
    maybeSingle() { return Promise.resolve(nextResponse()); },
    then(resolve: (v: Response) => unknown) {
      return Promise.resolve(nextResponse()).then(resolve);
    },
  });
  return {
    from(table: string) {
      state.fromCalls.push(table);
      state.afterUpdate = false;
      return chain;
    },
  };
}

const isSupabaseConfiguredMock = vi.fn<() => boolean>(() => true);
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ── Credits mock ───────────────────────────────────────────────────────
const spendCreditsMock = vi.fn<
  (userId: string, feature: string, metadata?: Record<string, unknown>) =>
    Promise<{ ok: boolean; balance: number }>
>();
vi.mock("@/lib/credits", () => ({
  spendCredits: (userId: string, feature: string, metadata?: Record<string, unknown>) =>
    spendCreditsMock(userId, feature, metadata),
}));

// ── Projects mock ──────────────────────────────────────────────────────
const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdFromRequestMock(),
}));

// ── Anthropic SDK mock — captured constructor + messages.create ────────
const anthropicCreateMock = vi.fn<
  (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>
>();
const { AnthropicCtor } = vi.hoisted(() => {
  return {
    AnthropicCtor: vi.fn(function AnthropicCtor(this: unknown) {
      // Constructor is a no-op; the messages.create function is bound below.
      (this as { messages: unknown }).messages = { create: (p: Record<string, unknown>) => (globalThis as { __anthropicCreate?: unknown }).__anthropicCreate as unknown };
    }),
  };
});
// Bind the create fn onto every instance by making messages.create call our mock.
AnthropicCtor.mockImplementation(function (this: unknown) {
  (this as { messages: { create: (p: Record<string, unknown>) => unknown } }).messages = {
    create: (params: Record<string, unknown>) => anthropicCreateMock(params),
  };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: AnthropicCtor,
}));

import { POST } from "./route";

function jsonReq(body: unknown): NextRequest {
  return new Request("http://x/api/data-room/auto-fill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function rawReq(bodyText: string): NextRequest {
  return new Request("http://x/api/data-room/auto-fill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: bodyText,
  }) as unknown as NextRequest;
}

function gateOk(user: { id: string; email: string }) {
  return { ok: true, user, uwp: { id: user.id, plan: "free", segment: "founder" } };
}
function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: new Response(JSON.stringify({ ok: false, error }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  };
}

const USER = { id: "u-1", email: "founder@x.co" };

function queueDocRow(row: Record<string, unknown> | null) {
  state.responses.push({ data: row, error: null });
}
function queueEmpty(n: number) {
  for (let i = 0; i < n; i++) state.responses.push({ data: null, error: null });
}
function queueSvi(row: Record<string, unknown> | null) {
  state.responses.push({ data: row, error: null });
}
function aiText(text: string) {
  return { content: [{ type: "text", text }] };
}

beforeEach(() => {
  resetState();
  gateMock.mockReset();
  isSupabaseConfiguredMock.mockReset();
  isSupabaseConfiguredMock.mockReturnValue(true);
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  spendCreditsMock.mockReset();
  spendCreditsMock.mockResolvedValue({ ok: true, balance: 4.75 });
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-active");
  anthropicCreateMock.mockReset();
  AnthropicCtor.mockClear();
});

describe("POST /api/data-room/auto-fill — auth + config guards", () => {
  it("401s when the feature gate rejects (anonymous caller)", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    const res = await POST(jsonReq({ documentId: "doc-1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it("calls gateRequireFeature with the 'share_management' feature key", async () => {
    gateMock.mockResolvedValue(gateFail(402, "Feature locked"));
    await POST(jsonReq({ documentId: "doc-1" }));
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("503s when the Supabase project is unconfigured (guard fires before JSON parse)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(jsonReq({ documentId: "doc-1" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Database not configured");
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/data-room/auto-fill — body validation", () => {
  it("400 Invalid JSON on a body that is not JSON", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(rawReq("<not json>"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("400 when both documentId and templateSlug are missing (never charges credits)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("documentId or templateSlug required");
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/data-room/auto-fill — credits + document lookup", () => {
  it("402 when spendCredits reports insufficient balance, echoing the 0.25 static cost", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    spendCreditsMock.mockResolvedValue({ ok: false, balance: 0.1 });
    const res = await POST(jsonReq({ templateSlug: "one-pager" }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("Insufficient credits");
    expect(body.balance).toBe(0.1);
    expect(body.cost).toBe(0.25);
    // Anthropic must not be called on a 402.
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it("spends credits on the 'data_room_auto_fill' feature key with project_id + email metadata", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    spendCreditsMock.mockResolvedValue({ ok: false, balance: 0 });
    await POST(jsonReq({ templateSlug: "one-pager" }));
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    const [userId, feature, metadata] = spendCreditsMock.mock.calls[0];
    expect(userId).toBe("u-1");
    expect(feature).toBe("data_room_auto_fill");
    expect(metadata).toEqual({ email: "founder@x.co", project_id: "proj-active" });
  });

  it("404s when a documentId is supplied but no row matches on (id, account_id)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    // First .from() → data_room_documents fetch returns null.
    queueDocRow(null);
    const res = await POST(jsonReq({ documentId: "doc-missing" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Document not found");
    // The doc fetch MUST filter on both id and account_id (tenancy boundary).
    const eqOnDocs = state.eqCalls.slice(0, 2);
    expect(eqOnDocs).toEqual([
      { col: "id", val: "doc-missing" },
      { col: "account_id", val: "u-1" },
    ]);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it("skips the data_room_documents fetch entirely when only templateSlug is supplied", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    // No doc fetch → svi_accounts is the first .from() call.
    queueSvi(null); // svi_accounts empty
    // shareholders (terminal thenable) → empty array response
    state.responses.push({ data: [], error: null });
    anthropicCreateMock.mockResolvedValue(aiText("filled body"));
    const res = await POST(jsonReq({ templateSlug: "one-pager" }));
    expect(res.status).toBe(200);
    expect(state.fromCalls[0]).toBe("svi_accounts");
    expect(state.fromCalls).not.toContain("data_room_documents");
    const body = await res.json();
    expect(body.documentId).toBeNull();
    expect(body.templateSlug).toBe("one-pager");
  });
});

describe("POST /api/data-room/auto-fill — AI success path", () => {
  it("200 with AI-generated filledContent when Anthropic returns a text block", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    queueDocRow({
      id: "doc-1",
      document_name: "Investor One-Pager",
      template_content: "# Overview\nStartup: [STARTUP_NAME]\nSVI: [SVI_SCORE]",
      account_id: "u-1",
    });
    // svi_accounts, svi_analyses, startup_metrics, shareholders, svi_evidence, update
    queueSvi({ id: "svi-1", current_svi: 720, current_stage: 3, startup_name: "Acme" });
    queueEmpty(1); // svi_analyses
    queueEmpty(1); // startup_metrics
    state.responses.push({ data: [], error: null }); // shareholders
    state.responses.push({ data: [], error: null }); // svi_evidence
    state.responses.push({ data: null, error: null }); // update
    anthropicCreateMock.mockResolvedValue(aiText("# Investor One-Pager\nStartup: Acme\nSVI: 720"));

    const res = await POST(jsonReq({ documentId: "doc-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.filledContent).toContain("Startup: Acme");
    expect(body.filledContent).toContain("SVI: 720");
    expect(body.documentId).toBe("doc-1");
    expect(body.creditsUsed).toBe(0.25);
    expect(body.balance).toBe(4.75);
    expect(body.startupName).toBe("Acme");
    // Words = filledContent.split(/\s+/).length — pin the count.
    expect(body.wordsGenerated).toBe(
      "# Investor One-Pager\nStartup: Acme\nSVI: 720".split(/\s+/).length,
    );
    // Anthropic constructor was instantiated once, messages.create called once.
    expect(AnthropicCtor).toHaveBeenCalledTimes(1);
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
    // Model + max_tokens contract pinned so a silent drift doesn't burn credits.
    const [params] = anthropicCreateMock.mock.calls[0];
    expect(params.model).toBe("claude-sonnet-5");
    expect(params.max_tokens).toBe(4096);
    expect(String(params.system)).toContain("Australian startup advisor");
    expect(String((params.messages as Array<{ content: string }>)[0].content))
      .toContain("Startup Name: Acme");
  });

  it("startupProfile override supersedes the svi_accounts row for name / score / stage in the AI context", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    queueDocRow({ id: "doc-1", document_name: "X", template_content: "T", account_id: "u-1" });
    queueSvi({ id: "svi-1", current_svi: 100, current_stage: 0, startup_name: "OldName" });
    queueEmpty(2); // analyses + metrics
    state.responses.push({ data: [], error: null }); // shareholders
    state.responses.push({ data: [], error: null }); // svi_evidence
    state.responses.push({ data: null, error: null }); // update
    anthropicCreateMock.mockResolvedValue(aiText("done"));

    const res = await POST(
      jsonReq({
        documentId: "doc-1",
        startupProfile: { startup_name: "OverrideCo", svi_score: 850, stage: 4 },
      }),
    );
    expect(res.status).toBe(200);
    const [params] = anthropicCreateMock.mock.calls[0];
    const prompt = String((params.messages as Array<{ content: string }>)[0].content);
    expect(prompt).toContain("Startup Name: OverrideCo");
    expect(prompt).toContain("SVI Score: 850/1000");
    // Stage 4 → "Growth" per the stageNames map in the route.
    expect(prompt).toContain("Stage: Growth (stage 4)");
    const body = await res.json();
    expect(body.startupName).toBe("OverrideCo");
  });

  it("returns 'Failed to generate content' when Anthropic responds with a non-text first content block", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    queueDocRow({ id: "doc-1", document_name: "X", template_content: "T", account_id: "u-1" });
    queueSvi(null);
    state.responses.push({ data: [], error: null }); // shareholders
    state.responses.push({ data: null, error: null }); // update
    anthropicCreateMock.mockResolvedValue({ content: [{ type: "tool_use" }] });
    const res = await POST(jsonReq({ documentId: "doc-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filledContent).toBe("Failed to generate content");
  });

  it("persists filled content back to data_room_documents.status='complete' with account_id + id filters", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    queueDocRow({ id: "doc-1", document_name: "X", template_content: "T", account_id: "u-1" });
    queueSvi(null);
    state.responses.push({ data: [], error: null }); // shareholders
    state.responses.push({ data: null, error: null }); // update
    anthropicCreateMock.mockResolvedValue(aiText("filled body here"));

    const res = await POST(jsonReq({ documentId: "doc-1" }));
    expect(res.status).toBe(200);
    // Update payload MUST stamp status=complete + template_content + timestamps.
    expect(state.updatePayload).not.toBeNull();
    expect(state.updatePayload!.status).toBe("complete");
    expect(state.updatePayload!.template_content).toBe("filled body here");
    expect(typeof state.updatePayload!.completed_at).toBe("string");
    expect(typeof state.updatePayload!.updated_at).toBe("string");
    // The .eq() chain after update MUST filter by both id and account_id.
    expect(state.updateEqAfter).toEqual([
      { col: "id", val: "doc-1" },
      { col: "account_id", val: "u-1" },
    ]);
  });
});

describe("POST /api/data-room/auto-fill — AI failure fallback", () => {
  it("falls back to the [VARIABLE_NAME] placeholder map when Anthropic throws", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    queueDocRow({
      id: "doc-1",
      document_name: "Report",
      template_content: "Name: [STARTUP_NAME]\nSVI: [SVI_SCORE]\nUnknown: [MYSTERY_FIELD]",
      account_id: "u-1",
    });
    queueSvi({ id: "svi-1", current_svi: 420, current_stage: 2, startup_name: "FallCo" });
    queueEmpty(2); // analyses, metrics
    state.responses.push({ data: [], error: null }); // shareholders
    state.responses.push({ data: [], error: null }); // svi_evidence
    state.responses.push({ data: null, error: null }); // update
    anthropicCreateMock.mockRejectedValue(new Error("network unreachable"));
    // Silence the console.error the route emits on the AI failure path.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(jsonReq({ documentId: "doc-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Known placeholders resolve from the varMap.
    expect(body.filledContent).toContain("Name: FallCo");
    expect(body.filledContent).toContain("SVI: 420");
    // Unknown placeholders are preserved verbatim so the founder can spot them.
    expect(body.filledContent).toContain("[MYSTERY_FIELD]");
    err.mockRestore();
  });

  it("uses a synthesised fallback template when the document has no template_content", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    queueDocRow({
      id: "doc-1",
      document_name: "Blank Doc",
      template_content: null,
      account_id: "u-1",
    });
    queueSvi(null);
    state.responses.push({ data: [], error: null }); // shareholders
    state.responses.push({ data: null, error: null }); // update
    anthropicCreateMock.mockResolvedValue(aiText("generated"));

    const res = await POST(jsonReq({ documentId: "doc-1" }));
    expect(res.status).toBe(200);
    const [params] = anthropicCreateMock.mock.calls[0];
    const prompt = String((params.messages as Array<{ content: string }>)[0].content);
    // Synthesised fallback should mention the document_name so the founder
    // can tell what got filled from the AI's perspective.
    expect(prompt).toContain("Blank Doc");
  });
});
