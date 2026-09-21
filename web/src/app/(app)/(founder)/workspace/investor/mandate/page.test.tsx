import type React from "react";
import { darkSurfaceOffences } from "@/design/light-markup";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/investor/mandate (G13-W3-T2). Pins: the 7
// sections render for evaluator personas with every control labelled
// (htmlFor ↔ id), chips are real checkboxes from the taxonomy vocab, the
// discoverable switch keeps the 0323 semantics (off by default, consent
// copy, never-share-email line), prefill from the primary mandate / the
// investor_prefs read-through, the Program-only weights section, the
// "not migrated" notice, the data-principle sentence, founders get copy
// only, and the investor's email never lands in the markup. Data layer
// mocked — lib/investors/mandates.test.ts covers it.

vi.mock("server-only", () => ({}));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/investor/mandate",
}));
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
const visibilityMock = vi.fn();
vi.mock("@/lib/investor-portal", () => ({ getInvestorVisibility: (u: string) => visibilityMock(u) }));
const { listMock, draftMock, limitMock } = vi.hoisted(() => ({ listMock: vi.fn(), draftMock: vi.fn(), limitMock: vi.fn() }));
vi.mock("@/lib/investors/mandates", async (orig) => {
  const shared = (await import("@/lib/investors/mandates-shared")) as Record<string, unknown>;
  void orig;
  return {
    ...shared,
    listMandates: (u: string) => listMock(u),
    mandateDraftFor: (u: string, d: boolean) => draftMock(u, d),
    mandateLimitFor: (p: string) => limitMock(p),
    canEditWeights: (p: string) => p === "investor_vc_small",
  };
});

const USER = {
  id: "u-inv", email: "angel@example.com", displayName: "Ann Angel", role: "user", plan: "investor_angel",
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};
const MID = "22222222-2222-4222-8222-222222222222";
const MANDATE = { id: MID, label: "Sydney Angels", is_default: true, discoverable: true };
const DRAFT = { id: MID, label: "Sydney Angels", kind: "angel", thesis: "Pre-seed agtech in ANZ", discoverable: true, sectors_include: ["agtech_food"], stages: ["seed"], geographies: ["NSW"], min_svi: 54, cheque_min_aud: 50000, cheque_max_aud: 250000 };

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  visibilityMock.mockReset().mockResolvedValue({ evaluator: true, discoverable: true });
  listMock.mockReset().mockResolvedValue({ migrated: true, mandates: [MANDATE], primary: MANDATE });
  draftMock.mockReset().mockResolvedValue({ draft: DRAFT, source: "mandate", mandateId: MID });
  limitMock.mockReset().mockResolvedValue(1);
  redirectMock.mockClear();
});

