// Colocated vitest for POST /api/evaluation/[criterionKey]/ai-suggest — P9-eval-ai-suggest-route-test.
//
// The route is the founder-facing "improve this criterion" surface. It reads
// whatever evidence rows the founder has already stored for one of the 13
// CRITERION_KEYS, sends them to the free-model pool via callAI, parses a
// { suggestions[], qualityTips[] } envelope, spends 0.10 credits, and (when
// there is a persisted row) writes ai_suggestions back onto the
// evaluation_criteria row keyed on (account_id, criterion_key). Sibling of
// the ai-score route which was previously pinned by ai-score/route.test.ts.
//
// Silent regressions this suite pins against:
//
//   - Dropping the getCurrentUser() 401 gate so any visitor can burn free-tier
//     AI credits against another founder's evidence.
//   - Dropping the isAIConfigured() 503 gate so a mis-provisioned prod calls
//     callAI() with no upstream and 500s the /evaluate page.
//   - Dropping the getSupabaseAdmin() 503 gate so a mis-provisioned prod
//     crashes with a raw TypeError instead of the documented envelope.
//   - Regressing the CRITERION_KEYS whitelist so an attacker can request
//     suggestions for an arbitrary criterion_key string and write a poisoned
//     row downstream reports would join to.
//   - Dropping the canAfford() 402 gate so a founder on 0 credits still
//     triggers an AI call — free-model pool would be drained per-tenant.
//   - Regressing the JSON parse fallback (`text.match(/\{[\s\S]*\}/)`) so
//     any model that wraps the envelope in prose 500s the route.
//   - Regressing the try/catch so a raw AI error surfaces to the widget with
//     no envelope — the /evaluate UI would render a blank card.
//   - Spending credits BEFORE the AI call so a rate-limit-refusal burns credit.
//   - Dropping the `.eq("account_id", account.id)` filter on the criterion
//     read so a founder's suggestions are computed against another founder's
//     evidence.
//   - Dropping the `if (criterionRow && account)` guard on the write so a
//     brand-new founder with no persisted row triggers a phantom update.
//   - Regressing the `Array.isArray(...) ? … : []` coercion so a model that
//     returns `suggestions: "one, two"` blows up the widget's `.map()`.
//   - Losing `export const dynamic = "force-dynamic"` — this route reads
//     per-request auth state and cannot be pinned to the build cache.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string } | null>>(),
  getSupabaseAdmin: vi.fn<() => unknown | null>(),
  isAIConfigured: vi.fn<() => boolean>(),
  callAI: vi.fn<(opts: unknown) => Promise<{ text: string }>>(),
  canAfford: vi.fn<
    (userId: string, feature: string) => Promise<{
      allowed: boolean;
      balance: number;
      cost: number;
      reason?: string;
    }>
  >(),
  spendCredits: vi.fn<
    (userId: string, feature: string, meta?: unknown) => Promise<{ ok: boolean; balance: number }>
  >(),
  getProjectIdFromRequest: vi.fn<() => Promise<string | null>>(),
  findSVIAccountWithFallback: vi.fn<
    (email: string, projectId: string | null) => Promise<Record<string, unknown> | null>
  >(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));
vi.mock("@/lib/ai-client", () => ({
  isAIConfigured: () => mocks.isAIConfigured(),
  callAI: (opts: unknown) => mocks.callAI(opts),
}));
vi.mock("@/lib/credits", () => ({
  FEATURE_COSTS: { criterion_ai_suggest: 0.1 },
  canAfford: (userId: string, feature: string) => mocks.canAfford(userId, feature),
  spendCredits: (userId: string, feature: string, meta?: unknown) =>
    mocks.spendCredits(userId, feature, meta),
}));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
  findSVIAccountWithFallback: (email: string, projectId: string | null) =>
    mocks.findSVIAccountWithFallback(email, projectId),
}));

import { POST, dynamic } from "./route";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";

// ---------------------------------------------------------------------------
// Fake supabase — records the read against evaluation_criteria and captures
// the update payload + eq filters.
// ---------------------------------------------------------------------------

