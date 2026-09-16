// Colocated vitest for POST /api/svi/dimensions/evidence/[projectId]/[dimension]/upload
// — G14-S36 / D4: the founder-supplied confidenceLevel is capped at
// document_uploaded before it reaches the row; a re-upload withdraws any
// reviewer verification on that row.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const upsertMock = vi.fn();
const fromMock = vi.fn((table: string) => {
  if (table === "svi_dimension_evidence") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
      }),
      upsert: (row: Record<string, unknown>, opts: unknown) => {
        upsertMock(row, opts);
        return { select: () => ({ single: async () => ({ data: { id: "ev-new" }, error: null }) }) };
      },
    };
  }
  throw new Error(`unexpected table ${table}`);
});

vi.mock("../../../../_helpers", () => ({
  requireProjectOwner: async () => ({ ok: true, ctx: { supabase: { from: fromMock }, userId: "owner-1", projectId: "p" } }),
  KNOWN_DIMENSIONS: ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"],
  loadDimensionResults: async () => ({ results: [], presentByDimension: {} }),
  loadCurrentSvi: async () => 100,
  loadCompletedEvidenceTypes: async () => new Set<string>(),
  computeRoadmapAndForecast: () => ({ roadmap: [], forecast: {} }),
  groupRoadmapByWeek: () => [],
}));

import { POST } from "./route";

const PROJECT = "11111111-1111-4111-8111-111111111111";

function call(dimension: string, body: Record<string, unknown>) {
  const req = new Request(`http://x/api/svi/dimensions/evidence/${PROJECT}/${dimension}/upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return POST(req, { params: Promise.resolve({ projectId: PROJECT, dimension }) });
}

beforeEach(() => {
  upsertMock.mockClear();
});

describe("POST …/upload — confidence cap (S36 D4)", () => {
  it("a founder POST of third_party_verified is stored as document_uploaded and reported as capped", async () => {
    const res = await call("lco", { evidenceType: "abn_registration", evidenceValueOrUrl: "79 659 615 111", confidenceLevel: "third_party_verified" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.confidenceLevel).toBe("document_uploaded");
    expect(json.requestedConfidenceLevel).toBe("third_party_verified");
    expect(json.confidenceCapped).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const row = upsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row.confidence_level).toBe("document_uploaded");
    expect(row.is_verified).toBe(false);
    expect(row.verified_at).toBeNull();
    expect(row.verified_by_user_id).toBeNull();
  });

  it("a catalog default of connected_source / transaction_data is capped too (founder-entered, not a connector)", async () => {
    const res = await call("tre", { evidenceType: "revenue_proof" }); // catalog: transaction_data
    expect(res.status).toBe(201);
    const row = upsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row.confidence_level).toBe("document_uploaded");
  });

  it("a lower requested level is kept as-is", async () => {
    const res = await call("ftv", { evidenceType: "founder_linkedin", evidenceValueOrUrl: "https://linkedin.com/in/x", confidenceLevel: "public_url" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.confidenceLevel).toBe("public_url");
    expect(json.confidenceCapped).toBe(false);
  });

  it("an unknown confidenceLevel is still a 400 (never silently mapped)", async () => {
    const res = await call("ftv", { evidenceType: "founder_linkedin", confidenceLevel: "verified_by_me" });
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
