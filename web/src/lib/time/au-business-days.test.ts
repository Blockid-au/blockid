import { describe, expect, it } from "vitest";
import { addSydneyBusinessDays, endOfSydneyDay, isSydneyBusinessDay, nswPublicHolidays, sydneyDateKey, verifiedSlaDueAt } from "./au-business-days";

describe("nswPublicHolidays", () => {
  it("2026: published NSW general holidays", () => {
    expect([...nswPublicHolidays(2026)].sort()).toEqual([
      "2026-01-01", "2026-01-26", "2026-04-03", "2026-04-06", "2026-04-25",
      "2026-06-08", "2026-10-05", "2026-12-25", "2026-12-26", "2026-12-28",
    ]);
  });
  it("2027: Christmas on Saturday adds Mon 27 + Tue 28; Australia Day Tue; Easter 28 Mar", () => {
    const h = nswPublicHolidays(2027);
    for (const d of ["2027-01-01", "2027-01-26", "2027-03-26", "2027-03-29", "2027-06-14", "2027-10-04", "2027-12-27", "2027-12-28"]) expect(h.has(d), d).toBe(true);
  });
  it("New Year on a Sunday moves to Monday (2023-01-02)", () => {
    expect(nswPublicHolidays(2023).has("2023-01-02")).toBe(true);
  });
});

describe("business days + SLA", () => {
  it("weekends and holidays are not business days", () => {
    expect(isSydneyBusinessDay("2026-10-24")).toBe(false); // Sat
    expect(isSydneyBusinessDay("2026-10-05")).toBe(false); // Labour Day
    expect(isSydneyBusinessDay("2026-10-20")).toBe(true);
    expect(isSydneyBusinessDay("2026-10-21", ["2026-10-21"])).toBe(false);
  });
  it("uses the Sydney date of the start instant, not UTC", () => {
    // 2026-10-20T14:30Z = Wed 21 Oct 01:30 AEDT
    expect(sydneyDateKey(new Date("2026-10-20T14:30:00Z"))).toBe("2026-10-21");
  });
  it("2 business days from Thursday ends Monday 23:59:59 Sydney", () => {
    const due = verifiedSlaDueAt(new Date("2026-10-22T03:00:00Z")); // Thu 22 Oct, 14:00 AEDT
    expect(sydneyDateKey(due)).toBe("2026-10-26");
    expect(due.toISOString()).toBe("2026-10-26T12:59:59.000Z"); // AEDT = UTC+11
  });
  it("skips Labour Day and Christmas break", () => {
    expect(sydneyDateKey(addSydneyBusinessDays(new Date("2026-10-02T00:00:00Z"), 1))).toBe("2026-10-06");
    expect(sydneyDateKey(addSydneyBusinessDays(new Date("2026-12-24T00:00:00Z"), 1))).toBe("2026-12-29");
  });
  it("end of day honours AEST (winter) as well as AEDT", () => {
    expect(endOfSydneyDay("2026-07-01").toISOString()).toBe("2026-07-01T13:59:59.000Z");
    expect(endOfSydneyDay("2026-11-02").toISOString()).toBe("2026-11-02T12:59:59.000Z");
  });
  it("rejects a negative count", () => {
    expect(() => addSydneyBusinessDays(new Date(), -1)).toThrow(RangeError);
  });
});
