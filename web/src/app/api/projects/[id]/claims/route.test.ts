// Colocated vitest for GET /api/projects/[id]/claims (G21 P1-A): auth ladder
// (401 / 404 on a bad id or no access / 503 on an access outage), the owner
// gets every claim with records + counts, an evaluator gets the consent-
// scoped projection (private records filtered, tier applied), `?dimension`
// narrows and validates, the rate limit answers 429, a missing 0417 is 503.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryClaimsDb, type MemoryClaimsDb } from "@/lib/evidence/claims-db";
import type { Claim, EvidenceRecord } from "@/lib/evidence/types";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveClaimsViewer: vi.fn(),
  db: null as unknown,
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/evidence/claims-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/evidence/claims-access")>("@/lib/evidence/claims-access");
  return { ...actual, resolveClaimsViewer: (...a: unknown[]) => mocks.resolveClaimsViewer(...a) };
});
vi.mock("@/lib/evidence/claims-db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/evidence/claims-db")>("@/lib/evidence/claims-db");
  return { ...actual, defaultClaimsDb: async () => mocks.db };
});
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => mocks.enforceRateLimit(...a) }));
vi.mock("server-only", () => ({}));

import { GET } from "./route";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const USER = { id: "u-1", email: "f@x.io", plan: "free" };

function claim(over: Partial<Claim>): Claim {
  return {
    id: over.id ?? "c",
    project_id: PROJECT,
    svi_dimension: "tre",
    category: "traction",
    claim_key: "traction.has_revenue",
    statement: "s",
    founder_claimed_value: null,
    extracted_value: true,
    normalized_value: { kind: "boolean", value: true },
    confidence: null,
    contradiction_status: "none",
    assessment_status: "claimed",
    source_report_id: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}
function rec(over: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    id: over.id ?? "r",
    project_id: PROJECT,
    claim_id: "c-1",
    svi_dimension: "tre",
    evidence_type: "L3_uploaded_document",
    source_type: "evidence_hub",
    source_uri: "https://drive.example/x",
    source_name: "Cap table",
    submitted_by: null,
    submitted_at: "2026-09-01T00:00:00.000Z",
    observed_at: null,
    confidence: null,
    verification_level: null,
    verified_by: null,
    verified_at: null,
    expires_at: null,
    hash: null,
    observed_value: null,
    visibility: "evaluators",
    consent_scope: {},
    status: "active",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

let db: MemoryClaimsDb;
const req = (path = `/api/projects/${PROJECT}/claims`) => new Request(`http://localhost${path}`);
const ctx = (id = PROJECT) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  db = memoryClaimsDb({
    claims: [claim({ id: "c-1", assessment_status: "evidence_backed" }), claim({ id: "c-2", claim_key: "legal.has_abn", svi_dimension: "lco", assessment_status: "unverified" })],
    records: [rec({ id: "r-1" }), rec({ id: "r-2", visibility: "private" }), rec({ id: "r-3", claim_id: "c-2", svi_dimension: "lco", evidence_type: "L1_self_declared", visibility: "public" })],
  });
  mocks.db = db;
  mocks.getCurrentUser.mockReset().mockResolvedValue(USER);
  mocks.resolveClaimsViewer.mockReset().mockResolvedValue({ kind: "owner", role: "owner", viewer: { scope: "owner", userId: "u-1" }, consentTier: null });
  mocks.enforceRateLimit.mockReset().mockReturnValue(null);
});

describe("GET /api/projects/[id]/claims", () => {
  it("401 signed out; 404 on a malformed id or no access; 503 when the access check throws", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET(req(), ctx())).status).toBe(401);
    mocks.getCurrentUser.mockResolvedValue(USER);
    expect((await GET(req("/api/projects/not-a-uuid/claims"), ctx("not-a-uuid"))).status).toBe(404);
    mocks.resolveClaimsViewer.mockResolvedValue(null);
    expect((await GET(req(), ctx())).status).toBe(404);
    mocks.resolveClaimsViewer.mockRejectedValue(new Error("db down"));
    expect((await GET(req(), ctx())).status).toBe(503);
  });

  it("owner: every claim with its records (private included), counts, viewer block, no-store", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.counts).toEqual({ claimed: 0, evidence_backed: 1, verified: 0, unverified: 1, conflicting: 0 });
    expect(body.viewer).toEqual({ kind: "owner", consent_tier: null });
    const c1 = body.claims.find((c: { id: string }) => c.id === "c-1");
    expect(c1.records.map((r: { id: string }) => r.id)).toEqual(["r-1", "r-2"]);
    expect(c1.records[0]).not.toHaveProperty("consent_scope");
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("project-claims", "u-1", expect.any(Request), 60, 60_000);
  });

  it("evaluator: private records filtered by visibility, then the consent tier projection", async () => {
    mocks.resolveClaimsViewer.mockResolvedValue({ kind: "evaluator", evaluationId: "ev-1", viewer: { scope: "evaluators", userId: "u-1" }, consentTier: "reports_shared" });
    const body = await (await GET(req(), ctx())).json();
    const c1 = body.claims.find((c: { id: string }) => c.id === "c-1");
    expect(c1.records.map((r: { id: string; source_uri: string | null }) => [r.id, r.source_uri])).toEqual([["r-1", null]]);
    expect(body.viewer).toEqual({ kind: "evaluator", consent_tier: "reports_shared" });

    mocks.resolveClaimsViewer.mockResolvedValue({ kind: "evaluator", evaluationId: "ev-1", viewer: { scope: "evaluators", userId: "u-1" }, consentTier: "attributed_only" });
    const counts = await (await GET(req(), ctx())).json();
    expect(counts.claims.find((c: { id: string }) => c.id === "c-1")).toMatchObject({ records: [], records_count: 1 });
    expect(counts.counts.evidence_backed).toBe(1);
  });

  it("?dimension narrows claims + records and rejects an unknown dimension", async () => {
    const body = await (await GET(req(`/api/projects/${PROJECT}/claims?dimension=LCO`), ctx())).json();
    expect(body.claims.map((c: { id: string }) => c.id)).toEqual(["c-2"]);
    expect(body.counts).toEqual({ claimed: 0, evidence_backed: 0, verified: 0, unverified: 1, conflicting: 0 });
    expect(body.claims[0].records.map((r: { id: string }) => r.id)).toEqual(["r-3"]);
    expect((await GET(req(`/api/projects/${PROJECT}/claims?dimension=xyz`), ctx())).status).toBe(400);
  });

  it("429 from the limiter is returned as-is; a missing 0417 table is 503 migration_pending; no db is 503", async () => {
    const { NextResponse } = await import("next/server");
    mocks.enforceRateLimit.mockReturnValue(NextResponse.json({ ok: false }, { status: 429 }));
    expect((await GET(req(), ctx())).status).toBe(429);
    mocks.enforceRateLimit.mockReturnValue(null);
    db.listClaims = async () => {
      throw new Error('relation "public.claims" does not exist');
    };
    const res = await GET(req(), ctx());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "unavailable", reason: "migration_pending" });
    mocks.db = null;
    expect((await GET(req(), ctx())).status).toBe(503);
  });
});
