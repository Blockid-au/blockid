import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: vi.fn(), scope: vi.fn(), save: vi.fn(), write: vi.fn(), synced: vi.fn(), snapshot: vi.fn(), evidence: vi.fn(),
  cookies: new Map<string, string>(), fetch: vi.fn<typeof fetch>(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => h.cookies.has(k) ? { value: h.cookies.get(k) } : undefined,
  set: (k: string, v: string) => h.cookies.set(k, v), delete: (k: string) => h.cookies.delete(k) }) }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: h.user }));
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrRedirect: h.scope }));
vi.mock("@/lib/oauth-connectors", () => ({ saveConnection: h.save, writeSignals: h.write, markSynced: h.synced }));
vi.mock("@/lib/connectors/snapshots", () => ({ insertConnectorSnapshot: h.snapshot }));
vi.mock("@/lib/connectors/connector-evidence", () => ({ emitConnectorEvidence: h.evidence }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ fixture: true }) }));
import { GET as start } from "../route";
import { GET as callback } from "./route";

beforeEach(() => {
  vi.resetAllMocks(); h.cookies.clear();
  vi.stubEnv("OAUTH_TOKEN_ENCRYPTION_KEY", "test-only-stripe-grant-key");
  vi.stubEnv("STRIPE_OAUTH_CLIENT_ID", "test-only-client");
  vi.stubEnv("STRIPE_OAUTH_CLIENT_SECRET", "test-only-secret");
  vi.stubEnv("OAUTH_REDIRECT_BASE_URL", "https://blockid.au");
  h.user.mockResolvedValue({ id: "member" });
  h.scope.mockResolvedValue({ scope: { projectId: "project-a", ownerUserId: "owner" }, denied: null });
  h.save.mockResolvedValue({ id: "connection" });
  h.snapshot.mockResolvedValue({ id: "snapshot" });
  h.fetch.mockImplementation(async url => {
    const u = new URL(String(url));
    const bodies: Record<string, unknown> = {
      "/oauth/token": { access_token: "test-only-token", stripe_user_id: "acct_123", livemode: true, scope: "read_only" },
      "/v1/account": { id: "acct_123", object: "account" },
      "/v1/balance": { object: "balance", livemode: true },
      "/v1/subscriptions": { object: "list", data: [], has_more: false },
    };
    if (!bodies[u.pathname]) throw new Error("Unexpected source request");
    return Response.json(bodies[u.pathname]);
  });
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function grant() {
  const response = await start(new Request("https://blockid.au/api/integrations/stripe?action=start"));
  const location = new URL(response.headers.get("location")!);
  expect(location.hostname).toBe("connect.stripe.com");
  return location.searchParams.get("state")!;
}
const finish = (state: string) => callback(new Request(`https://blockid.au/api/integrations/stripe/callback?code=test-code&state=${state}`));
describe("Stripe grant → source → unqualified snapshot integration", () => {
  it("keeps owner/project/account and complete explicit zero, without fabricated churn", async () => {
    const state = await grant();
    expect(h.cookies.get("blockid_stripe_state")).not.toBe(state);
    const response = await finish(state);
    expect(response.headers.get("location")).toContain("connected=stripe");
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ userId: "member", projectId: "project-a", providerAccountId: "acct_123" }));
    expect(h.write).not.toHaveBeenCalled();
    expect(h.evidence).not.toHaveBeenCalled();
    expect(h.snapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "owner", projectId: "project-a", metrics: expect.objectContaining({
      mrrAud: 0, activeSubscriptions: 0, churnedSubscriptions90d: null, churnRate90dPct: null,
      sourceObservation: expect.objectContaining({ sourceAccountId: "acct_123", complete: true, eligibleForValuation: false, metric: "fixed_recurring_contract_monthly_run_rate" }),
    }) }));
    expect(h.cookies.has("blockid_stripe_state")).toBe(false);
    h.fetch.mockClear();
    expect((await finish(state)).headers.get("location")).toContain("stripe_state_mismatch");
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it.each(["user", "project", "owner"])("rejects changed %s before token exchange", async changed => {
    const state = await grant();
    if (changed === "user") h.user.mockResolvedValue({ id: "other" });
    else h.scope.mockResolvedValue({ scope: { projectId: changed === "project" ? "project-b" : "project-a", ownerUserId: changed === "owner" ? "other" : "owner" }, denied: null });
    expect((await finish(state)).headers.get("location")).toContain("stripe_state_mismatch");
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
  });
  it("rechecks admin permission after grant issuance", async () => {
    const state = await grant();
    h.scope.mockResolvedValue({ scope: null, denied: new Response(null, { status: 403 }) });
    expect((await finish(state)).status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("upstream failure preserves connection but writes no monetary facts or zero snapshot", async () => {
    const state = await grant(), implementation = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url, init) => String(url).includes("/subscriptions") ? new Response("unavailable", { status: 500 }) : implementation(url, init));
    await finish(state);
    expect(h.save).toHaveBeenCalledOnce(); expect(h.write).not.toHaveBeenCalled(); expect(h.snapshot).not.toHaveBeenCalled(); expect(h.evidence).not.toHaveBeenCalled();
    expect(h.synced).toHaveBeenCalledWith("connection", "stripe recurring_source responded 500");
  });
  it("test-mode OAuth cannot write financial signals, even for an empty account", async () => {
    const state = await grant();
    h.fetch.mockResolvedValue(Response.json({ access_token: "test-only-token", stripe_user_id: "acct_123", livemode: false }));
    await finish(state);
    expect(h.fetch).toHaveBeenCalledOnce(); expect(h.write).not.toHaveBeenCalled(); expect(h.snapshot).not.toHaveBeenCalled();
    expect(h.synced).toHaveBeenCalledWith("connection", "invalid_binding");
  });
  it("does not mark a missing snapshot as successfully synced", async () => {
    const state = await grant(); h.snapshot.mockResolvedValue(null);
    await finish(state);
    expect(h.synced).toHaveBeenCalledWith("connection", "stripe_snapshot_write_failed");
    expect(h.synced).not.toHaveBeenCalledWith("connection");
  });
});
