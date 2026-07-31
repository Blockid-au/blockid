import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Colocated vitest for the public-slug sitemap reader.
 *
 * Master Upgrade Plan §11.1 (Level ≥ 2 evidence-checked profiles only) +
 * §14bis D3 (public_index=true owner opt-in) — pins the four DB filters
 * the sitemap depends on and the defensive per-row guards that keep an
 * unexpected DB row from leaking a sub-verified profile into the sitemap.
 */

interface FilterCall {
  method: "eq" | "gte" | "not" | "order" | "limit";
  args: unknown[];
}

interface QueryCapture {
  from: string;
  columns: string;
  calls: FilterCall[];
}

interface FakeState {
  adminConfigured: boolean;
  captured: QueryCapture[];
  result: {
    data: Array<Record<string, unknown>> | null;
    error: { message: string } | null;
  };
}

const state: FakeState = {
  adminConfigured: true,
  captured: [],
  result: { data: [], error: null },
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from(table: string) {
        const cap: QueryCapture = { from: table, columns: "", calls: [] };
        state.captured.push(cap);
        const chain = {
          select(cols: string) {
            cap.columns = cols;
            return chain;
          },
          eq(col: string, val: unknown) {
            cap.calls.push({ method: "eq", args: [col, val] });
            return chain;
          },
          gte(col: string, val: unknown) {
            cap.calls.push({ method: "gte", args: [col, val] });
            return chain;
          },
          not(col: string, op: string, val: unknown) {
            cap.calls.push({ method: "not", args: [col, op, val] });
            return chain;
          },
          order(col: string, opts: unknown) {
            cap.calls.push({ method: "order", args: [col, opts] });
            return chain;
          },
          async limit(n: number) {
            cap.calls.push({ method: "limit", args: [n] });
            return state.result;
          },
        };
        return chain;
      },
    };
  },
}));

import { listPublicSlugsForSitemap } from "./list-public-slugs";

beforeEach(() => {
  state.adminConfigured = true;
  state.captured = [];
  state.result = { data: [], error: null };
});

describe("listPublicSlugsForSitemap — admin absent", () => {
  it("returns [] when getSupabaseAdmin() is null (marketing build without secrets)", async () => {
    state.adminConfigured = false;
    const out = await listPublicSlugsForSitemap();
    expect(out).toEqual([]);
    expect(state.captured).toHaveLength(0);
  });

  it("does not throw when admin missing (build must never crash)", async () => {
    state.adminConfigured = false;
    await expect(listPublicSlugsForSitemap(10)).resolves.toEqual([]);
  });
});

describe("listPublicSlugsForSitemap — query shape", () => {
  it("targets the projects table", async () => {
    await listPublicSlugsForSitemap();
    expect(state.captured[0]?.from).toBe("projects");
  });

  it("whitelists exactly three columns (no PII loads)", async () => {
    await listPublicSlugsForSitemap();
    expect(state.captured[0]?.columns).toBe(
      "public_slug, verification_level, last_verified_at",
    );
  });

  it("filters public_index = true (owner opt-in per §14bis D3)", async () => {
    await listPublicSlugsForSitemap();
    const eq = state.captured[0]?.calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["public_index", true]);
  });

  it("gate at verification_level ≥ 2 (§11.1 evidence-checked)", async () => {
    await listPublicSlugsForSitemap();
    const gte = state.captured[0]?.calls.find((c) => c.method === "gte");
    expect(gte?.args).toEqual(["verification_level", 2]);
  });

  it("excludes rows with a null public_slug at the DB layer", async () => {
    await listPublicSlugsForSitemap();
    const not = state.captured[0]?.calls.find((c) => c.method === "not");
    expect(not?.args).toEqual(["public_slug", "is", null]);
  });

  it("orders by last_verified_at DESC with nullsFirst false (freshest first, stale-nulls last)", async () => {
    await listPublicSlugsForSitemap();
    const order = state.captured[0]?.calls.find((c) => c.method === "order");
    expect(order?.args).toEqual([
      "last_verified_at",
      { ascending: false, nullsFirst: false },
    ]);
  });

  it("defaults limit to 5000 when not specified", async () => {
    await listPublicSlugsForSitemap();
    const lim = state.captured[0]?.calls.find((c) => c.method === "limit");
    expect(lim?.args).toEqual([5000]);
  });

  it("passes through a custom limit unchanged", async () => {
    await listPublicSlugsForSitemap(42);
    const lim = state.captured[0]?.calls.find((c) => c.method === "limit");
    expect(lim?.args).toEqual([42]);
  });

  it("emits filters in the pinned order (eq → gte → not → order → limit) so a Supabase re-planner surprise is caught", async () => {
    await listPublicSlugsForSitemap();
    const methods = state.captured[0]?.calls.map((c) => c.method);
    expect(methods).toEqual(["eq", "gte", "not", "order", "limit"]);
  });
});

