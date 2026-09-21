// Colocated vitest for the free-allowance rules (G25-C).
//
// Every rule the founder's decision rests on is pinned here: the two-free
// count, the address identity (gmail dots / plus-tags), the abuse guard
// order (IP guard before the allowance), the platform cap turning "now" into
// "queued" but never into a refusal, the env parsing, and the metrics fold.

import { describe, expect, it } from "vitest";

import {
  FREE_REPORTS_DAILY_CAP_DEFAULT,
  FREE_REPORTS_PER_EMAIL,
  FREE_REPORTS_PER_IP_PER_DAY,
  FREE_REPORT_ALLOWANCE_USED,
  FREE_REPORT_IP_LIMIT,
  cleanReportEmail,
  decideFreeReportGate,
  emptyFreeReportMetrics,
  foldFreeReportMetrics,
  freeReportsDailyCap,
  isDisposableReportEmail,
  normaliseReportEmail,
  remainingFrom,
  utcDayKey,
  utcDayStart,
} from "./free-grants-rules";

describe("the numbers the decision rests on", () => {
  it("two free reports per address, three per network per day, cap default 50", () => {
    expect(FREE_REPORTS_PER_EMAIL).toBe(2);
    expect(FREE_REPORTS_PER_IP_PER_DAY).toBe(3);
    expect(FREE_REPORTS_DAILY_CAP_DEFAULT).toBe(50);
  });
});

