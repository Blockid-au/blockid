// Colocated tests for POST /api/evidence/bank-statement — S18-A member access.
//
// The parsed statement becomes an svi_evidence row on the project's
// account → editor+. Pins: viewer 403 before the upload is parsed; editor
// writes under the OWNER's email; owner / no project use the caller's key.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { describeMemberAccess } from "@/test/member-access-suite";
import { fakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { POST } from "./route";

const CSV = [
  "Date,Description,Amount,Balance",
  "01/06/2026,Stripe payout,1500.00,5000.00",
  "05/06/2026,AWS,-320.50,4679.50",
  "01/07/2026,Stripe payout,1800.00,6479.50",
  "09/07/2026,Payroll,-2400.00,4079.50",
].join("\n");

function req() {
  const fd = new FormData();
  fd.set("file", new File([CSV], "statement.csv", { type: "text/csv" }));
  return new NextRequest("http://x/api/evidence/bank-statement", { method: "POST", body: fd });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ svi_evidence: [{ id: "ev-1" }] });
}

beforeEach(reset);

describeMemberAccess("POST /api/evidence/bank-statement", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(req()),
  expectKeyFns: ["findOrCreateSVIAccount"],
});

describe("POST /api/evidence/bank-statement — write target", () => {
  it("editor: the evidence row is inserted on the OWNER's account", async () => {
    scopeState.role = "editor";
    const res = await POST(req());
    expect(res.status).toBe(200);
    const insert = db.sb!.find("svi_evidence", "insert")[0];
    expect((insert.args[0] as { account_id: string }).account_id).toBe("acct-1");
    // 0354: on a real SVI dimension key, never the legacy "financial_health"
    expect((insert.args[0] as { dimension: string }).dimension).toBe("iri");
    expect(scopeState.calls.find((c) => c.fn === "findOrCreateSVIAccount")?.email).toBe("owner@x.test");
  });

  it("viewer: 403 and nothing inserted", async () => {
    scopeState.role = "viewer";
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(db.sb!.calls).toEqual([]);
  });
});
