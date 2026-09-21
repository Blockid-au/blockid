// G21 P3-C — connector freshness: the three states against the proof TTL,
// the pure per-provider fold (newest stamp wins, revoked rows are not
// connectors, snapshot-only providers count), the fleet count, and the
// fail-soft DB reader.

import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TTL_DAYS } from "./claims";
import {
  FRESH_MAX_DAYS,
  STALE_AFTER_DAYS,
  ageInDays,
  computeConnectorFreshness,
  connectorFreshness,
  countStaleConnectors,
  freshnessLine,
  freshnessState,
  staleConnectorCount,
} from "./freshness";

const NOW = new Date("2026-09-20T00:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("freshnessState", () => {
  it("fresh ≤ 30 d, ageing 31–90 d, stale past the connector proof TTL, never without a read", () => {
    expect(STALE_AFTER_DAYS).toBe(DEFAULT_TTL_DAYS.connector);
    expect(FRESH_MAX_DAYS).toBe(30);
    expect(freshnessState(null)).toBe("never");
    expect(freshnessState(0)).toBe("fresh");
    expect(freshnessState(30)).toBe("fresh");
    expect(freshnessState(31)).toBe("ageing");
    expect(freshnessState(90)).toBe("ageing");
    expect(freshnessState(91)).toBe("stale");
    expect(ageInDays(daysAgo(2.4), NOW)).toBe(2);
    expect(ageInDays("not a date", NOW)).toBeNull();
    expect(ageInDays(null, NOW)).toBeNull();
  });

  it("freshnessLine reads as a badge", () => {
    expect(freshnessLine({ state: "never", ageDays: null })).toBe("connected, not yet synced");
    expect(freshnessLine({ state: "fresh", ageDays: 0 })).toBe("synced today");
    expect(freshnessLine({ state: "fresh", ageDays: 3 })).toBe("synced 3 d ago");
    expect(freshnessLine({ state: "ageing", ageDays: 45 })).toBe("ageing — 45 d since the last read");
    expect(freshnessLine({ state: "stale", ageDays: 120 })).toBe("stale — 120 d since the last read; its proof has expired");
  });
});

describe("computeConnectorFreshness", () => {
  it("one row per provider: newest of sync stamp / updated_at / snapshot; revoked rows ignored; snapshot-only providers count; errors carried", () => {
    const out = computeConnectorFreshness(
      {
        connections: [
          { provider: "github", status: "active", lastSyncAt: daysAgo(2), updatedAt: daysAgo(10) },
          { provider: "stripe", status: "active", lastSyncAt: daysAgo(60) },
          { provider: "ga4", status: "active", lastSyncAt: null, updatedAt: null },
          { provider: "ga4", status: "revoked", lastSyncAt: daysAgo(1) },
          { provider: "linkedin", status: "error", lastSyncAt: daysAgo(100), lastSyncError: "401" },
        ],
        snapshots: [
          { provider: "stripe", taken_at: daysAgo(3) },
          { provider: "stripe", taken_at: daysAgo(9) },
          { provider: "xero", taken_at: daysAgo(40) },
        ],
      },
      NOW,
    );
    expect(out).toEqual([
      { provider: "github", label: "GitHub", lastSyncAt: daysAgo(2), ageDays: 2, state: "fresh", error: null },
      { provider: "stripe", label: "Stripe", lastSyncAt: daysAgo(3), ageDays: 3, state: "fresh", error: null },
      { provider: "ga4", label: "Google Analytics", lastSyncAt: null, ageDays: null, state: "never", error: null },
      { provider: "linkedin", label: "LinkedIn", lastSyncAt: daysAgo(100), ageDays: 100, state: "stale", error: "401" },
      { provider: "xero", label: "Xero", lastSyncAt: daysAgo(40), ageDays: 40, state: "ageing", error: null },
    ]);
    expect(staleConnectorCount(out)).toBe(1);
    expect(computeConnectorFreshness({ connections: [{ provider: "stripe", status: "active", lastSyncAt: daysAgo(1), tokenUnreadable: true }], snapshots: [] }, NOW)[0].error).toBe("reconnect needed");
  });

  it("countStaleConnectors folds fleet rows per (project, provider) — active / error only, newest stamp", () => {
    const rows = [
      { project_id: "p1", provider: "stripe", status: "active", last_sync_at: daysAgo(120), updated_at: daysAgo(200) },
      { project_id: "p1", provider: "stripe", status: "active", last_sync_at: daysAgo(130), updated_at: daysAgo(200) }, // duplicate pair → counted once
      { project_id: "p1", provider: "xero", status: "active", last_sync_at: null, updated_at: daysAgo(5) },
      { project_id: "p2", provider: "github", status: "revoked", last_sync_at: daysAgo(400), updated_at: daysAgo(400) },
      { project_id: "p2", provider: "ga4", status: "error", last_sync_at: daysAgo(95), updated_at: daysAgo(95) },
      { project_id: null, provider: "stripe", status: "active", last_sync_at: daysAgo(1), updated_at: daysAgo(1) },
    ];
    expect(countStaleConnectors(rows, NOW)).toBe(2);
    expect(countStaleConnectors([], NOW)).toBe(0);
  });
});

describe("connectorFreshness (db)", () => {
  function fakeDb(data: Record<string, unknown[]>, fail = false) {
    const from = (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
      chain.then = (ok: (v: unknown) => void) => ok(fail ? { data: null, error: { code: "42P01", message: "missing" } } : { data: data[table] ?? [], error: null });
      return chain;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { from } as any;
  }

  it("reads project-scoped connections + snapshots and folds them; a db error or no db → []", async () => {
    const db = fakeDb({
      oauth_connections_v2: [{ provider: "stripe", status: "active", last_sync_at: daysAgo(50), last_sync_error: null, updated_at: daysAgo(50) }],
      connector_snapshots: [{ provider: "stripe", taken_at: daysAgo(2) }, { provider: "xero", taken_at: daysAgo(200) }],
    });
    const out = await connectorFreshness("p1", { db, now: NOW });
    expect(out.map((f) => [f.provider, f.state, f.ageDays])).toEqual([["stripe", "fresh", 2], ["xero", "stale", 200]]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await connectorFreshness("p1", { db: fakeDb({}, true), now: NOW })).toEqual([]);
    expect(await connectorFreshness("p1", { db: null, now: NOW })).toEqual([]);
    expect(await connectorFreshness("", { db, now: NOW })).toEqual([]);
    warn.mockRestore();
  });
});
