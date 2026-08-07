// Colocated vitest for POST + DELETE /api/term-sheet — P9-term-sheet-route-test.
//
// The route is the founder-facing entry point for Term Sheet AI v2. A silent
// regression here breaks the AU-investor-standard "founder-friendly term
// sheet review" surface the P5_investor_readiness_score + P1_dataroom_map
// exit criteria depend on, because the /term-sheet dashboard is where a
// paying founder converts a raw SAFE / Series-A term sheet into a
// clause-by-clause redline, a lawyer-question checklist, and a persisted
// term_sheet_analyses row that later renders in their data room.
//
// Silent regressions this suite pins against:
//
//   - Dropping the auth guard on POST — an anon caller triggers a Claude
//     API bill and gets an analysis without spending a credit.
//   - Dropping the JSON-parse `catch` — a text/plain body 500s instead of
//     the documented `{ ok:false, error:"Invalid JSON body" }` at 400.
//   - Regressing the Zod min-length (100) or max-length (30_000) guard —
//     the founder either wastes credits on a 20-char noise input or
//     blows the Claude context window on a 200KB paste.
//   - Regressing the canAfford gate — a founder with 0 credits still
//     receives an analysis (which the model was ALREADY billed for).
//   - Regressing the "spend AFTER analysis" ordering — if analyzeTermSheet
//     throws, spendCredits must NOT fire (the credit is refunded implicitly
//     by never spending it).
//   - Regressing the projectId passthrough into spendCredits — a
//     reseller-scoped founder would spend from the wrong credit balance.
//   - Regressing the extractCompanyName regex so a valid "ACME PTY LTD"
//     in the pasted term sheet doesn't seed the SVI deep-link CTA.
//   - Regressing the headline_valuation preference order
//     (valuationCapAud → postMoneyAud → preMoneyAud → null) — the
//     dashboard's "$X pre-money" chip drifts off the analysis.
//   - Regressing the risk_level_summary "worst risk" aggregation — a
//     term sheet with a `critical` redline records as `low` and the
//     admin dashboard's "term sheets needing lawyer review" filter breaks.
//   - Regressing the sha256 text_hash — duplicate detection on repeat
//     pastes stops working and the dataroom fills with dupes.
//   - Regressing the "persist error is best-effort" branch — a Supabase
//     RLS wobble blocks the founder from receiving the analysis they
//     already paid for.
//   - Regressing the DELETE ownership guard (eq id + eq user_id) — a
//     compromised session can delete another founder's analysis by
//     guessing a uuid.
//   - Losing `export const dynamic = "force-dynamic"` — the route lands
//     in the static shell and analyses are served stale.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Types ----------------------------------------------------------------

interface AppUser {
  id: string;
  email: string;
}

interface AnalysisEnvelope {
  mode: "live" | "demo";
  analysis: {
    keyTerms: {
      valuationCapAud: number | null;
      postMoneyAud: number | null;
      preMoneyAud: number | null;
      discountPct: number | null;
      proRataRights: boolean | null;
    };
    redline: Array<{ risk_level: string }>;
  } | null;
  dilution: unknown;
}

interface InsertedRow {
  user_id: string;
  email: string;
  project_id: string | null;
  term_sheet_text_hash: string;
  raw_text: string;
  result_json: unknown;
  analysis_json: unknown;
  risk_level_summary: string | null;
  valuation_cap: number | null;
  valuation_aud: number | null;
  discount_rate: number | null;
  pro_rata: boolean | null;
  company_name: string | null;
}

interface FakeSupabaseState {
  insertedId: string | null;
  insertError: { message: string } | null;
  insertThrow: Error | null;
  deleteError: { message: string } | null;
  captured: {
    fromCalls: string[];
    insertPayloads: InsertedRow[];
    selectCols: string[];
    deleteEqPairs: Array<{ col: string; val: unknown }>;
    deleteCalled: boolean;
  };
}

// --- Mocks (registered BEFORE route import) -------------------------------

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  analyzeMock: vi.fn<(args: unknown) => Promise<AnalysisEnvelope>>(),
  canAffordMock: vi.fn<
    (userId: string, feature: string) => Promise<{
      allowed: boolean;
      balance: number;
      cost: number;
      reason?: string;
    }>
  >(),
  spendMock: vi.fn<
    (userId: string, feature: string, meta: unknown) => Promise<{ balance: number }>
  >(),
  getProjectIdMock: vi.fn<() => Promise<string | null>>(),
  lawyerQuestionsMock: vi.fn<(analysis: unknown) => Array<{ severity: string; question: string }>>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/term-sheet/analyze", () => ({
  analyzeTermSheet: (args: unknown) => mocks.analyzeMock(args),
}));

