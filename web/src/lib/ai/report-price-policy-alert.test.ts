import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { maybeAlertReportPricePolicyExpiry, reportPricePolicyExpiryStatus } from "./report-price-policy-alert";

const EXPIRES = "2026-11-22T00:00:00Z";
const at = (iso: string) => Date.parse(iso);
const stateFile = () => join(mkdtempSync(join(tmpdir(), "price-policy-alert-")), "nested", "state.json");

describe("reportPricePolicyExpiryStatus", () => {
  it("does not warn with 7 or more days left", () => {
    expect(reportPricePolicyExpiryStatus(EXPIRES, at("2026-11-15T00:00:00Z"))).toMatchObject({ daysLeft: 7, warn: false, expired: false });
    expect(reportPricePolicyExpiryStatus(EXPIRES, at("2026-10-20T00:00:00Z")).warn).toBe(false);
  });

  it("warns inside the 7-day window and flags expiry at the instant itself", () => {
    expect(reportPricePolicyExpiryStatus(EXPIRES, at("2026-11-15T00:00:01Z"))).toMatchObject({ warn: true, expired: false });
    expect(reportPricePolicyExpiryStatus(EXPIRES, at(EXPIRES))).toMatchObject({ daysLeft: 0, warn: true, expired: true });
  });

  it("treats an unparseable expiry as expired (fail loud)", () => {
    expect(reportPricePolicyExpiryStatus("not-a-date", at(EXPIRES))).toMatchObject({ warn: true, expired: true });
  });
});

describe("maybeAlertReportPricePolicyExpiry", () => {
  it("sends nothing outside the warning window and writes no state", async () => {
    const send = vi.fn(async () => true);
    const file = stateFile();
    const r = await maybeAlertReportPricePolicyExpiry({ expiresAt: EXPIRES, now: at("2026-10-20T12:00:00Z"), send, stateFile: file });
    expect(r).toMatchObject({ warn: false, alerted: false });
    expect(send).not.toHaveBeenCalled();
    expect(() => readFileSync(file, "utf8")).toThrow();
  });

  it("alerts once per UTC day inside the window, then again the next day", async () => {
    const send = vi.fn(async (_text: string) => true);
    const file = stateFile();
    const first = await maybeAlertReportPricePolicyExpiry({ expiresAt: EXPIRES, now: at("2026-11-17T00:30:00Z"), send, stateFile: file });
    expect(first).toMatchObject({ warn: true, alerted: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatch(/expires in 5\.0 day\(s\)/);
    expect(send.mock.calls[0][0]).toContain(EXPIRES);

    const again = await maybeAlertReportPricePolicyExpiry({ expiresAt: EXPIRES, now: at("2026-11-17T23:30:00Z"), send, stateFile: file });
    expect(again).toMatchObject({ warn: true, alerted: false });
    expect(send).toHaveBeenCalledTimes(1);

    const nextDay = await maybeAlertReportPricePolicyExpiry({ expiresAt: EXPIRES, now: at("2026-11-18T00:30:00Z"), send, stateFile: file });
    expect(nextDay.alerted).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ day: "2026-11-18", expiresAt: EXPIRES });
  });

  it("a new expiry date re-arms the alert on the same day", async () => {
    const send = vi.fn(async () => true);
    const file = stateFile();
    const now = at("2026-11-17T01:00:00Z");
    await maybeAlertReportPricePolicyExpiry({ expiresAt: EXPIRES, now, send, stateFile: file });
    await maybeAlertReportPricePolicyExpiry({ expiresAt: "2026-11-20T00:00:00Z", now, send, stateFile: file });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("says EXPIRED once the policy has passed", async () => {
    const send = vi.fn(async (_text: string) => true);
    const r = await maybeAlertReportPricePolicyExpiry({ expiresAt: EXPIRES, now: at("2026-11-23T00:00:00Z"), send, stateFile: stateFile() });
    expect(r.expired).toBe(true);
    expect(send.mock.calls[0][0]).toMatch(/EXPIRED at 2026-11-22T00:00:00Z/);
  });

  it("never throws when the sender fails", async () => {
    const send = vi.fn(async () => { throw new Error("smtp down"); });
    const r = await maybeAlertReportPricePolicyExpiry({ expiresAt: EXPIRES, now: at("2026-11-21T00:00:00Z"), send, stateFile: stateFile() });
    expect(r).toMatchObject({ warn: true, alerted: false });
  });
});
