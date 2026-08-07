// Colocated vitest for POST /api/journal/reflect — P9 batch.
//
// The route generates an AI monthly reflection: it gathers journal entries,
// SVI history, evidence + action counts for a target month, prompts the AI,
// then persists the narrative back into growth_journal as an "ai_reflection"
// entry. Every wire between auth → credits → supabase reads → callAI →
// supabase insert is asserted here in isolation so the ordering + payload
// contract stays regression-guarded.
//
// Silent regressions this pins:
//   - dropping the getCurrentUser() guard so an anonymous caller runs an AI
//     spend against no account (401 → 500 or worse: silent success).
//   - dropping the getSupabaseAdmin() null-guard so the env-degraded tick
//     500s instead of returning the graceful 503 the /workspace UI reads.
//   - flipping the credits step off — credits are consumed BEFORE the AI
//     call, so a failed spend must short-circuit the expensive network hop
//     with a 402 + creditsRequired + balance envelope the paywall renders.
//   - dropping the FEATURE_COSTS.journal_reflect ?? 0.50 fallback so a
//     future rename of the credit key silently returns 0-cost to callers.
//   - dropping the request.json() try/catch so a body-less curl-and-retry
//     500s instead of defaulting to the current month.
//   - flipping the growth_journal query so it (a) doesn't scope to the
//     caller's account_id, (b) doesn't exclude prior ai_reflection rows,
//     or (c) doesn't sort chronologically (ascending) — any of these
//     mis-frame the AI prompt with cross-tenant / self-referential /
//     backwards-time data.
//   - dropping the svi_snapshots ordering so the sviDelta subtracts the
//     latest from the earliest in the wrong direction.
//   - flipping the sviDelta sign so a +8-point rise renders as "-8 points".
//   - dropping the sviDelta empty-state string so callers see "undefined
//     points" when a founder has no snapshot history for the month.
//   - dropping the growth_journal insert projection so a founder never
//     sees the saved entry echoed back into the /journal timeline.
//   - flipping the ai_reflection entry_type so the reflection lands in the
//     normal entry stream and gets re-summarised next month (recursive
//     feedback loop that inflates the AI prompt over time).
//   - dropping the try/catch around callAI so an AI outage 500s without a
//     structured error body — the paywall + retry UX depends on the
//     specific "AI reflection generation failed" copy.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  callAI: vi.fn(),
  spendCredits: vi.fn(),
  getProjectIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));
vi.mock("@/lib/ai-client", () => ({
  callAI: (opts: unknown) => mocks.callAI(opts),
}));
vi.mock("@/lib/credits", () => ({
  spendCredits: (userId: string, feature: string, meta: unknown) =>
    mocks.spendCredits(userId, feature, meta),
  FEATURE_COSTS: { journal_reflect: 0.5 },
}));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
}));

import { POST } from "./route";

const USER = { id: "user-1", email: "founder@example.com" };

interface FakeState {
  entries: unknown[] | null;
  entriesError: { message: string } | null;
  sviHistory: Array<{ score: number; snapshot_date: string }> | null;
  sviAccount: { current_svi: number | null } | null;
  evidenceCount: number | null;
  actions: unknown[] | null;
  insertRow: unknown;
  insertError: { message: string } | null;
  calls: {
    growthJournalSelect: string[];
    growthJournalInsert: Array<Record<string, unknown>>;
    sviSnapshotsFilters: Array<[string, unknown]>;
    growthJournalFilters: Array<[string, unknown]>;
    growthJournalOrder: Array<[string, unknown]>;
    evidenceSelect: Array<{ cols: string; opts?: unknown }>;
    userActionsCalls: Array<[string, ...unknown[]]>;
  };
}

