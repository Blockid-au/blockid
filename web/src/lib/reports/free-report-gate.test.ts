// Colocated vitest for the intake-side free-allowance gate (G25-C).
//
// Drives `runFreeReportGate` with injected deps — no database, no headers.
// What it pins: the address is required for a guest (400), malformed /
// disposable are refused (400), a honeypot is refused with the generic
// shape, the account address is used for a signed-in caller, a paid
// entitlement bypasses the count, the IP guard (429), the third run answers
// the quote (200, allowance_used), the reservation carries the sequence,
// the UNIQUE-index race is honoured, and I/O failures fail OPEN.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: vi.fn(async () => []) }));
vi.mock("@/lib/iphash", () => ({ hashIp: (ip: string | null) => (ip ? `h:${ip}` : null) }));
vi.mock("@/lib/reports/free-grants", () => ({
  remainingFreeReports: vi.fn(),
  countIpFreeReportsToday: vi.fn(),
  countFreeReportsSubmittedToday: vi.fn(),
  recordSubmission: vi.fn(),
}));

import { runFreeReportGate, freeReportPayQuote, FREE_REPORT_PAY_HREF, type FreeReportGateDeps } from "./free-report-gate";
import type { FreeReportGrantRow, RecordSubmissionOutcome } from "./free-grants";

function grant(seq: 1 | 2, source: "guest" | "account" = "guest"): FreeReportGrantRow {
  return {
    id: `g-${seq}`,
    email_hash: "h",
    email: "founder@example.com",
    project_id: null,
    analysis_id: null,
    ip_hash: null,
    submitted_at: "2026-09-21T00:00:00.000Z",
    delivered_at: null,
    delivery_status: "queued",
    sequence_no: seq,
    source,
  };
}

function deps(over: Partial<FreeReportGateDeps> = {}): FreeReportGateDeps & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { remaining: [], ipToday: [], submittedToday: [], record: [], entitlements: [] };
  return {
    calls,
    remaining: async (email) => {
      calls.remaining.push(email);
      return { used: 0 };
    },
    ipToday: async (h) => {
      calls.ipToday.push(h);
      return 0;
    },
    submittedToday: async () => {
      calls.submittedToday.push(1);
      return 0;
    },
    record: async (input) => {
      calls.record.push(input);
      return { ok: true, grant: grant(input.sequenceNo, input.source) } as RecordSubmissionOutcome;
    },
    entitlements: async (plan, userId) => {
      calls.entitlements.push([plan, userId]);
      return [];
    },
    hashIp: (ip) => (ip ? `h:${ip}` : null),
    ...over,
  };
}

const guest = { user: null, honeypot: "", clientIp: "203.0.113.9", env: {} as NodeJS.ProcessEnv };

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("guest — the address is required, validated, and never a throwaway", () => {
  it("missing → 400 email_required, nothing counted, nothing reserved", async () => {
    const d = deps();
    for (const bodyEmail of [undefined, null, "", "   "]) {
      const r = await runFreeReportGate({ ...guest, bodyEmail }, d);
      expect(r).toEqual({ allow: false, status: 400, reason: "email_required" });
    }
    expect(d.calls.remaining).toEqual([]);
    expect(d.calls.record).toEqual([]);
  });

  it("malformed → 400 email_invalid; disposable → 400 email_disposable", async () => {
    const d = deps();
    expect(await runFreeReportGate({ ...guest, bodyEmail: "nope" }, d)).toEqual({ allow: false, status: 400, reason: "email_invalid" });
    expect(await runFreeReportGate({ ...guest, bodyEmail: "x@mailinator.com" }, d)).toEqual({ allow: false, status: 400, reason: "email_disposable" });
    expect(d.calls.record).toEqual([]);
  });

  it("a filled honeypot is refused before anything else, with the generic reason for the route", async () => {
    const d = deps();
    const r = await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com", honeypot: "http://spam" }, d);
    expect(r).toEqual({ allow: false, status: 400, reason: "honeypot" });
    expect(d.calls.remaining).toEqual([]);
  });
});

