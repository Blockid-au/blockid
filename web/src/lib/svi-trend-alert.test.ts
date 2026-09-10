// Colocated vitest for lib/svi-trend-alert.ts (T0246).
// Pins: SVI_TREND_ALERT_THRESHOLD = 5 (|delta| ≥ 5 fires, 4.9 does not, both
// directions); first snapshot (delta null) and a missing user write nothing;
// dedupeKey = svi_trend:<project|account>:<snapshot_date> with the one-week
// throttle; the writer hands exactly that plan to insertNotification.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { insertMock } = vi.hoisted(() => ({ insertMock: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications", () => ({ insertNotification: (...a: unknown[]) => insertMock(...a) }));

import {
  SVI_TREND_ALERT_THRESHOLD,
  SVI_TREND_ALERT_THROTTLE_MS,
  sviTrendAlertDecision,
  maybeWriteSviTrendAlert,
  sviTrendDedupeKey,
} from "./svi-trend-alert";

const BASE = { userId: "u1", projectId: "p1", accountId: "a1", sviTotal: 61, snapshotDate: "2026-09-13" };

describe("sviTrendAlertDecision", () => {
  it("threshold is 5 and applies to both directions", () => {
    expect(SVI_TREND_ALERT_THRESHOLD).toBe(5);
    expect(sviTrendAlertDecision({ ...BASE, delta: 5 })).not.toBeNull();
    expect(sviTrendAlertDecision({ ...BASE, delta: -5 })).not.toBeNull();
    expect(sviTrendAlertDecision({ ...BASE, delta: 4.9 })).toBeNull();
    expect(sviTrendAlertDecision({ ...BASE, delta: -4 })).toBeNull();
    expect(sviTrendAlertDecision({ ...BASE, delta: 0 })).toBeNull();
  });

  it("first snapshot / NaN / no user → nothing", () => {
    expect(sviTrendAlertDecision({ ...BASE, delta: null })).toBeNull();
    expect(sviTrendAlertDecision({ ...BASE, delta: undefined })).toBeNull();
    expect(sviTrendAlertDecision({ ...BASE, delta: Number.NaN })).toBeNull();
    expect(sviTrendAlertDecision({ ...BASE, delta: 9, userId: null })).toBeNull();
  });

  it("plan shape: kind, payload, project-scoped dedupe key, weekly throttle", () => {
    expect(sviTrendAlertDecision({ ...BASE, delta: 7.26 })).toEqual({
      userId: "u1",
      projectId: "p1",
      kind: "svi_trend_alert",
      payload: { delta: 7.3, svi_total: 61, snapshot_date: "2026-09-13", direction: "up" },
      dedupeKey: "svi_trend:p1:2026-09-13",
      throttleMs: SVI_TREND_ALERT_THROTTLE_MS,
    });
    expect(sviTrendAlertDecision({ ...BASE, delta: -6, projectId: null })?.dedupeKey).toBe("svi_trend:a1:2026-09-13");
    expect(sviTrendAlertDecision({ ...BASE, delta: -6 })?.payload.direction).toBe("down");
    expect(sviTrendDedupeKey("p9", "2026-01-01")).toBe("svi_trend:p9:2026-01-01");
  });
});

describe("maybeWriteSviTrendAlert", () => {
  it("writes through insertNotification only when the decision fires", async () => {
    insertMock.mockClear();
    expect(await maybeWriteSviTrendAlert({ ...BASE, delta: 2 })).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
    expect(await maybeWriteSviTrendAlert({ ...BASE, delta: -8 })).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({ kind: "svi_trend_alert", dedupeKey: "svi_trend:p1:2026-09-13", payload: { delta: -8 } });
  });

  it("accepts an injected sink", async () => {
    const sink = vi.fn(async () => undefined);
    expect(await maybeWriteSviTrendAlert({ ...BASE, delta: 5 }, sink)).toBe(true);
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
