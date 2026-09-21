import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/investor/dealflow v2 (G13-W3-T2). Pins: the
// page reads getDealFlowV2 with the URL filters, renders the mandate-scored
// rows with taxonomy industry / stage / state columns, the Unclassified
// badge, fit + reason / gap / blocker chips, the dossier deep-link per
// project_id, the filter bar as URL-serialised toggles, the saved-views bar,
// and the three empty states (not migrated / no mandate / never computed).

vi.mock("server-only", () => ({}));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("@/components/access/FeatureGate", () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <div data-gate>{children}</div>,
}));
vi.mock("@/components/legal/not-financial-advice", () => ({ NotFinancialAdvice: () => <p data-nfa /> }));
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => "/workspace/investor/dealflow",
}));
const userMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => userMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
vi.mock("@/lib/evaluations/dossier", () => ({ DOSSIER_ALIAS_PATH: (id: string) => `/workspace/investor/startup/${id}` }));
const { dfMock } = vi.hoisted(() => ({ dfMock: vi.fn() }));
vi.mock("@/lib/investors/dealflow", () => ({ getDealFlowV2: (u: string, f: unknown) => dfMock(u, f) }));

const USER = { id: "u-inv", email: "angel@example.com", plan: "investor_angel", role: "user", displayName: "Ann" };
const MANDATE = { id: "11111111-1111-4111-8111-111111111111", label: "Seed fintech", sectors_include: ["fintech"], business_models: [], stages: ["seed"], geographies: ["NSW"], tags_include: [], min_svi: 50 };
const ROWS = [
  { project_id: "p-pay", company_name: "PayFlow", svi: 64, svi_delta_30d: 12, industry: "fintech", industry_secondary: null, business_model: "saas_subscription", stage_key: "seed", hq_state: "NSW", tags: ["esic_eligible"], unclassified: false, fit: 100, reasons: ["Invests in fintech", "Backs seed rounds"], gaps: [], blockers: [], computed_at: "t", updated_at: "t" },
  { project_id: "p-agri", company_name: "AgriSense", svi: 58, svi_delta_30d: null, industry: "unclassified", industry_secondary: null, business_model: "unclassified", stage_key: "mvp_early_revenue", hq_state: null, tags: [], unclassified: true, fit: 62, reasons: [], gaps: ["industry unclassified — founder confirmation pending"], blockers: [], computed_at: "t", updated_at: null },
  { project_id: "p-gated", company_name: "Gated", svi: 30, svi_delta_30d: -6, industry: "ai_ml", industry_secondary: null, business_model: "consumer_app", stage_key: "idea", hq_state: "VIC", tags: [], unclassified: false, fit: 0, reasons: [], gaps: ["SVI 30 below their 50 floor"], blockers: ["svi_floor"], computed_at: "t", updated_at: "t" },
];
const OK = { migrated: true, mandate: MANDATE, mandates: [MANDATE], rows: ROWS, total_above_floor: 3, never_computed: false, views: [{ id: "abc12345", name: "Seed NSW", filters: { industry: [], business_model: [], stage: ["seed"], state: ["NSW"], tags: [], sort: "fit" }, sort: "fit", created_at: "t" }] };

async function html(sp: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ searchParams: Promise.resolve(sp) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  userMock.mockReset().mockResolvedValue(USER);
  dfMock.mockReset().mockResolvedValue(OK);
  redirectMock.mockClear();
});

