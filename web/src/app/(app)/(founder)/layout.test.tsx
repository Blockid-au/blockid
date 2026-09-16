// G13-W4-IA4: the persona redirect for /dashboard must happen in the layout
// (a real 307), never only in the page behind dashboard/loading.tsx.
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/dashboard", user: { id: "u-1", role: "user" } as { id: string; role?: string } | null, persona: "investor_angel" }));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-pathname": state.pathname }) }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/nav/founder-phase", () => ({ getFounderNavContext: async () => ({ navPhase: 0, svi: null, growthPhaseId: null }) }));
vi.mock("@/lib/nav/persona-server", () => ({ resolvePersonaForUser: async () => state.persona }));
vi.mock("@/components/workspace/founder-nav-context", () => ({ FounderNavContextProvider: ({ children }: { children: unknown }) => children }));

import FounderLayout from "./layout";

describe("(founder) layout — persona redirect", () => {
  beforeEach(() => {
    state.pathname = "/dashboard";
    state.user = { id: "u-1", role: "user" };
    state.persona = "investor_angel";
    delete process.env.PERSONA_LANDING;
  });

  it("an evaluator persona on /dashboard is redirected to its landing before the shell streams", async () => {
    await expect(FounderLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/workspace/investor");
  });

  it("a founder on /dashboard renders", async () => {
    state.persona = "founder";
    await expect(FounderLayout({ children: null })).resolves.toBeDefined();
  });

  it("evaluators on other founder routes are not redirected by the layout (page gates handle them)", async () => {
    state.pathname = "/workspace/evaluations";
    await expect(FounderLayout({ children: null })).resolves.toBeDefined();
  });

  it("PERSONA_LANDING=off disables the redirect", async () => {
    process.env.PERSONA_LANDING = "off";
    await expect(FounderLayout({ children: null })).resolves.toBeDefined();
  });
});
