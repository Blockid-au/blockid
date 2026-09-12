// S18-B — page-scope helpers against the REAL `@/lib/projects` data-key
// readers (only Supabase is faked), pinning the one thing that matters:
// a member render never inserts an svi_accounts row.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

const sbState = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => sbState.sb }));

import type { ProjectScope } from "@/lib/projects";
import { pageScopeKeys, resolveSVIAccountIdForPage } from "./page-scope";

const OWNER = { id: "user-owner", email: "owner@x.test" };
const MEMBER = { id: "user-member", email: "member@x.test" };
const PROJECT = "proj-1";

function scope(role: ProjectScope["role"], caller: { id: string; email: string }): ProjectScope {
  const isOwner = role === "owner";
  return {
    projectId: PROJECT,
    project: { id: PROJECT, slug: "p", name: "P", userId: OWNER.id, role } as ProjectScope["project"],
    role,
    isOwner,
    userId: caller.id,
    email: caller.email,
    dataEmail: OWNER.email,
    ownerUserId: OWNER.id,
  };
}

describe("pageScopeKeys()", () => {
  it("null scope → caller's own keys, owner role, editable, not a member", () => {
    expect(pageScopeKeys(null, MEMBER)).toEqual({
      scope: null,
      projectId: null,
      dataEmail: MEMBER.email,
      ownerUserId: MEMBER.id,
      role: "owner",
      canEdit: true,
      isMember: false,
    });
  });

  it("owner scope → own keys + project, editable, not a member", () => {
    const k = pageScopeKeys(scope("owner", OWNER), OWNER);
    expect(k).toMatchObject({ projectId: PROJECT, dataEmail: OWNER.email, ownerUserId: OWNER.id, role: "owner", canEdit: true, isMember: false });
  });

  it("editor member → the OWNER's keys, editable, member", () => {
    const k = pageScopeKeys(scope("editor", MEMBER), MEMBER);
    expect(k).toMatchObject({ projectId: PROJECT, dataEmail: OWNER.email, ownerUserId: OWNER.id, role: "editor", canEdit: true, isMember: true });
  });

  it("viewer member → the OWNER's keys, read-only, member", () => {
    const k = pageScopeKeys(scope("viewer", MEMBER), MEMBER);
    expect(k).toMatchObject({ dataEmail: OWNER.email, ownerUserId: OWNER.id, role: "viewer", canEdit: false, isMember: true });
  });
});

describe("resolveSVIAccountIdForPage()", () => {
  let sb: FakeSupabase;
  beforeEach(() => {
    sb = fakeSupabase({ svi_accounts: [], projects: [{ id: PROJECT, name: "P" }] });
    sbState.sb = sb;
  });

  it("owner with no record → find-or-create under the OWNER's email + project (legacy behaviour)", async () => {
    sb.rows.svi_accounts = [];
    // insert resolves to the payload; the fake echoes it back as the created row
    const id = await resolveSVIAccountIdForPage(scope("owner", OWNER), OWNER);
    const inserts = sb.find("svi_accounts", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toMatchObject({ email: OWNER.email, project_id: PROJECT });
    expect(id === null || typeof id === "string" || id === undefined).toBe(true);
  });

  it("no scope → find-or-create under the caller's own email with a null project", async () => {
    await resolveSVIAccountIdForPage(null, MEMBER);
    const inserts = sb.find("svi_accounts", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toMatchObject({ email: MEMBER.email, project_id: null });
  });

  it("member with an existing owner record → the OWNER's row id, no insert", async () => {
    sb.rows.svi_accounts = [{ id: "acct-owner", email: OWNER.email, project_id: PROJECT }];
    const id = await resolveSVIAccountIdForPage(scope("viewer", MEMBER), MEMBER);
    expect(id).toBe("acct-owner");
    expect(sb.hasEq("svi_accounts", "email", OWNER.email)).toBe(true);
    expect(sb.hasEq("svi_accounts", "email", MEMBER.email)).toBe(false);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
  });

  it("member with NO owner record → null and NO insert (never a split svi_accounts row)", async () => {
    sb.rows.svi_accounts = [];
    for (const role of ["viewer", "editor", "admin"] as const) {
      sb.calls.length = 0;
      const id = await resolveSVIAccountIdForPage(scope(role, MEMBER), MEMBER);
      expect(id, role).toBeNull();
      expect(sb.find("svi_accounts", "insert"), role).toEqual([]);
      // The owner-only legacy (project_id IS NULL) fallback is skipped too.
      expect(sb.calls.filter((c) => c.table === "svi_accounts" && c.op === "is"), role).toEqual([]);
    }
  });
});
