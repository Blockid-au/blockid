// Colocated vitest for the S25-A resync worker. Pins, against a recording
// fake Supabase and the REAL token seal:
//   * an unreadable sealed token → outcome token_unreadable, ONE
//     `connector_reconnect` notification (30-day throttle, dedupe per row),
//     no provider call, lease released — and no console line ever carries
//     the sealed or raw token bytes;
//   * Stripe: the callback's metrics are re-pulled, a dated
//     `connector_snapshots` row is inserted with the documented shape, the
//     svi_signals rows are upserted on the (user, provider, key, project)
//     key, the legacy evidence rows are refreshed, and when the values moved
//     the account is rescored and `svi.rescored` (source connector_resync)
//     is enqueued for the OWNER;
//   * unchanged values → snapshot still written, no rescore, no webhook;
//   * Xero (legacy vault): refresh first, the rotated pair is resealed onto
//     the row, income / 3 → mrr_aud, both evidence rows refreshed;
//   * Xero refresh rejected (invalid_grant) → needs_reconnect + notification;
//   * listResyncCandidates merges both vaults under the cap; claimConnection
//     is a conditional flip that loses when the UPDATE matches no row.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  stripeMetrics: vi.fn(),
  xeroRefresh: vi.fn(),
  xeroTenant: vi.fn(),
  xeroMetrics: vi.fn(),
  notify: vi.fn(),
  enqueue: vi.fn(),
  rescore: vi.fn(),
}));

vi.mock("@/lib/oauth-stripe-signals", () => ({
  fetchStripeConnectMetrics: (t: string) => h.stripeMetrics(t),
}));
vi.mock("@/lib/connectors/xero-metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./xero-metrics")>();
  return {
    ...actual,
    refreshXeroToken: (t: string) => h.xeroRefresh(t),
    fetchXeroTenant: (t: string) => h.xeroTenant(t),
    fetchXeroMetrics: (t: string, tenant: string, name: string | null) => h.xeroMetrics(t, tenant, name),
  };
});
vi.mock("@/lib/notifications", () => ({ insertNotification: (a: unknown) => h.notify(a) }));
vi.mock("@/lib/webhooks/registry", () => ({ enqueueWebhook: (...a: unknown[]) => h.enqueue(...a) }));
vi.mock("@/lib/svi/rescore-from-evidence", () => ({ rescoreAccountFromEvidence: (db: unknown, a: unknown) => h.rescore(db, a) }));

import { sealToken } from "@/lib/oauth-token-seal";
import {
  MAX_CONNECTIONS_PER_TICK,
  RECONNECT_NOTIFY_THROTTLE_MS,
  claimConnection,
  listResyncCandidates,
  resyncConnection,
  type ResyncCandidate,
} from "./resync";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);
const RAW_STRIPE = "sk_live_RAWTOKENBYTES_1234567890";
const RAW_XERO_REFRESH = "xero_refresh_RAWBYTES_0987654321";
const NOW = new Date("2026-09-14T05:00:00Z");

type Row = Record<string, unknown>;
interface Op { table: string; op: string; args: unknown[] }

function fakeDb(data: Record<string, Row[]> = {}, opts: { claimWins?: boolean } = {}) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const filters: Array<[string, unknown[]]> = [];
    let mode: "select" | "update" | "insert" | "upsert" = "select";
    let payload: unknown = null;
    const chain: Record<string, unknown> = {};
    const rec = (op: string) => (...args: unknown[]) => {
      ops.push({ table, op, args });
      filters.push([op, args]);
      return chain;
    };
    for (const m of ["select", "eq", "is", "in", "or", "not", "ilike", "order", "limit"]) chain[m] = rec(m);
    chain.update = (patch: Row) => { mode = "update"; payload = patch; ops.push({ table, op: "update", args: [patch] }); return chain; };
    chain.insert = (row: Row) => { mode = "insert"; payload = row; ops.push({ table, op: "insert", args: [row] }); return chain; };
    chain.upsert = (rows: unknown, o: unknown) => { mode = "upsert"; payload = rows; ops.push({ table, op: "upsert", args: [rows, o] }); return chain; };
    const resolve = () => {
      if (mode === "update") return { data: opts.claimWins === false && table.startsWith("oauth_connections") && filters.some(([op]) => op === "or") ? [] : [{ id: "x" }], error: null };
      if (mode === "insert") return { data: { id: "new-1", ...(payload as Row) }, error: null };
      if (mode === "upsert") return { data: null, error: null };
      let rows = data[table] ?? [];
      // crude filter: apply eq() on known columns so scope lookups work
      for (const [op, args] of filters) {
        if (op === "eq") rows = rows.filter((r) => r[args[0] as string] === args[1]);
        if (op === "is") rows = rows.filter((r) => r[args[0] as string] === args[1]);
      }
      return { data: rows, error: null };
    };
    chain.maybeSingle = async () => { const r = resolve(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: null }; };
    chain.single = chain.maybeSingle;
    chain.then = (onOk: (v: unknown) => void) => onOk(resolve());
    return chain;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { from } as any, ops };
}

