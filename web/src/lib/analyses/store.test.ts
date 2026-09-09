// Colocated vitest for the analyses store.
//
// Two properties this module MUST hold, in tension with each other:
//
//   1. The write is fail-soft. `/api/intake` calls saveAnalysis while holding
//      a good analysis the founder is already looking at. If this function
//      ever throws — misconfigured Supabase, insert error, network — the
//      founder loses the analysis to a database hiccup. It must return null
//      and log, never propagate.
//
//   2. The read is strict. getAnalysisForViewer is the ONLY tenancy boundary
//      on /api/analyses/[id]. It returns null both for "no such row" and for
//      "not yours" so the route can answer 404 to each and never confirm an
//      id exists to someone who cannot see it.
//
// Plus: claiming is idempotent by construction (`user_id is null` on both
// updates). Dropping that filter would let a second login re-stamp rows and,
// worse, let one account claim another's already-claimed analyses.

import { beforeEach, describe, expect, it, vi } from "vitest";

interface Op {
  name: string;
  args: unknown[];
}
interface TableCall {
  table: string;
  ops: Op[];
}

const state: {
  calls: TableCall[];
  single: { data: unknown; error: { message: string } | null };
  maybeSingle: { data: unknown; error: { message: string } | null };
  list: { data: unknown; error: { message: string } | null };
  client: unknown;
  throwOnFrom: boolean;
} = {
  calls: [],
  single: { data: { id: "row-1" }, error: null },
  maybeSingle: { data: null, error: null },
  list: { data: [], error: null },
  client: null,
  throwOnFrom: false,
};

function makeClient() {
  return {
    from(table: string) {
      if (state.throwOnFrom) throw new Error("boom");
      const call: TableCall = { table, ops: [] };
      state.calls.push(call);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      for (const m of ["insert", "select", "eq", "gte", "is", "order", "limit", "update"]) {
        b[m] = (...args: unknown[]) => {
          call.ops.push({ name: m, args });
          return b;
        };
      }
      b.single = () => {
        call.ops.push({ name: "single", args: [] });
        return Promise.resolve(state.single);
      };
      b.maybeSingle = () => {
        call.ops.push({ name: "maybeSingle", args: [] });
        return Promise.resolve(state.maybeSingle);
      };
      b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(state.list).then(res, rej);
      return b;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => state.client,
  isSupabaseConfigured: () => Boolean(state.client),
}));

const rateLimitMock = vi.fn<
  (k: string, m: number, w: number) => { allowed: boolean; remaining: number; resetIn: number }
>();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (k: string, m: number, w: number) => rateLimitMock(k, m, w),
}));

import {
  ANALYSES_TABLE,
  ANON_RUN_LIMIT_PER_IP_DAY,
  ANON_RUN_LIMIT_PER_IP_HOUR,
  GUEST_ANALYSES_TABLE,
  WRITE_LIMIT_PER_ANON,
  WRITE_LIMIT_PER_IP,
  checkAnalysisWriteLimit,
  checkAnonRunLimit,
  claimAnalyses,
  claimSummarySend,
  markSummarySent,
  releaseSummaryClaim,
  countAnonRunsInWindow,
  getAnalysisForViewer,
  listAnalysesForViewer,
  saveAnalysis,
} from "./store";
import { ANON_RUN_WINDOW_MS } from "./signup-gate";
import { extractSignals } from "@/lib/svi-analysis";
import type { IntakeResult } from "@/lib/intake/analyze-input";

const RESULT: IntakeResult = {
  inputKind: "idea_text",
  confidence: 0.7,
  rawText: "a marketplace for surplus concrete",
  structured: {},
  signals: extractSignals({ rawText: "a marketplace for surplus concrete" }),
  classifierMode: "regex",
};

function opsOf(call: TableCall): string[] {
  return call.ops.map((o) => o.name);
}
function argOf(call: TableCall, name: string): unknown[] {
  return call.ops.find((o) => o.name === name)?.args ?? [];
}

