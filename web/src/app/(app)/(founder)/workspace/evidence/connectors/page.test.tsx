import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { founderUser, renderPage } from "@/test/founder-page-harness";

// Render test for /workspace/evidence/connectors — the S20-B Webhooks section.
// Pins: login redirect; a Growth owner sees the section with the add
// button, the existing endpoints (own + project-level) and never a secret;
// a Free founder sees the plan gate and no add button; a viewer member
// sees the list read-only with the "view only" note.

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("@/components/workspace/integration-row-card", () => ({
  IntegrationRowCard: ({ row }: { row: { provider: string } }) => <div data-row={row.provider} />,
}));
vi.mock("@/components/founder/crm-push-button", () => ({ CrmPushButton: () => <button>Push to CRM</button> }));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const scopeStateP = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState({ projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock: mk } = await import("@/test/project-scope-mock");
  return { ...mk(await scopeStateP), roleCanAdmin: (r: string) => r === "owner" || r === "admin" };
});
const scopeState = await scopeStateP;

const connectorsState = vi.hoisted(() => ({ configured: new Set<string>(), connections: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/oauth-connectors", () => ({
  listConnections: async () => connectorsState.connections,
  isProviderConfigured: (p: string) => connectorsState.configured.has(p),
}));
const freshnessMock = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock("@/lib/evidence/freshness", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/evidence/freshness")>();
  return { ...actual, connectorFreshness: (...a: unknown[]) => freshnessMock(...a) };
});
vi.mock("@/lib/blockchain-sync", () => ({ getSyncConfig: async () => null }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async () => [] }));

import { memoryWebhookStore, type MemoryStore } from "@/lib/webhooks/store";
let store: MemoryStore | null;
vi.mock("@/lib/webhooks/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhooks/store")>();
  return { ...actual, supabaseWebhookStore: () => store };
});

const PID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page({ searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
  scopeState.role = "owner";
  scopeState.projectId = PID;
  connectorsState.configured = new Set(["github", "ga4"]);
  connectorsState.connections = [];
  freshnessMock.mockReset().mockResolvedValue([]);
  delete process.env.XERO_CLIENT_ID;
  store = memoryWebhookStore();
  getCurrentUserMock.mockReset().mockResolvedValue({ ...founderUser(scopeState), plan: "founder_growth" });
});

describe("/workspace/evidence/connectors — Webhooks section", () => {
  it("redirects to login when signed out", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evidence/connectors");
  });

  it("Growth owner: section renders with the add button, own + project endpoints, no secret material", async () => {
    await store!.insertEndpoint({ user_id: scopeState.callerId, project_id: null, url: "https://mine.example.com/hook", description: "Zapier", secret_hash: "HASHVALUE", secret_enc: "SEALEDVALUE", events: ["svi.rescored"] });
    await store!.insertEndpoint({ user_id: "other-admin", project_id: PID, url: "https://project.example.com/hook", description: null, secret_hash: "HASHVALUE", secret_enc: "SEALEDVALUE", events: ["evidence.uploaded"] });
    const out = await html();
    expect(out).toContain("data-webhooks-section");
    expect(out).toContain("data-webhooks-add");
    expect(out).toContain("https://mine.example.com/hook");
    expect(out).toContain("https://project.example.com/hook");
    expect(out).toContain("Send test ping");
    expect(out).not.toContain("HASHVALUE");
    expect(out).not.toContain("SEALEDVALUE");
    expect(out).not.toContain("data-webhooks-gate");
    expect(out).toContain('href="/docs#webhooks"');
    // S-IA2 — the ex-/dashboard/integrations "Evidence sources" section is composed in.
    expect(out).toContain("Evidence sources");
    expect(out).toContain("GitHub — Product Activity Evidence");
  });

  it("Free founder: plan gate shown, no add button, empty state", async () => {
    getCurrentUserMock.mockResolvedValue({ ...founderUser(scopeState), plan: "founder_free" });
    const out = await html();
    expect(out).toContain("data-webhooks-gate");
    expect(out).not.toContain("data-webhooks-add");
    expect(out).toContain("data-webhooks-empty");
  });

  it("viewer member: read-only list, no controls", async () => {
    scopeState.role = "viewer";
    await store!.insertEndpoint({ user_id: scopeState.callerId, project_id: null, url: "https://mine.example.com/hook", description: null, secret_hash: "h", secret_enc: "s", events: ["svi.rescored"] });
    const out = await html();
    expect(out).toContain("View only");
    expect(out).not.toContain("data-webhooks-add");
    expect(out).not.toContain("Send test ping");
    expect(out).toContain("https://mine.example.com/hook");
  });
});

