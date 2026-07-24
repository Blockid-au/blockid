import { describe, expect, it } from "vitest";
import {
  DIGEST_SNAPSHOT_KPI_SECTIONS,
  buildDigestSnapshot,
  parseDigestSnapshotLine,
  readLastDigestSnapshot,
  serialiseDigestSnapshot,
  summariseDigestSnapshot,
  type DigestSnapshotEnvelope,
} from "./digest-snapshot";

const CAPTURED = new Date("2026-07-27T04:15:00.000Z");
const WEEK = "2026-W31";

function baseEnvelope(): DigestSnapshotEnvelope {
  return {
    ok: true,
    week: WEEK,
    reseller_count: 1,
    emailed: true,
    budget_utilization: { month_key: "2026-07", reseller_count: 1, rows: [] },
    tier_mix: { reseller_count: 1, rows: [] },
    commission_cleared_mtd: { month_key: "2026-07", reseller_count: 1, rows: [] },
    clawback_exposure: { reseller_count: 1, rows: [] },
    attributed_mrr: { reseller_count: 1, rows: [] },
    attributed_net_contribution: { month_key: "2026-07", reseller_count: 1, rows: [] },
    attributed_churn_30d: { window_days: 30, reseller_count: 1, rows: [] },
    ledger_drift_events: { window_days: 7, reseller_count: 1, rows: [] },
    gst_reconciliation_delta: { month_key: "2026-07", reseller_count: 1, rows: [] },
    cohort_velocity: { window_months: 3, cohort_months: [], reseller_count: 1, rows: [] },
    ltv_cac_per_reseller: { reseller_count: 1, rows: [] },
    sandbox_share_of_budget: { month_key: "2026-07", reseller_count: 1, rows: [] },
  };
}

describe("DIGEST_SNAPSHOT_KPI_SECTIONS", () => {
  it("locks the 12 canonical KPI section keys in declared order", () => {
    expect(DIGEST_SNAPSHOT_KPI_SECTIONS).toEqual([
      "budget_utilization",
      "tier_mix",
      "commission_cleared_mtd",
      "clawback_exposure",
      "attributed_mrr",
      "attributed_net_contribution",
      "attributed_churn_30d",
      "ledger_drift_events",
      "gst_reconciliation_delta",
      "cohort_velocity",
      "ltv_cac_per_reseller",
      "sandbox_share_of_budget",
    ]);
  });

  it("has no duplicate keys", () => {
    const set = new Set(DIGEST_SNAPSHOT_KPI_SECTIONS);
    expect(set.size).toBe(DIGEST_SNAPSHOT_KPI_SECTIONS.length);
  });
});

describe("buildDigestSnapshot", () => {
  it("normalises capturedAt to ISO string", () => {
    const s = buildDigestSnapshot({ capturedAt: CAPTURED, week: WEEK, envelope: {} });
    expect(s.captured_at).toBe("2026-07-27T04:15:00.000Z");
  });

  it("copies reseller_count + emailed out of the envelope onto the top level", () => {
    const s = buildDigestSnapshot({
      capturedAt: CAPTURED,
      week: WEEK,
      envelope: { reseller_count: 3, emailed: true },
    });
    expect(s.reseller_count).toBe(3);
    expect(s.emailed).toBe(true);
  });

  it("defaults reseller_count to 0 when the envelope omits it", () => {
    const s = buildDigestSnapshot({
      capturedAt: CAPTURED,
      week: WEEK,
      envelope: { emailed: false },
    });
    expect(s.reseller_count).toBe(0);
    expect(s.emailed).toBe(false);
  });

  it("floors fractional reseller_count and coerces negative to 0", () => {
    const a = buildDigestSnapshot({
      capturedAt: CAPTURED,
      week: WEEK,
      envelope: { reseller_count: 3.7, emailed: true },
    });
    expect(a.reseller_count).toBe(3);
    const b = buildDigestSnapshot({
      capturedAt: CAPTURED,
      week: WEEK,
      envelope: { reseller_count: -5, emailed: true },
    });
    expect(b.reseller_count).toBe(0);
  });

  it("coerces non-boolean emailed to false", () => {
    const s = buildDigestSnapshot({
      capturedAt: CAPTURED,
      week: WEEK,
      envelope: { emailed: "yes" as unknown as boolean },
    });
    expect(s.emailed).toBe(false);
  });

  it("handles Invalid Date by falling back to epoch", () => {
    const s = buildDigestSnapshot({
      capturedAt: new Date("not-a-date"),
      week: WEEK,
      envelope: {},
    });
    expect(s.captured_at).toBe("1970-01-01T00:00:00.000Z");
  });

  it("preserves the full envelope on the row so consumers can drill in", () => {
    const env = baseEnvelope();
    const s = buildDigestSnapshot({ capturedAt: CAPTURED, week: WEEK, envelope: env });
    expect(s.envelope).toBe(env);
  });
});

