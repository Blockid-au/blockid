// Colocated vitest for src/lib/startup-index-aggregator.ts (T0228).
//
// Pins the pure aggregation contract that feeds startupvalueindex.com:
// median-based BSI-AU, sector/stage buckets, 7-day sparkline, top movers,
// coverage AUD clamp, and citation formatting. Supabase is faked so we can
// hold analysis rows constant across ticks; the clock is frozen with
// vi.useFakeTimers so the daily/weekly windows are deterministic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AnalysisRow {
  id: string;
  email: string;
  total_svi: number | null;
  created_at: string;
  analysis_json: Record<string, unknown> | null;
}

let adminConfigured = true;
let lastSelect: string | null = null;
let lastGte: { col: string; val: unknown } | null = null;
let lastOrder: { col: string; opts: unknown } | null = null;
let lastLimit: number | null = null;
let nextData: AnalysisRow[] | null = [];

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!adminConfigured) return null;
    return {
      from(_table: string) {
        const chain = {
          select(cols: string) {
            lastSelect = cols;
            return chain;
          },
          gte(col: string, val: unknown) {
            lastGte = { col, val };
            return chain;
          },
          order(col: string, opts: unknown) {
            lastOrder = { col, opts };
            return chain;
          },
          limit(n: number) {
            lastLimit = n;
            return Promise.resolve({ data: nextData, error: null });
          },
        };
        return chain;
      },
    };
  },
}));

import { computeIndexHeadlines } from "./startup-index-aggregator";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 31, 15, 0, 0); // 2026-07-31 15:00Z
const TODAY_TS = Date.UTC(2026, 6, 31, 0, 0, 0);

function iso(offsetMs: number): string {
  return new Date(TODAY_TS + offsetMs).toISOString();
}

function row(
  email: string,
  svi: number | null,
  offsetMsFromMidnight: number,
  extra: Record<string, unknown> = {},
): AnalysisRow {
  return {
    id: `id-${email}-${offsetMsFromMidnight}`,
    email,
    total_svi: svi,
    created_at: iso(offsetMsFromMidnight),
    analysis_json: extra,
  };
}

beforeEach(() => {
  adminConfigured = true;
  lastSelect = null;
  lastGte = null;
  lastOrder = null;
  lastLimit = null;
  nextData = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("computeIndexHeadlines — degraded / empty inputs", () => {
  it("returns zero-shape when supabase admin is missing", async () => {
    adminConfigured = false;
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.value).toBe(0);
    expect(out.bsiAu.totalCompanies).toBe(0);
    expect(out.bsiAu.totalCoverageAud).toBe(0);
    expect(out.bsiAu.analysesToday).toBe(0);
    expect(out.bsiAu.analysesYesterday).toBe(0);
    expect(out.sectorIndices).toEqual([]);
    expect(out.stageIndices).toEqual([]);
    expect(out.topMovers.winners).toEqual([]);
    expect(out.topMovers.losers).toEqual([]);
  });

  it("returns zero-shape for empty analysis set", async () => {
    nextData = [];
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.value).toBe(0);
    expect(out.bsiAu.sparkline7d).toHaveLength(7);
    expect(out.bsiAu.sparkline7d.every((v) => v === 0)).toBe(true);
  });

  it("skips rows with null total_svi (never poisons median or buckets)", async () => {
    nextData = [
      row("a@x.io", null, -1000, { sector: "saas", stage: 3 }),
      row("b@x.io", 100, -1000, { sector: "saas", stage: 3 }),
    ];
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.value).toBe(100);
    // identityBuckets still counts by email hash even for null-svi rows
    // (bucket population happens outside the null guard). Only 1 non-null
    // svi entered the median.
    expect(out.sectorIndices[0]?.count).toBe(1);
  });

  it("passes through the loadAnalyses call shape (window filter + limit + ordering)", async () => {
    nextData = [];
    await computeIndexHeadlines(30);
    expect(lastSelect).toBe("id, email, total_svi, created_at, analysis_json");
    expect(lastGte?.col).toBe("created_at");
    expect(lastOrder?.col).toBe("created_at");
    expect(lastOrder?.opts).toEqual({ ascending: false });
    expect(lastLimit).toBe(5000);
  });

  it("null data payload from supabase collapses to []", async () => {
    nextData = null;
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.value).toBe(0);
    expect(out.bsiAu.totalCompanies).toBe(0);
  });
});

