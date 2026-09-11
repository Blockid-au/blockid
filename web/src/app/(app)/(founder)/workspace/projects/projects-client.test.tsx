// Colocated tests for ProjectsClient — S17-A shared projects.
//
// Static render (renderToStaticMarkup; no @testing-library/react here). Pins:
//   - a shared project renders the "Shared · <Role>" chip instead of Default;
//   - viewer role hides Edit / Archive / Members and the "Run SVI Analysis"
//     CTA, showing the view-only note instead;
//   - editor role keeps Edit + Run but hides Archive / Members;
//   - admin member keeps Edit / Members / Archive;
//   - shared projects never count toward the plan quota ("N of M used").

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { ProjectsClient } from "./projects-client";

type Role = "owner" | "admin" | "editor" | "viewer";

function project(id: string, role?: Role, extra: Record<string, unknown> = {}) {
  return {
    id,
    userId: role === undefined || role === "owner" ? "me" : "owner-9",
    name: `Project ${id}`,
    slug: id,
    description: null,
    industry: "SaaS",
    stage: 2,
    isDefault: false,
    createdAt: "2026-01-01T00:00:00Z",
    role,
    isShared: role !== undefined && role !== "owner",
    ...extra,
  };
}

function render(projects: ReturnType<typeof project>[], limit = 3) {
  return renderToStaticMarkup(
    <ProjectsClient initialProjects={projects} limit={limit} plan="founder_growth" accountType="accelerator" />,
  );
}

describe("ProjectsClient — S17-A shared projects", () => {
  it("owned project: Default badge (when default), Edit, Members, Archive and Run all present", () => {
    const out = render([project("own", "owner", { isDefault: true }), project("own2", "owner")]);
    expect(out).toContain("Default");
    expect(out).not.toContain("Shared ·");
    expect(out).toContain("Run SVI Analysis");
    expect(out).toContain(">Edit<");
    expect(out).toContain("/workspace/projects/own2/members");
    expect(out).toContain("Archive");
  });

  it("viewer: chip shown, mutating controls hidden, view-only note rendered", () => {
    const out = render([project("shared-v", "viewer")]);
    expect(out).toContain("Shared · Viewer");
    expect(out).toContain('data-testid="viewer-readonly-note"');
    expect(out).not.toContain("Run SVI Analysis");
    expect(out).not.toContain(">Edit<");
    expect(out).not.toContain("/members");
    expect(out).not.toMatch(/>\s*Archive\s*</);
  });

  it("editor: can run analyses and edit, but cannot archive or manage members", () => {
    const out = render([project("shared-e", "editor")]);
    expect(out).toContain("Shared · Editor");
    expect(out).toContain("Run SVI Analysis");
    expect(out).toContain(">Edit<");
    expect(out).not.toContain("/workspace/projects/shared-e/members");
    expect(out).not.toMatch(/>\s*Archive\s*</);
  });

  it("admin member: can edit, manage members and archive", () => {
    const out = render([project("shared-a", "admin")]);
    expect(out).toContain("Shared · Admin");
    expect(out).toContain(">Edit<");
    expect(out).toContain("/workspace/projects/shared-a/members");
    expect(out).toContain("Archive");
  });

  it("shared projects do not consume the plan quota", () => {
    const out = render([project("own", "owner"), project("s1", "viewer"), project("s2", "editor")], 1);
    expect(out).toContain("1 of 1 startup used");
    // limit reached because of the ONE owned project, not the two shared ones
    expect(out).toContain("reached your founder_growth plan limit");
  });
});