describe("serialiseDigestSnapshot", () => {
  it("emits exactly one JSON object + trailing newline", () => {
    const s = buildDigestSnapshot({
      capturedAt: CAPTURED,
      week: WEEK,
      envelope: { reseller_count: 1, emailed: true },
    });
    const line = serialiseDigestSnapshot(s);
    expect(line.endsWith("\n")).toBe(true);
    expect(line.slice(0, -1).includes("\n")).toBe(false);
    const parsed = JSON.parse(line);
    expect(parsed.week).toBe(WEEK);
    expect(parsed.captured_at).toBe("2026-07-27T04:15:00.000Z");
    expect(parsed.reseller_count).toBe(1);
    expect(parsed.emailed).toBe(true);
  });
});

describe("parseDigestSnapshotLine round-trip", () => {
  it("returns null on an empty line", () => {
    expect(parseDigestSnapshotLine("")).toBeNull();
    expect(parseDigestSnapshotLine("   \n")).toBeNull();
  });

  it("returns null on a corrupted / non-JSON line", () => {
    expect(parseDigestSnapshotLine("{not json")).toBeNull();
    expect(parseDigestSnapshotLine("42")).toBeNull();
    expect(parseDigestSnapshotLine("null")).toBeNull();
  });

  it("returns null when envelope is missing", () => {
    const bad = JSON.stringify({ week: WEEK, captured_at: CAPTURED.toISOString() });
    expect(parseDigestSnapshotLine(bad)).toBeNull();
  });

  it("round-trips a full snapshot", () => {
    const env = baseEnvelope();
    const s = buildDigestSnapshot({ capturedAt: CAPTURED, week: WEEK, envelope: env });
    const line = serialiseDigestSnapshot(s);
    const parsed = parseDigestSnapshotLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.captured_at).toBe(s.captured_at);
    expect(parsed!.week).toBe(s.week);
    expect(parsed!.reseller_count).toBe(s.reseller_count);
    expect(parsed!.emailed).toBe(s.emailed);
    // Envelope preserves the KPI section keys.
    for (const key of DIGEST_SNAPSHOT_KPI_SECTIONS) {
      expect(parsed!.envelope[key]).toBeDefined();
    }
  });
});

