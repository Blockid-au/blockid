// comparables-repo (S-R5) — table-backed AU comparables with the static
// 32-row fallback. Pure: rows are injected with setComparablesForTests();
// primeComparables() is exercised with a mocked Supabase client.

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

import { AU_COMPARABLES, AU_COMPARABLES_COUNT, AU_COMPARABLES_SOURCE_WINDOW } from "@/lib/data/au-comparables";
import {
  COMPARABLES_MILESTONE,
  COMPARABLES_VERIFIED_VIEW,
  comparablesCopyLine,
  comparablesCounts,
  comparablesHeadline,
  comparablesSnapshot,
  deriveArrMultiple,
  invalidateComparablesCache,
  primeComparables,
  rowToCompany,
  rowYear,
  setComparablesForTests,
  sourceWindowOf,
  topComparables,
  type ComparableRaiseRow,
} from "./comparables-repo";

function row(p: Partial<ComparableRaiseRow> = {}): ComparableRaiseRow {
  return {
    id: p.id ?? "11111111-2222-4333-8444-555555555555",
    name: "Acme Robotics",
    sector: "DeepTech",
    stage: "seed",
    round_date: "2026-03-14",
    round_label: "Seed",
    amount_aud: 4_000_000,
    post_money_aud: 20_000_000,
    arr_aud: 1_000_000,
    arr_multiple: null,
    ebitda_multiple: null,
    founded_year: 2024,
    notable: false,
    note: null,
    source_name: "startup-daily",
    source_url: "https://www.startupdaily.net/topic/funding/acme",
    source_date: "2026-03-14",
    verified_at: "2026-03-15T00:00:00Z",
    ...p,
  };
}

afterEach(() => {
  setComparablesForTests(null);
  invalidateComparablesCache();
  mocks.getSupabaseAdmin.mockReset();
});

describe("static fallback (rollback path)", () => {
  it("empty table → the static 32 with the static window, source=static", () => {
    setComparablesForTests([]);
    const s = comparablesSnapshot();
    expect(s.source).toBe("static");
    expect(s.n).toBe(AU_COMPARABLES_COUNT);
    expect(s.n).toBe(AU_COMPARABLES.length);
    expect(s.withMultiplesN).toBe(AU_COMPARABLES.filter((c) => c.arr_multiple > 0).length);
    expect(s.sourceWindow).toBe(AU_COMPARABLES_SOURCE_WINDOW);
    expect(s.sourceLabel).toBe("au-comparables.ts");
  });

  it("copy shows the live (static) count, never 500+ below the milestone", () => {
    setComparablesForTests([]);
    const line = comparablesCopyLine();
    expect(line).toContain(`${AU_COMPARABLES_COUNT} raises tracked`);
    expect(line).toContain("with disclosed multiples");
    expect(line).toContain("sources dated");
    expect(line).not.toContain("500+");
  });
});

describe("table-backed", () => {
  it("verified rows win: n / withMultiplesN / window come from the rows", () => {
    setComparablesForTests([
      row({ id: "a", name: "Acme", round_date: "2025-06-01", arr_multiple: 12 }),
      row({ id: "b", name: "Bolt", round_date: "2026-02-01", post_money_aud: null, arr_aud: null }),
      row({ id: "c", name: "Cove", round_date: "2024-11-11", post_money_aud: 30_000_000, arr_aud: 2_000_000 }),
    ]);
    const c = comparablesCounts();
    expect(c.source).toBe("table");
    expect(c.n).toBe(3);
    expect(c.withMultiplesN).toBe(2); // disclosed 12x + derived 15x; Bolt has neither
    expect(c.sourceWindow).toBe("2024–2026");
    expect(c.sourceLabel).toBe("au_comparable_raises");
  });

  it("topComparables selects from the live pool by sector / stage", () => {
    setComparablesForTests([
      row({ id: "a", name: "Alpha Health", sector: "HealthTech", stage: "seed", arr_multiple: 9 }),
      row({ id: "b", name: "Beta Health", sector: "HealthTech", stage: "series-a", arr_multiple: 11 }),
      row({ id: "c", name: "Gamma Fin", sector: "FinTech", stage: "seed", arr_multiple: 7 }),
    ]);
    const top = topComparables("HealthTech", "seed", 2);
    expect(top.map((t) => t.name)).toEqual(["Alpha Health", "Beta Health"]);
    expect(top[0].arr_multiple).toBe(9);
  });

  it("headline flips to 500+ at the milestone", () => {
    expect(comparablesHeadline(COMPARABLES_MILESTONE - 1)).toBe(String(COMPARABLES_MILESTONE - 1));
    expect(comparablesHeadline(COMPARABLES_MILESTONE)).toBe("500+");
    const many = Array.from({ length: COMPARABLES_MILESTONE }, (_, i) => row({ id: `r${i}`, name: `Co ${i}`, round_date: `2025-01-${String((i % 28) + 1).padStart(2, "0")}` }));
    setComparablesForTests(many);
    expect(comparablesCopyLine()).toContain("500+ raises tracked");
  });
});

