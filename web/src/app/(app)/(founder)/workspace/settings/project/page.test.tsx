// Render test for /workspace/settings/project (G13-W4-D2 E1.4). Pins: login
// redirect; the empty state without an active project; the facts card +
// the taxonomy confirmation card for an owner/editor (founder actor); the
// read-only note for a viewer; an evaluator persona gets the evaluator
// actor (protected tags disabled).

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/workspace-layout", () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirectMock(u) }));
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const scopeMock = vi.fn();
vi.mock("@/lib/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/projects")>()),
  getCurrentProjectIsSandbox: async () => false,
  getProjectScope: () => scopeMock(),
}));
const getTaxonomyMock = vi.fn();
vi.mock("@/lib/taxonomy/store", () => ({ getTaxonomy: (id: string) => getTaxonomyMock(id) }));
const isEvaluatorMock = vi.fn(async () => false);
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: () => isEvaluatorMock() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import ProjectSettingsPage from "./page";

const USER = { id: "u-1", email: "jo@acme.io", plan: "free" };
const PROJECT = { id: "p-1", name: "Acme Robotics", slug: "acme-robotics", industry: "DeepTech" };
const TAX = { project_id: "p-1", industry: "advanced_manufacturing", business_model: "unclassified", customer_types: ["b2b"], stage_key: "seed", hq_state: "NSW", geo_scope: null, tags: [], sources: { industry: "auto" }, confidence: { industry: 0.7 }, suggested: null, confirmed_at: null, confirmed_by: null };

async function html(): Promise<string> {
  return renderToStaticMarkup(await ProjectSettingsPage());
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  scopeMock.mockReset().mockResolvedValue({ project: PROJECT, role: "owner" });
  getTaxonomyMock.mockReset().mockResolvedValue(TAX);
  isEvaluatorMock.mockReset().mockResolvedValue(false);
});

describe("/workspace/settings/project", () => {
  it("redirects anonymous users", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/settings/project");
  });

  it("no active project → empty state linking to My startups", async () => {
    scopeMock.mockResolvedValue(null);
    const out = await html();
    expect(out).toContain('data-testid="project-settings-empty"');
    expect(out).toContain('href="/workspace/projects"');
    expect(out).not.toContain('data-testid="taxonomy-confirm-card"');
  });

  it("owner: facts card + the taxonomy confirmation card seeded from the store (founder actor)", async () => {
    const out = await html();
    expect(out).toContain("Project settings");
    expect(out).toContain('data-testid="project-facts"');
    expect(out).toContain("Acme Robotics");
    expect(out).toContain("acme-robotics");
    expect(out).toContain('data-testid="taxonomy-confirm-card"');
    expect(out).toContain("Advanced manufacturing");
    expect(out).toContain("Correct?");
    expect(out).toContain('data-testid="taxonomy-confirm"');
    expect(getTaxonomyMock).toHaveBeenCalledWith("p-1");
  });

  it("viewer: read-only note instead of the card; evaluator persona: evaluator actor", async () => {
    scopeMock.mockResolvedValue({ project: PROJECT, role: "viewer" });
    const ro = await html();
    expect(ro).toContain('data-testid="taxonomy-readonly"');
    expect(ro).not.toContain('data-testid="taxonomy-confirm-card"');
    scopeMock.mockResolvedValue({ project: PROJECT, role: "owner" });
    isEvaluatorMock.mockResolvedValue(true);
    getTaxonomyMock.mockResolvedValue({ ...TAX, industry: "unclassified" });
    const ev = await html();
    expect(ev).toContain("can only be declared by the founder");
  });
});
