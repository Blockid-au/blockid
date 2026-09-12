// Colocated vitest for POST /api/website-tech-audit — release QA-4 P2-b.
//
// Pins the body-parse contract: an empty or malformed JSON body is a 400
// (`readJsonBody`), never a 500 through the generic catch, and the audit
// (outbound fetches) is never started for a body that failed validation.

import { beforeEach, describe, expect, it, vi } from "vitest";

const deepTechAuditMock = vi.fn();
const scrapeUrlMock = vi.fn();
vi.mock("@/lib/rnd-input", () => ({
  deepTechAudit: (...a: unknown[]) => deepTechAuditMock(...a),
  scrapeUrl: (...a: unknown[]) => scrapeUrlMock(...a),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => null,
  isSupabaseConfigured: () => false,
}));
vi.mock("@/lib/svi-analysis", () => ({ detectSector: () => "saas" }));
vi.mock("@/lib/competitive-intelligence", () => ({
  analyzeWebsiteCI: vi.fn(),
  computeHeuristicSCI: vi.fn(),
  getSectorEbitdaBenchmarks: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { POST } from "./route";

function raw(body: string): Request {
  return new Request("http://localhost/api/website-tech-audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  deepTechAuditMock.mockReset();
  scrapeUrlMock.mockReset();
});

describe("POST /api/website-tech-audit — body guards", () => {
  it("empty body → 400 invalid_json (not 500); no audit started", async () => {
    const res = await POST(raw(""));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
    expect(deepTechAuditMock).not.toHaveBeenCalled();
  });

  it("malformed JSON → 400 invalid_json (not 500)", async () => {
    const res = await POST(raw("{"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
    expect(deepTechAuditMock).not.toHaveBeenCalled();
  });

  it("JSON without url → 400 'url is required'", async () => {
    const res = await POST(raw(JSON.stringify({ analyzeCI: false })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("url is required");
    expect(deepTechAuditMock).not.toHaveBeenCalled();
  });

  it("JSON that is not an object → 400", async () => {
    const res = await POST(raw("\"https://example.com\""));
    expect(res.status).toBe(400);
    expect(deepTechAuditMock).not.toHaveBeenCalled();
  });
});
