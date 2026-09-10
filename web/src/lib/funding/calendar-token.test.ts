// Colocated vitest for the Money Radar calendar token helpers (T0245).
// Pins: token shape (24 bytes base64url → 32 chars), lazy mint that only
// fills a NULL column (race-safe), token → user lookup, the subscribe URL,
// and the funding_matches ⨝ catalogue join that feeds buildFundingCalendar.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  configured: true,
  results: {} as Record<string, unknown[]>,
  calls: [] as Array<{ table: string; ops: string[] }>,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.configured) return null;
    return {
      from(table: string) {
        const call = { table, ops: [] as string[] };
        state.calls.push(call);
        const chain: Record<string, unknown> = {};
        for (const op of ["select", "eq", "is", "in", "not", "update"]) {
          chain[op] = (...args: unknown[]) => {
            call.ops.push(`${op}(${args.map((a) => JSON.stringify(a)).join(",")})`);
            return chain;
          };
        }
        chain.maybeSingle = async () => ({ data: (state.results[table] ?? [])[0] ?? null, error: null });
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: state.results[table] ?? [], error: null });
        return chain;
      },
    };
  },
}));

import {
  fundingCalendarUrl,
  getOrMintCalendarToken,
  isCalendarTokenShape,
  loadFundingCalendarRows,
  newCalendarToken,
  userForCalendarToken,
} from "./calendar-token";

describe("token shape + URL", () => {
  it("newCalendarToken is 32 base64url chars and passes the shape check", () => {
    const t = newCalendarToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(isCalendarTokenShape(t)).toBe(true);
    expect(isCalendarTokenShape("short")).toBe(false);
    expect(isCalendarTokenShape("x".repeat(32) + "!")).toBe(false);
    expect(isCalendarTokenShape(null)).toBe(false);
  });

  it("fundingCalendarUrl builds the .ics URL against the site origin", () => {
    expect(fundingCalendarUrl("abc", "https://blockid.au/")).toBe("https://blockid.au/api/funding/calendar.ics?token=abc");
  });
});

describe("getOrMintCalendarToken", () => {
  beforeEach(() => {
    state.configured = true;
    state.results = {};
    state.calls = [];
  });

  it("returns the existing token without writing", async () => {
    state.results.app_users = [{ calendar_token: "existing-token-existing-token-xx" }];
    expect(await getOrMintCalendarToken("u1")).toBe("existing-token-existing-token-xx");
    expect(state.calls.some((c) => c.ops.some((o) => o.startsWith("update(")))).toBe(false);
  });

  it("mints only into a NULL column (is(calendar_token,null)) and returns what the DB stored", async () => {
    // First read → no token; the update().select().maybeSingle() → the minted row.
    const tokenFromDb = "minted-minted-minted-minted-mint";
    let first = true;
    Object.defineProperty(state.results, "app_users", {
      get() {
        if (first) {
          first = false;
          return [{ calendar_token: null }];
        }
        return [{ calendar_token: tokenFromDb }];
      },
      configurable: true,
    });
    expect(await getOrMintCalendarToken("u1")).toBe(tokenFromDb);
    const upd = state.calls.find((c) => c.ops.some((o) => o.startsWith("update(")))!;
    expect(upd.ops).toContain('is("calendar_token",null)');
    expect(upd.ops).toContain('eq("id","u1")');
    const written = upd.ops.find((o) => o.startsWith("update("))!;
    expect(written).toMatch(/"calendar_token":"[A-Za-z0-9_-]{32}"/);
  });

  it("null when Supabase is not configured", async () => {
    state.configured = false;
    expect(await getOrMintCalendarToken("u1")).toBeNull();
    expect(await userForCalendarToken("a".repeat(32))).toBeNull();
    expect(await loadFundingCalendarRows("u1")).toEqual([]);
  });
});

describe("userForCalendarToken", () => {
  beforeEach(() => {
    state.configured = true;
    state.results = {};
    state.calls = [];
  });

  it("rejects malformed tokens before touching the DB and maps the row", async () => {
    expect(await userForCalendarToken("nope")).toBeNull();
    expect(state.calls).toHaveLength(0);
    state.results.app_users = [{ id: "u1", email: "f@x.au", plan: "founder_starter" }];
    expect(await userForCalendarToken("b".repeat(32))).toEqual({ id: "u1", email: "f@x.au", plan: "founder_starter" });
    expect(state.calls[0].ops).toContain(`eq("calendar_token",${JSON.stringify("b".repeat(32))})`);
  });
});

describe("loadFundingCalendarRows", () => {
  beforeEach(() => {
    state.configured = true;
    state.results = {};
    state.calls = [];
  });

  it("joins funding_matches to au_grants / au_programs / projects and drops orphans", async () => {
    state.results.funding_matches = [
      { ref_kind: "grant", ref_id: "mvp", project_id: "p1", closes_at: "2026-10-03", score: 80, status_at_match: "open" },
      { ref_kind: "program", ref_id: "sm", project_id: null, closes_at: "2026-11-01", score: 70, status_at_match: "upcoming" },
      { ref_kind: "grant", ref_id: "gone", project_id: "p1", closes_at: "2026-11-11", score: 50, status_at_match: "open" },
    ];
    state.results.au_grants = [{ id: "mvp", name: "MVP Ventures", official_url: "https://mvp", summary: "s", amount_max_aud: 200000 }];
    state.results.au_programs = [{ id: "sm", name: "Startmate", official_url: "https://sm", summary: null, program_type: "accelerator", next_cohort_start: "2027-01-15" }];
    state.results.projects = [{ id: "p1", name: "Acme" }];
    const rows = await loadFundingCalendarRows("u1");
    expect(rows).toEqual([
      {
        ref_kind: "grant",
        ref_id: "mvp",
        closes_at: "2026-10-03",
        score: 80,
        status_at_match: "open",
        name: "MVP Ventures",
        official_url: "https://mvp",
        summary: "s",
        amount_max_aud: 200000,
        startup: "Acme",
      },
      {
        ref_kind: "program",
        ref_id: "sm",
        closes_at: "2026-11-01",
        score: 70,
        status_at_match: "upcoming",
        name: "Startmate",
        official_url: "https://sm",
        summary: null,
        program_type: "accelerator",
        next_cohort_start: "2027-01-15",
        startup: null,
      },
    ]);
    const matches = state.calls.find((c) => c.table === "funding_matches")!;
    expect(matches.ops).toEqual(expect.arrayContaining(['eq("user_id","u1")', 'not("closes_at","is",null)', 'in("status_at_match",["open","upcoming"])']));
  });
});
