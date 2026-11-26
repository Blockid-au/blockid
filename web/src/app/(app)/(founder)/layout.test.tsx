// G13-W4-IA4: the persona redirect for /dashboard must happen in the layout
// (a real 307), never only in the page behind dashboard/loading.tsx.
// G20-sweep: the same for /workspace, equity/setup, the dossier alias and the
// tier-gated pages under workspace/loading.tsx (lib/nav/founder-layout-redirects).
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/dashboard",
  user: { id: "u-1", role: "user" } as { id: string; role?: string } | null,
  persona: "investor_angel",
  capTable: false,
  evaluationId: null as string | null,
  gate: null as string | null,
  row: { accountType: "investor_angel", segment: "investor_angel", onboardingCompleted: true, loaded: true } as {
    accountType: string | null;
    segment: string | null;
    onboardingCompleted: boolean;
    loaded: boolean;
  },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-pathname": state.pathname }) }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/nav/founder-phase", () => ({ getFounderNavContext: async () => ({ navPhase: 0, svi: null, growthPhaseId: null }) }));
vi.mock("@/lib/nav/persona-server", async (importOriginal) => ({
  // navSeatFor stays real — the fallbacks it applies are what this test pins.
  ...(await importOriginal<typeof import("@/lib/nav/persona-server")>()),
  resolvePersonaForUser: async () => state.persona,
  loadPersonaRow: async () => state.row,
}));
vi.mock("@/components/workspace/founder-nav-context", () => ({ FounderNavContextProvider: ({ children }: { children: unknown }) => children }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: state.capTable ? [{ id: "sh-1" }] : [] }) }) }) }),
  }),
}));
vi.mock("@/lib/evaluations/dossier", () => ({
  DOSSIER_PATH: (id: string) => `/workspace/evaluations/${id}`,
  findEvaluationIdForProject: async () => state.evaluationId,
}));
vi.mock("@/lib/entitlements/require-tier-for-page", () => ({ resolveTierGate: async () => state.gate }));

import FounderLayout from "./layout";

describe("(founder) layout — persona redirect", () => {
  beforeEach(() => {
    state.pathname = "/dashboard";
    state.user = { id: "u-1", role: "user" };
    state.persona = "investor_angel";
    state.capTable = false;
    state.evaluationId = null;
    state.gate = null;
    state.row = { accountType: "investor_angel", segment: "investor_angel", onboardingCompleted: true, loaded: true };
    delete process.env.PERSONA_LANDING;
  });

  // G36 — the seat's persona inputs ride the nav context so the server-rendered
  // sidebar is already the persona's (qa:live lane 22 read the founder's 4
  // groups for an investor_angel before /api/entitlement/me answered).
  it("publishes the seat (account_type, segment, session plan) on the nav context; no seat when the row is unreadable", async () => {
    state.pathname = "/workspace/investor";
    state.user = { id: "u-1", role: "user", plan: "free" } as typeof state.user;
    const el = (await FounderLayout({ children: null })) as { props: { value: { seat?: unknown } } };
    expect(el.props.value.seat).toEqual({ accountType: "investor_angel", segment: "investor_angel", plan: "free" });
    // Same fallbacks as /api/entitlement/me (plan ?? "free", segment ?? "founder") — no SSR → client flip.
    state.user = { id: "u-1", role: "user", plan: "investor_angel" } as typeof state.user;
    state.row = { accountType: "founder", segment: null, onboardingCompleted: true, loaded: true };
    const fromPlan = (await FounderLayout({ children: null })) as { props: { value: { seat?: unknown } } };
    expect(fromPlan.props.value.seat).toEqual({ accountType: "founder", segment: "founder", plan: "investor_angel" });
    state.user = { id: "u-1", role: "user" };
    const noPlan = (await FounderLayout({ children: null })) as { props: { value: { seat?: { plan: string } } } };
    expect(noPlan.props.value.seat?.plan).toBe("free");
    state.row = { accountType: null, segment: null, onboardingCompleted: false, loaded: false };
    const bare = (await FounderLayout({ children: null })) as { props: { value: { seat?: unknown } } };
    expect(bare.props.value.seat).toBeUndefined();
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

  // G20-sweep — redirects under workspace/loading.tsx resolve here (real 307).
  it("/workspace lands on /dashboard before the workspace skeleton streams", async () => {
    state.pathname = "/workspace";
    await expect(FounderLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    state.pathname = "/workspace/";
    await expect(FounderLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("/workspace/equity/setup goes to the cap table once shareholders exist, renders otherwise", async () => {
    state.pathname = "/workspace/equity/setup";
    await expect(FounderLayout({ children: null })).resolves.toBeDefined();
    state.capTable = true;
    await expect(FounderLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/workspace/equity/cap-table");
  });

  it("the dossier alias redirects to the evaluation when the caller holds one", async () => {
    state.pathname = "/workspace/investor/startup/11111111-1111-4111-8111-111111111111?tab=x";
    await expect(FounderLayout({ children: null })).resolves.toBeDefined();
    state.evaluationId = "ev-9";
    await expect(FounderLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/workspace/evaluations/ev-9");
  });

  it("a tier-gated page redirects to pricing from the layout when the gate says so", async () => {
    state.pathname = "/workspace/esop/vesting";
    await expect(FounderLayout({ children: null })).resolves.toBeDefined();
    state.gate = "/pricing?feature=vesting.read&from=%2Fworkspace%2Fesop%2Fvesting";
    await expect(FounderLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/pricing?feature=vesting.read");
  });

  it("an anonymous request never redirects here (the (app) layout owns the login bounce)", async () => {
    state.user = null;
    state.pathname = "/workspace";
    await expect(FounderLayout({ children: null })).resolves.toBeDefined();
  });
});
