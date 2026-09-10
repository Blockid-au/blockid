// Guest paid-report memory (T0247) — storage-safe, idempotent, never throws.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUEST_PAID_REPORTS_KEY,
  RADAR_UPSELL_AFTER_REPORTS,
  guestPaidReportCount,
  rememberGuestPaidReport,
} from "./guest-paid-reports";

function fakeStorage(opts: { throwOnSet?: boolean; throwOnGet?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    getItem(k: string) {
      if (opts.throwOnGet) throw new Error("blocked");
      return map.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if (opts.throwOnSet) throw new Error("blocked");
      map.set(k, v);
    },
    map,
  };
}

const g = globalThis as { window?: unknown };
let hadWindow: boolean;
let prevWindow: unknown;

beforeEach(() => {
  hadWindow = "window" in g;
  prevWindow = g.window;
});
afterEach(() => {
  if (hadWindow) g.window = prevWindow;
  else delete g.window;
  vi.restoreAllMocks();
});

describe("guest-paid-reports", () => {
  it("counts distinct ids and is idempotent per report", () => {
    const storage = fakeStorage();
    g.window = { localStorage: storage };
    expect(guestPaidReportCount()).toBe(0);
    expect(rememberGuestPaidReport("r1")).toBe(1);
    expect(rememberGuestPaidReport("r1")).toBe(1);
    expect(rememberGuestPaidReport("r2")).toBe(2);
    expect(rememberGuestPaidReport("r3")).toBe(3);
    expect(guestPaidReportCount()).toBe(3);
    expect(JSON.parse(storage.map.get(GUEST_PAID_REPORTS_KEY)!)).toEqual(["r1", "r2", "r3"]);
    expect(guestPaidReportCount() >= RADAR_UPSELL_AFTER_REPORTS).toBe(true);
  });

  it("ignores junk in storage and an empty id", () => {
    const storage = fakeStorage();
    storage.map.set(GUEST_PAID_REPORTS_KEY, '{"not":"an array"}');
    g.window = { localStorage: storage };
    expect(guestPaidReportCount()).toBe(0);
    storage.map.set(GUEST_PAID_REPORTS_KEY, '["a", 1, null, "b"]');
    expect(guestPaidReportCount()).toBe(2);
    expect(rememberGuestPaidReport("")).toBe(0);
  });

  it("reads 0 and drops writes when storage is blocked; no-ops on the server", () => {
    g.window = { localStorage: fakeStorage({ throwOnGet: true, throwOnSet: true }) };
    expect(guestPaidReportCount()).toBe(0);
    expect(() => rememberGuestPaidReport("r1")).not.toThrow();
    delete g.window;
    expect(guestPaidReportCount()).toBe(0);
    expect(rememberGuestPaidReport("r1")).toBe(0);
  });

  it("the upsell threshold is three A$3 reports (A$9)", () => {
    expect(RADAR_UPSELL_AFTER_REPORTS).toBe(3);
  });
});