beforeEach(() => {
  state.calls = [];
  state.single = { data: { id: "row-1" }, error: null };
  state.maybeSingle = { data: null, error: null };
  state.list = { data: [], error: null };
  state.client = makeClient();
  state.throwOnFrom = false;
  rateLimitMock.mockReset().mockReturnValue({ allowed: true, remaining: 9, resetIn: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

// ─── Rate limit ────────────────────────────────────────────────────────────

describe("checkAnalysisWriteLimit", () => {
  it("allows a normal write and checks BOTH the anon key and the IP", () => {
    expect(checkAnalysisWriteLimit("anon1", "1.2.3.4").allowed).toBe(true);
    expect(rateLimitMock).toHaveBeenCalledTimes(2);
    expect(rateLimitMock.mock.calls[0][0]).toContain("anon1");
    expect(rateLimitMock.mock.calls[0][1]).toBe(WRITE_LIMIT_PER_ANON);
    expect(rateLimitMock.mock.calls[1][0]).toContain("1.2.3.4");
    expect(rateLimitMock.mock.calls[1][1]).toBe(WRITE_LIMIT_PER_IP);
  });

  it("blocks on the anon bucket without wasting the IP bucket", () => {
    rateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0, resetIn: 1 });
    expect(checkAnalysisWriteLimit("anon1", "1.2.3.4")).toEqual({
      allowed: false,
      reason: "anon",
    });
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
  });

  it("blocks on the IP bucket — a cookie-dropping loop is still capped", () => {
    rateLimitMock
      .mockReturnValueOnce({ allowed: true, remaining: 1, resetIn: 0 })
      .mockReturnValueOnce({ allowed: false, remaining: 0, resetIn: 1 });
    expect(checkAnalysisWriteLimit("anon1", "1.2.3.4")).toEqual({
      allowed: false,
      reason: "ip",
    });
  });
});

// ─── saveAnalysis ──────────────────────────────────────────────────────────

describe("saveAnalysis", () => {
  it("inserts into analyses and returns the new row id", async () => {
    const id = await saveAnalysis({ anonKey: "anon1", result: RESULT });
    expect(id).toBe("row-1");
    expect(state.calls[0].table).toBe(ANALYSES_TABLE);
    expect(opsOf(state.calls[0])).toEqual(["insert", "select", "single"]);
  });

  it("writes the anon key onto the row", async () => {
    await saveAnalysis({ anonKey: "anon1", result: RESULT });
    const row = argOf(state.calls[0], "insert")[0] as Record<string, unknown>;
    expect(row.anon_key).toBe("anon1");
    expect(row.public_visible).toBe(false);
    expect(row.investor_visible).toBe(false);
  });

  it("returns null (never throws) when Supabase is not configured", async () => {
    state.client = null;
    await expect(saveAnalysis({ anonKey: "a", result: RESULT })).resolves.toBeNull();
  });

  it("returns null (never throws) when the insert errors", async () => {
    state.single = { data: null, error: { message: "duplicate key" } };
    await expect(saveAnalysis({ anonKey: "a", result: RESULT })).resolves.toBeNull();
  });

  it("returns null (never throws) when the client itself blows up", async () => {
    state.throwOnFrom = true;
    await expect(saveAnalysis({ anonKey: "a", result: RESULT })).resolves.toBeNull();
  });
});

// ─── getAnalysisForViewer ──────────────────────────────────────────────────

const ANON_ROW = {
  id: "aaaaaaaa-1111-1111-1111-111111111111",
  anon_key: "anon1",
  user_id: null,
  input_kind: "idea_text",
  input_text: "an idea",
  input_chars: 7,
  input_truncated: false,
  input_url: null,
  input_filename: null,
  intake: {},
  context: null,
  svi: null,
  svi_total: null,
  stage: null,
  stage_label: null,
  valuation_mid_aud: null,
  created_at: "2026-09-08T00:00:00.000Z",
};

describe("getAnalysisForViewer", () => {
  it("returns the analysis to the anon-cookie holder that created it", async () => {
    state.maybeSingle = { data: ANON_ROW, error: null };
    const out = await getAnalysisForViewer(ANON_ROW.id, { anonKey: "anon1" });
    expect(out).toBeTruthy();
    expect((out as { id: string }).id).toBe(ANON_ROW.id);
  });

  it("returns null for a DIFFERENT anon key — the 404 path", async () => {
    state.maybeSingle = { data: ANON_ROW, error: null };
    expect(await getAnalysisForViewer(ANON_ROW.id, { anonKey: "someone-else" })).toBeNull();
  });

  it("returns null for a caller with no cookie and no session at all", async () => {
    state.maybeSingle = { data: ANON_ROW, error: null };
    expect(await getAnalysisForViewer(ANON_ROW.id, {})).toBeNull();
  });

  it("returns the analysis to its owning user", async () => {
    state.maybeSingle = { data: { ...ANON_ROW, user_id: "u1" }, error: null };
    expect(await getAnalysisForViewer(ANON_ROW.id, { userId: "u1" })).toBeTruthy();
  });

  it("returns null to a DIFFERENT user", async () => {
    state.maybeSingle = { data: { ...ANON_ROW, user_id: "u1" }, error: null };
    expect(await getAnalysisForViewer(ANON_ROW.id, { userId: "u2" })).toBeNull();
  });

  it("does NOT let a stale anon cookie reach a row already claimed by a user", async () => {
    state.maybeSingle = { data: { ...ANON_ROW, user_id: "u1" }, error: null };
    expect(await getAnalysisForViewer(ANON_ROW.id, { anonKey: "anon1" })).toBeNull();
  });

  it("returns null when the row does not exist", async () => {
    state.maybeSingle = { data: null, error: null };
    expect(await getAnalysisForViewer(ANON_ROW.id, { anonKey: "anon1" })).toBeNull();
  });

  it("returns null (not a throw) on a query error", async () => {
    state.maybeSingle = { data: null, error: { message: "down" } };
    await expect(
      getAnalysisForViewer(ANON_ROW.id, { anonKey: "anon1" }),
    ).resolves.toBeNull();
  });
});

// ─── listAnalysesForViewer ─────────────────────────────────────────────────

describe("listAnalysesForViewer", () => {
  it("filters by user_id for a signed-in caller", async () => {
    state.list = { data: [{ id: "1" }], error: null };
    await listAnalysesForViewer({ userId: "u1" });
    expect(argOf(state.calls[0], "eq")).toEqual(["user_id", "u1"]);
  });

  it("filters by anon key AND unclaimed for a signed-out caller", async () => {
    state.list = { data: [], error: null };
    await listAnalysesForViewer({ anonKey: "anon1" });
    expect(argOf(state.calls[0], "eq")).toEqual(["anon_key", "anon1"]);
    expect(argOf(state.calls[0], "is")).toEqual(["user_id", null]);
  });

  it("orders newest first", async () => {
    await listAnalysesForViewer({ userId: "u1" });
    expect(argOf(state.calls[0], "order")).toEqual([
      "created_at",
      { ascending: false },
    ]);
  });

  it("never queries at all for a caller with no identity", async () => {
    expect(await listAnalysesForViewer({})).toEqual([]);
    expect(state.calls[0]?.ops.some((o) => o.name === "eq")).toBeFalsy();
  });

  it("returns [] on a query error rather than throwing into the route", async () => {
    state.list = { data: null, error: { message: "down" } };
    await expect(listAnalysesForViewer({ userId: "u1" })).resolves.toEqual([]);
  });

  it("does not select the raw input text in a list view", async () => {
    await listAnalysesForViewer({ userId: "u1" });
    expect(String(argOf(state.calls[0], "select")[0])).not.toContain("input_text");
  });
});

// ─── claimAnalyses ─────────────────────────────────────────────────────────

describe("claimAnalyses", () => {
  it("claims anonymous analyses filtered on user_id IS NULL (idempotency)", async () => {
    state.list = { data: [{ id: "1" }, { id: "2" }], error: null };
    const out = await claimAnalyses({ userId: "u1", anonKey: "anon1" });
    expect(out.analyses).toBe(2);
    expect(state.calls[0].table).toBe(ANALYSES_TABLE);
    expect(argOf(state.calls[0], "eq")).toEqual(["anon_key", "anon1"]);
    expect(argOf(state.calls[0], "is")).toEqual(["user_id", null]);
    const patch = argOf(state.calls[0], "update")[0] as Record<string, unknown>;
    expect(patch.user_id).toBe("u1");
  });

  it("claims paid guest reports on the normalised purchase email", async () => {
    state.list = { data: [{ id: "g1" }], error: null };
    const out = await claimAnalyses({
      userId: "u1",
      email: "  Buyer@Example.COM ",
    });
    expect(out.guestAnalyses).toBe(1);
    const guest = state.calls.find((c) => c.table === GUEST_ANALYSES_TABLE)!;
    expect(argOf(guest, "eq")).toEqual(["email", "buyer@example.com"]);
    expect(argOf(guest, "is")).toEqual(["user_id", null]);
  });

  it("is a no-op when there is neither an anon key nor an email", async () => {
    const out = await claimAnalyses({ userId: "u1" });
    expect(out).toEqual({ analyses: 0, guestAnalyses: 0 });
    expect(state.calls).toHaveLength(0);
  });

  it("claiming twice returns zero the second time (nothing left unclaimed)", async () => {
    state.list = { data: [{ id: "1" }], error: null };
    const first = await claimAnalyses({ userId: "u1", anonKey: "anon1" });
    state.list = { data: [], error: null };
    const second = await claimAnalyses({ userId: "u1", anonKey: "anon1" });
    expect(first.analyses).toBe(1);
    expect(second.analyses).toBe(0);
  });

  it("reports zero rather than throwing when the update errors", async () => {
    state.list = { data: null, error: { message: "down" } };
    await expect(
      claimAnalyses({ userId: "u1", anonKey: "anon1", email: "a@b.com" }),
    ).resolves.toEqual({ analyses: 0, guestAnalyses: 0 });
  });

  it("returns zero when Supabase is unconfigured — never breaks a signup", async () => {
    state.client = null;
    await expect(
      claimAnalyses({ userId: "u1", anonKey: "anon1" }),
    ).resolves.toEqual({ analyses: 0, guestAnalyses: 0 });
  });
});

// ── Signup gate count ────────────────────────────────────────────────────
//
// This count is the ONLY input to whether an anonymous visitor's run is
// allowed to start. Two failure modes matter, in opposite directions:
//   * counting outside the window would wall a visitor returning months
//     later, who has no memory of ever using the site;
//   * throwing or counting high on a database hiccup would wall a real
//     founder over an outage, so it must fail OPEN.

describe("countAnonRunsInWindow", () => {
  it("counts only this anon key's rows, newest window only", async () => {
    state.list = { data: [{ id: "a" }, { id: "b" }], error: null };
    const n = await countAnonRunsInWindow("anon1", { since: "2026-08-09T00:00:00.000Z" });
    expect(n).toBe(2);
    const call = state.calls[0];
    expect(call.table).toBe(ANALYSES_TABLE);
    expect(argOf(call, "eq")).toEqual(["anon_key", "anon1"]);
    expect(argOf(call, "gte")).toEqual(["created_at", "2026-08-09T00:00:00.000Z"]);
  });

  it("bounds the read instead of counting an unbounded slice", async () => {
    await countAnonRunsInWindow("anon1", { cap: 4 });
    expect(argOf(state.calls[0], "limit")).toEqual([4]);
    expect(opsOf(state.calls[0])).toContain("select");
  });

  it("defaults the cutoff to the rolling window", async () => {
    await countAnonRunsInWindow("anon1");
    const [column, cutoff] = argOf(state.calls[0], "gte") as [string, string];
    expect(column).toBe("created_at");
    const ageMs = Date.now() - Date.parse(cutoff);
    expect(ageMs).toBeGreaterThan(ANON_RUN_WINDOW_MS - 5_000);
    expect(ageMs).toBeLessThan(ANON_RUN_WINDOW_MS + 5_000);
  });

  it("returns 0 with no anon key rather than querying", async () => {
    expect(await countAnonRunsInWindow("")).toBe(0);
    expect(state.calls).toHaveLength(0);
  });

  it("FAILS OPEN when supabase is unconfigured", async () => {
    state.client = null;
    expect(await countAnonRunsInWindow("anon1")).toBe(0);
  });

  it("FAILS OPEN when the query errors", async () => {
    state.list = { data: null, error: { message: "relation missing" } };
    expect(await countAnonRunsInWindow("anon1")).toBe(0);
  });

  it("FAILS OPEN when the client throws", async () => {
    state.throwOnFrom = true;
    expect(await countAnonRunsInWindow("anon1")).toBe(0);
  });
});

// ── Anonymous run ceiling ────────────────────────────────────────────────
//
// Defence in depth behind the signup gate. The gate is keyed to a cookie, and
// cookies can be cleared — without this, one person could loop "run #1"
// forever by clearing site data between runs. Generous on purpose: it must
// stop a loop without a real founder ever noticing it exists.

describe("checkAnonRunLimit", () => {
  it("checks an hourly burst bucket and a daily drip bucket", () => {
    checkAnonRunLimit("1.2.3.4");
    const keys = rateLimitMock.mock.calls.map((c) => c[0]);
    expect(keys).toContain("analysis-run:ip:hour:1.2.3.4");
    expect(keys).toContain("analysis-run:ip:day:1.2.3.4");
  });

  it("stays generous enough that ordinary use never sees it", () => {
    expect(ANON_RUN_LIMIT_PER_IP_HOUR).toBeGreaterThanOrEqual(10);
    expect(ANON_RUN_LIMIT_PER_IP_DAY).toBeGreaterThanOrEqual(ANON_RUN_LIMIT_PER_IP_HOUR);
    expect(rateLimitMock.mock.calls.length).toBe(0);
    checkAnonRunLimit("1.2.3.4");
    expect(rateLimitMock.mock.calls[0][1]).toBe(ANON_RUN_LIMIT_PER_IP_HOUR);
    expect(rateLimitMock.mock.calls[0][2]).toBe(60 * 60 * 1000);
    expect(rateLimitMock.mock.calls[1][2]).toBe(24 * 60 * 60 * 1000);
  });

  it("reports which bucket tripped", () => {
    rateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0, resetIn: 1 });
    expect(checkAnonRunLimit("1.2.3.4")).toEqual({ allowed: false, reason: "hour" });
    rateLimitMock.mockReturnValueOnce({ allowed: true, remaining: 1, resetIn: 0 });
    rateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0, resetIn: 1 });
    expect(checkAnonRunLimit("1.2.3.4")).toEqual({ allowed: false, reason: "day" });
  });

  it("never blocks when the client IP is unknown", () => {
    expect(checkAnonRunLimit("unknown")).toEqual({ allowed: true });
    expect(checkAnonRunLimit("")).toEqual({ allowed: true });
    expect(rateLimitMock).not.toHaveBeenCalled();
  });
});

