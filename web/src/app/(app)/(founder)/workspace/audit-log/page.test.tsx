import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/audit-log (S20-A) with the data layer mocked.
// Pins: login redirect; owner sees the PROJECT log (actor dropdown with
// members, Export CSV link, project pinned in the query even when the URL
// names another project); a viewer sees "own actions only" (no actor
// dropdown, no export, actor forced to self); action filter → prefix;
// `?source=legacy` renders the legacy app_user_audit_log table.

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/audit-log",
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getProjectScopeMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getCurrentProjectIsSandbox: async () => false,
  getProjectScope: () => getProjectScopeMock(),
}));

const listMembersMock = vi.fn();
vi.mock("@/lib/project-members/scope", () => ({ listMembers: (id: string) => listMembersMock(id) }));

const legacyMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({ getUserAuditLog: (id: string, o: unknown) => legacyMock(id, o) }));

const listEventsMock = vi.fn();
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, listAuditEvents: (q: unknown) => listEventsMock(q) };
});

const ME = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const PID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_PID = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const USER = {
  id: ME, email: "owner@x.au", displayName: "Owner", role: "user", plan: null,
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};

const ROWS = [
  { id: 2, ts: "2026-09-12T01:00:00.000Z", user_id: OTHER, actor: "user", action: "evidence.create", resource_type: "evidence", resource_id: "ev-1", detail: { method: "POST", route: "/api/evidence", status: 201, actor_role: "editor", project_id: PID } },
  { id: 1, ts: "2026-09-12T00:00:00.000Z", user_id: ME, actor: "user", action: "projects.update", resource_type: "project", resource_id: PID, detail: { method: "PATCH", route: "/api/projects/:id", status: 403, actor_role: "owner", project_id: PID } },
];

async function html(search: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ searchParams: Promise.resolve(search) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  getProjectScopeMock.mockReset().mockResolvedValue({ projectId: PID, role: "owner", isOwner: true });
  listMembersMock.mockReset().mockResolvedValue([
    { id: "m1", projectId: PID, userEmail: "ed@x.au", userId: OTHER, role: "editor", status: "accepted" },
    { id: "m2", projectId: PID, userEmail: "pending@x.au", userId: null, role: "viewer", status: "invited" },
  ]);
  listEventsMock.mockReset().mockResolvedValue(ROWS);
  legacyMock.mockReset().mockResolvedValue([]);
});

describe("/workspace/audit-log", () => {
  it("redirects to login when signed out", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/audit-log");
  });

  it("owner: project log, actor dropdown with accepted members, export link, project pinned", async () => {
    const out = await html({ project: OTHER_PID, actor: OTHER, action: "evidence" });
    expect(out).toContain("by every member");
    expect(out).toContain('data-testid="audit-export"');
    expect(out).toContain(`href="/api/audit-log/export?project=${OTHER_PID}&amp;actor=${OTHER}&amp;action=evidence"`);
    expect(out).toContain("ed@x.au (editor)");
    expect(out).not.toContain("pending@x.au");
    expect(out).toContain(`<input type="hidden" name="project" value="${PID}"`);
    expect(out).toContain("evidence.create");
    expect(out).toContain("projects.update");
    expect(out).toContain(">you<");
    expect(out).toContain("(editor)");
    expect(out).toContain("PATCH /api/projects/:id");
    expect(listEventsMock).toHaveBeenCalledWith({ projectId: PID, actorUserId: OTHER, actionPrefix: "evidence", limit: 50, offset: 0 });
  });

  it("viewer: own actions only — no actor dropdown, no export, actor forced to self", async () => {
    getProjectScopeMock.mockResolvedValue({ projectId: PID, role: "viewer", isOwner: false });
    const out = await html({ actor: OTHER, project: OTHER_PID, action: "svi" });
    expect(out).toContain('data-testid="audit-own-only"');
    expect(out).not.toContain('data-testid="audit-export"');
    expect(out).not.toContain('name="actor"');
    expect(out).toContain("Your role: <span");
    expect(listMembersMock).not.toHaveBeenCalled();
    expect(listEventsMock).toHaveBeenCalledWith({ projectId: null, actorUserId: ME, actionPrefix: "svi", limit: 50, offset: 0 });
  });

  it("admin: project log but no export", async () => {
    getProjectScopeMock.mockResolvedValue({ projectId: PID, role: "admin", isOwner: false });
    const out = await html();
    expect(out).toContain('name="actor"');
    expect(out).not.toContain('data-testid="audit-export"');
    expect(listEventsMock).toHaveBeenCalledWith(expect.objectContaining({ projectId: PID, actorUserId: null }));
  });

  it("no project → own rows; scope errors degrade to own rows", async () => {
    getProjectScopeMock.mockRejectedValue(new Error("boom"));
    const out = await html();
    expect(out).toContain('data-testid="audit-own-only"');
    expect(listEventsMock).toHaveBeenCalledWith(expect.objectContaining({ projectId: null, actorUserId: ME }));
  });

  it("paginates preserving filters; empty state", async () => {
    listEventsMock.mockResolvedValue([]);
    const out = await html({ page: "3", action: "svi" });
    expect(out).toContain("No audit rows match on page 3");
    expect(out).toContain('href="/workspace/audit-log?action=svi&amp;page=2"');
    expect(listEventsMock).toHaveBeenCalledWith(expect.objectContaining({ offset: 100 }));
  });

  it("?source=legacy renders the legacy per-user table", async () => {
    legacyMock.mockResolvedValue([
      { id: "r1", user_id: ME, action: "api_key.revoked", subject_type: "api_key", subject_id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa", fields: {}, route: "/api/keys/x", ip: null, user_agent: null, created_at: "2026-09-12T00:00:00.000Z" },
    ]);
    const out = await html({ source: "legacy" });
    expect(out).toContain("legacy detail rows");
    expect(out).toContain("api_key.revoked");
    expect(out).toContain("api_key:11111111");
    expect(legacyMock).toHaveBeenCalledWith(ME, { limit: 50, offset: 0 });
    expect(listEventsMock).not.toHaveBeenCalled();
  });
});