function v2Stripe(over: Partial<ResyncCandidate> = {}): ResyncCandidate {
  return {
    table: "oauth_connections_v2",
    id: "conn-1",
    provider: "stripe",
    accessTokenSealed: sealToken(RAW_STRIPE),
    refreshTokenSealed: null,
    linkedUserId: "member-1",
    projectId: "proj-1",
    accountId: null,
    providerAccountId: "acct_123",
    metadata: { stripe_user_id: "acct_123" },
    resyncLastAt: null,
    ...over,
  };
}

const STRIPE_METRICS = { mrrAud: 8200, arrAud: 98400, activeSubscriptions: 41, activeCustomers: 57, churnedSubscriptions90d: 1, churnRate90dPct: 2.4, currency: "aud" };
const SCOPE_DATA = {
  projects: [{ id: "proj-1", user_id: "owner-1" }],
  svi_accounts: [{ id: "acc-1", email: "owner@x.test", user_id: "owner-1", project_id: "proj-1", current_svi: 140 }],
};

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = KEY;
  delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  delete process.env.OAUTH_TOKEN_MIGRATION;
  h.stripeMetrics.mockReset().mockResolvedValue(STRIPE_METRICS);
  h.xeroRefresh.mockReset();
  h.xeroTenant.mockReset();
  h.xeroMetrics.mockReset();
  h.notify.mockReset().mockResolvedValue(undefined);
  h.enqueue.mockReset().mockResolvedValue({ queued: 1, endpoints: ["e1"], envelopeId: "env" });
  h.rescore.mockReset().mockResolvedValue({ previousSVI: 140, newSVI: 147, delta: 7, stage: 3, evidenceCount: 3, evidenceBonusApplied: 3, connectedRevenue: null, newBadges: [] });
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
});

function consoleText(): string {
  return [...warnSpy.mock.calls, ...errorSpy.mock.calls, ...logSpy.mock.calls].map((c) => JSON.stringify(c)).join("\n");
}

describe("resyncConnection — unreadable token", () => {
  it("skips the pull, notifies reconnect once / 30 d, releases the lease, and never logs the token", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = OTHER_KEY;
    const sealedElsewhere = sealToken(RAW_STRIPE)!; // sealed under a key we no longer hold
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = KEY;
    const { db, ops } = fakeDb(SCOPE_DATA);
    const c = v2Stripe({ accessTokenSealed: sealedElsewhere });

    const out = await resyncConnection(db, c, { now: NOW });

    expect(out).toMatchObject({ outcome: "token_unreadable", id: "conn-1", provider: "stripe", project_id: "proj-1" });
    expect(h.stripeMetrics).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: "owner-1",
      projectId: "proj-1",
      kind: "connector_reconnect",
      payload: expect.objectContaining({ provider: "stripe", href: "/workspace/evidence" }),
      dedupeKey: "connector_reconnect:stripe:oauth_connections_v2:conn-1",
      throttleMs: RECONNECT_NOTIFY_THROTTLE_MS,
    }));
    expect(RECONNECT_NOTIFY_THROTTLE_MS).toBe(30 * 24 * 60 * 60 * 1000);
    const release = ops.find((o) => o.table === "oauth_connections_v2" && o.op === "update");
    expect(release?.args[0]).toMatchObject({ resync_leased_until: null, last_sync_error: "token_unreadable", status: "error" });
    expect(ops.some((o) => o.table === "connector_snapshots")).toBe(false);
    // The security pin: no console output contains the sealed payload or raw bytes.
    const text = consoleText();
    expect(text).not.toContain(sealedElsewhere);
    expect(text).not.toContain(RAW_STRIPE);
    expect(JSON.stringify(out)).not.toContain(RAW_STRIPE);
  });
});

