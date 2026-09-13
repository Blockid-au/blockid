// Colocated vitest for POST /api/investors/crm/import (S28-B).
//
// Pins: 401 / 503; the three body shapes (multipart file, raw text/csv,
// JSON { csv }); an empty / headerless file → 400 before any lookup; a
// too-large body → 413; viewer → 403; editor dedupes against the
// project's existing emails (update, stage forwards only, tags unioned,
// archived revived) and batch-inserts the rest with created_by = the
// CALLER; the counts come back; the row cap reports `truncated`.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  user: { id: "member-1", email: "m@x.test" } as { id: string; email: string } | null,
  scope: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrDeny: (...a: unknown[]) => mocks.scope(...a) }));
const rate = vi.hoisted(() => ({ enforceRateLimit: vi.fn<(...a: unknown[]) => unknown>(() => null) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => rate.enforceRateLimit(...a) }));

import { CRM_IMPORT_RATE_MAX, CRM_IMPORT_RATE_WINDOW_MS, POST } from "./route";

const OWNER = "owner-1";
const PID = "proj-1";
const scopeOf = (role: string) => ({
  scope: { projectId: PID, role, isOwner: role === "owner", ownerUserId: OWNER, dataEmail: "o@x.test", userId: "member-1", email: "m@x.test" },
  denied: null,
});
const EXISTING = { id: "c1", project_id: PID, name: "Jane", email: "jane@bb.vc", org: null, type: "other", stage: "diligence", tags: ["lead"], archived_at: "2026-09-01T00:00:00Z" };

const CSV = ["name,email,org,type,stage,tags", "Jane Chen,JANE@bb.vc,Blackbird,vc,contacted,sydney", "Sam Lee,sam@x.co,,angel,meeting,", "=Evil,,,,,", "Dup,jane@bb.vc,,,,"].join("\n");

let sb: FakeSupabase;
const rawReq = (text: string, ct = "text/csv") =>
  new Request("http://localhost/api/investors/crm/import", { method: "POST", headers: { "content-type": ct }, body: text }) as unknown as NextRequest;
const jsonReq = (body: unknown) =>
  new Request("http://localhost/api/investors/crm/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as unknown as NextRequest;
const formReq = (text: string) => {
  const fd = new FormData();
  fd.set("file", new File([text], "investors.csv", { type: "text/csv" }));
  return new Request("http://localhost/api/investors/crm/import", { method: "POST", body: fd }) as unknown as NextRequest;
};

beforeEach(() => {
  sb = fakeSupabase({ investor_contacts: [EXISTING] });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("editor"));
  rate.enforceRateLimit.mockReset().mockReturnValue(null);
});

describe("POST /api/investors/crm/import", () => {
  it("401 / 503; empty or headerless file → 400 before any lookup; oversize → 413", async () => {
    mocks.user = null;
    expect((await POST(rawReq(CSV))).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test" };
    mocks.sb = null;
    expect((await POST(rawReq(CSV))).status).toBe(503);
    mocks.sb = sb;
    expect((await POST(rawReq("   "))).status).toBe(400);
    expect((await POST(rawReq("email\na@b.co"))).status).toBe(400);
    expect((await POST(jsonReq({ nope: 1 }))).status).toBe(400);
    expect((await POST(rawReq("x".repeat(1_000_001)))).status).toBe(413);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(sb.calls.length).toBe(0);
  });

  it("viewer → 403, nothing written", async () => {
    mocks.scope.mockResolvedValue({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await POST(rawReq(CSV))).status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("editor");
    expect(sb.find("investor_contacts", "insert").length).toBe(0);
  });

  it("editor: existing email → update (forward-only stage, tags unioned, revived); new rows inserted; counts + skipped", async () => {
    const res = await POST(formReq(CSV));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, created: 2, updated: 1, skipped: 1, truncated: false });
    expect(body.skippedRows).toEqual([{ line: 5, reason: "duplicate email in file" }]);
    // existing lookup keyed on the project + the file's lower-cased emails
    expect(sb.hasEq("investor_contacts", "project_id", PID)).toBe(true);
    expect(sb.find("investor_contacts", "in")[0].args).toEqual(["email", ["jane@bb.vc", "sam@x.co"]]);
    // the update: name/org/type from the file, stage NOT dragged back (diligence stays), tags unioned, archived cleared
    const upd = sb.find("investor_contacts", "update");
    expect(upd.length).toBe(1);
    expect(upd[0].args[0]).toMatchObject({ name: "Jane Chen", org: "Blackbird", type: "vc", tags: ["lead", "sydney"], archived_at: null });
    expect("stage" in (upd[0].args[0] as object)).toBe(false);
    expect(sb.hasEq("investor_contacts", "id", "c1")).toBe(true);
    // the inserts: formula prefix stripped, caller as created_by, source csv_import
    const ins = sb.find("investor_contacts", "insert");
    expect(ins.length).toBe(1);
    const rows = ins[0].args[0] as Array<Record<string, unknown>>;
    expect(rows.map((r) => [r.name, r.email, r.type, r.stage])).toEqual([
      ["Sam Lee", "sam@x.co", "angel", "meeting"],
      ["Evil", null, "other", "researching"],
    ]);
    expect(rows[0]).toMatchObject({ project_id: PID, source: "csv_import", created_by: "member-1", owner_user_id: "member-1" });
  });

  it("S29-hardening: rate-limited per user (10/hour) after auth and before the body is read; the 429 is returned as-is", async () => {
    const { NextResponse } = await import("next/server");
    rate.enforceRateLimit.mockReturnValue(NextResponse.json({ ok: false, error: "Rate limit exceeded — please wait a moment before generating more.", retryInSeconds: 60 }, { status: 429, headers: { "Retry-After": "60" } }));
    const res = await POST(rawReq(CSV));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toMatchObject({ ok: false, retryInSeconds: 60 });
    expect(rate.enforceRateLimit).toHaveBeenCalledWith("crm-import", "member-1", expect.anything(), CRM_IMPORT_RATE_MAX, CRM_IMPORT_RATE_WINDOW_MS);
    expect([CRM_IMPORT_RATE_MAX, CRM_IMPORT_RATE_WINDOW_MS]).toEqual([10, 3_600_000]);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(sb.find("investor_contacts", "insert")).toHaveLength(0);
    // Anonymous callers never reach the limiter (401 first).
    mocks.user = null;
    rate.enforceRateLimit.mockClear();
    expect((await POST(rawReq(CSV))).status).toBe(401);
    expect(rate.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("accepts JSON { csv } and reports truncation past 500 rows", async () => {
    sb.rows.investor_contacts = [];
    const many = ["name,email", ...Array.from({ length: 505 }, (_, i) => `P${i},p${i}@x.co`)].join("\n");
    const res = await POST(jsonReq({ csv: many }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ created: 500, updated: 0, truncated: true });
    // batched inserts of ≤100
    expect(sb.find("investor_contacts", "insert").length).toBe(5);
  });
});
