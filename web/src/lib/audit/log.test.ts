import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type InsertRecord = { table: string; row: Record<string, unknown> };
type SelectRecord = { table: string; userId: string; range: [number, number] };

const inserts: InsertRecord[] = [];
const selects: SelectRecord[] = [];
let nextInsertError: { code?: string; message: string } | null = null;
let nextInsertThrow: Error | null = null;
let nextSelectError: { code?: string; message: string } | null = null;
let nextSelectRows: Record<string, unknown>[] = [];
let adminConfigured = true;

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!adminConfigured) return null;
    return {
      from(table: string) {
        return {
          insert(row: Record<string, unknown>) {
            if (nextInsertThrow) {
              const e = nextInsertThrow;
              nextInsertThrow = null;
              throw e;
            }
            inserts.push({ table, row });
            const err = nextInsertError;
            nextInsertError = null;
            return Promise.resolve({ error: err });
          },
          select(_cols: string) {
            const chain = {
              _userId: "",
              _range: [0, 0] as [number, number],
              eq(_col: string, val: string) {
                chain._userId = val;
                return chain;
              },
              order(_col: string, _opts: unknown) {
                return chain;
              },
              range(a: number, b: number) {
                chain._range = [a, b];
                selects.push({ table, userId: chain._userId, range: [a, b] });
                const err = nextSelectError;
                nextSelectError = null;
                const rows = nextSelectRows;
                nextSelectRows = [];
                return Promise.resolve({ data: err ? null : rows, error: err });
              },
            };
            return chain;
          },
        };
      },
    };
  },
}));

import {
  logUserAction,
  getUserAuditLog,
  extractIp,
  extractUserAgent,
} from "./log";

describe("logUserAction", () => {
  beforeEach(() => {
    inserts.length = 0;
    selects.length = 0;
    nextInsertError = null;
    nextInsertThrow = null;
    nextSelectError = null;
    nextSelectRows = [];
    adminConfigured = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("inserts a row with all fields and returns ok", async () => {
    const res = await logUserAction({
      userId: "user-1",
      action: "project.create",
      subjectType: "project",
      subjectId: "proj-1",
      fields: { name_len: 12 },
      route: "/api/projects",
      ip: "10.0.0.1",
      ua: "Mozilla/5.0",
    });
    expect(res).toEqual({ ok: true });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("app_user_audit_log");
    expect(inserts[0].row).toEqual({
      user_id: "user-1",
      action: "project.create",
      subject_type: "project",
      subject_id: "proj-1",
      fields: { name_len: 12 },
      route: "/api/projects",
      ip: "10.0.0.1",
      user_agent: "Mozilla/5.0",
    });
  });

  it("defaults nullable columns when caller omits them", async () => {
    const res = await logUserAction({
      userId: "user-2",
      action: "stripe.checkout",
      subjectType: "stripe_session",
      route: "/api/stripe/checkout",
    });
    expect(res).toEqual({ ok: true });
    expect(inserts[0].row).toMatchObject({
      subject_id: null,
      fields: {},
      ip: null,
      user_agent: null,
    });
  });

  it("swallows supabase insert errors and returns ok:false", async () => {
    nextInsertError = { code: "23505", message: "duplicate" };
    const res = await logUserAction({
      userId: "user-3",
      action: "project.archive",
      subjectType: "project",
      route: "/api/projects/x",
    });
    expect(res).toEqual({ ok: false, reason: "duplicate" });
    expect(console.error).toHaveBeenCalled();
  });

  it("swallows thrown exceptions from the client", async () => {
    nextInsertThrow = new Error("network down");
    const res = await logUserAction({
      userId: "user-4",
      action: "project.create",
      subjectType: "project",
      route: "/api/projects",
    });
    expect(res).toEqual({ ok: false, reason: "threw" });
    expect(console.error).toHaveBeenCalled();
  });

  it("returns ok:false and warns when supabase admin is not configured", async () => {
    adminConfigured = false;
    const res = await logUserAction({
      userId: "user-5",
      action: "project.create",
      subjectType: "project",
      route: "/api/projects",
    });
    expect(res).toEqual({ ok: false, reason: "supabase_not_configured" });
    expect(console.warn).toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });
});

describe("getUserAuditLog", () => {
  beforeEach(() => {
    inserts.length = 0;
    selects.length = 0;
    nextInsertError = null;
    nextSelectError = null;
    nextSelectRows = [];
    adminConfigured = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns rows filtered by user with default limit 50", async () => {
    nextSelectRows = [
      {
        id: "a",
        user_id: "user-9",
        action: "project.create",
        subject_type: "project",
        subject_id: null,
        fields: {},
        route: "/api/projects",
        ip: null,
        user_agent: null,
        created_at: "2026-07-23T00:00:00Z",
      },
    ];
    const rows = await getUserAuditLog("user-9");
    expect(rows).toHaveLength(1);
    expect(selects[0]).toEqual({
      table: "app_user_audit_log",
      userId: "user-9",
      range: [0, 49],
    });
  });

  it("clamps limit between 1 and 200 and applies offset", async () => {
    nextSelectRows = [];
    await getUserAuditLog("user-9", { limit: 500, offset: 100 });
    expect(selects[0].range).toEqual([100, 299]);
  });

  it("returns [] when select errors", async () => {
    nextSelectError = { code: "42P01", message: "no table" };
    const rows = await getUserAuditLog("user-9");
    expect(rows).toEqual([]);
  });

  it("returns [] when supabase admin is not configured", async () => {
    adminConfigured = false;
    const rows = await getUserAuditLog("user-9");
    expect(rows).toEqual([]);
  });
});

describe("extractIp / extractUserAgent", () => {
  it("prefers x-forwarded-for first hop over x-real-ip", () => {
    const h = new Headers({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "x-real-ip": "9.9.9.9",
    });
    expect(extractIp(h)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const h = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(extractIp(h)).toBe("9.9.9.9");
  });

  it("returns null when no ip headers are set", () => {
    expect(extractIp(new Headers())).toBeNull();
  });

  it("truncates user-agent to 500 chars", () => {
    const long = "u".repeat(1000);
    const h = new Headers({ "user-agent": long });
    expect(extractUserAgent(h)).toHaveLength(500);
  });

  it("returns null when user-agent header is absent", () => {
    expect(extractUserAgent(new Headers())).toBeNull();
  });
});