describe("computeIndexHeadlines — BSI-AU headline", () => {
  it("computes median for odd-length svi set", async () => {
    nextData = [
      row("a@x.io", 80, -1000, { sector: "saas" }),
      row("b@x.io", 120, -1000, { sector: "saas" }),
      row("c@x.io", 200, -1000, { sector: "saas" }),
    ];
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.value).toBe(120);
  });

  it("rounds the even-length median (mean of two middle values)", async () => {
    nextData = [
      row("a@x.io", 90, -1000),
      row("b@x.io", 100, -1000),
      row("c@x.io", 110, -1000),
      row("d@x.io", 130, -1000),
    ];
    const out = await computeIndexHeadlines();
    // (100 + 110) / 2 = 105
    expect(out.bsiAu.value).toBe(105);
  });

  it("counts analyses-today separately from analyses-yesterday", async () => {
    nextData = [
      row("a@x.io", 100, 3600_000), // 1h after today midnight
      row("a@x.io", 100, 7200_000), // 2h after today midnight
      row("b@x.io", 100, -3600_000), // yesterday
      row("c@x.io", 100, -2 * DAY), // day before yesterday
    ];
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.analysesToday).toBe(2);
    expect(out.bsiAu.analysesYesterday).toBe(1);
  });

  it("totalCompanies dedupes by hashed email (unique founders, not analyses)", async () => {
    nextData = [
      row("shared@x.io", 100, -1000),
      row("shared@x.io", 110, -2000),
      row("shared@x.io", 120, -3000),
      row("other@x.io", 130, -1000),
    ];
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.totalCompanies).toBe(2);
  });

  it("totalCoverageAud sums blended valuations and rounds to an integer", async () => {
    nextData = [
      row("a@x.io", 100, -1000, {
        deepValuation: { blendedValuation: { midAud: 1_234_567.89 } },
      }),
      row("b@x.io", 100, -1000, {
        deepValuation: { blendedValuation: { midAud: 500_000.55 } },
      }),
    ];
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.totalCoverageAud).toBe(Math.round(1_234_567.89 + 500_000.55));
  });

  it("clamps a runaway valuation at 2B AUD (no over-flow into headline)", async () => {
    nextData = [
      row("a@x.io", 100, -1000, {
        deepValuation: { blendedValuation: { midAud: 9_999_999_999 } },
      }),
    ];
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.totalCoverageAud).toBe(2_000_000_000);
  });

  it("clamps a negative valuation at 0 (never subtracts from coverage)", async () => {
    nextData = [
      row("a@x.io", 100, -1000, {
        deepValuation: { blendedValuation: { midAud: -50_000 } },
      }),
      row("b@x.io", 100, -1000, {
        deepValuation: { blendedValuation: { midAud: 100_000 } },
      }),
    ];
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.totalCoverageAud).toBe(100_000);
  });
});

