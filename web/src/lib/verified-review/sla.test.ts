import { describe, expect, it } from "vitest";
import { verifiedSlaDueAt } from "@/lib/time/au-business-days";
import { businessDaysLeft, businessMsBetween, describeSla, formatSydney, slaState, sydneyInstant } from "./sla";

const H = 3_600_000;
// Sydney local → UTC helper for readable fixtures (AEDT +11 from 4 Oct 2026).
const syd = (key: string, h: number, m = 0) => sydneyInstant(key, h, m);

describe("sydneyInstant (DST-aware)", () => {
  it("AEDT (+11) in October, AEST (+10) after DST ends (first Sunday of April)", () => {
    expect(syd("2026-10-21", 9).toISOString()).toBe("2026-10-20T22:00:00.000Z");
    expect(syd("2027-04-05", 9).toISOString()).toBe("2027-04-04T23:00:00.000Z");
    expect(syd("2026-07-01", 17).toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });
});

describe("businessMsBetween — 09:00–17:00 Sydney on business days only", () => {
  it("same afternoon", () => {
    expect(businessMsBetween(syd("2026-10-20", 13), syd("2026-10-20", 23, 59))).toBe(4 * H);
  });
  it("skips the weekend (Fri 16:00 → Mon 10:00 = 2h)", () => {
    expect(businessMsBetween(syd("2026-10-23", 16), syd("2026-10-26", 10))).toBe(2 * H);
  });
  it("skips an NSW public holiday (Labour Day Mon 5 Oct 2026) across the DST switch", () => {
    expect(businessMsBetween(syd("2026-10-02", 17), syd("2026-10-06", 9))).toBe(0);
    expect(businessMsBetween(syd("2026-10-02", 16), syd("2026-10-06", 10))).toBe(2 * H);
  });
  it("0 for an empty / inverted interval", () => {
    expect(businessMsBetween(syd("2026-10-20", 12), syd("2026-10-20", 12))).toBe(0);
    expect(businessMsBetween(syd("2026-10-21", 12), syd("2026-10-20", 12))).toBe(0);
  });
});

describe("slaState + businessDaysLeft against the real SLA (2 business days)", () => {
  const paid = syd("2026-10-20", 10); // Tue
  const due = verifiedSlaDueAt(paid, 2); // end of Thu 22 Oct, Sydney

  it("due is the end of Thursday in Sydney", () => {
    expect(formatSydney(due)).toMatch(/Thu.*22 Oct.*11:59.*AEDT/i);
  });

  it("on track → due soon (≤ 4 business hours) → overdue", () => {
    expect(slaState(due, syd("2026-10-20", 10))).toBe("on_track");
    expect(slaState(due, syd("2026-10-22", 12))).toBe("on_track"); // 5h left
    expect(slaState(due, syd("2026-10-22", 13, 30))).toBe("due_soon"); // 3.5h left
    expect(slaState(due, syd("2026-10-22", 20))).toBe("due_soon"); // after hours, not yet past the deadline
    expect(slaState(due, syd("2026-10-23", 0, 30))).toBe("overdue");
    expect(slaState(null, syd("2026-10-23", 0, 30))).toBe("no_sla");
  });

  it("business days left / late", () => {
    expect(businessDaysLeft(due, syd("2026-10-20", 10))).toBe(2);
    expect(businessDaysLeft(due, syd("2026-10-21", 10))).toBe(1);
    expect(businessDaysLeft(due, syd("2026-10-22", 10))).toBe(0);
    expect(businessDaysLeft(due, syd("2026-10-26", 10))).toBe(-2); // Fri 23 + Mon 26
  });

  it("a Friday payment is due Tuesday (weekend skipped)", () => {
    const friDue = verifiedSlaDueAt(syd("2026-10-23", 15), 2);
    expect(formatSydney(friDue)).toMatch(/Tue.*27 Oct/i);
    expect(businessDaysLeft(friDue, syd("2026-10-23", 15))).toBe(2);
  });
});

describe("describeSla", () => {
  const due = verifiedSlaDueAt(syd("2026-10-20", 10), 2);
  it("lines the queue shows", () => {
    expect(describeSla(due.toISOString(), syd("2026-10-20", 10)).line).toBe("2 business days left");
    expect(describeSla(due.toISOString(), syd("2026-10-22", 14)).line).toBe("Due today · 3h 00m business time left");
    expect(describeSla(due.toISOString(), syd("2026-10-23", 2)).line).toBe("Overdue by 1 business day");
    expect(describeSla(due.toISOString(), syd("2026-10-27", 9)).line).toBe("Overdue by 3 business days");
  });
  it("overdue on the same Sydney day reads the clock time; bad input reads No SLA", () => {
    const s = describeSla(syd("2026-10-22", 10).toISOString(), syd("2026-10-22", 12, 30));
    expect(s.state).toBe("overdue");
    expect(s.line).toBe("Overdue by 2h 30m");
    expect(describeSla("not-a-date", new Date()).state).toBe("no_sla");
    expect(describeSla(null, new Date()).line).toBe("No SLA recorded");
  });
});
