// Colocated tests for lib/funding/growth-extras (T0251): the Growth rung is
// gated on the plan id via planIdToTier (no new flag) — founder growth /
// scale / enterprise + legacy growth SKUs pass, Starter / Free / evaluator
// tiers do not; the server helper also honours an ACTIVE STARTUP PACKAGE
// PURCHASE (review 2026-09-10 #4 — never the `startup_package` feature, which
// no buyer is ever granted).

import { describe, expect, it } from "vitest";
import {
  hasActiveStartupPackage,
  hasGrowthExtras,
  listActiveStartupPackageUserIds,
  planHasGrowthExtras,
  radarWindowOpen,
} from "./growth-extras";

const NOW = new Date("2026-09-10T00:00:00Z");
const OPEN = "2026-12-01T00:00:00Z";
const CLOSED = "2026-09-01T00:00:00Z";

describe("planHasGrowthExtras (pure)", () => {
  it("founder tier ≥ growth (incl. legacy growth SKUs) → true", () => {
    for (const id of ["founder_growth", "founder_scale", "founder_enterprise", "growth", "growth_annual"]) {
      expect(planHasGrowthExtras(id), id).toBe(true);
    }
  });
  it("Free / Starter / unknown / evaluator tiers → false", () => {
    for (const id of ["founder_free", "founder_starter", "free", "founding50", null, undefined, "nope", "investor_vc_ent", "accelerator_enterprise"]) {
      expect(planHasGrowthExtras(id), String(id)).toBe(false);
    }
  });
});

describe("radarWindowOpen (pure)", () => {
  it("open only for a parseable stamp strictly in the future", () => {
    expect(radarWindowOpen(OPEN, NOW)).toBe(true);
    expect(radarWindowOpen(CLOSED, NOW)).toBe(false);
    expect(radarWindowOpen(NOW.toISOString(), NOW)).toBe(false);
    expect(radarWindowOpen(null, NOW)).toBe(false);
    expect(radarWindowOpen("not a date", NOW)).toBe(false);
  });
});

/**
 * Query-builder fake keyed on table: `app_users` honours the `.gt()` /
 * `.in()` filters on the fixture rows; the two marker tables return their
 * rows filtered by `.in("user_id", …)` / `.eq()`.
 */
function fakeDb(fixture: {
  app_users?: Array<{ id: string; money_radar_until: string | null }>;
  startup_package_purchases?: Array<{ user_id: string; status: string }>;
  credit_transactions?: Array<{ user_id: string; reason: string }>;
  error?: string;
}) {
  const calls: Array<{ table: string; ops: string[] }> = [];
  return {
    calls,
    from(table: string) {
      const call = { table, ops: [] as string[] };
      calls.push(call);
      const filters: Array<[string, string, unknown]> = [];
      const c: Record<string, unknown> = {};
      for (const op of ["select", "gt", "in", "eq", "limit"]) {
        c[op] = (...args: unknown[]) => {
          call.ops.push(`${op}(${args.map((a) => JSON.stringify(a)).join(",")})`);
          if (op === "gt" || op === "in" || op === "eq") filters.push([op, String(args[0]), args[1]]);
          return c;
        };
      }
      c.then = (resolve: (v: unknown) => unknown) => {
        if (fixture.error && table === "app_users") return resolve({ data: null, error: { message: fixture.error } });
        const rows = ((fixture as Record<string, unknown[]>)[table] ?? []) as Array<Record<string, unknown>>;
        const data = rows.filter((r) =>
          filters.every(([op, col, v]) => {
            if (op === "in") return (v as unknown[]).includes(r[col]);
            if (op === "eq") return r[col] === v;
            if (op === "gt") return typeof r[col] === "string" && String(r[col]) > String(v);
            return true;
          }),
        );
        return resolve({ data, error: null });
      };
      return c;
    },
  };
}

