// Colocated tests for POST /api/integrations/[provider]/sync — S18-A member access.
//
// A sync refreshes the project's svi_signals from the CALLER's own
// connection (their token, keyed on their user_id) and writes the signals
// under the project OWNER's user_id so owner + members read one set.
// editor+; viewer → 403 before the connection is even looked up.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const conn = vi.hoisted(() => ({
  getConnection: vi.fn(),
  writeSignals: vi.fn(),
  markSynced: vi.fn(),
}));
vi.mock("@/lib/oauth-connectors", () => ({
  getConnection: (...a: unknown[]) => conn.getConnection(...a),
  writeSignals: (...a: unknown[]) => conn.writeSignals(...a),
  markSynced: (...a: unknown[]) => conn.markSynced(...a),
}));
vi.mock("@/lib/oauth-github-signals", () => ({
  fetchGithubSignals: async () => ({ recentCommits30d: 5, publicRepos: 2, topLanguage: "ts", primaryRepoName: "app", primaryRepoStars: 1 }),
}));
const stripe = vi.hoisted(() => ({ fetch: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/oauth-stripe-signals", () => ({ fetchStripeConnectMetrics: stripe.fetch }));
vi.mock("@/lib/connectors/snapshots", () => ({ insertConnectorSnapshot: stripe.snapshot }));
const ga4 = vi.hoisted(() => ({ rich: vi.fn(async () => ({ windowDays: 90, sessions: 1, topChannels: [], funnel: {} })), snapshots: [] as unknown[] }));
vi.mock("@/lib/oauth-ga4-signals", () => ({
  fetchGa4Signals: async () => ({}),
  fetchGa4RichSignals: () => ga4.rich(),
  ga4SnapshotRow: (a: { userId: string; projectId: string | null; signals: unknown; source: string }) => ({ user_id: a.userId, project_id: a.projectId, source: a.source }),
  writeGa4Snapshot: async (_db: unknown, row: unknown) => {
    ga4.snapshots.push(row);
    return true;
  },
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));

import { POST } from "./route";

function run() {
  return POST(new Request("http://x/api/integrations/github/sync", { method: "POST" }), {
    params: Promise.resolve({ provider: "github" }),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  conn.getConnection.mockReset().mockResolvedValue({ id: "conn-1", status: "active", accessToken: "t", lastSyncAt: null });
  conn.writeSignals.mockReset().mockResolvedValue(undefined);
  conn.markSynced.mockReset().mockResolvedValue(undefined);
}

beforeEach(reset);

describeMemberAccess("POST /api/integrations/[provider]/sync", {
  state: scopeState,
  kind: "write",
  reset,
  run,
});

describe("POST /api/integrations/[provider]/sync — keys", () => {
  it("editor: uses the CALLER's connection, writes signals under the OWNER's user_id", async () => {
    scopeState.role = "editor";
    const res = await run();
    expect(res.status).toBe(200);
    expect(conn.getConnection).toHaveBeenCalledWith("user-caller", "github", "proj-1");
    expect(conn.writeSignals).toHaveBeenCalledWith("user-owner", "proj-1", "github", expect.any(Array));
  });

  it("owner: signals written under their own user_id", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(conn.writeSignals).toHaveBeenCalledWith("user-caller", "proj-1", "github", expect.any(Array));
  });

  it("viewer: 403 and the connection is never looked up", async () => {
    scopeState.role = "viewer";
    const res = await run();
    expect(res.status).toBe(403);
    expect(conn.getConnection).not.toHaveBeenCalled();
  });
});

describe("POST /api/integrations/ga4/sync — S-R5 rich snapshot", () => {
  function runGa4() {
    return POST(new Request("http://x/api/integrations/ga4/sync", { method: "POST" }), { params: Promise.resolve({ provider: "ga4" }) });
  }

  it("writes the flat svi_signals keys AND a ga4_signal_snapshots row under the owner + project", async () => {
    ga4.snapshots.length = 0;
    ga4.rich.mockClear();
    conn.getConnection.mockResolvedValue({ id: "conn-1", status: "active", accessToken: "t", lastSyncAt: null, providerAccountId: "12345", metadata: {} });
    scopeState.role = "editor";
    const res = await runGa4();
    expect(res.status).toBe(200);
    expect(conn.writeSignals).toHaveBeenCalledWith("user-owner", "proj-1", "ga4", expect.any(Array));
    expect(ga4.rich).toHaveBeenCalledTimes(1);
    expect(ga4.snapshots).toEqual([{ user_id: "user-owner", project_id: "proj-1", source: "sync" }]);
    expect(conn.markSynced).toHaveBeenCalledWith("conn-1");
  });

  it("a failed rich pull never fails the sync", async () => {
    ga4.snapshots.length = 0;
    ga4.rich.mockRejectedValueOnce(new Error("quota"));
    conn.getConnection.mockResolvedValue({ id: "conn-1", status: "active", accessToken: "t", lastSyncAt: null, providerAccountId: "12345", metadata: {} });
    const res = await runGa4();
    expect(res.status).toBe(200);
    expect(ga4.snapshots).toEqual([]);
    expect(conn.markSynced).toHaveBeenCalledWith("conn-1");
  });
});


describe("Stripe manual sync source boundary", () => {
  const runStripe = () => POST(new Request("http://x/api/integrations/stripe/sync", { method: "POST" }), { params: Promise.resolve({ provider: "stripe" }) });
  beforeEach(() => {
    conn.getConnection.mockResolvedValue({ id: "conn-1", status: "active", accessToken: "t", providerAccountId: "acct_bound", metadata: { livemode: true } });
    stripe.fetch.mockReset().mockResolvedValue({ sourceObservation: { eligibleForValuation: false } });
    stripe.snapshot.mockReset().mockResolvedValue({ id: "snapshot" });
  });
  it("binds the account and persists an observation without scoring signals", async () => {
    scopeState.role = "editor";
    expect((await runStripe()).status).toBe(200);
    expect(stripe.fetch).toHaveBeenCalledWith("t", { sourceAccountId: "acct_bound", livemode: true });
    expect(stripe.snapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "user-owner", projectId: "proj-1", provider: "stripe", source: "resync" }));
    expect(conn.writeSignals).not.toHaveBeenCalled();
  });
  it("does not record a successful sync if persistence fails", async () => {
    stripe.snapshot.mockResolvedValue(null);
    expect((await runStripe()).status).toBe(502);
    expect(conn.markSynced).toHaveBeenCalledWith("conn-1", "stripe_snapshot_write_failed");
    expect(conn.writeSignals).not.toHaveBeenCalled();
  });
  it("fails explicitly for an older connection with missing live-mode binding", async () => {
    conn.getConnection.mockResolvedValue({ id: "conn-1", status: "active", accessToken: "t", providerAccountId: "acct_bound", metadata: {} });
    stripe.fetch.mockRejectedValue(new Error("invalid_binding"));
    const result = await runStripe();
    expect(result.status).toBe(502);
    expect(await result.json()).toMatchObject({ ok: false, error: "invalid_binding" });
    expect(stripe.fetch).toHaveBeenCalledWith("t", { sourceAccountId: "acct_bound", livemode: false });
    expect(conn.markSynced).toHaveBeenCalledWith("conn-1", "invalid_binding");
    expect(conn.markSynced).not.toHaveBeenCalledWith("conn-1");
    expect(stripe.snapshot).not.toHaveBeenCalled();
    expect(conn.writeSignals).not.toHaveBeenCalled();
  });
  it("does not persist partial results on a rejected source", async () => {
    stripe.fetch.mockRejectedValue(new Error("invalid_binding"));
    expect((await runStripe()).status).toBe(502);
    expect(stripe.snapshot).not.toHaveBeenCalled();
    expect(conn.writeSignals).not.toHaveBeenCalled();
  });
});