describe("/workspace/investor/dealflow — v2", () => {
  it("redirects signed-out visitors", async () => {
    userMock.mockResolvedValueOnce(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/investor/dealflow");
  });

  it("passes the URL filters to the loader and renders the mandate-scored rows keyed on project_id", async () => {
    const out = await html({ industry: "fintech,ai_ml", stage: "seed", fit: "0", sort: "svi" });
    expect(dfMock).toHaveBeenCalledWith("u-inv", expect.objectContaining({ industry: ["fintech", "ai_ml"], stage: ["seed"], min_fit: 0, sort: "svi" }));
    expect(out).toContain('data-migrated="1"');
    expect(out).toContain('data-rows="3"');
    expect(out).toContain("ranked against <strong>Seed fintech</strong>");
    // columns from the taxonomy row, not the legacy snapshot guess
    expect(out).toContain('data-row="p-pay"');
    expect(out).toContain("PayFlow");
    expect(out).toContain("Fintech");
    expect(out).toContain("Seed (Post-PMF)");
    expect(out).toContain(">NSW<");
    expect(out).toContain("SVI 64");
    expect(out).toContain('data-delta="12"');
    expect(out).toContain("▲12");
    // fit + reason chips + dossier deep-link
    expect(out).toContain('data-fit="100"');
    expect(out).toContain('data-chip="reason">Invests in fintech');
    expect(out).toContain('href="/workspace/investor/startup/p-pay"');
    // Unclassified badge (DQ-1) with the founder-confirmation gap
    expect(out).toContain('data-row="p-agri" data-fit="62" data-unclassified="1"');
    expect(out).toContain('data-badge="unclassified"');
    expect(out).toContain("industry unclassified — founder confirmation pending");
    // gated row: fit 0 in red + blocker chip
    expect(out).toContain('data-chip="blocker">svi floor');
    expect(out).toContain("▼6");
  });

  it("filter bar: URL-serialised toggles per axis with aria-pressed; the active chip links to the toggled-off URL; Clear all", async () => {
    const out = await html({ stage: "seed", state: "NSW" });
    expect(out).toContain("data-filter-bar");
    expect(out).toMatch(/class="inline-flex min-h-11 items-center rounded-full bg-brand-navy[^"]*" data-filter="stage" data-value="seed" aria-pressed="true" href="\/workspace\/investor\/dealflow\?state=NSW"/);
    expect(out).toMatch(/data-filter="stage" data-value="seed" aria-pressed="true"/);
    expect(out).toMatch(/data-filter="stage" data-value="series_a" aria-pressed="false"/);
    expect(out).toContain('href="/workspace/investor/dealflow?stage=seed%2Cseries_a&amp;state=NSW"');
    expect(out).toContain('data-filter="industry" data-value="fintech"');
    expect(out).toContain('data-filter="business_model" data-value="saas_subscription"');
    expect(out).toContain('data-filter="tags" data-value="esic_eligible"');
    expect(out).toContain('data-filter="min_fit" data-value="60"');
    expect(out).toContain('data-filter="moved"');
    expect(out).toContain('data-filter="clear"');
    expect(out).not.toContain("cheque_band");
  });

  it("saved views bar lists the user's views + 'My mandate' (the mandate as filters) and shows Save view when filters are active", async () => {
    const out = await html({ stage: "seed" });
    expect(out).toContain('data-saved-views="true" data-count="1"');
    expect(out).toContain('data-saved-view="abc12345"');
    expect(out).toContain("Seed NSW");
    expect(out).toContain('data-view="mandate"');
    expect(out).toContain(`href="/workspace/investor/dealflow?industry=fintech&amp;stage=seed&amp;state=NSW&amp;svi=50&amp;mandate=${MANDATE.id}"`);
    expect(out).toContain("data-save-view");
    const none = await html();
    expect(none).not.toContain("data-save-view");
  });

  it("empty states: not migrated → notice; no mandate → CTA; never computed → nightly notice; no rows → broaden", async () => {
    dfMock.mockResolvedValue({ ...OK, migrated: false, mandate: null, rows: [] });
    expect(await html()).toContain('data-notice="not-migrated"');
    dfMock.mockResolvedValue({ ...OK, mandate: null, rows: [] });
    const noMandate = await html();
    expect(noMandate).toContain('data-empty="no_mandate"');
    expect(noMandate).toContain("Write your mandate");
    dfMock.mockResolvedValue({ ...OK, rows: [], never_computed: true });
    expect(await html()).toContain('data-notice="never-computed"');
    dfMock.mockResolvedValue({ ...OK, rows: [], total_above_floor: 3 });
    expect(await html({ stage: "idea" })).toContain('data-empty="no_rows"');
  });

  it("mandate picker appears with several mandates and never leaks the investor's email", async () => {
    dfMock.mockResolvedValue({ ...OK, mandates: [MANDATE, { ...MANDATE, id: "22222222-2222-4222-8222-222222222222", label: "Fund II" }] });
    const out = await html();
    expect(out).toContain("data-mandate-picker");
    expect(out).toContain("Fund II");
    expect(out).toContain("mandate=22222222-2222-4222-8222-222222222222");
    expect(out).not.toContain("angel@example.com");
  });
});
