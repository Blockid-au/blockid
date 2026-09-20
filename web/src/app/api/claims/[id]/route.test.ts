// Colocated vitest for PATCH /api/claims/[id] (G21 P1-A): auth ladder (401 /
// 404 malformed or unknown / 404 non-member / 403 viewer-only member), body
// validation 400, the happy path appends a claim_versions row BEFORE the
// update and re-grades (founder ≠ extraction → conflicting), the audit sink
// receives `claim.corrected`, 429 from the limiter, 503 when 0417 is missing.
// The handler is wrapped by apiRoute (mutation audit) — asserted.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryClaimsDb, type MemoryClaimsDb } from "@/lib/evidence/claims-db";
import type { Claim, EvidenceRecord } from "@/lib/evidence/types";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertProjectAccess: vi.fn(),
  db: null as unknown,
  enforceRateLimit: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/projects", () => {
  class ProjectAccessError extends Error {
    constructor(
      msg: string,
      public code: "not_found" | "forbidden" | "service_unavailable",
    ) {
      super(msg);
    }
  }
  return { ProjectAccessError, assertProjectAccess: (...a: unknown[]) => mocks.assertProjectAccess(...a) };
});
vi.mock("@/lib/evidence/claims-db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/evidence/claims-db")>("@/lib/evidence/claims-db");
  return { ...actual, defaultClaimsDb: async () => mocks.db };
});
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => mocks.enforceRateLimit(...a) }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...a: unknown[]) => mocks.appendAudit(...a) }));
vi.mock("server-only", () => ({}));

import { ProjectAccessError } from "@/lib/projects";
import { isAuditedHandler } from "@/lib/audit/api-route";
import { PATCH } from "./route";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "22222222-2222-4222-8222-222222222222";
const USER = { id: "founder-1", email: "f@x.io", plan: "free" };

const CLAIM: Claim = {
  id: CLAIM_ID,
  project_id: PROJECT,
  svi_dimension: "tre",
  category: "traction",
  claim_key: "traction.mrr_aud",
  statement: "Monthly recurring revenue of A$12,000",
  founder_claimed_value: null,
  extracted_value: 12000,
  normalized_value: { kind: "number", value: 12000, unit: "AUD" },
  confidence: 20,
  contradiction_status: "none",
  assessment_status: "unverified",
  source_report_id: "svi-1",
  created_by: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};
const RECORD: EvidenceRecord = {
  id: "r-1",
  project_id: PROJECT,
  claim_id: CLAIM_ID,
  svi_dimension: "tre",
  evidence_type: "L1_self_declared",
  source_type: "founder_text",
  source_uri: null,
  source_name: null,
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
};

let db: MemoryClaimsDb;
const ctx = (id = CLAIM_ID) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, id = CLAIM_ID) =>
  new Request(`http://localhost/api/claims/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  db = memoryClaimsDb({ claims: [CLAIM], records: [RECORD] });
  mocks.db = db;
  mocks.getCurrentUser.mockReset().mockResolvedValue(USER);
  mocks.assertProjectAccess.mockReset().mockResolvedValue({ role: "owner" });
  mocks.enforceRateLimit.mockReset().mockReturnValue(null);
  mocks.appendAudit.mockReset().mockResolvedValue({ id: 1n, curr_hash: "x" });
});

describe("PATCH /api/claims/[id]", () => {
  it("is an audited mutation route", () => {
    expect(isAuditedHandler(PATCH)).toBe(true);
  });

  it("401 signed out; 404 malformed / unknown id; 404 non-member; 403 viewer-only member; 503 access outage", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await PATCH(patch({ note: "n", statement: "x" }), ctx())).status).toBe(401);
    mocks.getCurrentUser.mockResolvedValue(USER);
    expect((await PATCH(patch({ note: "n", statement: "x" }, "nope"), ctx("nope"))).status).toBe(404);
    expect((await PATCH(patch({ note: "n", statement: "x" }, "33333333-3333-4333-8333-333333333333"), ctx("33333333-3333-4333-8333-333333333333"))).status).toBe(404);
    mocks.assertProjectAccess.mockRejectedValue(new ProjectAccessError("no", "not_found"));
    expect((await PATCH(patch({ note: "n", statement: "x" }), ctx())).status).toBe(404);
    mocks.assertProjectAccess.mockRejectedValue(new ProjectAccessError("viewer", "forbidden"));
    expect((await PATCH(patch({ note: "n", statement: "x" }), ctx())).status).toBe(403);
    mocks.assertProjectAccess.mockRejectedValue(new ProjectAccessError("down", "service_unavailable"));
    expect((await PATCH(patch({ note: "n", statement: "x" }), ctx())).status).toBe(503);
    expect(mocks.assertProjectAccess).toHaveBeenCalledWith("founder-1", PROJECT, "editor");
    expect(db.versions).toEqual([]);
  });

  it("400 on an invalid body (no note / neither field / bad JSON) — nothing written", async () => {
    expect((await PATCH(patch({ statement: "x" }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ note: "n" }), ctx())).status).toBe(400);
    expect((await PATCH(patch("{not json"), ctx())).status).toBe(400);
    const res = await PATCH(patch({ note: "n", statement: "" }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_body", issues: [{ path: "statement" }] });
    expect(db.versions).toEqual([]);
    expect(db.claims[0].statement).toBe(CLAIM.statement);
  });

  it("appends a version with the previous state, updates the claim, flags the contradiction and audits", async () => {
    const res = await PATCH(patch({ founder_claimed_value: 5000, note: "Stripe shows A$5k" }), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, version: { version: 1 }, status_changed: true, claim: { id: CLAIM_ID, founder_claimed_value: 5000, extracted_value: 12000, contradiction_status: "conflicting", assessment_status: "conflicting" } });
    expect(db.versions).toHaveLength(1);
    expect(db.versions[0]).toMatchObject({ claim_id: CLAIM_ID, version: 1, note: "Stripe shows A$5k", changed_by: "founder-1", snapshot: { before: { founder_claimed_value: null, assessment_status: "unverified" }, patch: { founder_claimed_value: 5000 } } });
    expect(mocks.appendAudit.mock.calls.map((c) => (c[0] as { action: string }).action)).toEqual(["claim.status_changed", "claim.corrected"]);
    expect(mocks.appendAudit.mock.calls[1][0]).toMatchObject({ user_id: "founder-1", actor: "user", resource_type: "claim", resource_id: CLAIM_ID, detail: { version: 1, fields: ["founder_claimed_value"] } });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("claim-correction", "founder-1", expect.any(Request), 30, 60_000);

    // a second correction is version 2, the first stays
    const again = await PATCH(patch({ statement: "MRR of A$5,000", note: "wording" }), ctx());
    expect((await again.json()).version.version).toBe(2);
    expect(db.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it("429 from the limiter; 503 when 0417 is missing or no db", async () => {
    const { NextResponse } = await import("next/server");
    mocks.enforceRateLimit.mockReturnValue(NextResponse.json({ ok: false }, { status: 429 }));
    expect((await PATCH(patch({ note: "n", statement: "x" }), ctx())).status).toBe(429);
    mocks.enforceRateLimit.mockReturnValue(null);
    db.getClaim = async () => {
      throw new Error("Could not find the table 'public.claims' in the schema cache");
    };
    const res = await PATCH(patch({ note: "n", statement: "x" }), ctx());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: "migration_pending" });
    mocks.db = null;
    expect((await PATCH(patch({ note: "n", statement: "x" }), ctx())).status).toBe(503);
  });
});
