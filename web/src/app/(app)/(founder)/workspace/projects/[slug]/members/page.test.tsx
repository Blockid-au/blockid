import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B render test for /workspace/projects/[slug]/members — the owner-only
// (admin+) project-settings surface. Pins: owner + admin get the roster;
// an editor/viewer member gets the page shell with the view-only note
// (never the roster, never a 404); a non-member still 404s.

const scopeState = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(await scopeState);
});
vi.mock("@/lib/auth", async () => {
  const { founderUser } = await import("@/test/founder-page-harness");
  return { getCurrentUser: async () => founderUser(await scopeState) };
});
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const listMembersMock = vi.fn();
vi.mock("@/lib/project-members/scope", () => ({ listMembers: (id: string) => listMembersMock(id) }));
vi.mock("./project-members-client", () => ({
  ProjectMembersClient: (p: { initialMembers: unknown[] }) => <div data-roster data-count={p.initialMembers.length} />,
}));

import { renderPage, dataAttr } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page({ params: Promise.resolve({ slug: "p" }) }));
}

const state = await scopeState;

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  listMembersMock.mockReset();
  listMembersMock.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
});

describe("/workspace/projects/[slug]/members (S18-B)", () => {
  it("owner: roster rendered", async () => {
    const out = await html();
    expect(listMembersMock).toHaveBeenCalledWith("proj-1");
    expect(dataAttr(out, "count")).toBe("2");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (admin): roster rendered", async () => {
    state.role = "admin";
    const out = await html();
    expect(dataAttr(out, "count")).toBe("2");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (editor / viewer): shell + view-only note, roster never fetched, no 404", async () => {
    for (const role of ["editor", "viewer"] as const) {
      state.role = role;
      listMembersMock.mockClear();
      const out = await html();
      expect(listMembersMock, role).not.toHaveBeenCalled();
      expect(out, role).not.toContain("data-roster");
      expect(out, role).toContain('data-testid="viewer-readonly-note"');
      expect(out, role).toContain("invite or remove members");
    }
  });

  it("non-member / unknown slug: 404 (zero-info disclosure unchanged)", async () => {
    state.projectId = null;
    await expect(html()).rejects.toThrow("NOT_FOUND");
  });
});