describe("/workspace/investor/mandate — 7-section mandate form", () => {
  it("redirects signed-out visitors to login with next=", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/investor/mandate");
  });

  it("evaluator: renders all 7 sections with headings, prefilled from the primary mandate", async () => {
    const out = await html();
    expect(darkSurfaceOffences(out), "G26 light template").toEqual([]);
    for (const key of ["identity", "appetite", "stage_cheque", "geography", "floors", "tags_esg", "weights"]) {
      expect(out, key).toContain(`data-mandate-section="${key}"`);
    }
    expect(out).toContain("1 · Identity");
    expect(out).toContain("7 · Weights (advanced)");
    expect(out).toContain(`data-mandate-id="${MID}"`);
    expect(out).toContain('data-draft-source="mandate"');
    expect(out).toContain('value="Sydney Angels"');
    expect(out).toContain("Pre-seed agtech in ANZ");
    expect(out).toContain('value="50000"');
    expect(out).toContain('value="250000"');
    expect(out).toContain('data-chip="agtech_food" data-on="1"');
    expect(out).toContain('data-chip="fintech" data-on="0"');
    expect(out).toContain('data-chip="seed" data-on="1"');
    expect(out).toContain('data-chip="NSW" data-on="1"');
    expect(out).toContain('data-min-svi-value');
    expect(out).toContain(">54<");
    expect(listMock).toHaveBeenCalledWith("u-inv");
    expect(draftMock).toHaveBeenCalledWith("u-inv", true);
  });

  it("a11y: every input / select / textarea / range has an id and a matching <label htmlFor>; chips are real checkboxes", async () => {
    const out = await html();
    const ids = [...out.matchAll(/<(?:input|select|textarea)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(60);
    const fors = new Set([...out.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
    const missing = ids.filter((id) => !fors.has(id));
    expect(missing, "controls without a <label htmlFor>").toEqual([]);
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('type="range"');
    expect(out).toContain('name="min_svi"');
    expect(out).toMatch(/<fieldset[^>]*>\s*<legend[^>]*>Sectors — include<\/legend>/);
    // taxonomy vocabulary labels, not slugs
    expect(out).toContain("Agtech / food");
    expect(out).toContain("Seed (Post-PMF)");
    expect(out).toContain("SaaS / subscription");
    expect(out).toContain("ESIC eligible");
  });

  it("discoverable switch keeps the 0323 semantics: role=switch, consent copy, never-share-email line, ON when the mandate says so", async () => {
    const out = await html();
    expect(out).toContain("data-investor-visibility");
    expect(out).toContain('data-discoverable="1"');
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-checked="true"');
    expect(out).toContain("Let matching founders see me");
    expect(out).toContain("We never share your email.");
    draftMock.mockResolvedValue({ draft: { label: "" }, source: "empty", mandateId: null });
    const fresh = await html();
    expect(fresh).toContain('data-discoverable="0"');
    expect(fresh).toContain('aria-checked="false"');
  });

  it("Scout: weights section is locked copy; Program: seven weight inputs with the live sum", async () => {
    const scout = await html();
    expect(scout).toContain("data-weights-locked");
    expect(scout).not.toContain('name="weights.industry"');
    getCurrentUserMock.mockResolvedValue({ ...USER, plan: "investor_vc_small" });
    const program = await html();
    expect(program).toContain('data-weights-sum="100"');
    for (const axis of ["industry", "business_model", "stage", "geo", "cheque", "tags", "floors"]) expect(program).toContain(`name="weights.${axis}"`);
  });

  it("prefs read-through: the prefill notice shows and no mandate id is set; 'not migrated' notice before 0393; limit copy when Scout already holds one", async () => {
    draftMock.mockResolvedValue({ draft: { label: "Old Firm", sectors_include: ["fintech"] }, source: "prefs", mandateId: null });
    listMock.mockResolvedValue({ migrated: true, mandates: [], primary: null });
    const out = await html();
    expect(out).toContain("data-prefs-prefill");
    expect(out).toContain('data-mandate-id=""');
    expect(out).toContain('value="Old Firm"');
    listMock.mockResolvedValue({ migrated: false, mandates: [], primary: null });
    expect(await html()).toContain("data-not-migrated");
    // one mandate on file, no id in the draft (e.g. a second create attempt) → save disabled + limit copy
    listMock.mockResolvedValue({ migrated: true, mandates: [MANDATE], primary: MANDATE });
    draftMock.mockResolvedValue({ draft: { label: "" }, source: "empty", mandateId: null });
    const limited = await html();
    expect(limited).toContain("Your plan allows one mandate");
  });

  it("founder persona: copy only — no form, no data reads; the investor's email never lands in the markup", async () => {
    visibilityMock.mockResolvedValue({ evaluator: false, discoverable: false });
    const out = await html();
    expect(out).toContain("data-mandate-founder-copy");
    expect(out).not.toContain("data-mandate-form");
    expect(out).not.toContain('role="switch"');
    expect(listMock).not.toHaveBeenCalled();
    expect(out).toContain("Your mandate");
    expect(out).not.toContain("angel@example.com");
    const ev = await (async () => {
      visibilityMock.mockResolvedValue({ evaluator: true, discoverable: true });
      return html();
    })();
    expect(ev).not.toContain("angel@example.com");
    expect(ev).toContain("Your data belongs to your startup.");
  });
});