function makeState(): FakeState {
  return {
    entries: [],
    entriesError: null,
    sviHistory: [],
    sviAccount: null,
    evidenceCount: 0,
    actions: [],
    insertRow: { id: "entry-1", entry_type: "ai_reflection" },
    insertError: null,
    calls: {
      growthJournalSelect: [],
      growthJournalInsert: [],
      sviSnapshotsFilters: [],
      growthJournalFilters: [],
      growthJournalOrder: [],
      evidenceSelect: [],
      userActionsCalls: [],
    },
  };
}

function makeSupabase(state: FakeState) {
  function growthJournalBuilder() {
    let insertPayload: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {
      select(cols: string) {
        state.calls.growthJournalSelect.push(cols);
        if (insertPayload) {
          return {
            single: async () => ({
              data: state.insertError ? null : state.insertRow,
              error: state.insertError,
            }),
          };
        }
        return chain;
      },
      eq(col: string, val: unknown) {
        state.calls.growthJournalFilters.push([`eq:${col}`, val]);
        return chain;
      },
      gte(col: string, val: unknown) {
        state.calls.growthJournalFilters.push([`gte:${col}`, val]);
        return chain;
      },
      lte(col: string, val: unknown) {
        state.calls.growthJournalFilters.push([`lte:${col}`, val]);
        return chain;
      },
      neq(col: string, val: unknown) {
        state.calls.growthJournalFilters.push([`neq:${col}`, val]);
        return chain;
      },
      order(col: string, opts?: unknown) {
        state.calls.growthJournalOrder.push([col, opts]);
        return chain;
      },
      insert(payload: Record<string, unknown>) {
        insertPayload = payload;
        state.calls.growthJournalInsert.push(payload);
        return chain;
      },
      then(res: (r: { data: unknown[] | null; error: unknown }) => unknown) {
        return Promise.resolve({
          data: state.entries,
          error: state.entriesError,
        }).then(res);
      },
    };
    return chain;
  }

  function sviSnapshotsBuilder() {
    const chain: Record<string, unknown> = {
      select() {
        return chain;
      },
      eq(col: string, val: unknown) {
        state.calls.sviSnapshotsFilters.push([`eq:${col}`, val]);
        return chain;
      },
      gte(col: string, val: unknown) {
        state.calls.sviSnapshotsFilters.push([`gte:${col}`, val]);
        return chain;
      },
      lte(col: string, val: unknown) {
        state.calls.sviSnapshotsFilters.push([`lte:${col}`, val]);
        return chain;
      },
      order(col: string, opts?: unknown) {
        state.calls.sviSnapshotsFilters.push([`order:${col}`, opts]);
        return chain;
      },
      then(res: (r: { data: unknown[] | null }) => unknown) {
        return Promise.resolve({ data: state.sviHistory }).then(res);
      },
    };
    return chain;
  }

  function sviAccountsBuilder() {
    const chain: Record<string, unknown> = {
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      maybeSingle: async () => ({ data: state.sviAccount }),
    };
    return chain;
  }

  function evidenceItemsBuilder() {
    const chain: Record<string, unknown> = {
      select(cols: string, opts?: unknown) {
        state.calls.evidenceSelect.push({ cols, opts });
        return chain;
      },
      eq() {
        return chain;
      },
      gte() {
        return chain;
      },
      lte(col: string, val: unknown) {
        void col;
        void val;
        return {
          then(res: (r: { count: number | null }) => unknown) {
            return Promise.resolve({ count: state.evidenceCount }).then(res);
          },
        };
      },
    };
    return chain;
  }

  function userActionsBuilder() {
    const chain: Record<string, unknown> = {
      select() {
        state.calls.userActionsCalls.push(["select"]);
        return chain;
      },
      eq(col: string, val: unknown) {
        state.calls.userActionsCalls.push(["eq", col, val]);
        return chain;
      },
      not(col: string, op: string, val: unknown) {
        state.calls.userActionsCalls.push(["not", col, op, val]);
        return chain;
      },
      gte(col: string, val: unknown) {
        state.calls.userActionsCalls.push(["gte", col, val]);
        return chain;
      },
      lte(col: string, val: unknown) {
        state.calls.userActionsCalls.push(["lte", col, val]);
        return Promise.resolve({ data: state.actions });
      },
    };
    return chain;
  }

  return {
    from(table: string) {
      switch (table) {
        case "growth_journal":
          return growthJournalBuilder();
        case "svi_snapshots":
          return sviSnapshotsBuilder();
        case "svi_accounts":
          return sviAccountsBuilder();
        case "evidence_items":
          return evidenceItemsBuilder();
        case "user_actions":
          return userActionsBuilder();
        default:
          throw new Error(`unexpected table ${table}`);
      }
    },
  };
}