describe("resyncConnection — Stripe Connect (v2 vault)", () => {
  it("pulls with the connected account's token, writes the dated snapshot, refreshes signals + evidence, rescored + webhook when changed", async () => {
    const { db, ops } = fakeDb({ ...SCOPE_DATA, connector_snapshots: [] });
    const out = await resyncConnection(db, v2Stripe(), { now: NOW });

    expect(out).toMatchObject({ outcome: "synced", changed: true, svi_delta: 7, webhooks_queued: 1 });
    expect(h.stripeMetrics).toHaveBeenCalledWith(RAW_STRIPE);

    // Snapshot shape (0349): owner-keyed, dated, provider + metrics + source.
    const snap = ops.find((o) => o.table === "connector_snapshots" && o.op === "insert");
    expect(snap?.args[0]).toEqual({
      user_id: "owner-1",
      project_id: "proj-1",
      provider: "stripe",
      taken_at: NOW.toISOString(),
      metrics: STRIPE_METRICS,
      source: "resync",
    });

    // svi_signals upsert on the unique key, all four metrics, dated now.
    const sig = ops.find((o) => o.table === "svi_signals" && o.op === "upsert");
    expect(sig?.args[1]).toEqual({ onConflict: "user_id,provider,signal_key,project_id", ignoreDuplicates: false });
    const rows = sig?.args[0] as Row[];
    expect(rows.map((r) => [r.signal_key, r.signal_value_num])).toEqual([
      ["mrr_aud", 8200], ["active_customers", 57], ["active_subscriptions", 41], ["churn_rate_90d_pct", 2.4],
    ]);
    for (const r of rows) expect(r).toMatchObject({ user_id: "owner-1", project_id: "proj-1", provider: "stripe", captured_at: NOW.toISOString() });

    // Evidence rows refreshed on the account (tre + mpc), dated, magnitude-priced.
    const evInserts = ops.filter((o) => o.table === "svi_evidence" && o.op === "insert").map((o) => o.args[0] as Row);
    expect(evInserts.map((r) => [r.evidence_type, r.dimension])).toEqual([["stripe", "tre"], ["stripe", "mpc"]]);
    expect(evInserts[0]).toMatchObject({ account_id: "acc-1", confidence_level: "connected_source", verified_at: NOW.toISOString(), svi_impact: 10 });
    expect(JSON.parse(evInserts[0].value_or_url as string)).toMatchObject({ mrr: 8200, customerCount: 57, churnRate90dPct: 2.4, source: "connector_resync" });

    // Rescore through the shared lib + webhook to the OWNER only.
    expect(h.rescore).toHaveBeenCalledWith(db, expect.objectContaining({ accountId: "acc-1", dataEmail: "owner@x.test", projectId: "proj-1", ownerUserId: "owner-1", currentSvi: 140 }));
    expect(h.enqueue).toHaveBeenCalledWith(
      "svi.rescored",
      "proj-1",
      expect.objectContaining({ project_id: "proj-1", account_id: "acc-1", svi_total: 147, previous_svi: 140, delta: 7, source: "connector_resync", snapshot_date: "2026-09-14" }),
      expect.objectContaining({ userIds: ["owner-1"] }),
    );

    // Lease released + sync stamped.
    const release = ops.filter((o) => o.table === "oauth_connections_v2" && o.op === "update").at(-1);
    expect(release?.args[0]).toMatchObject({ resync_leased_until: null, resync_last_at: NOW.toISOString(), last_sync_error: null, status: "active" });
    expect(consoleText()).not.toContain(RAW_STRIPE);
  });

  it("unchanged values → snapshot written, signals refreshed, but NO rescore and NO webhook", async () => {
    const { db, ops } = fakeDb({
      ...SCOPE_DATA,
      connector_snapshots: [{ id: "s0", user_id: "owner-1", project_id: "proj-1", provider: "stripe", taken_at: "2026-09-07T05:00:00Z", metrics: { ...STRIPE_METRICS, mrrAud: 8200.3 }, source: "resync" }],
    });
    const out = await resyncConnection(db, v2Stripe(), { now: NOW });
    expect(out).toMatchObject({ outcome: "unchanged", changed: false, svi_delta: null, webhooks_queued: 0 });
    expect(ops.some((o) => o.table === "connector_snapshots" && o.op === "insert")).toBe(true);
    expect(ops.some((o) => o.table === "svi_signals" && o.op === "upsert")).toBe(true);
    expect(h.rescore).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("a provider failure is reported, the lease released with the error, nothing rescored", async () => {
    h.stripeMetrics.mockRejectedValue(new Error("stripe 429"));
    const { db, ops } = fakeDb(SCOPE_DATA);
    const out = await resyncConnection(db, v2Stripe(), { now: NOW });
    expect(out).toMatchObject({ outcome: "failed", error: "stripe 429" });
    const release = ops.filter((o) => o.table === "oauth_connections_v2" && o.op === "update").at(-1);
    expect(release?.args[0]).toMatchObject({ resync_leased_until: null, last_sync_error: "stripe 429" });
    expect(h.rescore).not.toHaveBeenCalled();
    expect(consoleText()).not.toContain(RAW_STRIPE);
  });
});

function legacyXero(over: Partial<ResyncCandidate> = {}): ResyncCandidate {
  return {
    table: "oauth_connections",
    id: "legacy-9",
    provider: "xero",
    accessTokenSealed: sealToken("xero_access_old"),
    refreshTokenSealed: sealToken(RAW_XERO_REFRESH),
    linkedUserId: null,
    projectId: null,
    accountId: "acc-1",
    providerAccountId: "tenant-1",
    metadata: { tenantId: "tenant-1", tenantName: "Acme Pty Ltd" },
    resyncLastAt: "2026-09-01T05:00:00Z",
    ...over,
  };
}

const XERO_METRICS = { totalIncomeAud: 27_000, totalExpensesAud: 19_500, netProfitAud: 7_500, bankBalanceAud: 42_100.5, windowMonths: 3, tenantName: "Acme Pty Ltd", reportPeriod: null };

describe("resyncConnection — Xero (legacy vault)", () => {
  it("refreshes first, reseals the rotated pair, pulls the 3-month P&L + bank balance, writes income/3 as mrr_aud and both evidence rows", async () => {
    h.xeroRefresh.mockResolvedValue({ accessToken: "xero_access_new", refreshToken: "xero_refresh_new", expiresAt: "2026-09-14T05:30:00Z" });
    h.xeroMetrics.mockResolvedValue(XERO_METRICS);
    const { db, ops } = fakeDb({ ...SCOPE_DATA, connector_snapshots: [] });

    const out = await resyncConnection(db, legacyXero(), { now: NOW });

    expect(out).toMatchObject({ outcome: "synced", changed: true, project_id: "proj-1" });
    expect(h.xeroRefresh).toHaveBeenCalledWith(RAW_XERO_REFRESH);
    expect(h.xeroTenant).not.toHaveBeenCalled(); // tenant known from the row
    expect(h.xeroMetrics).toHaveBeenCalledWith("xero_access_new", "tenant-1", "Acme Pty Ltd");

    // Rotated pair resealed onto the legacy row — sealed (gcm:), never plaintext.
    const reseal = ops.find((o) => o.table === "oauth_connections" && o.op === "update" && "access_token" in (o.args[0] as Row));
    const patch = reseal?.args[0] as Row;
    expect(String(patch.access_token)).toMatch(/^gcm:/);
    expect(String(patch.refresh_token)).toMatch(/^gcm:/);
    expect(JSON.stringify(patch)).not.toContain("xero_refresh_new");

    const snap = ops.find((o) => o.table === "connector_snapshots" && o.op === "insert")?.args[0] as Row;
    expect(snap).toMatchObject({ user_id: "owner-1", project_id: "proj-1", provider: "xero", source: "resync", metrics: XERO_METRICS });

    const sig = ops.find((o) => o.table === "svi_signals" && o.op === "upsert")?.args[0] as Row[];
    expect(sig.map((r) => [r.signal_key, r.signal_value_num])).toEqual([["mrr_aud", 9000], ["expenses_3m_aud", 19_500], ["bank_balance_aud", 42_100.5]]);

    const ev = ops.filter((o) => o.table === "svi_evidence" && o.op === "insert").map((o) => o.args[0] as Row);
    expect(ev.map((r) => [r.evidence_type, r.dimension])).toEqual([["xero_pl", "financial_health"], ["xero_revenue", "traction"]]);
    expect(JSON.parse(ev[0].value_or_url as string)).toMatchObject({ totalIncomeAud: 27_000, totalExpensesAud: 19_500, bankBalanceAud: 42_100.5 });

    expect(h.enqueue).toHaveBeenCalledWith("svi.rescored", "proj-1", expect.objectContaining({ source: "connector_resync" }), expect.objectContaining({ userIds: ["owner-1"] }));
    expect(consoleText()).not.toContain(RAW_XERO_REFRESH);
    expect(consoleText()).not.toContain("xero_access_new");
  });

  it("refresh rejected (invalid_grant) → needs_reconnect + one notification, nothing pulled", async () => {
    const { XeroRefreshError } = await import("./xero-metrics");
    h.xeroRefresh.mockRejectedValue(new XeroRefreshError(400, "invalid_grant"));
    const { db, ops } = fakeDb(SCOPE_DATA);
    const out = await resyncConnection(db, legacyXero(), { now: NOW });
    expect(out).toMatchObject({ outcome: "needs_reconnect", error: "xero_refresh_rejected" });
    expect(h.xeroMetrics).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "connector_reconnect", userId: "owner-1", payload: expect.objectContaining({ provider: "xero" }) }));
    expect(ops.some((o) => o.table === "connector_snapshots")).toBe(false);
  });
});