// ── Free-summary delivery: "once" is a database property ──────────────────
//
// The free tier promises one email per analysis. The only thing that can
// actually guarantee that across a double-click, a retried fetch and a second
// tab is the conditional UPDATE — `is("summary_requested_at", null)`. If that
// filter is ever dropped, every caller wins the claim and the founder gets
// duplicates, so it is asserted directly.
describe("claimSummarySend", () => {
  it("claims only while nothing has claimed it yet", async () => {
    state.list = { data: [{ id: "row-1" }], error: null };
    const res = await claimSummarySend("row-1", "founder@example.com");
    expect(res).toEqual({ outcome: "claimed" });
    const call = state.calls[0];
    expect(call.table).toBe(ANALYSES_TABLE);
    expect(opsOf(call)).toContain("update");
    // THE guard. Without it the "once" promise is client-side wishful thinking.
    expect(argOf(call, "is")).toEqual(["summary_requested_at", null]);
    expect(argOf(call, "eq")).toEqual(["id", "row-1"]);
  });

  it("writes the address and clears any previous error on the claim", async () => {
    state.list = { data: [{ id: "row-1" }], error: null };
    await claimSummarySend("row-1", "founder@example.com");
    const patch = argOf(state.calls[0], "update")[0] as Record<string, unknown>;
    expect(patch.summary_email).toBe("founder@example.com");
    expect(typeof patch.summary_requested_at).toBe("string");
    expect(patch.summary_send_error).toBeNull();
  });

  it("reports already_claimed when the conditional update matched nothing", async () => {
    state.list = { data: [], error: null };
    expect(await claimSummarySend("row-1", "f@e.com")).toEqual({
      outcome: "already_claimed",
    });
  });

  it("refuses to proceed when the database is unreachable", async () => {
    // No claim means no protection against a duplicate, so the only safe
    // answer is "do not send" — never "send anyway".
    state.list = { data: null, error: { message: "connection reset" } };
    expect(await claimSummarySend("row-1", "f@e.com")).toEqual({
      outcome: "unavailable",
    });
  });

  it("refuses to proceed when Supabase is not configured", async () => {
    state.client = null;
    expect(await claimSummarySend("row-1", "f@e.com")).toEqual({
      outcome: "unavailable",
    });
  });
});

