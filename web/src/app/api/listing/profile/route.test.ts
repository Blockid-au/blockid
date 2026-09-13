// Colocated tests for /api/listing/profile (S29-A).
//
//   GET   — viewer+; no project → empty facts; the stored blob normalised.
//   PATCH — editor+ (viewer 403, non-member 404); validation before the
//           scope lookup (unknown key / bad shape / empty → 400); `null`
//           clears; upserts the ACTIVE project's row (never keyed on the
//           caller); returns the merged facts.

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
const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_free" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));
vi.mock("@/lib/share-price-server", () => ({ loadSharePriceMidForScope: async () => null }));

import { GET, PATCH } from "./route";

const patch = (body: unknown, raw = false) =>
  PATCH(new Request("http://localhost/api/listing/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: raw ? (body as string) : JSON.stringify(body) }));

beforeEach(() => {
  Object.assign(scopeState, makeScopeState({ role: "editor" }));
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  db.sb = fakeSupabase({ listing_profiles: [{ project_id: "proj-1", facts: { market_makers: 2, junk: true }, pdf_credits_charged: 0, pdf_charged_at: null, updated_at: "2026-09-01T00:00:00Z" }] });
});

describe("GET /api/listing/profile", () => {
  it("401; no project → empty; viewer reads the normalised facts", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    scopeState.projectId = null;
    expect(await (await GET()).json()).toEqual({ ok: true, role: null, facts: {}, updatedAt: null });
    Object.assign(scopeState, makeScopeState({ role: "viewer" }));
    expect(await (await GET()).json()).toEqual({ ok: true, role: "viewer", facts: { market_makers: 2 }, updatedAt: "2026-09-01T00:00:00Z" });
    expect(db.sb!.hasEq("listing_profiles", "project_id", "proj-1")).toBe(true);
  });
});

describe("PATCH /api/listing/profile", () => {
  it("401; invalid JSON / unknown key / bad shape / empty → 400 before the scope lookup; viewer 403; non-member 404; no project 404", async () => {
    auth.user = null;
    expect((await patch({ market_makers: 3 })).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await patch("{nope", true)).status).toBe(400);
    expect(await (await patch({ bogus: 1 })).json()).toEqual({ ok: false, error: "unknown fact: bogus" });
    expect((await patch({ directors_total: 1.5 })).status).toBe(400);
    expect(await (await patch({})).json()).toEqual({ ok: false, error: "nothing to update" });
    expect(scopeState.lastMinRole).toBeUndefined();
    Object.assign(scopeState, makeScopeState({ role: "viewer" }));
    expect((await patch({ market_makers: 3 })).status).toBe(403);
    expect(scopeState.lastMinRole).toBe("editor");
    Object.assign(scopeState, makeScopeState({ nonMember: true }));
    expect((await patch({ market_makers: 3 })).status).toBe(404);
    Object.assign(scopeState, makeScopeState({ role: "editor", projectId: null }));
    expect((await patch({ market_makers: 3 })).status).toBe(404);
    expect(db.sb!.find("listing_profiles", "upsert")).toHaveLength(0);
  });

  it("editor: merges, clears with null, upserts the project row and returns the stored facts", async () => {
    const res = await patch({ directors_total: 5, independent_directors: 3, market_makers: null, audited_accounts_fys: ["FY2026", "FY2025"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: "editor", facts: { directors_total: 5, independent_directors: 3, audited_accounts_fys: ["FY2025", "FY2026"] } });
    const up = db.sb!.find("listing_profiles", "upsert");
    expect(up).toHaveLength(1);
    expect(up[0].args[0]).toMatchObject({ project_id: "proj-1", facts: { directors_total: 5, independent_directors: 3, audited_accounts_fys: ["FY2025", "FY2026"] } });
    expect(JSON.stringify(up[0].args[0])).not.toContain("user-caller");
  });

  it("503 without a database", async () => {
    db.sb = null;
    expect((await patch({ market_makers: 3 })).status).toBe(503);
  });
});