describe("computeIndexHeadlines — sparkline & deltas", () => {
  it("bucketed 7 daily medians land in the right offset slot", async () => {
    nextData = [
      row("a@x.io", 60, -6 * DAY + 3600_000), // 6d ago
      row("b@x.io", 90, -3 * DAY + 3600_000), // 3d ago
      row("c@x.io", 150, 3600_000), // today
    ];
    const out = await computeIndexHeadlines();
    // Empty days inherit the global bsiAu fallback via `|| bsiAu`
    const bsi = out.bsiAu.value;
    expect(out.bsiAu.sparkline7d[0]).toBe(60); // 6d ago
    expect(out.bsiAu.sparkline7d[3]).toBe(90); // 3d ago
    expect(out.bsiAu.sparkline7d[6]).toBe(150); // today
    expect(out.bsiAu.sparkline7d[1]).toBe(bsi); // filler
  });

  it("deltaDay = today - yesterday, deltaWeek = today - 6d-ago", async () => {
    nextData = [
      row("a@x.io", 70, -6 * DAY + 3600_000), // 6d ago
      row("b@x.io", 100, -1 * DAY + 3600_000), // yesterday
      row("c@x.io", 130, 3600_000), // today
    ];
    const out = await computeIndexHeadlines();
    expect(out.bsiAu.deltaDay).toBe(130 - 100);
    expect(out.bsiAu.deltaWeek).toBe(130 - 70);
  });

  it("rows older than the 7-day sparkline are excluded from the sparkline slots", async () => {
    nextData = [
      row("a@x.io", 200, -20 * DAY),
      row("b@x.io", 100, 3600_000),
    ];
    const out = await computeIndexHeadlines();
    // Only today has data. Others fall through to the bsiAu fallback.
    const bsi = out.bsiAu.value;
    expect(out.bsiAu.sparkline7d[6]).toBe(100);
    for (let i = 0; i < 6; i++) {
      expect(out.bsiAu.sparkline7d[i]).toBe(bsi);
    }
  });
});

describe("computeIndexHeadlines — sector indices", () => {
  it("groups by declared sector and drops sectors not in SECTOR_META", async () => {
    nextData = [
      row("a@x.io", 100, -1000, { sector: "saas" }),
      row("b@x.io", 200, -1000, { sector: "fintech" }),
      row("c@x.io", 150, -1000, { sector: "custom-unknown" }),
      row("d@x.io", 150, -1000, {}), // extractSector defaults to "default" — dropped
    ];
    const out = await computeIndexHeadlines();
    const sectors = out.sectorIndices.map((s) => s.sector).sort();
    expect(sectors).toEqual(["fintech", "saas"]);
  });

  it("reads sector from analysis_json.signals.sector when top-level is missing", async () => {
    nextData = [
      row("a@x.io", 100, -1000, { signals: { sector: "AI" } }), // uppercase
      row("b@x.io", 200, -1000, { signals: { sector: "ai" } }),
    ];
    const out = await computeIndexHeadlines();
    const ai = out.sectorIndices.find((s) => s.sector === "ai");
    expect(ai?.count).toBe(2);
    expect(ai?.label).toBe("AI / ML");
  });

  it("sorts sectors by descending count so the busiest sits on top", async () => {
    nextData = [
      row("a1@x.io", 100, -1000, { sector: "saas" }),
      row("a2@x.io", 110, -1000, { sector: "saas" }),
      row("a3@x.io", 120, -1000, { sector: "saas" }),
      row("b1@x.io", 100, -1000, { sector: "fintech" }),
      row("c1@x.io", 100, -1000, { sector: "ai" }),
      row("c2@x.io", 110, -1000, { sector: "ai" }),
    ];
    const out = await computeIndexHeadlines();
    const counts = out.sectorIndices.map((s) => s.count);
    expect(counts).toEqual([3, 2, 1]);
    expect(out.sectorIndices[0].sector).toBe("saas");
  });

  it("sector deltaWeek = median(week) - median(all)", async () => {
    nextData = [
      row("a@x.io", 50, -30 * DAY, { sector: "saas" }), // historical only
      row("b@x.io", 200, -1000, { sector: "saas" }), // this week
    ];
    const out = await computeIndexHeadlines();
    const saas = out.sectorIndices.find((s) => s.sector === "saas");
    // all = median(50, 200) = 125 (rounded)
    // week = median(200) = 200
    expect(saas?.value).toBe(125);
    expect(saas?.deltaWeek).toBe(200 - 125);
  });

  it("sector with no week data defaults deltaWeek to 0", async () => {
    nextData = [
      row("a@x.io", 80, -30 * DAY, { sector: "healthtech" }),
      row("b@x.io", 120, -20 * DAY, { sector: "healthtech" }),
    ];
    const out = await computeIndexHeadlines();
    const ht = out.sectorIndices.find((s) => s.sector === "healthtech");
    expect(ht?.deltaWeek).toBe(0);
  });

  it("attaches label + emoji from SECTOR_META", async () => {
    nextData = [row("a@x.io", 100, -1000, { sector: "marketplace" })];
    const out = await computeIndexHeadlines();
    const mp = out.sectorIndices[0];
    expect(mp.label).toBe("Marketplace");
    expect(mp.emoji).toBe("🛒");
  });
});