describe("row helpers", () => {
  it("deriveArrMultiple: disclosed wins, else post-money ÷ ARR, else null", () => {
    expect(deriveArrMultiple({ arr_multiple: 12.34, post_money_aud: 1, arr_aud: 1 })).toBe(12.3);
    expect(deriveArrMultiple({ arr_multiple: null, post_money_aud: 20_000_000, arr_aud: 1_500_000 })).toBe(13.3);
    expect(deriveArrMultiple({ arr_multiple: 0, post_money_aud: null, arr_aud: 1 })).toBeNull();
  });

  it("rowToCompany maps sector words + unknown stage labels onto the AU enums", () => {
    const c = rowToCompany(row({ sector: "climate tech", stage: "Series A round", founded_year: null, round_date: "2026-05-05", notable: true }));
    expect(c.industry).toBe("CleanTech");
    expect(c.stage).toBe("series-a");
    expect(c.founded_year).toBe(2026);
    expect(c.notable).toBe(true);
    expect(c.arr_multiple).toBe(20); // 20M / 1M
  });

  it("rowYear + sourceWindowOf", () => {
    expect(rowYear({ founded_year: 2019, round_date: "2026-01-01" })).toBe(2019);
    expect(rowYear({ founded_year: null, round_date: "2026-01-01" })).toBe(2026);
    expect(sourceWindowOf([{ round_date: "2025-01-01" }])).toBe("2025");
    expect(sourceWindowOf([])).toBe(AU_COMPARABLES_SOURCE_WINDOW);
  });
});

describe("primeComparables", () => {
  function sb(result: { data?: unknown; error?: { message: string } | null }, seen: { table?: string } = {}) {
    return {
      from: (table: string) => {
        seen.table = table;
        const b = { select: () => b, order: () => b, limit: async () => ({ data: result.data ?? null, error: result.error ?? null }) };
        return b;
      },
    };
  }

  it("reads the verified view and the sync readers see the rows", async () => {
    const seen: { table?: string } = {};
    mocks.getSupabaseAdmin.mockReturnValue(sb({ data: [row({ id: "x", name: "Xylo", arr_multiple: 8 })] }, seen));
    await primeComparables({ force: true });
    expect(seen.table).toBe(COMPARABLES_VERIFIED_VIEW);
    expect(comparablesCounts()).toMatchObject({ n: 1, withMultiplesN: 1, source: "table" });
  });

  it("no client / query error / throw → static fallback, never throws", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    await primeComparables({ force: true });
    expect(comparablesCounts().source).toBe("static");

    invalidateComparablesCache();
    mocks.getSupabaseAdmin.mockReturnValue(sb({ error: { message: 'relation "v_au_comparable_raises_verified" does not exist' } }));
    await primeComparables({ force: true });
    expect(comparablesCounts().source).toBe("static");

    invalidateComparablesCache();
    mocks.getSupabaseAdmin.mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(primeComparables({ force: true })).resolves.toBeUndefined();
    expect(comparablesCounts().source).toBe("static");
  });

  it("is a no-op while test rows are injected", async () => {
    setComparablesForTests([row()]);
    await primeComparables({ force: true });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