describe("listPublicSlugsForSitemap — error / empty branches", () => {
  it("returns [] when Supabase returns an error", async () => {
    state.result = { data: null, error: { message: "boom" } };
    const out = await listPublicSlugsForSitemap();
    expect(out).toEqual([]);
  });

  it("returns [] when data is null with no error", async () => {
    state.result = { data: null, error: null };
    const out = await listPublicSlugsForSitemap();
    expect(out).toEqual([]);
  });

  it("returns [] when data is an empty array", async () => {
    state.result = { data: [], error: null };
    const out = await listPublicSlugsForSitemap();
    expect(out).toEqual([]);
  });
});

describe("listPublicSlugsForSitemap — row mapping", () => {
  it("maps a well-formed row to {slug, verificationLevel, lastVerifiedAt}", async () => {
    state.result = {
      data: [
        {
          public_slug: "atlassian",
          verification_level: 3,
          last_verified_at: "2026-07-01T12:00:00.000Z",
        },
      ],
      error: null,
    };
    const out = await listPublicSlugsForSitemap();
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("atlassian");
    expect(out[0].verificationLevel).toBe(3);
    expect(out[0].lastVerifiedAt).toBeInstanceOf(Date);
    expect(out[0].lastVerifiedAt.toISOString()).toBe(
      "2026-07-01T12:00:00.000Z",
    );
  });

  it("skips rows with a non-string public_slug (defensive vs. DB drift)", async () => {
    state.result = {
      data: [
        { public_slug: null, verification_level: 3, last_verified_at: "2026-01-01T00:00:00.000Z" },
        { public_slug: 42, verification_level: 3, last_verified_at: "2026-01-01T00:00:00.000Z" },
        { public_slug: undefined, verification_level: 3, last_verified_at: "2026-01-01T00:00:00.000Z" },
        { public_slug: "keep-me", verification_level: 2, last_verified_at: "2026-01-01T00:00:00.000Z" },
      ],
      error: null,
    };
    const out = await listPublicSlugsForSitemap();
    expect(out.map((r) => r.slug)).toEqual(["keep-me"]);
  });

  it("skips rows with verification_level < 2 even if the DB filter regressed", async () => {
    state.result = {
      data: [
        { public_slug: "l1-self-declared", verification_level: 1, last_verified_at: "2026-01-01T00:00:00.000Z" },
        { public_slug: "l0-nothing", verification_level: 0, last_verified_at: "2026-01-01T00:00:00.000Z" },
        { public_slug: "l2-evidence", verification_level: 2, last_verified_at: "2026-01-01T00:00:00.000Z" },
      ],
      error: null,
    };
    const out = await listPublicSlugsForSitemap();
    expect(out.map((r) => r.slug)).toEqual(["l2-evidence"]);
  });

  it("coerces a non-number verification_level to 0 (which is then filtered out)", async () => {
    state.result = {
      data: [
        { public_slug: "bad-level", verification_level: "3", last_verified_at: "2026-01-01T00:00:00.000Z" },
      ],
      error: null,
    };
    const out = await listPublicSlugsForSitemap();
    expect(out).toEqual([]);
  });

  it("falls back to now when last_verified_at is not a string", async () => {
    state.result = {
      data: [
        { public_slug: "no-timestamp", verification_level: 2, last_verified_at: null },
      ],
      error: null,
    };
    const before = Date.now();
    const out = await listPublicSlugsForSitemap();
    const after = Date.now();
    expect(out).toHaveLength(1);
    const ts = out[0].lastVerifiedAt.getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("preserves DB row order (already sorted by last_verified_at DESC)", async () => {
    state.result = {
      data: [
        { public_slug: "newest", verification_level: 2, last_verified_at: "2026-07-31T00:00:00.000Z" },
        { public_slug: "middle", verification_level: 2, last_verified_at: "2026-06-30T00:00:00.000Z" },
        { public_slug: "oldest", verification_level: 2, last_verified_at: "2026-05-30T00:00:00.000Z" },
      ],
      error: null,
    };
    const out = await listPublicSlugsForSitemap();
    expect(out.map((r) => r.slug)).toEqual(["newest", "middle", "oldest"]);
  });

  it("handles a mixed batch — keeps valid rows, drops the rest, without throwing", async () => {
    state.result = {
      data: [
        { public_slug: "ok-1", verification_level: 2, last_verified_at: "2026-07-30T00:00:00.000Z" },
        { public_slug: null, verification_level: 3, last_verified_at: "2026-07-29T00:00:00.000Z" },
        { public_slug: "ok-2", verification_level: 4, last_verified_at: "2026-07-28T00:00:00.000Z" },
        { public_slug: "under-verified", verification_level: 1, last_verified_at: "2026-07-27T00:00:00.000Z" },
      ],
      error: null,
    };
    const out = await listPublicSlugsForSitemap();
    expect(out.map((r) => r.slug)).toEqual(["ok-1", "ok-2"]);
    expect(out.map((r) => r.verificationLevel)).toEqual([2, 4]);
  });
});