interface CriteriaEq {
  col: string;
  val: unknown;
}
interface UpdateCall {
  payload: Record<string, unknown>;
  eqs: CriteriaEq[];
}
interface FakeState {
  criteriaRow: Record<string, unknown> | null;
  selectEqs: CriteriaEq[];
  selectCols: string | null;
  updates: UpdateCall[];
}

let state: FakeState;

function makeSupabase(): unknown {
  return {
    from(table: string) {
      if (table !== "evaluation_criteria") {
        throw new Error(`unexpected table: ${table}`);
      }
      // ── SELECT chain ────────────────────────────────────────────────
      const selectApi: Record<string, unknown> = {};
      selectApi.eq = (col: string, val: unknown) => {
        state.selectEqs.push({ col, val });
        return selectApi;
      };
      selectApi.maybeSingle = () => Promise.resolve({ data: state.criteriaRow });

      // ── UPDATE chain — thenable so `await update().eq().eq()` works ─
      function makeUpdate(payload: Record<string, unknown>): Record<string, unknown> {
        const call: UpdateCall = { payload, eqs: [] };
        state.updates.push(call);
        const api: Record<string, unknown> = {};
        api.eq = (col: string, val: unknown) => {
          call.eqs.push({ col, val });
          return api;
        };
        // thenable — awaiting the chain resolves to { error: null }
        (api as { then?: unknown }).then = (
          resolve: (v: { error: null }) => unknown,
        ) => resolve({ error: null });
        return api;
      }

      return {
        select: (cols: string) => {
          state.selectCols = cols;
          return selectApi;
        },
        update: (payload: Record<string, unknown>) => makeUpdate(payload),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const USER = { id: "user-1", email: "founder@example.com" };
const ACCOUNT = {
  id: "acct-1",
  startup_name: "Acme",
  current_svi: 140,
};
const AI_ENVELOPE = {
  suggestions: [
    "Add a competitor matrix",
    "Cite market size sources",
    "Include GTM channels",
    "Attach three design-partner LOIs",
    "Publish a 90-second product tour",
  ],
  qualityTips: [
    "Bring the evidence count up from 1 to 3 to reach 'good'.",
    "Investors want to see triangulated sources, not vibes.",
    "Do not paste a single Notion doc as the entire criterion.",
  ],
};

function paramsOf(key: string) {
  return { params: Promise.resolve({ criterionKey: key }) };
}

function req(): Request {
  return new Request("http://x/api/evaluation/idea/ai-suggest", { method: "POST" });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  state = {
    criteriaRow: {
      text_input: "We solve X for Y using Z; validated with 12 design partners.",
      files: [{ name: "one-pager.pdf", type: "application/pdf" }],
      links: [{ url: "https://acme.co", label: "Landing" }],
      quality_level: "basic",
      ai_score: 62,
    },
    selectEqs: [],
    selectCols: null,
    updates: [],
  };
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase());
  mocks.isAIConfigured.mockReturnValue(true);
  mocks.callAI.mockResolvedValue({ text: JSON.stringify(AI_ENVELOPE) });
  mocks.canAfford.mockResolvedValue({ allowed: true, balance: 10, cost: 0.1 });
  mocks.spendCredits.mockResolvedValue({ ok: true, balance: 9.9 });
  mocks.getProjectIdFromRequest.mockResolvedValue("proj-1");
  mocks.findSVIAccountWithFallback.mockResolvedValue(ACCOUNT);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// dynamic export
// ---------------------------------------------------------------------------

describe("route module", () => {
  it("exports dynamic='force-dynamic' — per-request auth state must NOT be cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe("POST — auth gate", () => {
  it("returns 401 with the documented envelope when getCurrentUser() is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Authentication required" });
  });

  it("401 never runs isAIConfigured / canAfford / callAI / spendCredits — no side effects", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(req(), paramsOf("idea"));
    expect(mocks.isAIConfigured).not.toHaveBeenCalled();
    expect(mocks.canAfford).not.toHaveBeenCalled();
    expect(mocks.callAI).not.toHaveBeenCalled();
    expect(mocks.spendCredits).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AI-configured gate
// ---------------------------------------------------------------------------

describe("POST — AI-configured gate", () => {
  it("returns 503 with the documented envelope when isAIConfigured() is false", async () => {
    mocks.isAIConfigured.mockReturnValue(false);
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "AI service not configured" });
  });

  it("503 (AI not configured) never touches Supabase, credits, or callAI", async () => {
    mocks.isAIConfigured.mockReturnValue(false);
    await POST(req(), paramsOf("idea"));
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.canAfford).not.toHaveBeenCalled();
    expect(mocks.callAI).not.toHaveBeenCalled();
    expect(mocks.spendCredits).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Supabase gate
// ---------------------------------------------------------------------------

describe("POST — Supabase gate", () => {
  it("returns 503 with the documented envelope when getSupabaseAdmin() is null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Database unavailable" });
  });

  it("503 (no DB) never spends credits or calls the model", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    await POST(req(), paramsOf("idea"));
    expect(mocks.callAI).not.toHaveBeenCalled();
    expect(mocks.spendCredits).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CriterionKey whitelist
// ---------------------------------------------------------------------------

describe("POST — CRITERION_KEYS whitelist", () => {
  it("returns 400 when criterionKey is not in the 13-key whitelist", async () => {
    const res = await POST(req(), paramsOf("not-a-real-key"));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("Invalid criterion key");
  });

  it("400 error message enumerates every valid key so the founder sees the whitelist", async () => {
    const res = await POST(req(), paramsOf("bogus"));
    const body = await jsonOf(res);
    for (const key of CRITERION_KEYS) {
      expect(String(body.error)).toContain(key);
    }
  });

  it("400 (bad criterion) never spends credits, calls canAfford, or calls the model", async () => {
    await POST(req(), paramsOf("bogus"));
    expect(mocks.callAI).not.toHaveBeenCalled();
    expect(mocks.spendCredits).not.toHaveBeenCalled();
    expect(mocks.canAfford).not.toHaveBeenCalled();
  });

  it("accepts every one of the 13 whitelisted CRITERION_KEYS without a 400 (route reaches AI call)", async () => {
    for (const key of CRITERION_KEYS) {
      mocks.callAI.mockClear();
      const res = await POST(req(), paramsOf(key));
      expect(res.status).toBe(200);
      expect(mocks.callAI).toHaveBeenCalledTimes(1);
    }
  });
});

// ---------------------------------------------------------------------------
// canAfford gate
// ---------------------------------------------------------------------------

describe("POST — canAfford gate", () => {
  it("returns 402 with balance+cost when canAfford is disallowed", async () => {
    mocks.canAfford.mockResolvedValue({
      allowed: false,
      balance: 0.05,
      cost: 0.1,
      reason: "insufficient_credits",
    });
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(402);
    const body = await jsonOf(res);
    expect(body).toMatchObject({ ok: false, error: "Insufficient credits", balance: 0.05, cost: 0.1 });
  });

  it("402 (no credits) never calls the AI model or spendCredits", async () => {
    mocks.canAfford.mockResolvedValue({ allowed: false, balance: 0, cost: 0.1 });
    await POST(req(), paramsOf("idea"));
    expect(mocks.callAI).not.toHaveBeenCalled();
    expect(mocks.spendCredits).not.toHaveBeenCalled();
  });

  it("canAfford is called with (user.id, 'criterion_ai_suggest')", async () => {
    await POST(req(), paramsOf("idea"));
    expect(mocks.canAfford).toHaveBeenCalledWith("user-1", "criterion_ai_suggest");
  });
});

// ---------------------------------------------------------------------------
// callAI invocation shape
// ---------------------------------------------------------------------------

describe("POST — callAI invocation shape", () => {
  it("passes system + user + maxTokens=1500 (the seam ADK/free-model pool depends on)", async () => {
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as {
      system: string;
      user: string;
      maxTokens: number;
    };
    expect(typeof args.system).toBe("string");
    expect(typeof args.user).toBe("string");
    expect(args.maxTokens).toBe(1500);
  });

  it("system prompt anchors the criterion title so the model does not free-associate", async () => {
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { system: string };
    expect(args.system).toContain("Idea & Innovation");
  });

  it("system prompt anchors the AU context (ASIC / ATO / AU investor expectations)", async () => {
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { system: string };
    // System prompt must mention Australia — the whole product is AU-native.
    expect(args.system).toMatch(/Australian|ASIC|ATO/);
  });

  it("user prompt includes the startup name from the SVI account", async () => {
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(args.user).toContain("Acme");
  });

  it("user prompt falls back to 'Unknown Startup' when the account has no startup_name", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue({ id: "acct-1" });
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(args.user).toContain("Unknown Startup");
  });

  it("user prompt falls back to 'Unknown Startup' when there is no account row at all", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue(null);
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(args.user).toContain("Unknown Startup");
  });

  it("user prompt truncates textInput at 1000 chars — protects the token budget", async () => {
    const long = "A".repeat(3000);
    state.criteriaRow = {
      text_input: long,
      files: [],
      links: [],
      quality_level: "basic",
      ai_score: null,
    };
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    // Neither 3000 chars nor 1001-A run should leak through — the .slice(0, 1000)
    // cap MUST hold or the free-model pool blows its per-call token budget.
    expect(args.user).not.toContain("A".repeat(1001));
    expect(args.user).toContain("A".repeat(1000));
  });

  it("user prompt renders 'No text input provided.' when the row has no text", async () => {
    state.criteriaRow = {
      text_input: "",
      files: [],
      links: [],
      quality_level: "incomplete",
      ai_score: null,
    };
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(args.user).toContain("No text input provided.");
  });

  it("user prompt renders 'No files uploaded.' + 'No links provided.' when both are empty", async () => {
    state.criteriaRow = {
      text_input: "we have text",
      files: [],
      links: [],
      quality_level: "basic",
      ai_score: null,
    };
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(args.user).toContain("No files uploaded.");
    expect(args.user).toContain("No links provided.");
  });

  it("user prompt lists file names + types when files are attached", async () => {
    state.criteriaRow = {
      text_input: "",
      files: [
        { name: "deck.pdf", type: "application/pdf" },
        { name: "financials.xlsx", type: "application/vnd.ms-excel" },
      ],
      links: [],
      quality_level: "basic",
      ai_score: null,
    };
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(args.user).toContain("deck.pdf");
    expect(args.user).toContain("financials.xlsx");
  });

  it("user prompt lists link labels (or URLs when label empty) when links exist", async () => {
    state.criteriaRow = {
      text_input: "",
      files: [],
      links: [
        { url: "https://acme.co", label: "Landing" },
        { url: "https://demo.acme.co", label: "" },
      ],
      quality_level: "basic",
      ai_score: null,
    };
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(args.user).toContain("Landing");
    expect(args.user).toContain("https://demo.acme.co");
  });

  it("user prompt renders 'Not yet scored' when ai_score is null on the row", async () => {
    state.criteriaRow = {
      text_input: "we have text",
      files: [],
      links: [],
      quality_level: "basic",
      ai_score: null,
    };
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(args.user).toContain("Not yet scored");
  });

  it("user prompt renders the numeric ai_score when the row has one", async () => {
    state.criteriaRow = {
      text_input: "we have text",
      files: [],
      links: [],
      quality_level: "good",
      ai_score: 78,
    };
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(args.user).toContain("78/100");
  });

  it("user prompt embeds every guidingQuestion from the criterion def", async () => {
    await POST(req(), paramsOf("idea"));
    const args = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    // The idea criterion has 4 guiding questions — pin one of them explicitly
    // so a future edit that drops the list is caught.
    expect(args.user).toContain("What problem does your idea solve?");
  });
});

// ---------------------------------------------------------------------------
// JSON parse (raw + regex fallback)
// ---------------------------------------------------------------------------

describe("POST — JSON parse fallback", () => {
  it("parses a raw JSON envelope directly", async () => {
    mocks.callAI.mockResolvedValue({ text: JSON.stringify(AI_ENVELOPE) });
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.suggestions).toEqual(AI_ENVELOPE.suggestions);
  });

  it("extracts the JSON envelope from prose-wrapped model output via regex fallback", async () => {
    mocks.callAI.mockResolvedValue({
      text: `Sure! Here are some suggestions:\n\n${JSON.stringify(AI_ENVELOPE)}\n\nHope that helps.`,
    });
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.suggestions).toEqual(AI_ENVELOPE.suggestions);
    expect(body.qualityTips).toEqual(AI_ENVELOPE.qualityTips);
  });

  it("returns 500 with the documented envelope when the model returns non-JSON prose", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.callAI.mockResolvedValue({ text: "I cannot help with that." });
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "AI suggestion generation failed" });
    errorSpy.mockRestore();
  });

  it("does NOT spend credits when the AI response is unparseable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.callAI.mockResolvedValue({ text: "totally not json" });
    await POST(req(), paramsOf("idea"));
    expect(mocks.spendCredits).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// suggestions / qualityTips coercion
// ---------------------------------------------------------------------------

describe("POST — suggestions/qualityTips coercion", () => {
  it("defaults non-array suggestions to [] (widget expects an array)", async () => {
    mocks.callAI.mockResolvedValue({
      text: JSON.stringify({ suggestions: "one, two", qualityTips: [] }),
    });
    const res = await POST(req(), paramsOf("idea"));
    expect((await jsonOf(res)).suggestions).toEqual([]);
  });

  it("defaults non-array qualityTips to [] (widget expects an array)", async () => {
    mocks.callAI.mockResolvedValue({
      text: JSON.stringify({ suggestions: [], qualityTips: 42 }),
    });
    const res = await POST(req(), paramsOf("idea"));
    expect((await jsonOf(res)).qualityTips).toEqual([]);
  });

  it("preserves suggestion + qualityTip order verbatim from the model", async () => {
    const ordered = {
      suggestions: ["c", "a", "b"],
      qualityTips: ["z", "y"],
    };
    mocks.callAI.mockResolvedValue({ text: JSON.stringify(ordered) });
    const res = await POST(req(), paramsOf("idea"));
    const body = await jsonOf(res);
    expect(body.suggestions).toEqual(["c", "a", "b"]);
    expect(body.qualityTips).toEqual(["z", "y"]);
  });
});

// ---------------------------------------------------------------------------
// spendCredits — happens AFTER successful AI call
// ---------------------------------------------------------------------------

describe("POST — spendCredits ordering", () => {
  it("only spends credits after a successful, parseable AI call", async () => {
    await POST(req(), paramsOf("idea"));
    expect(mocks.spendCredits).toHaveBeenCalledTimes(1);
    expect(mocks.spendCredits).toHaveBeenCalledWith(
      "user-1",
      "criterion_ai_suggest",
      expect.objectContaining({
        criterionKey: "idea",
        currentQuality: "basic",
      }),
    );
  });

  it("does not spend credits when callAI throws (rate-limit / upstream 429)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.callAI.mockRejectedValue(new Error("upstream 429"));
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(500);
    expect(mocks.spendCredits).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("response body carries balance from spendCredits + creditsUsed from FEATURE_COSTS", async () => {
    const res = await POST(req(), paramsOf("idea"));
    const body = await jsonOf(res);
    expect(body.balance).toBe(9.9);
    expect(body.creditsUsed).toBe(0.1);
  });

  it("meta.currentQuality falls back to 'incomplete' when the row has no quality_level", async () => {
    state.criteriaRow = { text_input: "x", files: [], links: [] };
    await POST(req(), paramsOf("idea"));
    expect(mocks.spendCredits).toHaveBeenCalledWith(
      "user-1",
      "criterion_ai_suggest",
      expect.objectContaining({ currentQuality: "incomplete" }),
    );
  });
});

// ---------------------------------------------------------------------------
// evaluation_criteria SELECT — tenancy filter
// ---------------------------------------------------------------------------

describe("POST — evaluation_criteria read tenancy", () => {
  it("scopes the criteria SELECT to (account_id, criterion_key) — no cross-tenant leak", async () => {
    await POST(req(), paramsOf("market"));
    const cols = state.selectEqs.map((e) => e.col).sort();
    expect(cols).toEqual(["account_id", "criterion_key"].sort());
    const accountEq = state.selectEqs.find((e) => e.col === "account_id");
    const criterionEq = state.selectEqs.find((e) => e.col === "criterion_key");
    expect(accountEq?.val).toBe("acct-1");
    expect(criterionEq?.val).toBe("market");
  });

  it("skips the criteria SELECT entirely when no account exists — no wasted read", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue(null);
    await POST(req(), paramsOf("idea"));
    expect(state.selectEqs).toEqual([]);
    expect(state.selectCols).toBeNull();
  });

  it("still reaches the AI call when no account exists (route degrades gracefully to defaults)", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue(null);
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(200);
    expect(mocks.callAI).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// evaluation_criteria UPDATE — payload shape + when to skip
// ---------------------------------------------------------------------------

describe("POST — evaluation_criteria update", () => {
  it("updates ai_suggestions + updated_at when the row AND account both exist", async () => {
    await POST(req(), paramsOf("idea"));
    expect(state.updates).toHaveLength(1);
    const call = state.updates[0]!;
    expect(call.payload.ai_suggestions).toEqual(AI_ENVELOPE.suggestions);
    expect(typeof call.payload.updated_at).toBe("string");
    expect(() => new Date(call.payload.updated_at as string).toISOString()).not.toThrow();
  });

  it("update filters by BOTH account_id and criterion_key — no cross-row write", async () => {
    await POST(req(), paramsOf("market"));
    expect(state.updates).toHaveLength(1);
    const cols = state.updates[0]!.eqs.map((e) => e.col).sort();
    expect(cols).toEqual(["account_id", "criterion_key"].sort());
    const accountEq = state.updates[0]!.eqs.find((e) => e.col === "account_id");
    const criterionEq = state.updates[0]!.eqs.find((e) => e.col === "criterion_key");
    expect(accountEq?.val).toBe("acct-1");
    expect(criterionEq?.val).toBe("market");
  });

  it("SKIPS the update entirely when there is no persisted criteria row — no phantom write", async () => {
    state.criteriaRow = null;
    await POST(req(), paramsOf("idea"));
    expect(state.updates).toEqual([]);
  });

  it("SKIPS the update entirely when there is no account row — no orphan write", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue(null);
    await POST(req(), paramsOf("idea"));
    expect(state.updates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Happy-path envelope shape
// ---------------------------------------------------------------------------

describe("POST — happy path envelope", () => {
  it("returns { ok, criterionKey, suggestions, qualityTips, currentQuality, balance, creditsUsed }", async () => {
    const res = await POST(req(), paramsOf("idea"));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body).toMatchObject({
      ok: true,
      criterionKey: "idea",
      suggestions: AI_ENVELOPE.suggestions,
      qualityTips: AI_ENVELOPE.qualityTips,
      currentQuality: "basic",
      balance: 9.9,
      creditsUsed: 0.1,
    });
  });

  it("currentQuality echoes the row's quality_level bit-for-bit", async () => {
    state.criteriaRow = {
      text_input: "x",
      files: [],
      links: [{ url: "https://x", label: "y" }],
      quality_level: "strong",
      ai_score: 91,
    };
    const res = await POST(req(), paramsOf("idea"));
    const body = await jsonOf(res);
    expect(body.currentQuality).toBe("strong");
  });

  it("currentQuality defaults to 'incomplete' when the row has no quality_level", async () => {
    state.criteriaRow = { text_input: "x", files: [], links: [] };
    const res = await POST(req(), paramsOf("idea"));
    const body = await jsonOf(res);
    expect(body.currentQuality).toBe("incomplete");
  });

  it("criterionKey in the response matches the URL param, not any body-supplied value", async () => {
    const res = await POST(req(), paramsOf("team"));
    const body = await jsonOf(res);
    expect(body.criterionKey).toBe("team");
  });
});
