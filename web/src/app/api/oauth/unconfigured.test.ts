import { beforeEach, describe, expect, it, vi } from "vitest";

// G20 (2026-09-20): with no OAuth client id a BROWSER navigation to the
// connect route must not land on a JSON 503 page — it goes back to the
// connectors tab; programmatic callers still get the typed 503.
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u-1", email: "f@example.com", plan: "free" })) }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: "s" }) })) }));

const routes = [
  { name: "xero", env: "XERO_CLIENT_ID", load: () => import("./xero/route") },
  { name: "stripe", env: "STRIPE_CLIENT_ID", load: () => import("./stripe/route") },
];

describe("OAuth connect routes without a client id", () => {
  beforeEach(() => {
    delete process.env.XERO_CLIENT_ID;
    delete process.env.STRIPE_CLIENT_ID;
  });
  for (const r of routes) {
    it(`${r.name}: html navigation → 307 to the connectors tab; json caller → 503`, async () => {
      const { GET } = await r.load();
      const html = await GET(new Request("https://blockid.au/api/oauth/" + r.name, { headers: { accept: "text/html,application/xhtml+xml" } }));
      expect(html.status).toBe(307);
      expect(html.headers.get("location")).toContain(`/workspace/evidence/connectors?connector=${r.name}&status=unavailable`);
      const json = await GET(new Request("https://blockid.au/api/oauth/" + r.name, { headers: { accept: "application/json" } }));
      expect(json.status).toBe(503);
    });
  }
});