describe("cleanReportEmail / normaliseReportEmail — identity", () => {
  it("trims and lower-cases, rejects malformed", () => {
    expect(cleanReportEmail("  Founder@Example.COM ")).toBe("founder@example.com");
    expect(cleanReportEmail("nope")).toBeNull();
    expect(cleanReportEmail("a@b")).toBeNull();
    expect(cleanReportEmail("")).toBeNull();
    expect(cleanReportEmail(42)).toBeNull();
    expect(cleanReportEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });

  it("strips the plus-tag on every domain", () => {
    expect(normaliseReportEmail("a.b+news@example.com")).toBe("a.b@example.com");
    expect(normaliseReportEmail("founder+1@startup.com.au")).toBe("founder@startup.com.au");
  });

  it("strips dots only on gmail-style domains", () => {
    expect(normaliseReportEmail("  A.B+news@Gmail.com ")).toBe("ab@gmail.com");
    expect(normaliseReportEmail("a.b@googlemail.com")).toBe("ab@googlemail.com");
    expect(normaliseReportEmail("a.b@outlook.com")).toBe("a.b@outlook.com");
  });

  it("three spellings of one gmail inbox are one person; two real addresses are two", () => {
    const a = normaliseReportEmail("a.b+1@gmail.com");
    expect(normaliseReportEmail("ab+2@gmail.com")).toBe(a);
    expect(normaliseReportEmail("A.B@GMAIL.COM")).toBe(a);
    expect(normaliseReportEmail("ab@gmail.com")).not.toBe(normaliseReportEmail("ab@example.com"));
  });

  it("an address that is only a plus-tag is malformed", () => {
    expect(normaliseReportEmail("+tag@example.com")).toBe("+tag@example.com");
    expect(normaliseReportEmail("a+@example.com")).toBe("a@example.com");
  });
});

describe("isDisposableReportEmail", () => {
  it("knows the throwaway domains and nothing else", () => {
    expect(isDisposableReportEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableReportEmail("x@guerrillamail.com")).toBe(true);
    expect(isDisposableReportEmail("x@yopmail.com")).toBe(true);
    expect(isDisposableReportEmail("x@blockid.au")).toBe(false);
    expect(isDisposableReportEmail("nope")).toBe(false);
  });
});

describe("freeReportsDailyCap — env NAME FREE_REPORTS_DAILY_CAP", () => {
  it("default when unset / blank / garbage / negative; 0 is a valid pause", () => {
    expect(freeReportsDailyCap({})).toBe(50);
    expect(freeReportsDailyCap({ FREE_REPORTS_DAILY_CAP: "" })).toBe(50);
    expect(freeReportsDailyCap({ FREE_REPORTS_DAILY_CAP: "lots" })).toBe(50);
    expect(freeReportsDailyCap({ FREE_REPORTS_DAILY_CAP: "-3" })).toBe(50);
    expect(freeReportsDailyCap({ FREE_REPORTS_DAILY_CAP: "0" })).toBe(0);
    expect(freeReportsDailyCap({ FREE_REPORTS_DAILY_CAP: "120" })).toBe(120);
  });
});

describe("decideFreeReportGate — order and outcomes", () => {
  const base = { used: 0, ipToday: 0, submittedToday: 0, cap: 50 };

  it("first run → sequence 1, now", () => {
    expect(decideFreeReportGate(base)).toEqual({ allow: true, reason: "free_allowance", sequenceNo: 1, queued: false });
  });

  it("second run → sequence 2, now", () => {
    expect(decideFreeReportGate({ ...base, used: 1 })).toMatchObject({ allow: true, sequenceNo: 2, queued: false });
  });

  it("third run → the pay path, nothing runs", () => {
    expect(decideFreeReportGate({ ...base, used: 2 })).toEqual({ allow: false, reason: FREE_REPORT_ALLOWANCE_USED, used: 2, next: "pay" });
    expect(decideFreeReportGate({ ...base, used: 9 })).toMatchObject({ allow: false, used: 9 });
  });

  it("the IP guard fires before the allowance (an address farm behind one network stops at three)", () => {
    expect(decideFreeReportGate({ ...base, ipToday: 3 })).toEqual({ allow: false, reason: FREE_REPORT_IP_LIMIT, limit: 3 });
    expect(decideFreeReportGate({ ...base, ipToday: 2 })).toMatchObject({ allow: true });
    // unknown IP → the guard is skipped, not failed
    expect(decideFreeReportGate({ ...base, ipToday: null })).toMatchObject({ allow: true });
  });

  it("the platform cap queues, it never refuses", () => {
    expect(decideFreeReportGate({ ...base, submittedToday: 50 })).toEqual({ allow: true, reason: "free_allowance", sequenceNo: 1, queued: true });
    expect(decideFreeReportGate({ ...base, submittedToday: 49 })).toMatchObject({ queued: false });
    // Review v3.26.0 P3: cap 0 = free reports switched off → refused to the pay path, never a silent queue.
    expect(decideFreeReportGate({ ...base, cap: 0 })).toEqual({ allow: false, reason: "free_reports_disabled", next: "pay" });
  });

  it("a paid entitlement is never counted", () => {
    expect(decideFreeReportGate({ ...base, used: 5, ipToday: 9, paidEntitlement: true })).toEqual({ allow: true, reason: "paid_entitlement", sequenceNo: null, queued: false });
  });

  it("garbage counts are treated as zero", () => {
    expect(decideFreeReportGate({ ...base, used: Number.NaN })).toMatchObject({ allow: true, sequenceNo: 1 });
    expect(decideFreeReportGate({ ...base, used: -4 })).toMatchObject({ allow: true, sequenceNo: 1 });
  });
});

describe("remainingFrom", () => {
  it("never negative", () => {
    expect(remainingFrom(0)).toBe(2);
    expect(remainingFrom(1)).toBe(1);
    expect(remainingFrom(2)).toBe(0);
    expect(remainingFrom(7)).toBe(0);
  });
});

describe("UTC day helpers", () => {
  it("utcDayStart is midnight UTC of the same day; utcDayKey is YYYY-MM-DD", () => {
    const t = Date.UTC(2026, 8, 21, 13, 45);
    expect(utcDayStart(t)).toBe("2026-09-21T00:00:00.000Z");
    expect(utcDayKey(t)).toBe("2026-09-21");
    expect(utcDayKey("2026-09-20T23:59:59.000Z")).toBe("2026-09-20");
  });
});

describe("foldFreeReportMetrics — the /api/status block", () => {
  const now = Date.UTC(2026, 8, 21, 12, 0);
  const rows = [
    { email_hash: "h1", submitted_at: "2026-09-21T01:00:00.000Z", delivered_at: "2026-09-21T01:20:00.000Z", delivery_status: "sent" as const },
    { email_hash: "h1", submitted_at: "2026-09-20T01:00:00.000Z", delivered_at: "2026-09-20T01:20:00.000Z", delivery_status: "sent" as const },
    { email_hash: "h2", submitted_at: "2026-09-19T01:00:00.000Z", delivered_at: null, delivery_status: "queued" as const },
    { email_hash: "h3", submitted_at: "2026-09-10T01:00:00.000Z", delivered_at: "2026-09-10T02:00:00.000Z", delivery_status: "sent" as const },
    { email_hash: "h4", submitted_at: "2026-09-21T09:00:00.000Z", delivered_at: null, delivery_status: "failed" as const },
  ];

  it("counts submitted / delivered / unique people / today, keeps the cap and the conversion count", () => {
    const m = foldFreeReportMetrics(rows, { now, cap: 50, convertedToPaid: 1 });
    expect(m).toMatchObject({ submitted: 5, delivered: 3, unique_emails: 4, today: 2, cap: 50, converted_to_paid: 1 });
  });

  it("the sparkline is the last 7 UTC days, oldest first, every day present, outside rows ignored", () => {
    const m = foldFreeReportMetrics(rows, { now, cap: 50 });
    expect(m.last_7_days.map((d) => d.day)).toEqual(["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"]);
    expect(m.last_7_days[6]).toEqual({ day: "2026-09-21", submitted: 2, delivered: 1 });
    expect(m.last_7_days[4]).toEqual({ day: "2026-09-19", submitted: 1, delivered: 0 });
    expect(m.last_7_days.reduce((a, d) => a + d.submitted, 0)).toBe(4); // h3 on 09-10 is outside the window
  });

  it("the empty block has the same keys and a 7-day sparkline of zeros", () => {
    const m = emptyFreeReportMetrics(50, now);
    expect(Object.keys(m).sort()).toEqual(["cap", "converted_to_paid", "delivered", "last_7_days", "submitted", "today", "unique_emails"]);
    expect(m.last_7_days).toHaveLength(7);
    expect(m.last_7_days.every((d) => d.submitted === 0 && d.delivered === 0)).toBe(true);
  });
});