describe("listResyncCandidates / claimConnection", () => {
  it("merges v2 then legacy rows under the cap and maps the sealed columns without opening them", async () => {
    const { db, ops } = fakeDb({
      oauth_connections_v2: [{ id: "v2-1", user_id: "u-1", project_id: "p-1", provider: "stripe", status: "active", provider_account_id: "acct_1", access_token_encrypted: "gcm:x:y:z", refresh_token_encrypted: null, metadata: { livemode: true }, resync_last_at: null }],
      oauth_connections: [
        { id: "l-1", account_id: "acc-1", provider: "xero", provider_user_id: null, access_token: "gcm:a:b:c", refresh_token: "gcm:d:e:f", raw_profile: JSON.stringify({ tenantId: "t-1", tenantName: "Acme" }), resync_last_at: null },
        { id: "l-2", account_id: "acc-2", provider: "github", provider_user_id: null, access_token: "gcm:a:b:c", refresh_token: null, raw_profile: null, resync_last_at: null },
      ],
    });
    const out = await listResyncCandidates(db, MAX_CONNECTIONS_PER_TICK, NOW);
    expect(MAX_CONNECTIONS_PER_TICK).toBe(20);
    expect(out.map((c) => [c.table, c.id, c.provider])).toEqual([["oauth_connections_v2", "v2-1", "stripe"], ["oauth_connections", "l-1", "xero"]]);
    expect(out[1]).toMatchObject({ accountId: "acc-1", providerAccountId: "t-1", metadata: { tenantId: "t-1", tenantName: "Acme" }, accessTokenSealed: "gcm:a:b:c" });
    // Only active v2 rows, both providers, oldest-synced first, stale-first filter.
    expect(ops).toContainEqual({ table: "oauth_connections_v2", op: "eq", args: ["status", "active"] });
    expect(ops).toContainEqual({ table: "oauth_connections_v2", op: "in", args: ["provider", ["stripe", "xero"]] });
    expect(ops).toContainEqual({ table: "oauth_connections_v2", op: "limit", args: [20] });
    expect(ops.find((o) => o.table === "oauth_connections_v2" && o.op === "or")?.args[0]).toMatch(/^resync_last_at\.is\.null,resync_last_at\.lt\./);
    expect(ops).toContainEqual({ table: "oauth_connections", op: "not", args: ["access_token", "is", null] });
    expect(ops).toContainEqual({ table: "oauth_connections", op: "limit", args: [19] });
  });

  it("claim is a conditional flip: wins when the UPDATE matched, loses (false) when another tick holds the lease", async () => {
    const win = fakeDb({});
    expect(await claimConnection(win.db, { table: "oauth_connections_v2", id: "v2-1" }, NOW)).toBe(true);
    const upd = win.ops.find((o) => o.op === "update");
    expect(upd?.args[0]).toEqual({ resync_leased_until: "2026-09-14T05:15:00.000Z" });
    expect(win.ops.find((o) => o.op === "or")?.args[0]).toBe(`resync_leased_until.is.null,resync_leased_until.lt.${NOW.toISOString()}`);
    expect(win.ops).toContainEqual({ table: "oauth_connections_v2", op: "eq", args: ["id", "v2-1"] });

    const lose = fakeDb({}, { claimWins: false });
    expect(await claimConnection(lose.db, { table: "oauth_connections", id: "l-1" }, NOW)).toBe(false);
  });
});