function req(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/journal/reflect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body ?? {}),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.spendCredits.mockResolvedValue({ ok: true, balance: 10 });
  mocks.getProjectIdFromRequest.mockResolvedValue("proj-1");
  mocks.callAI.mockResolvedValue({
    text: "Great month — momentum is real.",
    provider: "claude",
    model: "claude-sonnet-4-6",
  });
  const st = makeState();
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(st));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/journal/reflect", () => {
  it("returns 401 when no user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/auth/i);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.spendCredits).not.toHaveBeenCalled();
    expect(mocks.callAI).not.toHaveBeenCalled();
  });

  it("returns 503 when getSupabaseAdmin returns null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req({}));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/database/i);
    expect(mocks.spendCredits).not.toHaveBeenCalled();
    expect(mocks.callAI).not.toHaveBeenCalled();
  });

  it("returns 402 when credits spend fails, echoing FEATURE_COSTS + balance", async () => {
    mocks.spendCredits.mockResolvedValue({ ok: false, balance: 0.2 });
    const res = await POST(req({ month: "2026-06" }));
    expect(res.status).toBe(402);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/insufficient credits/i);
    expect(body.creditsRequired).toBe(0.5);
    expect(body.balance).toBe(0.2);
    expect(mocks.callAI).not.toHaveBeenCalled();
  });

  it("defaults targetMonth to current YYYY-MM when body omits it", async () => {
    const now = new Date("2026-08-07T12:00:00Z");
    vi.setSystemTime(now);
    await POST(req({}));
    const meta = mocks.spendCredits.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(meta.month).toBe("2026-08");
    vi.useRealTimers();
  });

  it("treats invalid JSON body as empty (no throw, defaults to current month)", async () => {
    const now = new Date("2026-03-15T00:00:00Z");
    vi.setSystemTime(now);
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(200);
    const meta = mocks.spendCredits.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(meta.month).toBe("2026-03");
    vi.useRealTimers();
  });

  it("passes project_id from getProjectIdFromRequest into spendCredits metadata", async () => {
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-99");
    await POST(req({ month: "2026-05" }));
    expect(mocks.spendCredits).toHaveBeenCalledWith(
      USER.id,
      "journal_reflect",
      { month: "2026-05", project_id: "proj-99" },
    );
  });

  it("scopes growth_journal fetch to caller's account_id and excludes prior ai_reflection rows", async () => {
    const state = makeState();
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    expect(state.calls.growthJournalFilters).toEqual(
      expect.arrayContaining([
        ["eq:account_id", USER.id],
        ["gte:created_at", "2026-05-01"],
        ["lte:created_at", "2026-05-31T23:59:59Z"],
        ["neq:entry_type", "ai_reflection"],
      ]),
    );
    // Ordering must be ascending so the prompt is chronological.
    expect(state.calls.growthJournalOrder).toContainEqual([
      "created_at",
      { ascending: true },
    ]);
  });

  it("selects only the columns the prompt needs from growth_journal (no PII column drift)", async () => {
    const state = makeState();
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    // First growth_journal.select() is the list read; second happens after insert().
    const listSelect = state.calls.growthJournalSelect[0];
    expect(listSelect).toBe(
      "entry_type, title, content, tags, svi_at_time, created_at",
    );
  });

  it("scopes svi_snapshots by email + orders ascending so sviDelta subtracts newest - oldest", async () => {
    const state = makeState();
    state.sviHistory = [
      { score: 420, snapshot_date: "2026-05-02" },
      { score: 435, snapshot_date: "2026-05-20" },
      { score: 470, snapshot_date: "2026-05-28" },
    ];
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    expect(state.calls.sviSnapshotsFilters).toEqual(
      expect.arrayContaining([
        ["eq:email", USER.email],
        ["gte:snapshot_date", "2026-05-01"],
        ["lte:snapshot_date", "2026-05-31"],
        ["order:snapshot_date", { ascending: true }],
      ]),
    );
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("SVI moved from 420 to 470 (+50 points)");
  });

  it("renders 'No SVI data available for this month' when svi_snapshots is empty", async () => {
    const state = makeState();
    state.sviHistory = [];
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("No SVI data available for this month");
    expect(promptArg.user).not.toContain("SVI moved from");
  });

  it("renders a negative sviDelta with the leading minus (no double-sign)", async () => {
    const state = makeState();
    state.sviHistory = [
      { score: 500, snapshot_date: "2026-05-01" },
      { score: 480, snapshot_date: "2026-05-30" },
    ];
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("SVI moved from 500 to 480 (-20 points)");
  });

  it("threads currentSVI + evidenceCount + actionsCompleted counts into the prompt", async () => {
    const state = makeState();
    state.sviAccount = { current_svi: 612 };
    state.evidenceCount = 7;
    state.actions = [
      { action_key: "upload_pitch_deck", completed_at: "2026-05-05" },
      { action_key: "book_advisor_call", completed_at: "2026-05-10" },
    ];
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("Current SVI: 612/1000");
    expect(promptArg.user).toContain("Evidence documents added: 7");
    expect(promptArg.user).toContain("Actions completed: 2");
    expect(promptArg.user).toContain("- upload pitch deck");
    expect(promptArg.user).toContain("- book advisor call");
  });

  it("renders currentSVI as 'unknown/1000' when svi_accounts has no row", async () => {
    const state = makeState();
    state.sviAccount = null;
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("Current SVI: unknown/1000");
  });

  it("renders 'No journal entries this month.' when the month has no rows", async () => {
    const state = makeState();
    state.entries = [];
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("No journal entries this month.");
  });

  it("renders 'No actions completed.' when user_actions is empty", async () => {
    const state = makeState();
    state.actions = [];
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("No actions completed.");
  });

  it("summarises journal entries with day + entry_type + title + truncated 150-char content", async () => {
    const state = makeState();
    state.entries = [
      {
        entry_type: "milestone",
        title: "First 10 signups",
        content: "x".repeat(300),
        tags: [],
        svi_at_time: 500,
        created_at: "2026-05-08T12:00:00Z",
      },
    ];
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toMatch(/\(milestone\) First 10 signups: x{150}(?!x)/);
  });

  it("omits ': content' when the entry has no content", async () => {
    const state = makeState();
    state.entries = [
      {
        entry_type: "note",
        title: "Standup",
        content: null,
        tags: [],
        svi_at_time: null,
        created_at: "2026-05-08T12:00:00Z",
      },
    ];
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    await POST(req({ month: "2026-05" }));
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("(note) Standup");
    expect(promptArg.user).not.toContain("Standup:");
  });

  it("uses en-AU 'long' month name in the prompt", async () => {
    await POST(req({ month: "2026-02" }));
    const promptArg = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("Month: February 2026");
  });

  it("calls callAI with the advisor system prompt + maxTokens=800", async () => {
    await POST(req({ month: "2026-05" }));
    const arg = mocks.callAI.mock.calls[0]?.[0] as {
      system: string;
      user: string;
      maxTokens: number;
    };
    expect(arg.system).toContain("startup advisor");
    expect(arg.maxTokens).toBe(800);
    expect(arg.user).toContain("Write a 3-paragraph monthly reflection");
    expect(arg.user).toContain("Australian English");
  });

  it("returns 500 when the AI call throws", async () => {
    mocks.callAI.mockRejectedValue(new Error("gemini down"));
    const res = await POST(req({ month: "2026-05" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/AI reflection generation failed/i);
  });

  it("inserts an ai_reflection row into growth_journal with the expected shape", async () => {
    const state = makeState();
    state.sviAccount = { current_svi: 600 };
    state.sviHistory = [
      { score: 500, snapshot_date: "2026-05-01" },
      { score: 600, snapshot_date: "2026-05-30" },
    ];
    state.evidenceCount = 3;
    state.actions = [{ action_key: "a", completed_at: "2026-05-02" }];
    state.entries = [
      { entry_type: "note", title: "T", content: "c", tags: [], svi_at_time: 550, created_at: "2026-05-02T00:00:00Z" },
    ];
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));

    const res = await POST(req({ month: "2026-05" }));
    expect(res.status).toBe(200);
    expect(state.calls.growthJournalInsert).toHaveLength(1);
    const payload = state.calls.growthJournalInsert[0];
    expect(payload.account_id).toBe(USER.id);
    expect(payload.email).toBe(USER.email);
    expect(payload.entry_type).toBe("ai_reflection");
    expect(payload.title).toBe("Monthly Reflection — May 2026");
    expect(payload.content).toBe("Great month — momentum is real.");
    expect(payload.tags).toEqual(["ai", "reflection", "2026-05"]);
    expect(payload.svi_at_time).toBe(600);
    const meta = payload.metadata as Record<string, unknown>;
    expect(meta.month).toBe("2026-05");
    expect(meta.entriesCount).toBe(1);
    expect(meta.evidenceCount).toBe(3);
    expect(meta.actionsCompleted).toBe(1);
    expect(meta.sviDelta).toBe("SVI moved from 500 to 600 (+100 points)");
    expect(meta.provider).toBe("claude");
    expect(meta.model).toBe("claude-sonnet-4-6");
  });

  it("returns 500 when the growth_journal insert returns an error", async () => {
    const state = makeState();
    state.insertError = { message: "row-level security" };
    state.insertRow = null;
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
    const res = await POST(req({ month: "2026-05" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toMatch(/failed to save reflection/i);
  });

  it("happy path returns {ok:true, entry, reflection, stats}", async () => {
    const state = makeState();
    state.sviAccount = { current_svi: 700 };
    state.sviHistory = [
      { score: 680, snapshot_date: "2026-05-01" },
      { score: 700, snapshot_date: "2026-05-30" },
    ];
    state.evidenceCount = 4;
    state.actions = [
      { action_key: "a", completed_at: "2026-05-10" },
      { action_key: "b", completed_at: "2026-05-20" },
    ];
    state.entries = [
      { entry_type: "note", title: "T", content: "c", tags: [], svi_at_time: 690, created_at: "2026-05-02T00:00:00Z" },
      { entry_type: "note", title: "U", content: "d", tags: [], svi_at_time: 695, created_at: "2026-05-12T00:00:00Z" },
    ];
    state.insertRow = { id: "entry-42", entry_type: "ai_reflection" };
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));

    const res = await POST(req({ month: "2026-05" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.entry).toEqual({ id: "entry-42", entry_type: "ai_reflection" });
    expect(body.reflection).toBe("Great month — momentum is real.");
    const stats = body.stats as Record<string, unknown>;
    expect(stats.entriesCount).toBe(2);
    expect(stats.evidenceCount).toBe(4);
    expect(stats.actionsCompleted).toBe(2);
    expect(stats.sviDelta).toBe("SVI moved from 680 to 700 (+20 points)");
  });
});