describe("/workspace/evidence/connectors — integrations by evidence value (G21 P3-C)", () => {
  it("every listed card states the claims it strengthens (dimension chips + level + one sentence); hidden / Priority-2/3 connectors are one 'Not offered' row each with the sentence", async () => {
    const out = await html();
    // offered cards (GitHub + GA4 configured; Stripe Connect hidden → not a card)
    for (const id of ["github", "ga4"]) {
      expect(out).toContain(`data-connector-card="${id}"`);
      expect(out).toContain(`data-evidence-value="${id}"`);
    }
    expect(out).not.toContain('data-connector-card="stripe"');
    expect(out).toContain("commit cadence over the last 30 days");
    expect(out).toContain("30-day sessions and tracked conversions");
    expect(out).toContain('data-evidence-level="L4_connected_source"');
    expect(out).toContain("Founder &amp; Team");
    // blockchain sync is not an evidence source and says so
    expect(out).toContain('data-connector-card="blockchain"');
    expect(out).toContain("Strengthens no claim on its own");
    // the not-offered list: G20 hidden connectors (Stripe Connect, Xero, QuickBooks) + Priority-2/3
    expect(out).toContain('data-testid="not-offered-connectors"');
    for (const id of ["stripe", "xero", "quickbooks", "hubspot", "salesforce", "airtable", "notion_drive", "investor_crm", "licensed_datasets"]) {
      expect(out, id).toContain(`data-not-offered="${id}"`);
    }
    expect(out).toContain("Not offered yet");
    expect(out).toContain("/contact?topic=sales&amp;feature=connector_stripe_connect");
    expect(out).toContain("/contact?topic=sales&amp;feature=connector_xero");
    expect(out).toContain("/contact?topic=sales&amp;feature=connector_hubspot");
    expect(out).toContain("STRIPE_CLIENT_ID (Stripe Connect OAuth app) is not set");
    // no freshness badge when nothing is connected
    expect(out).not.toContain("data-freshness=");
  });

  it("a connected source carries its freshness badge (fresh / ageing / stale, text not colour alone); a configured Xero shows a card instead of a list row", async () => {
    process.env.XERO_CLIENT_ID = "x";
    connectorsState.connections = [
      { provider: "github", status: "active", providerAccountId: "octo", lastSyncAt: "2026-09-19T00:00:00Z", lastSyncError: null },
      { provider: "ga4", status: "active", providerAccountId: "p1", lastSyncAt: "2026-06-01T00:00:00Z", lastSyncError: null },
    ];
    freshnessMock.mockResolvedValue([
      { provider: "github", label: "GitHub", lastSyncAt: "2026-09-19T00:00:00Z", ageDays: 1, state: "fresh", error: null },
      { provider: "ga4", label: "Google Analytics", lastSyncAt: "2026-06-01T00:00:00Z", ageDays: 111, state: "stale", error: null },
      { provider: "xero", label: "Xero", lastSyncAt: "2026-08-01T00:00:00Z", ageDays: 50, state: "ageing", error: null },
    ]);
    const out = await html();
    expect(freshnessMock).toHaveBeenCalledWith(PID, expect.anything());
    expect(out).toContain('data-freshness="fresh" data-freshness-provider="github"');
    expect(out).toContain("synced 1 d ago");
    expect(out).toContain('data-freshness="stale" data-freshness-provider="ga4"');
    expect(out).toContain("stale — 111 d since the last read; its proof has expired");
    expect(out).toContain('data-connector-card="xero"');
    expect(out).toContain('data-freshness="ageing" data-freshness-provider="xero"');
    expect(out).toContain("ageing — 50 d since the last read");
    expect(out).not.toContain('data-not-offered="xero"');
    expect(out).toContain("booked P&amp;L and the runway claim");
  });
});
