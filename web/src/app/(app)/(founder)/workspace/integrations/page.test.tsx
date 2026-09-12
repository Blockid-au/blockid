import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { founderUser, renderPage } from "@/test/founder-page-harness";

// Render test for /workspace/integrations — the S20-B Webhooks section.
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

vi.mock("@/lib/oauth-connectors", () => ({ listConnections: async () => [], isProviderConfigured: () => false }));
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
  store = memoryWebhookStore();
  getCurrentUserMock.mockReset().mockResolvedValue({ ...founderUser(scopeState), plan: "founder_growth" });
});

describe("/workspace/integrations — Webhooks section", () => {
  it("redirects to login when signed out", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/integrations");
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
