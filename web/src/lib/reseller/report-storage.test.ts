import { describe, it, expect } from "vitest";
import {
  buildDownloadFilename,
  buildStoragePath,
  computeRetentionWindow,
  filterVisibleReports,
  isMonthExposed,
  monthKeyOffset,
  monthKeyToInt,
  REPORT_BUCKET,
  RETENTION_EXPOSED_MONTHS,
  RETENTION_HARD_MONTHS,
  selectExpiredReports,
  SIGNED_URL_TTL_SECONDS,
} from "./report-storage";

describe("report-storage constants", () => {
  it("bucket + TTL + retention match plan", () => {
    expect(REPORT_BUCKET).toBe("reseller-reports");
    expect(SIGNED_URL_TTL_SECONDS).toBe(86400);
    expect(RETENTION_EXPOSED_MONTHS).toBe(12);
    expect(RETENTION_HARD_MONTHS).toBe(24);
  });
});

describe("buildStoragePath", () => {
  it("joins reseller_id + month.csv", () => {
    expect(buildStoragePath("abc-123", "2026-07")).toBe("abc-123/2026-07.csv");
  });
});

describe("buildDownloadFilename", () => {
  it("slugifies display name + month", () => {
    expect(buildDownloadFilename("InfoVision Pty Ltd", "2026-07")).toBe(
      "blockid-infovision-pty-ltd-2026-07.csv",
    );
  });
  it("strips punctuation and collapses hyphens", () => {
    expect(buildDownloadFilename('Alpha, "Bravo" & Co', "2026-06")).toBe(
      "blockid-alpha-bravo-co-2026-06.csv",
    );
  });
  it("clamps overlong slugs to 40 chars", () => {
    const name = "a".repeat(120);
    const out = buildDownloadFilename(name, "2026-01");
    expect(out.length).toBeLessThanOrEqual("blockid-".length + 40 + "-2026-01.csv".length);
    expect(out.startsWith("blockid-" + "a".repeat(40))).toBe(true);
  });
  it("falls back to 'reseller' when the input strips to empty", () => {
    expect(buildDownloadFilename("...", "2026-07")).toBe("blockid-reseller-2026-07.csv");
  });
});

describe("monthKeyToInt", () => {
  it("preserves chronological ordering", () => {
    expect(monthKeyToInt("2026-01")).toBeLessThan(monthKeyToInt("2026-12"));
    expect(monthKeyToInt("2025-12")).toBeLessThan(monthKeyToInt("2026-01"));
    expect(monthKeyToInt("2026-07")).toBe(202607);
  });
});

describe("monthKeyOffset", () => {
  const anchor = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15
  it("offset=0 returns current month", () => {
    expect(monthKeyOffset(anchor, 0)).toBe("2026-07");
  });
  it("offset=1 returns previous month", () => {
    expect(monthKeyOffset(anchor, 1)).toBe("2026-06");
  });
  it("offset that spans year boundary", () => {
    expect(monthKeyOffset(anchor, 7)).toBe("2025-12");
    expect(monthKeyOffset(anchor, 19)).toBe("2024-12");
  });
});

describe("computeRetentionWindow", () => {
  const anchor = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15
  it("exposedMinKey is 11 months back so the window covers 12 months incl current", () => {
    const { exposedMinKey, hardMinKey } = computeRetentionWindow(anchor);
    expect(exposedMinKey).toBe("2025-08");
    expect(hardMinKey).toBe("2024-08");
  });
});

describe("filterVisibleReports + isMonthExposed", () => {
  const anchor = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15
  const files = [
    { month_key: "2026-07" },
    { month_key: "2026-01" },
    { month_key: "2025-08" }, // exactly at cutoff → visible
    { month_key: "2025-07" }, // just outside → hidden
    { month_key: "2024-01" }, // ancient → hidden (still not purged)
  ];
  it("keeps last 12 months only", () => {
    const visible = filterVisibleReports(files, anchor).map((f) => f.month_key);
    expect(visible).toEqual(["2026-07", "2026-01", "2025-08"]);
  });
  it("isMonthExposed agrees with filter", () => {
    expect(isMonthExposed("2026-07", anchor)).toBe(true);
    expect(isMonthExposed("2025-08", anchor)).toBe(true);
    expect(isMonthExposed("2025-07", anchor)).toBe(false);
    expect(isMonthExposed("2024-01", anchor)).toBe(false);
  });
});

describe("selectExpiredReports", () => {
  const anchor = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15
  const files = [
    { month_key: "2026-07" },
    { month_key: "2024-08" }, // exactly at 24mo cutoff → NOT expired
    { month_key: "2024-07" }, // one month older → expired
    { month_key: "2023-01" }, // very old → expired
  ];
  it("purges rows older than 24-month hard retention", () => {
    const expired = selectExpiredReports(files, anchor).map((f) => f.month_key);
    expect(expired).toEqual(["2024-07", "2023-01"]);
  });
});