describe("summariseDigestSnapshot", () => {
  it("marks every KPI section present when the envelope carries them", () => {
    const s = buildDigestSnapshot({
      capturedAt: CAPTURED,
      week: WEEK,
      envelope: baseEnvelope(),
    });
    const summary = summariseDigestSnapshot(s);
    expect(summary.sections).toHaveLength(DIGEST_SNAPSHOT_KPI_SECTIONS.length);
    for (const row of summary.sections) {
      expect(row.present).toBe(true);
      expect(row.skipped_reason).toBeNull();
    }
  });

  it("carries skipped_reason across when a section is skipped", () => {
    const env = baseEnvelope();
    (env as Record<string, unknown>).budget_utilization = {
      skipped_reason: "budget_query_failed",
    };
    const s = buildDigestSnapshot({ capturedAt: CAPTURED, week: WEEK, envelope: env });
    const summary = summariseDigestSnapshot(s);
    const budget = summary.sections.find((r) => r.key === "budget_utilization");
    expect(budget?.present).toBe(false);
    expect(budget?.skipped_reason).toBe("budget_query_failed");
  });

  it("marks a section absent when the envelope omits the key entirely", () => {
    const env = baseEnvelope();
    delete (env as Record<string, unknown>).sandbox_share_of_budget;
    const s = buildDigestSnapshot({ capturedAt: CAPTURED, week: WEEK, envelope: env });
    const summary = summariseDigestSnapshot(s);
    const sandbox = summary.sections.find((r) => r.key === "sandbox_share_of_budget");
    expect(sandbox?.present).toBe(false);
    expect(sandbox?.skipped_reason).toBeNull();
  });

  it("preserves the KPI section order in the summary output", () => {
    const s = buildDigestSnapshot({
      capturedAt: CAPTURED,
      week: WEEK,
      envelope: baseEnvelope(),
    });
    const summary = summariseDigestSnapshot(s);
    expect(summary.sections.map((r) => r.key)).toEqual([
      ...DIGEST_SNAPSHOT_KPI_SECTIONS,
    ]);
  });

  it("copies top-level fields (captured_at/week/reseller_count/emailed) onto the summary", () => {
    const s = buildDigestSnapshot({
      capturedAt: CAPTURED,
      week: WEEK,
      envelope: { reseller_count: 4, emailed: false },
    });
    const summary = summariseDigestSnapshot(s);
    expect(summary.captured_at).toBe(s.captured_at);
    expect(summary.week).toBe(WEEK);
    expect(summary.reseller_count).toBe(4);
    expect(summary.emailed).toBe(false);
  });
});

describe("readLastDigestSnapshot", () => {
  function makeLine(week: string): string {
    return serialiseDigestSnapshot(
      buildDigestSnapshot({ capturedAt: CAPTURED, week, envelope: baseEnvelope() }),
    );
  }

  it("returns null on empty input", () => {
    expect(readLastDigestSnapshot("")).toBeNull();
  });

  it("returns null on whitespace-only input", () => {
    expect(readLastDigestSnapshot("\n\n   \n")).toBeNull();
  });

  it("returns null on non-string input", () => {
    // Runtime robustness check — TS forbids this but a bad caller could reach here.
    expect(
      readLastDigestSnapshot(undefined as unknown as string),
    ).toBeNull();
  });

  it("returns the only snapshot when the file has exactly one row", () => {
    const week = "2026-W28";
    const s = readLastDigestSnapshot(makeLine(week));
    expect(s?.week).toBe(week);
  });

  it("returns the newest snapshot when the file has multiple rows", () => {
    const text = makeLine("2026-W28") + makeLine("2026-W29") + makeLine("2026-W30");
    const s = readLastDigestSnapshot(text);
    expect(s?.week).toBe("2026-W30");
  });

  it("skips a corrupted trailing line and returns the previous good row", () => {
    const text = makeLine("2026-W28") + makeLine("2026-W29") + "{not-json\n";
    const s = readLastDigestSnapshot(text);
    expect(s?.week).toBe("2026-W29");
  });

  it("skips multiple corrupted trailing lines", () => {
    const text = makeLine("2026-W28") + "not-json\n" + "another-bad\n";
    const s = readLastDigestSnapshot(text);
    expect(s?.week).toBe("2026-W28");
  });

  it("handles a file with no trailing newline (mid-write truncation)", () => {
    const line = makeLine("2026-W31").replace(/\n$/, "");
    const s = readLastDigestSnapshot(line);
    expect(s?.week).toBe("2026-W31");
  });

  it("returns null when every line is corrupted", () => {
    expect(readLastDigestSnapshot("nope\nnah\n")).toBeNull();
  });
});