describe("markSummarySent", () => {
  it("stamps the sent time against the row", async () => {
    await markSummarySent("row-1");
    const call = state.calls[0];
    const patch = argOf(call, "update")[0] as Record<string, unknown>;
    expect(typeof patch.summary_sent_at).toBe("string");
    expect(argOf(call, "eq")).toEqual(["id", "row-1"]);
  });

  it("does nothing at all without a client", async () => {
    state.client = null;
    await markSummarySent("row-1");
    expect(state.calls).toHaveLength(0);
  });
});

describe("releaseSummaryClaim", () => {
  it("gives the claim back so a failed send can be retried", async () => {
    await releaseSummaryClaim("row-1", "smtp refused");
    const call = state.calls[0];
    const patch = argOf(call, "update")[0] as Record<string, unknown>;
    expect(patch.summary_requested_at).toBeNull();
    expect(patch.summary_send_error).toBe("smtp refused");
  });

  it("never releases a row that already sent", async () => {
    // Guards the one catastrophic case: a late failure path releasing a claim
    // on a row whose email already landed, which would allow a duplicate.
    await releaseSummaryClaim("row-1", "late error");
    expect(argOf(state.calls[0], "is")).toEqual(["summary_sent_at", null]);
  });

  it("truncates a runaway error string", async () => {
    await releaseSummaryClaim("row-1", "x".repeat(2000));
    const patch = argOf(state.calls[0], "update")[0] as Record<string, unknown>;
    expect((patch.summary_send_error as string).length).toBe(500);
  });
});
