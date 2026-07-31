/**
 * Colocated 5-case vitest for POST /api/v1/vc/[jti]/revoke.
 *
 * Owner-only revocation is a small blast-radius endpoint with an outsized
 * abuse ceiling if it accepts the wrong caller — so the suite pins:
 *
 *   1. happy path: owner + valid jti + reason → 200 with `alreadyRevoked=false`
 *      + inserts into `revocations` + links `vc_issued.revocation_id`
 *   2. non-owner → 403; no mutation
 *   3. unknown jti → 404; no mutation
 *   4. already-revoked → 200 no-op (`alreadyRevoked=true`) with the
 *      original revocation timestamp / reason
 *   5. tampered owner attempt (wrong session user against a revoked row)
 *      → 403; never leaks the already-revoked shape to non-owners
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Auth mock ──────────────────────────────────────────────────────
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ─── Rate-limit — always allow ─────────────────────────────────────
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 999, resetIn: 60_000 }),
}));

// ─── Supabase admin double ─────────────────────────────────────────
type Op = { table: string; kind: string; args?: unknown };
const state: {
  vcRow: unknown;
  projRow: unknown;
  existingRevocation: unknown;
  insertErr: unknown;
  insertedRevRow: unknown;
  ops: Op[];
} = {
  vcRow: null,
  projRow: null,
  existingRevocation: null,
  insertErr: null,
  insertedRevRow: null,
  ops: [],
};

function makeAdmin() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      };
      builder.maybeSingle = async () => {
        if (table === "vc_issued") return { data: state.vcRow, error: null };
        if (table === "projects") return { data: state.projRow, error: null };
        if (table === "revocations") {
          // conflict-recovery lookup
          return { data: state.existingRevocation, error: null };
        }
        return { data: null, error: null };
      };
      builder.single = async () => {
        // Only revocations.insert(...).select().single() reaches here.
        if (state.insertErr) return { data: null, error: state.insertErr };
        return { data: state.insertedRevRow, error: null };
      };
      builder.insert = (row: unknown) => {
        state.ops.push({ table, kind: "insert", args: row });
        return builder;
      };
      builder.update = (row: unknown) => {
        state.ops.push({ table, kind: "update", args: row });
        return builder;
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => makeAdmin(),
}));

import { POST } from "./route";

function makeReq(body: unknown): Request {
  return new Request("http://x/api/v1/vc/urn:uuid:abc/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(jti: string) {
  return { params: Promise.resolve({ jti }) };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  state.vcRow = null;
  state.projRow = null;
  state.existingRevocation = null;
  state.insertErr = null;
  state.insertedRevRow = null;
  state.ops = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/v1/vc/[jti]/revoke", () => {
  it("[case 1] happy path: owner revoke inserts revocation + links vc_issued", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-owner" });
    state.vcRow = {
      id: "vc-1",
      jti: "urn:uuid:abc",
      subject_business_id: "proj-1",
      revocation_id: null,
    };
    state.projRow = { user_id: "user-owner" };
    state.insertedRevRow = {
      id: "rev-uuid-1",
      revoked_at: "2026-07-31T00:00:00.000Z",
      reason: "key compromise",
    };

    const res = await POST(makeReq({ reason: "key compromise" }), ctx("urn:uuid:abc"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyRevoked).toBe(false);
    expect(body.revocationId).toBe("rev-uuid-1");

    const insertOp = state.ops.find((o) => o.table === "revocations" && o.kind === "insert");
    expect(insertOp).toBeTruthy();
    expect((insertOp!.args as Record<string, unknown>).revocation_kind).toBe("verifiable_credential");
    expect((insertOp!.args as Record<string, unknown>).revoked_ref).toBe("urn:uuid:abc");
    expect((insertOp!.args as Record<string, unknown>).revoked_by_user_id).toBe("user-owner");

    const linkOp = state.ops.find((o) => o.table === "vc_issued" && o.kind === "update");
    expect(linkOp).toBeTruthy();
    expect((linkOp!.args as Record<string, unknown>).revocation_id).toBe("rev-uuid-1");
  });

  it("[case 2] rejects a non-owner with 403 and mutates nothing", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-attacker" });
    state.vcRow = {
      id: "vc-1",
      jti: "urn:uuid:abc",
      subject_business_id: "proj-1",
      revocation_id: null,
    };
    state.projRow = { user_id: "user-owner" };

    const res = await POST(makeReq({ reason: "hostile takeover" }), ctx("urn:uuid:abc"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");

    expect(state.ops.filter((o) => o.kind === "insert" || o.kind === "update").length).toBe(0);
  });

  it("[case 3] unknown jti → 404 and mutates nothing", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-owner" });
    state.vcRow = null; // not found

    const res = await POST(makeReq({ reason: "cleanup" }), ctx("urn:uuid:missing"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
    expect(state.ops.filter((o) => o.kind === "insert" || o.kind === "update").length).toBe(0);
  });

  it("[case 4] already-revoked → 200 no-op with the original timestamp", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-owner" });
    state.vcRow = {
      id: "vc-1",
      jti: "urn:uuid:abc",
      subject_business_id: "proj-1",
      revocation_id: "rev-prev",
    };
    state.projRow = { user_id: "user-owner" };
    state.existingRevocation = {
      id: "rev-prev",
      revoked_at: "2026-07-20T00:00:00.000Z",
      reason: "earlier revoke",
    };

    const res = await POST(makeReq({ reason: "second try" }), ctx("urn:uuid:abc"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyRevoked).toBe(true);
    expect(body.revocationId).toBe("rev-prev");
    expect(body.revokedAt).toBe("2026-07-20T00:00:00.000Z");
    expect(body.reason).toBe("earlier revoke");

    // Idempotent — must NOT re-insert into revocations.
    expect(state.ops.some((o) => o.table === "revocations" && o.kind === "insert")).toBe(false);
    // Must NOT re-touch vc_issued.
    expect(state.ops.some((o) => o.table === "vc_issued" && o.kind === "update")).toBe(false);
  });

  it("[case 5] wrong-owner attempt on a revoked row still returns 403 — never leaks the revoked shape", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-attacker" });
    state.vcRow = {
      id: "vc-1",
      jti: "urn:uuid:abc",
      subject_business_id: "proj-1",
      revocation_id: "rev-prev",
    };
    state.projRow = { user_id: "user-owner" };
    state.existingRevocation = {
      id: "rev-prev",
      revoked_at: "2026-07-20T00:00:00.000Z",
      reason: "earlier revoke",
    };

    const res = await POST(makeReq({ reason: "tamper" }), ctx("urn:uuid:abc"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
    // The already-revoked reason must NOT surface to a non-owner.
    expect(JSON.stringify(body)).not.toContain("earlier revoke");
    expect(state.ops.filter((o) => o.kind === "insert" || o.kind === "update").length).toBe(0);
  });
});