describe("guest — the two free reports, then the quote", () => {
  it("first run → free, sequence 1, the address lower-cased, IP hashed (never raw)", async () => {
    const d = deps();
    const r = await runFreeReportGate({ ...guest, bodyEmail: " Founder@Example.com " }, d);
    expect(r).toMatchObject({ allow: true, path: "free", email: "founder@example.com", source: "guest", queued: false, remaining: 1 });
    expect((r as { grant: FreeReportGrantRow }).grant.sequence_no).toBe(1);
    expect(d.calls.record[0]).toEqual({ email: "founder@example.com", sequenceNo: 1, source: "guest", ipHash: "h:203.0.113.9" });
    expect(d.calls.ipToday).toEqual(["h:203.0.113.9"]);
  });

  it("second run → sequence 2, none left after it", async () => {
    const d = deps({ remaining: async () => ({ used: 1 }) });
    const r = await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com" }, d);
    expect(r).toMatchObject({ allow: true, path: "free", remaining: 0 });
    expect((r as { grant: FreeReportGrantRow }).grant.sequence_no).toBe(2);
  });

  it("third run → 200 free_allowance_used, nothing reserved", async () => {
    const d = deps({ remaining: async () => ({ used: 2 }) });
    const r = await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com" }, d);
    expect(r).toEqual({ allow: false, status: 200, reason: "free_allowance_used", used: 2 });
    expect(d.calls.record).toEqual([]);
  });

  it("the UNIQUE index wins a race: the ledger says allowance_used even though the count said 1", async () => {
    const d = deps({ remaining: async () => ({ used: 1 }), record: async () => ({ ok: false, reason: "allowance_used" }) });
    const r = await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com" }, d);
    expect(r).toEqual({ allow: false, status: 200, reason: "free_allowance_used", used: 2 });
  });

  it("more than three free reports from one network today → 429 free_ip_limit", async () => {
    const d = deps({ ipToday: async () => 3 });
    expect(await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com" }, d)).toEqual({ allow: false, status: 429, reason: "free_ip_limit" });
    expect(d.calls.record).toEqual([]);
  });

  it("the platform cap → still allowed and reserved, but queued", async () => {
    const d = deps({ submittedToday: async () => 50 });
    const r = await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com" }, d);
    expect(r).toMatchObject({ allow: true, path: "free", queued: true });
    expect(d.calls.record).toHaveLength(1);
  });

  it("the cap reads the env NAME FREE_REPORTS_DAILY_CAP", async () => {
    const d = deps({ submittedToday: async () => 5 });
    const r = await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com", env: { FREE_REPORTS_DAILY_CAP: "5" } as NodeJS.ProcessEnv }, d);
    expect(r).toMatchObject({ allow: true, queued: true });
  });

  it("a non-string honeypot value (a JSON bot) is still a filled honeypot", async () => {
    const d = deps();
    for (const honeypot of [1, ["x"], { a: 1 }]) {
      expect(await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com", honeypot }, d)).toEqual({ allow: false, status: 400, reason: "honeypot" });
    }
    expect(d.calls.record).toEqual([]);
  });
});

describe("signed-in — the same two-free rule on the account address", () => {
  const user = { id: "u1", email: "Member@Example.com", plan: "founder_free" };

  it("uses the account address, source account, no IP guard", async () => {
    const d = deps();
    const r = await runFreeReportGate({ ...guest, user, bodyEmail: "someone-else@example.com" }, d);
    expect(r).toMatchObject({ allow: true, path: "free", email: "member@example.com", source: "account" });
    expect(d.calls.remaining).toEqual(["member@example.com"]);
    expect(d.calls.ipToday).toEqual([]);
    expect(d.calls.record[0]).toMatchObject({ source: "account", ipHash: null });
  });

  it("does not double-grant: two guest reports on the same address → the account's third is the quote", async () => {
    const d = deps({ remaining: async () => ({ used: 2 }) });
    expect(await runFreeReportGate({ ...guest, user, bodyEmail: undefined }, d)).toEqual({ allow: false, status: 200, reason: "free_allowance_used", used: 2 });
  });

  it("a paid report entitlement bypasses the allowance and reserves nothing", async () => {
    const d = deps({ entitlements: async () => ["report.basic"], remaining: async () => ({ used: 2 }) });
    const r = await runFreeReportGate({ ...guest, user, bodyEmail: undefined }, d);
    expect(r).toMatchObject({ allow: true, path: "entitled", grant: null });
    expect(d.calls.record).toEqual([]);
  });

  it("an admin (staff QA) never counts against or hits the allowance — 2026-09-25 live bug", async () => {
    const d = deps({ remaining: async () => ({ used: 2 }) });
    const r = await runFreeReportGate({ ...guest, user: { ...user, role: "admin" }, bodyEmail: undefined }, d);
    expect(r).toMatchObject({ allow: true, path: "entitled", grant: null });
    expect(d.calls.remaining).toEqual([]);
    expect(d.calls.record).toEqual([]);
  });

  it("a plain user role is still counted", async () => {
    const d = deps({ remaining: async () => ({ used: 2 }) });
    const r = await runFreeReportGate({ ...guest, user: { ...user, role: "user" }, bodyEmail: undefined }, d);
    expect(r).toEqual({ allow: false, status: 200, reason: "free_allowance_used", used: 2 });
  });
});

describe("fail open — a database wobble never walls a founder", () => {
  it("count reads that throw are the permissive answer", async () => {
    const d = deps({
      remaining: async () => {
        throw new Error("db");
      },
      ipToday: async () => {
        throw new Error("db");
      },
      submittedToday: async () => {
        throw new Error("db");
      },
    });
    expect(await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com" }, d)).toMatchObject({ allow: true, path: "free", queued: false });
  });

  it("a ledger that cannot reserve lets the run proceed without a grant", async () => {
    const d = deps({ record: async () => ({ ok: false, reason: "unavailable" }) });
    expect(await runFreeReportGate({ ...guest, bodyEmail: "founder@example.com" }, d)).toMatchObject({ allow: true, path: "free", grant: null, remaining: 1 });
  });
});

describe("the quote", () => {
  it("is the A$3 Trusted Business Report SKU from lane A's constant, and the workspace pay href", () => {
    expect(freeReportPayQuote()).toEqual({ sku: "sku_trust_report_5aud", amount_cents: 300, label: "A$3 inc. GST" });
    expect(FREE_REPORT_PAY_HREF).toBe("/workspace/reports/business");
  });
});
