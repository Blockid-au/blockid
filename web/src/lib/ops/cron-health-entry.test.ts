import { describe, expect, it } from "vitest";
import { normaliseCronEntry } from "./cron-health-entry";

describe("normaliseCronEntry (G33-T03)", () => {
  it("passes the standard row through", () => {
    expect(normaliseCronEntry({ ts: "2026-09-24T00:30:03Z", endpoint: "svi-snapshot", status: "fail", duration_ms: 12, detail: "x" })).toEqual({ ts: "2026-09-24T00:30:03Z", endpoint: "svi-snapshot", status: "fail", duration_ms: 12, detail: "x" });
  });

  it("maps the legacy ga4-daily-pull row that crashed the watchdog", () => {
    expect(normaliseCronEntry({ cron: "ga4-daily-pull", ok: true, note: "appended 2026-09-21 sessions=0", at: "2026-09-22T13:03:34.330Z" })).toEqual({ ts: "2026-09-22T13:03:34.330Z", endpoint: "ga4-daily-pull", status: "ok", duration_ms: 0, detail: "appended 2026-09-21 sessions=0" });
    expect(normaliseCronEntry({ cron: "ga4-daily-pull", ok: false, at: "2026-09-22T13:03:34.330Z" })?.status).toBe("fail");
  });

  it("drops rows without a string ts or endpoint instead of throwing", () => {
    expect(normaliseCronEntry({ endpoint: "x" })).toBeNull();
    expect(normaliseCronEntry({ ts: 5, endpoint: "x" })).toBeNull();
    expect(normaliseCronEntry({ ts: "2026-09-24T00:00:00Z" })).toBeNull();
    expect(normaliseCronEntry(null)).toBeNull();
    expect(normaliseCronEntry("row")).toBeNull();
  });
});
