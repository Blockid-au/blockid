// Colocated vitest for lib/digest/weekly.ts — the T0246 money block wiring.
//
// Pins: `money` is on every payload; it is the full block (from
// funding_matches joined to the catalogue) only when `can(user,
// "money_radar")` is true, and the teaser otherwise (no funding_matches read
// at all); a radar deadline inside 30 days or a new match is enough signal
// to send on an otherwise silent week, but the teaser never is.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { canMock, summariesMock, state } = vi.hoisted(() => ({
  canMock: vi.fn(),
  summariesMock: vi.fn(),
  state: {
    tables: {} as Record<string, Array<Record<string, unknown>>>,
    reads: [] as string[],
  },
}));

vi.mock("@/lib/entitlements", () => ({ can: (...a: unknown[]) => canMock(...a) }));
vi.mock("@/lib/analysis/aggregate-startup-summary", () => ({ getAllStartupSummaries: (...a: unknown[]) => summariesMock(...a) }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      state.reads.push(table);
      const filters: Array<{ op: string; col: string; val: unknown }> = [];
      const apply = () => {
        let rows = state.tables[table] ?? [];
        for (const f of filters) {
          if (f.op === "eq") rows = rows.filter((r) => r[f.col] === f.val);
          if (f.op === "in") rows = rows.filter((r) => (f.val as unknown[]).includes(r[f.col]));
        }
        return rows;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq(col: string, val: unknown) {
          filters.push({ op: "eq", col, val });
          return chain;
        },
        in(col: string, val: unknown) {
          filters.push({ op: "in", col, val });
          return chain;
        },
        is: () => chain,
        gte: () => chain,
        lt: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return Promise.resolve({ data: apply(), error: null }).then(onF, onR);
        },
      };
      return chain;
    },
  }),
}));

import { buildFounderDigest } from "./weekly";

const PERIOD_START = new Date("2026-09-07T00:00:00.000Z");
const PERIOD_END = new Date("2026-09-14T00:00:00.000Z");

beforeEach(() => {
  canMock.mockReset().mockResolvedValue(false);
  summariesMock.mockReset().mockResolvedValue([]);
  state.reads = [];
  state.tables = {
    app_users: [{ id: "u1", email: "sam@example.com", display_name: "Sam", plan: "founder_starter", segment: "founder" }],
    projects: [{ id: "p1", user_id: "u1", is_default: true }],
    // One snapshot inside the period → SVI movement → the digest sends.
    svi_snapshots: [{ id: "s1", project_id: "p1", report_share_token: null, dim_results: { tre: { score: 40 } }, svi_total: 61, created_at: "2026-09-10T00:00:00Z" }],
    tbr_views: [],
    tbr_leads: [],
    funding_matches: [
      { user_id: "u1", ref_kind: "grant", ref_id: "nsw-mvp", score: 80, status_at_match: "open", closes_at: "2026-09-26", first_seen_at: "2026-09-13T05:00:00Z" },
      { user_id: "u1", ref_kind: "program", ref_id: "syd-startmate", score: 70, status_at_match: "open", closes_at: null, first_seen_at: "2026-08-01T00:00:00Z" },
    ],
    au_grants: [{ id: "nsw-mvp", name: "MVP Ventures", official_url: "https://mvp.example", amount_max_aud: 50000 }],
    au_programs: [{ id: "syd-startmate", name: "Startmate", official_url: "https://startmate.example", funding_aud: 120000 }],
  };
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

describe("buildFounderDigest — money block", () => {
  it("radar holder: full block built from funding_matches + catalogue names", async () => {
    canMock.mockResolvedValue(true);
    const p = await buildFounderDigest("u1", PERIOD_START, PERIOD_END);
    expect(p).not.toBeNull();
    expect(canMock).toHaveBeenCalledWith({ id: "u1", plan: "founder_starter", segment: "founder" }, "money_radar");
    expect(p!.money).toEqual({
      radar: true,
      new_matches: 1,
      next_deadline: { name: "MVP Ventures", closes_at: "2026-09-26", days: 12, ref_kind: "grant", ref_id: "nsw-mvp", official_url: "https://mvp.example" },
      suggested_action: "Finish your MVP Ventures draft — two weeks is enough if you start now",
      href: "https://blockid.au/workspace/funding",
    });
    expect(state.reads).toContain("funding_matches");
  });

  it("non-radar founder: teaser, and funding_matches is never read", async () => {
    canMock.mockResolvedValue(false);
    const p = await buildFounderDigest("u1", PERIOD_START, PERIOD_END);
    expect(p!.money).toEqual({ radar: false, new_matches: 0, href: "https://blockid.au/pricing?from=digest_money" });
    expect(state.reads).not.toContain("funding_matches");
  });

  it("a radar deadline inside 30 days sends on a silent week; the teaser does not", async () => {
    // Silence the report: snapshot outside the period, no views, no leads.
    state.tables.svi_snapshots = [{ id: "s0", project_id: "p1", report_share_token: null, dim_results: {}, svi_total: 61, created_at: "2026-08-01T00:00:00Z" }];
    state.tables.funding_matches = [
      { user_id: "u1", ref_kind: "grant", ref_id: "nsw-mvp", score: 80, status_at_match: "open", closes_at: "2026-09-26", first_seen_at: "2026-08-01T00:00:00Z" },
    ];
    canMock.mockResolvedValue(false);
    expect(await buildFounderDigest("u1", PERIOD_START, PERIOD_END)).toBeNull();

    canMock.mockResolvedValue(true);
    const p = await buildFounderDigest("u1", PERIOD_START, PERIOD_END);
    expect(p?.money.next_deadline?.days).toBe(12);

    // Far-off deadline + no new matches → still silent.
    state.tables.funding_matches[0].closes_at = "2027-03-01";
    expect(await buildFounderDigest("u1", PERIOD_START, PERIOD_END)).toBeNull();
  });
});
