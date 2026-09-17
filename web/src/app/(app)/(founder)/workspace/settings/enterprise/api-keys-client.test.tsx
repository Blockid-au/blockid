// G14-S38 — scope pills on the API-keys settings section. Static render
// (no DOM): every key row shows its scopes as pills (analyze always, the
// evaluator scopes highlighted), and the create form only offers
// `evaluations:*` when the account is an evaluator.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));

import type { ApiKeyInfo } from "@/lib/api-keys";
import { ApiKeysClient, ScopePills } from "./api-keys-client";

const key = (over: Partial<ApiKeyInfo> = {}): ApiKeyInfo => ({
  id: "k-1",
  name: "Affinity sync",
  prefix: "bk_live_abcdef01...",
  isActive: true,
  lastUsedAt: null,
  createdAt: "2026-09-17T00:00:00.000Z",
  permissions: [],
  scopes: ["analyze", "evaluations:read"],
  rateLimitPerMin: 100,
  ...over,
});

describe("ScopePills", () => {
  it("renders one pill per scope with data-scope; unknown strings dropped; empty → analyze", () => {
    const html = renderToStaticMarkup(<ScopePills scopes={["analyze", "evaluations:write", "bogus"]} />);
    expect(html.match(/data-testid="api-key-scope"/g)).toHaveLength(2);
    expect(html).toContain('data-scope="evaluations:write"');
    expect(html).not.toContain("bogus");
    expect(renderToStaticMarkup(<ScopePills scopes={[]} />)).toContain('data-scope="analyze"');
  });
});

describe("ApiKeysClient", () => {
  it("each key row shows its scope pills", () => {
    const html = renderToStaticMarkup(
      <ApiKeysClient keys={[key(), key({ id: "k-2", name: "CI", scopes: ["analyze"] })]} canCreate currentPlan="investor_fund" rateLimit={100} canEvaluatorScopes />,
    );
    expect(html.match(/data-testid="api-key-scopes"/g)).toHaveLength(2);
    expect(html).toContain('data-scope="evaluations:read"');
    expect(html.match(/data-scope="analyze"/g)).toHaveLength(2);
  });

  it("a legacy row without scopes still renders the analyze pill", () => {
    const html = renderToStaticMarkup(<ApiKeysClient keys={[key({ scopes: undefined as unknown as ApiKeyInfo["scopes"] })]} canCreate={false} currentPlan="free" rateLimit={60} />);
    expect(html).toContain('data-scope="analyze"');
  });
});
