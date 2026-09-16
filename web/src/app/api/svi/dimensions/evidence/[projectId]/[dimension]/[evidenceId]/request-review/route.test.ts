// Colocated vitest for POST …/[evidenceId]/request-review — G14-S36.
// Flips review_status to 'pending' for the owner's own row only; never
// touches confidence_level; idempotent on an already-pending row; refuses a
// verified row.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updateError: null as { code?: string } | null,
  updates: [] as Array<{ patch: Record<string, unknown>; id: string }>,
  authOk: true,
}));

const fromMock = vi.fn((table: string) => {
  if (table !== "svi_dimension_evidence") throw new Error(`unexpected table ${table}`);
  return {
    select: () => ({
      eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }) }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: async (_c: string, id: string) => {
        state.updates.push({ patch, id });
        return { error: state.updateError };
      },
    }),
  };
});

vi.mock("../../../../../_helpers", () => ({
  requireProjectOwner: async () =>
    state.authOk
      ? { ok: true, ctx: { supabase: { from: fromMock }, userId: "owner-1", projectId: "p" } }
      : { ok: false, status: 403, error: "Forbidden" },
  KNOWN_DIMENSIONS: ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"],
}));

import { POST } from "./route";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const EV = "6f1c2b3a-1b2c-4d5e-8f90-abcdef123456";

function call(evidenceId = EV, dimension = "lco") {
  const req = new Request(`http://x/api/svi/dimensions/evidence/${PROJECT}/${dimension}/${evidenceId}/request-review`, { method: "POST" }) as unknown as NextRequest;
  return POST(req, { params: Promise.resolve({ projectId: PROJECT, dimension, evidenceId }) });
}

beforeEach(() => {
  state.row = { id: EV, project_id: PROJECT, dimension: "lco", confidence_level: "document_uploaded", is_verified: false, review_status: "none" };
  state.updateError = null;
  state.updates = [];
  state.authOk = true;
});

describe("POST …/request-review", () => {
  it("flips review_status to pending and leaves confidence_level alone", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyPending: false, reviewStatus: "pending" });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].id).toBe(EV);
    expect(state.updates[0].patch).toMatchObject({ review_status: "pending", review_note: null });
    expect(state.updates[0].patch).not.toHaveProperty("confidence_level");
    expect(state.updates[0].patch).not.toHaveProperty("is_verified");
  });

  it("idempotent on an already-pending row; 409 on a verified row", async () => {
    state.row = { ...state.row!, review_status: "pending" };
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alreadyPending: true });
    expect(state.updates).toEqual([]);

    state.row = { ...state.row!, review_status: "none", is_verified: true };
    expect((await call()).status).toBe(409);
  });

  it("400 on an unknown dimension or a non-uuid id; 403 when not the owner; 404 when the row is not the project's", async () => {
    expect((await call(EV, "xyz")).status).toBe(400);
    expect((await call("nope")).status).toBe(400);
    state.authOk = false;
    expect((await call()).status).toBe(403);
    state.authOk = true;
    state.row = null;
    expect((await call()).status).toBe(404);
    expect(state.updates).toEqual([]);
  });

  it("503 review_unavailable when 0406 has not been applied (42703 undefined column)", async () => {
    state.updateError = { code: "42703" };
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "review_unavailable" });
  });
});