describe("computeIndexHeadlines — stage indices", () => {
  it("buckets by numeric stage and labels via STAGE_LABELS", async () => {
    nextData = [
      row("a@x.io", 100, -1000, { sector: "saas", stage: 0 }),
      row("b@x.io", 100, -1000, { sector: "saas", stage: 2 }),
      row("c@x.io", 100, -1000, { sector: "saas", stage: 3 }),
      row("d@x.io", 150, -1000, { sector: "saas", stage: 3 }),
      row("e@x.io", 200, -1000, { sector: "saas", stage: 7 }),
    ];
    const out = await computeIndexHeadlines();
    const byStage = new Map(out.stageIndices.map((s) => [s.stage, s]));
    expect(byStage.get(0)?.label).toBe("Concept");
    expect(byStage.get(2)?.label).toBe("MVP");
    expect(byStage.get(3)?.label).toBe("Traction");
    expect(byStage.get(3)?.count).toBe(2);
    expect(byStage.get(7)?.label).toBe("Mature");
  });

  it("sorts stage indices ascending by stage number", async () => {
    nextData = [
      row("a@x.io", 100, -1000, { sector: "saas", stage: 5 }),
      row("b@x.io", 100, -1000, { sector: "saas", stage: 1 }),
      row("c@x.io", 100, -1000, { sector: "saas", stage: 3 }),
    ];
    const out = await computeIndexHeadlines();
    expect(out.stageIndices.map((s) => s.stage)).toEqual([1, 3, 5]);
  });

  it("out-of-range stage falls back to 'Stage N' label", async () => {
    nextData = [row("a@x.io", 100, -1000, { sector: "saas", stage: 42 })];
    const out = await computeIndexHeadlines();
    expect(out.stageIndices[0].stage).toBe(42);
    expect(out.stageIndices[0].label).toBe("Stage 42");
  });

  it("non-numeric stage bucket collapses to 0 (Concept)", async () => {
    nextData = [
      row("a@x.io", 100, -1000, { sector: "saas", stage: "MVP" }),
      row("b@x.io", 100, -1000, { sector: "saas" }),
    ];
    const out = await computeIndexHeadlines();
    // Both fall through to stage=0 (extractStage returns 0 when non-number)
    expect(out.stageIndices[0].stage).toBe(0);
    expect(out.stageIndices[0].count).toBe(2);
  });
});