describe("listActiveStartupPackageUserIds / hasActiveStartupPackage (server)", () => {
  const db = () =>
    fakeDb({
      app_users: [
        { id: "u-pkg-project", money_radar_until: OPEN }, // bought with a project → purchases row
        { id: "u-pkg-noproject", money_radar_until: OPEN }, // bought without a project → only the seed grant
        { id: "u-pkg-expired", money_radar_until: CLOSED }, // window closed
        { id: "u-support-radar", money_radar_until: OPEN }, // support stamp on a plain Starter — no purchase
        { id: "u-refunded", money_radar_until: OPEN }, // refunded package
        { id: "u-starter", money_radar_until: null },
      ],
      startup_package_purchases: [
        { user_id: "u-pkg-project", status: "active" },
        { user_id: "u-pkg-expired", status: "active" },
        { user_id: "u-refunded", status: "refunded" },
      ],
      credit_transactions: [
        { user_id: "u-pkg-noproject", reason: "package_seed" },
        { user_id: "u-pkg-project", reason: "package_seed" },
        { user_id: "u-support-radar", reason: "plan_grant" },
      ],
    });

  it("open radar window AND a purchase marker (purchases row or package_seed grant) — nothing else", async () => {
    const ids = await listActiveStartupPackageUserIds(db(), { now: NOW });
    expect([...ids].sort()).toEqual(["u-pkg-noproject", "u-pkg-project"]);
  });

  it("scopes to userIds when given and short-circuits on an empty list", async () => {
    const d = db();
    expect([...(await listActiveStartupPackageUserIds(d, { now: NOW, userIds: ["u-pkg-noproject", "u-starter"] }))]).toEqual(["u-pkg-noproject"]);
    expect(d.calls[0].ops).toContain('in("id",["u-pkg-noproject","u-starter"])');
    expect((await listActiveStartupPackageUserIds(d, { now: NOW, userIds: [] })).size).toBe(0);
  });

  it("hasActiveStartupPackage: buyer true, expired / support-only / refunded / Starter false, DB error false", async () => {
    expect(await hasActiveStartupPackage("u-pkg-project", { db: db(), now: NOW })).toBe(true);
    expect(await hasActiveStartupPackage("u-pkg-noproject", { db: db(), now: NOW })).toBe(true);
    expect(await hasActiveStartupPackage("u-pkg-expired", { db: db(), now: NOW })).toBe(false);
    expect(await hasActiveStartupPackage("u-support-radar", { db: db(), now: NOW })).toBe(false);
    expect(await hasActiveStartupPackage("u-refunded", { db: db(), now: NOW })).toBe(false);
    expect(await hasActiveStartupPackage("u-starter", { db: db(), now: NOW })).toBe(false);
    expect(await hasActiveStartupPackage("", { db: db(), now: NOW })).toBe(false);
    expect(await hasActiveStartupPackage("u-pkg-project", { db: fakeDb({ error: "42703" }), now: NOW })).toBe(false);
    expect(await hasActiveStartupPackage("u-pkg-project", { db: null, now: NOW })).toBe(false);
  });
});

describe("hasGrowthExtras (server)", () => {
  it("plan rung short-circuits without touching the purchase lookup", async () => {
    let called = false;
    const ok = await hasGrowthExtras({ id: "u", plan: "founder_growth" }, { hasActivePackage: async () => { called = true; return false; } });
    expect(ok).toBe(true);
    expect(called).toBe(false);
  });
  it("Starter / Free with an active Startup Package purchase → true; without → false; a throwing lookup → false", async () => {
    expect(await hasGrowthExtras({ id: "u", plan: "founder_starter" }, { hasActivePackage: async (id) => id === "u" })).toBe(true);
    expect(await hasGrowthExtras({ id: "u", plan: "founder_free" }, { hasActivePackage: async (id) => id === "u" })).toBe(true);
    expect(await hasGrowthExtras({ id: "u", plan: "founder_starter" }, { hasActivePackage: async () => false })).toBe(false);
    expect(await hasGrowthExtras({ id: "u", plan: null }, { hasActivePackage: async () => { throw new Error("db"); } })).toBe(false);
  });
});
