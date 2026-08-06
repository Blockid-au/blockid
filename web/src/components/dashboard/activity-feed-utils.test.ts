import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BarChart3,
  FileText,
  PieChart,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  buildActivityItems,
  formatRelativeTime,
} from "./activity-feed-utils";

describe("buildActivityItems", () => {
  const NOW = new Date("2026-08-06T12:00:00.000Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an empty array for an empty input", () => {
    expect(buildActivityItems([])).toEqual([]);
  });

  it("assigns id from array index as string", () => {
    const items = buildActivityItems([
      { action_type: "svi_analysis", description: "a", created_at: new Date(NOW).toISOString() },
      { action_type: "svi_analysis", description: "b", created_at: new Date(NOW).toISOString() },
      { action_type: "svi_analysis", description: "c", created_at: new Date(NOW).toISOString() },
    ]);
    expect(items.map((it) => it.id)).toEqual(["0", "1", "2"]);
  });

  it("maps each known action_type to its lucide icon", () => {
    const cases: Array<[string, unknown]> = [
      ["svi_analysis", TrendingUp],
      ["evidence_added", FileText],
      ["cap_table_updated", PieChart],
      ["shareholder_added", Users],
      ["report_generated", BarChart3],
      ["equity_setup", Shield],
    ];
    for (const [type, icon] of cases) {
      const [item] = buildActivityItems([
        { action_type: type, description: "x", created_at: new Date(NOW).toISOString() },
      ]);
      expect(item.icon).toBe(icon);
    }
  });

  it("falls back to FileText for unknown action_type", () => {
    const [item] = buildActivityItems([
      { action_type: "never_seen_before", description: "x", created_at: new Date(NOW).toISOString() },
    ]);
    expect(item.icon).toBe(FileText);
  });

  it("uses description when provided", () => {
    const [item] = buildActivityItems([
      {
        action_type: "svi_analysis",
        description: "SVI recomputed after new evidence",
        created_at: new Date(NOW).toISOString(),
      },
    ]);
    expect(item.text).toBe("SVI recomputed after new evidence");
  });

  it("falls back to action_type with underscores replaced when description is empty", () => {
    const [item] = buildActivityItems([
      { action_type: "cap_table_updated", description: "", created_at: new Date(NOW).toISOString() },
    ]);
    expect(item.text).toBe("cap table updated");
  });

  it("replaces every underscore in the fallback text (not only the first)", () => {
    const [item] = buildActivityItems([
      { action_type: "a_b_c_d_e", description: "", created_at: new Date(NOW).toISOString() },
    ]);
    expect(item.text).toBe("a b c d e");
  });

  it("passes created_at through formatRelativeTime for the time field", () => {
    const ten = new Date(NOW - 10 * 60_000).toISOString();
    const [item] = buildActivityItems([
      { action_type: "svi_analysis", description: "x", created_at: ten },
    ]);
    expect(item.time).toBe("10m ago");
  });

  it("preserves input order", () => {
    const items = buildActivityItems([
      { action_type: "evidence_added", description: "first", created_at: new Date(NOW).toISOString() },
      { action_type: "shareholder_added", description: "second", created_at: new Date(NOW).toISOString() },
      { action_type: "report_generated", description: "third", created_at: new Date(NOW).toISOString() },
    ]);
    expect(items.map((it) => it.text)).toEqual(["first", "second", "third"]);
    expect(items.map((it) => it.icon)).toEqual([FileText, Users, BarChart3]);
  });
});

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-08-06T12:00:00.000Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Just now' for timestamps within the last minute", () => {
    expect(formatRelativeTime(new Date(NOW).toISOString())).toBe("Just now");
    expect(formatRelativeTime(new Date(NOW - 30_000).toISOString())).toBe("Just now");
    expect(formatRelativeTime(new Date(NOW - 59_999).toISOString())).toBe("Just now");
  });

  it("returns 'Just now' for future timestamps (clock skew)", () => {
    expect(formatRelativeTime(new Date(NOW + 5_000).toISOString())).toBe("Just now");
  });

  it("returns Xm ago for the 1..59 minute range", () => {
    expect(formatRelativeTime(new Date(NOW - 60_000).toISOString())).toBe("1m ago");
    expect(formatRelativeTime(new Date(NOW - 45 * 60_000).toISOString())).toBe("45m ago");
    expect(formatRelativeTime(new Date(NOW - 59 * 60_000).toISOString())).toBe("59m ago");
  });

  it("returns Xh ago for the 1..23 hour range", () => {
    expect(formatRelativeTime(new Date(NOW - 60 * 60_000).toISOString())).toBe("1h ago");
    expect(formatRelativeTime(new Date(NOW - 5 * 60 * 60_000).toISOString())).toBe("5h ago");
    expect(formatRelativeTime(new Date(NOW - 23 * 60 * 60_000).toISOString())).toBe("23h ago");
  });

  it("returns Xd ago for the 1..6 day range", () => {
    const day = 24 * 60 * 60_000;
    expect(formatRelativeTime(new Date(NOW - day).toISOString())).toBe("1d ago");
    expect(formatRelativeTime(new Date(NOW - 3 * day).toISOString())).toBe("3d ago");
    expect(formatRelativeTime(new Date(NOW - 6 * day).toISOString())).toBe("6d ago");
  });

  it("falls back to a localized date string once the delta is >= 7 days", () => {
    const day = 24 * 60 * 60_000;
    const iso = new Date(NOW - 7 * day).toISOString();
    expect(formatRelativeTime(iso)).toBe(new Date(iso).toLocaleDateString());
    const older = new Date(NOW - 90 * day).toISOString();
    expect(formatRelativeTime(older)).toBe(new Date(older).toLocaleDateString());
  });

  it("crosses each boundary at the expected threshold", () => {
    // 60 seconds → 1m (not 'Just now')
    expect(formatRelativeTime(new Date(NOW - 60_000).toISOString())).toBe("1m ago");
    // 3600 seconds → 1h (not 60m)
    expect(formatRelativeTime(new Date(NOW - 3600_000).toISOString())).toBe("1h ago");
    // 86400 seconds → 1d (not 24h)
    expect(formatRelativeTime(new Date(NOW - 86_400_000).toISOString())).toBe("1d ago");
  });
});