vi.mock("@/lib/credits", () => ({
  canAfford: (userId: string, feature: string) => mocks.canAffordMock(userId, feature),
  spendCredits: (userId: string, feature: string, meta: unknown) =>
    mocks.spendMock(userId, feature, meta),
  FEATURE_COSTS: { term_sheet: 1.0 },
}));

vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdMock(),
}));

vi.mock("@/lib/term-sheet-lawyer-questions", () => ({
  generateLawyerQuestions: (analysis: unknown) => mocks.lawyerQuestionsMock(analysis),
}));

import { POST, DELETE, dynamic } from "./route";

// --- Fixtures + helpers ---------------------------------------------------

const USER: AppUser = { id: "u-42", email: "founder@x.co" };

// A ≥100-char body so the Zod min guard passes without contaminating the
// tests that intentionally exercise the min-length branch.
const LONG_BODY = "SAFE agreement: valuation cap A$5,000,000. Discount rate 20%. "
  + "Pro-rata rights included. AU standard MFN clause included in this SAFE. "
  + "Investor: ACME Ventures PTY LTD. Post-money SAFE.";

function baseAnalysis(overrides: Partial<AnalysisEnvelope["analysis"]> = {}): AnalysisEnvelope {
  return {
    mode: "live",
    analysis: {
      keyTerms: {
        valuationCapAud: 5_000_000,
        postMoneyAud: 6_000_000,
        preMoneyAud: 4_000_000,
        discountPct: 20,
        proRataRights: true,
      },
      redline: [{ risk_level: "medium" }],
      ...overrides,
    } as AnalysisEnvelope["analysis"],
    dilution: null,
  };
}

function makeFakeSupabase(): { client: unknown; state: FakeSupabaseState } {
  const state: FakeSupabaseState = {
    insertedId: "row-1",
    insertError: null,
    insertThrow: null,
    deleteError: null,
    captured: {
      fromCalls: [],
      insertPayloads: [],
      selectCols: [],
      deleteEqPairs: [],
      deleteCalled: false,
    },
  };

  const client = {
    from(table: string) {
      state.captured.fromCalls.push(table);
      return {
        insert(payload: InsertedRow) {
          state.captured.insertPayloads.push(payload);
          return {
            select(cols: string) {
              state.captured.selectCols.push(cols);
              return {
                single: async () => {
                  if (state.insertThrow) throw state.insertThrow;
                  if (state.insertError) return { data: null, error: state.insertError };
                  return { data: { id: state.insertedId }, error: null };
                },
              };
            },
          };
        },
        delete() {
          state.captured.deleteCalled = true;
          const q = {
            eq(col: string, val: unknown) {
              state.captured.deleteEqPairs.push({ col, val });
              return q;
            },
            then(resolve: (value: unknown) => void) {
              return Promise.resolve({ error: state.deleteError }).then(resolve);
            },
          };
          return q;
        },
      };
    },
  };

  return { client, state };
}

function jsonPost(body: unknown): Request {
  return new Request("http://localhost/api/term-sheet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function rawPost(text: string): Request {
  return new Request("http://localhost/api/term-sheet", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: text,
  });
}

function deleteReq(id: string | null): Request {
  const url = id != null
    ? `http://localhost/api/term-sheet?id=${encodeURIComponent(id)}`
    : "http://localhost/api/term-sheet";
  return new Request(url, { method: "DELETE" });
}

beforeEach(() => {
  mocks.getCurrentUserMock.mockReset();
  mocks.getSupabaseAdminMock.mockReset();
  mocks.analyzeMock.mockReset();
  mocks.canAffordMock.mockReset();
  mocks.spendMock.mockReset();
  mocks.getProjectIdMock.mockReset();
  mocks.lawyerQuestionsMock.mockReset();

  // Sensible defaults — individual tests override as needed.
  mocks.getCurrentUserMock.mockResolvedValue(USER);
  mocks.getSupabaseAdminMock.mockReturnValue(null);
  mocks.canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 1 });
  mocks.spendMock.mockResolvedValue({ balance: 9 });
  mocks.getProjectIdMock.mockResolvedValue(null);
  mocks.lawyerQuestionsMock.mockReturnValue([]);
  mocks.analyzeMock.mockResolvedValue(baseAnalysis());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests ----------------------------------------------------------------

