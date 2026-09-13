// Colocated tests for GET /api/cap-table/issues (S26-B): viewer+ reads the
// OWNER's issue transactions for the project (transfers and other
// projects' rows dropped), joined to allottee / class names, with the
// generated-resolution PDF link when one exists.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
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
const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { GET } from "./route";

const TX1 = "44444444-4444-4444-8444-444444444444";
const TX2 = "44444444-4444-4444-8444-444444444445";

function seed(owner = "user-caller") {
  db.sb = fakeSupabase({
    share_transactions: [
      { id: TX1, account_id: owner, project_id: "proj-1", transaction_type: "issue", to_shareholder_id: "sh-1", share_class_id: "cls-1", shares: "400000", price_per_share: "0.2500", total_value: "100000.00", round_name: "Seed", effective_date: "2026-08-01", created_at: "2026-08-01T00:00:00Z" },
      { id: TX2, account_id: owner, project_id: null, transaction_type: "issue", to_shareholder_id: "sh-missing", share_class_id: null, shares: 100, price_per_share: null, total_value: null, round_name: null, effective_date: null, created_at: "2026-07-01T00:00:00Z" },
      { id: "t-transfer", account_id: owner, project_id: "proj-1", transaction_type: "transfer", shares: 5, created_at: "2026-07-02T00:00:00Z" },
      { id: "t-other", account_id: owner, project_id: "proj-9", transaction_type: "issue", shares: 5, created_at: "2026-07-03T00:00:00Z" },
    ],
    shareholders: [{ id: "sh-1", name: "Seed Investor Pty Ltd", role: "investor" }],
    share_classes: [{ id: "cls-1", name: "Ordinary" }],
    board_resolutions: [{ id: "br-1", project_id: "proj-1", kind: "share-issue", record_id: TX1, content_hash: "h", payload: {}, credits_charged: 1, issued_at: "2026-09-13T00:00:00Z" }],
  });
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  seed();
});

describe("GET /api/cap-table/issues", () => {
  it("401 / 404 no project / 404 non-member", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test" };
    scopeState.projectId = null;
    expect((await GET()).status).toBe(404);
    Object.assign(scopeState, makeScopeState({ nonMember: true }));
    expect((await GET()).status).toBe(404);
  });

  it("viewer reads the OWNER's issues, joined and filtered, newest first, with the resolution link", async () => {
    scopeState.role = "viewer";
    seed("user-owner");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("viewer");
    expect(db.sb!.hasEq("share_transactions", "account_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("share_transactions", "transaction_type", "issue")).toBe(true);
    expect(body.issues.map((i: { id: string }) => i.id)).toEqual([TX1, TX2]);
    expect(body.issues[0]).toMatchObject({ allotteeName: "Seed Investor Pty Ltd", allotteeRole: "investor", shareClass: "Ordinary", shares: 400_000, pricePerShareAud: 0.25, totalValueAud: 100_000, roundName: "Seed", effectiveDate: "2026-08-01", resolutionPdfUrl: `/api/board-resolutions/share-issue/${TX1}/pdf` });
    expect(body.issues[1]).toMatchObject({ allotteeName: "—", shareClass: "Ordinary", shares: 100, pricePerShareAud: null, totalValueAud: null, resolutionPdfUrl: null });
  });
});
