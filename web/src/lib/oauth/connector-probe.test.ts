// Release QA-2 F11 — connector probe: HEAD answers 204 + header, never 5xx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONNECTOR_CONFIGURED_HEADER,
  connectorProbeHeaders,
  isConnectorConfigured,
  probeConnector,
} from "./connector-probe";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set() {}, get() {} }) }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => null }));

describe("connectorProbeHeaders / isConnectorConfigured", () => {
  it("encodes the flag and a short private cache", () => {
    expect(connectorProbeHeaders(true)).toEqual({ [CONNECTOR_CONFIGURED_HEADER]: "true", "Cache-Control": "private, max-age=300" });
    expect(connectorProbeHeaders(false)[CONNECTOR_CONFIGURED_HEADER]).toBe("false");
  });

  it("reads the header first, then falls back to the legacy status rule", () => {
    const res = (status: number, flag?: string) => ({ status, headers: new Headers(flag ? { [CONNECTOR_CONFIGURED_HEADER]: flag } : {}) });
    expect(isConnectorConfigured(res(204, "true"))).toBe(true);
    expect(isConnectorConfigured(res(204, "false"))).toBe(false);
    expect(isConnectorConfigured(res(200))).toBe(true);
    expect(isConnectorConfigured(res(503))).toBe(false);
  });

  it("probeConnector: network error → not configured", async () => {
    expect(await probeConnector("/api/oauth/xero", (async () => { throw new Error("boom"); }) as unknown as typeof fetch)).toBe(false);
    const ok = (async () => new Response(null, { status: 204, headers: connectorProbeHeaders(true) })) as unknown as typeof fetch;
    expect(await probeConnector("/api/oauth/xero", ok)).toBe(true);
  });
});

describe("HEAD /api/oauth/<provider> — 204 + X-Connector-Configured, never 503", () => {
  const ENV: Record<string, string> = {
    xero: "XERO_CLIENT_ID",
    stripe: "STRIPE_CLIENT_ID",
    ga4: "GOOGLE_CLIENT_ID",
    linkedin: "LINKEDIN_CLIENT_ID",
    github: "GITHUB_CLIENT_ID",
  };
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of Object.values(ENV)) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of Object.values(ENV)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  for (const [provider, envKey] of Object.entries(ENV)) {
    it(`${provider}: unset → 204 + false; set → 204 + true`, async () => {
      const mod = await import(`@/app/api/oauth/${provider}/route`);
      const off = await mod.HEAD();
      expect(off.status).toBe(204);
      expect(off.headers.get(CONNECTOR_CONFIGURED_HEADER)).toBe("false");
      expect(isConnectorConfigured(off)).toBe(false);

      process.env[envKey] = "client-id";
      const on = await mod.HEAD();
      expect(on.status).toBe(204);
      expect(on.headers.get(CONNECTOR_CONFIGURED_HEADER)).toBe("true");
      expect(isConnectorConfigured(on)).toBe(true);
    });
  }
});