describe("computeIndexHeadlines — top movers", () => {
  it("skips identities with < 2 analyses (no basis for a delta)", async () => {
    nextData = [row("a@x.io", 100, -1000, { sector: "saas" })];
    const out = await computeIndexHeadlines();
    expect(out.topMovers.winners).toEqual([]);
    expect(out.topMovers.losers).toEqual([]);
  });

  it("requires a prior analysis > 7 days before the latest (adjacent day rows skipped)", async () => {
    nextData = [
      row("a@x.io", 150, -1000, { sector: "saas" }), // latest
      row("a@x.io", 100, -3 * DAY, { sector: "saas" }), // within week — not a prior
    ];
    const out = await computeIndexHeadlines();
    expect(out.topMovers.winners).toEqual([]);
  });

  it("emits a winner when the latest svi is > 1 above the prior-week value", async () => {
    nextData = [
      row("a@x.io", 180, -1000, { sector: "fintech" }), // latest
      row("a@x.io", 100, -10 * DAY, { sector: "fintech" }), // >7d prior
    ];
    const out = await computeIndexHeadlines();
    // winners = movers sorted DESC by delta; losers = movers sorted ASC.
    // Both lists are populated from the same movers[] — a lone positive mover
    // therefore appears in both slices.
    expect(out.topMovers.winners).toHaveLength(1);
    expect(out.topMovers.winners[0].deltaWeek).toBe(80);
    expect(out.topMovers.winners[0].sector).toBe("fintech");
    expect(out.topMovers.losers).toHaveLength(1);
    expect(out.topMovers.losers[0].deltaWeek).toBe(80);
  });

  it("orders both lists off the same movers[] (winners DESC, losers ASC)", async () => {
    nextData = [
      row("a@x.io", 180, -1000, { sector: "fintech" }), // +80
      row("a@x.io", 100, -10 * DAY, { sector: "fintech" }),
      row("b@x.io", 50, -1000, { sector: "ai" }), // -150
      row("b@x.io", 200, -10 * DAY, { sector: "ai" }),
    ];
    const out = await computeIndexHeadlines();
    expect(out.topMovers.winners.map((m) => m.deltaWeek)).toEqual([80, -150]);
    expect(out.topMovers.losers.map((m) => m.deltaWeek)).toEqual([-150, 80]);
  });

  it("drops movers whose |delta| < 1 (noise floor)", async () => {
    nextData = [
      row("a@x.io", 100.4, -1000, { sector: "saas" }),
      row("a@x.io", 100, -10 * DAY, { sector: "saas" }),
    ];
    const out = await computeIndexHeadlines();
    expect(out.topMovers.winners).toEqual([]);
    expect(out.topMovers.losers).toEqual([]);
  });

  it("caps winners and losers at 5 entries each", async () => {
    const rows: AnalysisRow[] = [];
    for (let i = 0; i < 8; i++) {
      const email = `winner${i}@x.io`;
      rows.push(row(email, 200 + i, -1000, { sector: "saas" }));
      rows.push(row(email, 50, -10 * DAY, { sector: "saas" }));
    }
    for (let i = 0; i < 8; i++) {
      const email = `loser${i}@x.io`;
      rows.push(row(email, 50, -1000, { sector: "fintech" }));
      rows.push(row(email, 200 + i, -10 * DAY, { sector: "fintech" }));
    }
    nextData = rows;
    const out = await computeIndexHeadlines();
    expect(out.topMovers.winners).toHaveLength(5);
    expect(out.topMovers.losers).toHaveLength(5);
  });

  it("winners are sorted by descending deltaWeek", async () => {
    const rows: AnalysisRow[] = [];
    for (let i = 0; i < 4; i++) {
      const email = `winner${i}@x.io`;
      rows.push(row(email, 100 + i * 25, -1000, { sector: "saas" }));
      rows.push(row(email, 50, -10 * DAY, { sector: "saas" }));
    }
    nextData = rows;
    const out = await computeIndexHeadlines();
    const deltas = out.topMovers.winners.map((w) => w.deltaWeek);
    const sorted = [...deltas].sort((a, b) => b - a);
    expect(deltas).toEqual(sorted);
  });

  it("mover ticker is upper-cased and formatted as SECTOR-tail", async () => {
    nextData = [
      row("a@x.io", 180, -1000, { sector: "fintech" }),
      row("a@x.io", 100, -10 * DAY, { sector: "fintech" }),
    ];
    const out = await computeIndexHeadlines();
    const ticker = out.topMovers.winners[0].ticker;
    expect(ticker).toMatch(/^FINT-/);
    // Uppercase throughout
    expect(ticker).toBe(ticker.toUpperCase());
  });
});

describe("computeIndexHeadlines — citation & envelope", () => {
  it("citation embeds date, bsiAu value, and unique-company count", async () => {
    nextData = [
      row("a@x.io", 100, -1000, { sector: "saas" }),
      row("a@x.io", 110, -2000, { sector: "saas" }),
      row("b@x.io", 200, -1000, { sector: "saas" }),
    ];
    const out = await computeIndexHeadlines(45);
    expect(out.citation).toBe(
      `BSI-AU as of 2026-07-31: ${out.bsiAu.value} (n=${out.bsiAu.totalCompanies} companies, window=45d)`,
    );
  });

  it("generatedAt is the frozen current instant in ISO", async () => {
    nextData = [];
    const out = await computeIndexHeadlines();
    expect(out.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it("default windowDays is 90 when caller omits", async () => {
    nextData = [];
    const out = await computeIndexHeadlines();
    expect(out.citation).toContain("window=90d");
  });
});