describe("POST /api/term-sheet — auth + body validation", () => {
  it("returns 401 when getCurrentUser resolves null (no analyzer / no credit hit)", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "Authentication required" });
    expect(mocks.analyzeMock).not.toHaveBeenCalled();
    expect(mocks.canAffordMock).not.toHaveBeenCalled();
    expect(mocks.spendMock).not.toHaveBeenCalled();
  });

  it("returns 400 with 'Invalid JSON body' on a non-JSON payload", async () => {
    const res = await POST(rawPost("<<not json>>"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(mocks.analyzeMock).not.toHaveBeenCalled();
    expect(mocks.canAffordMock).not.toHaveBeenCalled();
  });

  it("returns 400 with a Zod path-scoped error on termSheet under the 100-char floor", async () => {
    const res = await POST(jsonPost({ termSheet: "too short" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("termSheet");
    expect(String(body.error)).toMatch(/min 100 chars|too short/i);
    expect(mocks.analyzeMock).not.toHaveBeenCalled();
  });

  it("returns 400 when termSheet exceeds the 30,000-char cap", async () => {
    const oversize = "x".repeat(30_001);
    const res = await POST(jsonPost({ termSheet: oversize }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/30,?000 characters|too long/i);
    expect(mocks.analyzeMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 100 chars (inclusive floor)", async () => {
    const exact = "A".repeat(100);
    const res = await POST(jsonPost({ termSheet: exact }));
    expect(res.status).toBe(200);
    expect(mocks.analyzeMock).toHaveBeenCalledTimes(1);
  });

  it("rejects at 99 chars (below floor by 1)", async () => {
    const under = "A".repeat(99);
    const res = await POST(jsonPost({ termSheet: under }));
    expect(res.status).toBe(400);
    expect(mocks.analyzeMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the capTable holder is missing required fields", async () => {
    const res = await POST(
      jsonPost({
        termSheet: LONG_BODY,
        capTable: [{ id: "h1", name: "Ava" }], // missing shares + shareClass
      }),
    );
    expect(res.status).toBe(400);
    expect(mocks.analyzeMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the round has the wrong shape", async () => {
    const res = await POST(
      jsonPost({
        termSheet: LONG_BODY,
        round: { preMoneyAud: "not-a-number" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts capTable=null + round=null as documented optional shape", async () => {
    const res = await POST(jsonPost({ termSheet: LONG_BODY, capTable: null, round: null }));
    expect(res.status).toBe(200);
    expect(mocks.analyzeMock).toHaveBeenCalledWith({
      termSheet: LONG_BODY,
      capTable: null,
      round: null,
    });
  });
});

describe("POST /api/term-sheet — credit gate", () => {
  it("returns 402 with balance + cost when canAfford denies", async () => {
    mocks.canAffordMock.mockResolvedValueOnce({
      allowed: false,
      balance: 0.25,
      cost: 1,
      reason: "insufficient_credits",
    });
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "Insufficient credits",
      balance: 0.25,
      cost: 1,
    });
    expect(mocks.analyzeMock).not.toHaveBeenCalled();
    expect(mocks.spendMock).not.toHaveBeenCalled();
    expect(mocks.getProjectIdMock).not.toHaveBeenCalled();
  });

  it("passes user.id + 'term_sheet' into canAfford", async () => {
    await POST(jsonPost({ termSheet: LONG_BODY }));
    expect(mocks.canAffordMock).toHaveBeenCalledWith("u-42", "term_sheet");
  });
});

describe("POST /api/term-sheet — analysis + spend ordering", () => {
  it("calls analyzeTermSheet with the parsed body and then spendCredits with the resolved projectId", async () => {
    mocks.getProjectIdMock.mockResolvedValueOnce("proj-1");
    const res = await POST(
      jsonPost({
        termSheet: LONG_BODY,
        capTable: [
          {
            id: "h1",
            name: "Ava",
            shares: 100,
            shareClass: "common",
            isFounder: true,
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.analyzeMock).toHaveBeenCalledWith({
      termSheet: LONG_BODY,
      capTable: [
        {
          id: "h1",
          name: "Ava",
          shares: 100,
          shareClass: "common",
          isFounder: true,
        },
      ],
      round: null,
    });
    expect(mocks.spendMock).toHaveBeenCalledWith("u-42", "term_sheet", {
      project_id: "proj-1",
    });
  });

  it("does NOT spend credits when analyzeTermSheet throws (implicit refund)", async () => {
    mocks.analyzeMock.mockRejectedValueOnce(new Error("Anthropic 500"));
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Analysis failed" });
    expect(mocks.spendMock).not.toHaveBeenCalled();
  });

  it("forwards project_id=null when no active project is resolved", async () => {
    await POST(jsonPost({ termSheet: LONG_BODY }));
    expect(mocks.spendMock).toHaveBeenCalledWith("u-42", "term_sheet", {
      project_id: null,
    });
  });

  it("passes the analysis object into generateLawyerQuestions and echoes the result", async () => {
    const analysis = baseAnalysis();
    mocks.analyzeMock.mockResolvedValueOnce(analysis);
    const lqs = [{ severity: "red", question: "Why 2x participating pref?" }];
    mocks.lawyerQuestionsMock.mockReturnValueOnce(lqs);
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    const body = await res.json();
    expect(mocks.lawyerQuestionsMock).toHaveBeenCalledWith(analysis.analysis);
    expect(body.lawyer_questions_v2).toEqual(lqs);
  });
});

describe("POST /api/term-sheet — response envelope", () => {
  it("echoes analysis mode + dilution + balance + credits_used + headline valuation", async () => {
    const analysis = baseAnalysis({
      keyTerms: {
        valuationCapAud: 8_000_000,
        postMoneyAud: 9_000_000,
        preMoneyAud: 7_500_000,
        discountPct: 15,
        proRataRights: true,
      },
    });
    mocks.analyzeMock.mockResolvedValueOnce(analysis);
    mocks.spendMock.mockResolvedValueOnce({ balance: 8.5 });
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("live");
    expect(body.dilution).toBeNull();
    expect(body.balance).toBe(8.5);
    expect(body.creditsUsed).toBe(1.0);
    expect(body.headline_valuation_aud).toBe(8_000_000);
    // FEATURE_COSTS.term_sheet from the credits module (mocked to 1.0)
    expect(body.creditsUsed).toBe(1.0);
  });

  it("sets Cache-Control: private, no-store on the 200 response", async () => {
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns analysis_id=null when Supabase is not configured", async () => {
    mocks.getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    const body = await res.json();
    expect(body.analysis_id).toBeNull();
  });

  it("falls back to postMoneyAud when valuationCapAud is null (headline_valuation preference order)", async () => {
    mocks.analyzeMock.mockResolvedValueOnce(
      baseAnalysis({
        keyTerms: {
          valuationCapAud: null,
          postMoneyAud: 12_000_000,
          preMoneyAud: 10_000_000,
          discountPct: null,
          proRataRights: null,
        },
      }),
    );
    const body = await (await POST(jsonPost({ termSheet: LONG_BODY }))).json();
    expect(body.headline_valuation_aud).toBe(12_000_000);
  });

  it("falls back to preMoneyAud when valuationCapAud + postMoneyAud are both null", async () => {
    mocks.analyzeMock.mockResolvedValueOnce(
      baseAnalysis({
        keyTerms: {
          valuationCapAud: null,
          postMoneyAud: null,
          preMoneyAud: 3_500_000,
          discountPct: null,
          proRataRights: null,
        },
      }),
    );
    const body = await (await POST(jsonPost({ termSheet: LONG_BODY }))).json();
    expect(body.headline_valuation_aud).toBe(3_500_000);
  });

  it("returns headline_valuation_aud=null when all three valuation fields are null", async () => {
    mocks.analyzeMock.mockResolvedValueOnce(
      baseAnalysis({
        keyTerms: {
          valuationCapAud: null,
          postMoneyAud: null,
          preMoneyAud: null,
          discountPct: null,
          proRataRights: null,
        },
      }),
    );
    const body = await (await POST(jsonPost({ termSheet: LONG_BODY }))).json();
    expect(body.headline_valuation_aud).toBeNull();
  });
});

describe("POST /api/term-sheet — company name extraction", () => {
  it("extracts a PTY LTD company name from the first 400 chars", async () => {
    const body = await (await POST(jsonPost({ termSheet: "Acme Widgets PTY LTD" + " ".repeat(90) }))).json();
    expect(body.company_name).toMatch(/Acme Widgets\s+PTY\s+LTD/);
  });

  it("extracts a LIMITED variant (case-sensitive — the extractor requires the uppercase suffix)", async () => {
    const ts = "Term Sheet: this document is between FooBar LIMITED and the investor "
      + "and covers the AU$5m raise into ".padEnd(150, "x");
    const body = await (await POST(jsonPost({ termSheet: ts }))).json();
    expect(body.company_name).toMatch(/FooBar\s+LIMITED/);
  });

  it("returns company_name=null when no PTY LTD / LIMITED / INC / CORP / LLC / CO. match exists in the first 400 chars", async () => {
    const ts = "This term sheet has no capitalised legal-entity suffix in the first "
      + "four hundred characters and is padded ".padEnd(200, "x");
    const body = await (await POST(jsonPost({ termSheet: ts }))).json();
    expect(body.company_name).toBeNull();
  });

  it("stops scanning after 400 chars — a PTY LTD at position 500 is not matched", async () => {
    const ts = "no match in the first 400 chars ".repeat(20) + " ACME PTY LTD";
    // First 400 chars have no match; PTY LTD lives past the head window.
    const body = await (await POST(jsonPost({ termSheet: ts }))).json();
    expect(body.company_name).toBeNull();
  });

  it("truncates company names longer than 120 chars to 120", async () => {
    const longName = "X".repeat(130);
    const ts = `${longName} PTY LTD investor terms follow`.padEnd(150, "y");
    const body = await (await POST(jsonPost({ termSheet: ts }))).json();
    // "PTY LTD" appended to a 130-char prefix would exceed 120; guard slices.
    expect(String(body.company_name).length).toBeLessThanOrEqual(120);
  });
});

describe("POST /api/term-sheet — persistence", () => {
  it("inserts into term_sheet_analyses when supabase is configured, populating the summary columns", async () => {
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValueOnce(client);
    mocks.getProjectIdMock.mockResolvedValueOnce("proj-abc");
    const analysis = baseAnalysis({
      keyTerms: {
        valuationCapAud: 5_000_000,
        postMoneyAud: 6_000_000,
        preMoneyAud: 4_000_000,
        discountPct: 20,
        proRataRights: false,
      },
      redline: [{ risk_level: "medium" }, { risk_level: "critical" }, { risk_level: "low" }],
    });
    mocks.analyzeMock.mockResolvedValueOnce(analysis);
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    const body = await res.json();
    expect(body.analysis_id).toBe("row-1");
    expect(state.captured.fromCalls).toContain("term_sheet_analyses");
    expect(state.captured.selectCols).toContain("id");
    const row = state.captured.insertPayloads[0];
    expect(row.user_id).toBe("u-42");
    expect(row.email).toBe("founder@x.co");
    expect(row.project_id).toBe("proj-abc");
    expect(row.raw_text).toBe(LONG_BODY);
    expect(row.result_json).toBe(analysis.analysis);
    expect(row.analysis_json).toBe(analysis.analysis);
    expect(row.risk_level_summary).toBe("critical");
    expect(row.valuation_cap).toBe(5_000_000);
    expect(row.valuation_aud).toBe(5_000_000);
    expect(row.discount_rate).toBe(20);
    expect(row.pro_rata).toBe(false);
    // sha256 hex is 64 chars, lowercase.
    expect(row.term_sheet_text_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stamps the same sha256 hash for the same term sheet text across calls (idempotent hash)", async () => {
    const runOnce = async () => {
      const { client, state } = makeFakeSupabase();
      mocks.getSupabaseAdminMock.mockReturnValueOnce(client);
      await POST(jsonPost({ termSheet: LONG_BODY }));
      return state.captured.insertPayloads[0].term_sheet_text_hash;
    };
    const [a, b] = await Promise.all([runOnce(), runOnce()]);
    expect(a).toBe(b);
  });

  it("stamps a DIFFERENT sha256 hash when the term sheet text differs by one char", async () => {
    const { client: c1, state: s1 } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValueOnce(c1);
    await POST(jsonPost({ termSheet: LONG_BODY }));
    const { client: c2, state: s2 } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValueOnce(c2);
    await POST(jsonPost({ termSheet: `${LONG_BODY}!` }));
    expect(s1.captured.insertPayloads[0].term_sheet_text_hash).not.toBe(
      s2.captured.insertPayloads[0].term_sheet_text_hash,
    );
  });

  it("picks the worst risk level using the {critical:4, high:3, medium:2, low:1} priority ladder", async () => {
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValueOnce(client);
    mocks.analyzeMock.mockResolvedValueOnce(
      baseAnalysis({
        keyTerms: {
          valuationCapAud: null,
          postMoneyAud: null,
          preMoneyAud: null,
          discountPct: null,
          proRataRights: null,
        },
        redline: [
          { risk_level: "low" },
          { risk_level: "high" },
          { risk_level: "medium" },
        ],
      }),
    );
    await POST(jsonPost({ termSheet: LONG_BODY }));
    expect(state.captured.insertPayloads[0].risk_level_summary).toBe("high");
  });

  it("sets risk_level_summary=null when redline is empty", async () => {
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValueOnce(client);
    mocks.analyzeMock.mockResolvedValueOnce(
      baseAnalysis({
        keyTerms: {
          valuationCapAud: 1,
          postMoneyAud: null,
          preMoneyAud: null,
          discountPct: null,
          proRataRights: null,
        },
        redline: [],
      }),
    );
    await POST(jsonPost({ termSheet: LONG_BODY }));
    expect(state.captured.insertPayloads[0].risk_level_summary).toBeNull();
  });

  it("does NOT persist when analysis.analysis is null (demo-mode / model-refused branch)", async () => {
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValueOnce(client);
    mocks.analyzeMock.mockResolvedValueOnce({
      mode: "demo",
      analysis: null,
      dilution: null,
    });
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.analysis_id).toBeNull();
    expect(state.captured.fromCalls).toEqual([]);
  });

  it("swallows an insert() error (result stays 200, analysis_id=null)", async () => {
    const { client, state } = makeFakeSupabase();
    state.insertError = { message: "duplicate key" };
    mocks.getSupabaseAdminMock.mockReturnValueOnce(client);
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.analysis_id).toBeNull();
  });

  it("swallows an unexpected throw during persistence (best-effort branch)", async () => {
    const { client, state } = makeFakeSupabase();
    state.insertThrow = new Error("network reset");
    mocks.getSupabaseAdminMock.mockReturnValueOnce(client);
    const res = await POST(jsonPost({ termSheet: LONG_BODY }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.analysis_id).toBeNull();
  });
});

describe("DELETE /api/term-sheet", () => {
  it("returns 401 when getCurrentUser resolves null", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(deleteReq("row-1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
  });

  it("returns 400 when ?id= is missing", async () => {
    const res = await DELETE(deleteReq(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Missing id" });
  });

  it("returns 503 when Supabase is not configured", async () => {
    mocks.getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await DELETE(deleteReq("row-1"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Storage unavailable" });
  });

  it("scopes DELETE by id AND user_id (ownership guard) and returns { ok: true } on success", async () => {
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValueOnce(client);
    const res = await DELETE(deleteReq("row-9"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(state.captured.deleteCalled).toBe(true);
    // Both filters must be present — id AND user_id — so a caller cannot
    // delete another founder's analysis by guessing a uuid.
    expect(state.captured.deleteEqPairs).toEqual([
      { col: "id", val: "row-9" },
      { col: "user_id", val: "u-42" },
    ]);
    expect(state.captured.fromCalls).toContain("term_sheet_analyses");
  });

  it("returns 500 with a scrubbed error message when Supabase errors on delete", async () => {
    const { client, state } = makeFakeSupabase();
    state.deleteError = { message: "column mismatch" };
    mocks.getSupabaseAdminMock.mockReturnValueOnce(client);
    const res = await DELETE(deleteReq("row-1"));
    const body = await res.json();
    expect(res.status).toBe(500);
    // Route intentionally does NOT leak the underlying supabase error message.
    expect(body).toEqual({ ok: false, error: "Delete failed" });
  });
});

describe("module exports", () => {
  it("exports dynamic = 'force-dynamic' so the route never lands in the static shell", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
