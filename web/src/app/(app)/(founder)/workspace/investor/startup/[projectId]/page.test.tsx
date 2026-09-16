import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// /workspace/investor/startup/[projectId] alias (G13-W2-D1): redirects to
// the caller's dossier when they hold an evaluation on the project, else
// renders the "Add to my evaluations" interstitial that names nothing about
// the project.

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
const isEvaluatorUserMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: (u: unknown) => isEvaluatorUserMock(u) }));
const findMock = vi.fn();
vi.mock("@/lib/evaluations/dossier", () => ({
  findEvaluationIdForProject: (u: string, p: string) => findMock(u, p),
  DOSSIER_PATH: (id: string) => `/workspace/evaluations/${id}`,
}));

const USER = { id: "u-1", email: "scout@fund.vc", displayName: "Sam", role: "user", plan: "investor_angel" };

async function html(projectId = "p-1"): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ params: Promise.resolve({ projectId }) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
  isEvaluatorUserMock.mockReset();
  isEvaluatorUserMock.mockResolvedValue(true);
  findMock.mockReset();
  redirectMock.mockClear();
});

describe("/workspace/investor/startup/[projectId]", () => {
  it("redirects anonymous users to login", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/investor/startup/p-1");
  });

  it("302s to the caller's dossier when an evaluation exists", async () => {
    findMock.mockResolvedValue("e-9");
    await expect(html()).rejects.toThrow("REDIRECT:/workspace/evaluations/e-9");
    expect(findMock).toHaveBeenCalledWith("u-1", "p-1");
  });

  it("renders the interstitial (no project details) for evaluators without a row", async () => {
    findMock.mockResolvedValue(null);
    const out = await html();
    expect(out).toContain('data-testid="dossier-interstitial"');
    expect(out).toContain("Add to my evaluations");
    expect(out).toContain('href="/workspace/evaluations"');
    expect(out).not.toContain("p-1");
  });

  it("points non-evaluators at evaluator plans", async () => {
    findMock.mockResolvedValue(null);
    isEvaluatorUserMock.mockResolvedValue(false);
    const out = await html();
    expect(out).toContain("See evaluator plans");
    expect(out).not.toContain("Add to my evaluations");
  });

  it("404s a malformed id", async () => {
    await expect(html("x y")).rejects.toThrow("NOT_FOUND");
  });
});
