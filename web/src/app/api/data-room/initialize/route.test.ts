// Colocated vitest for /api/data-room/initialize — RETIRED 2026-09-08.
//
// This route was the third of three unreconciled data-room implementations.
// It inserted `account_id, email, token, title, is_active` into `data_rooms`,
// none of which exist on that table, so every call 500'd; and where it did run
// it seeded ~34 checklist rows with no content behind them — the exact failure
// an investor would have opened. It had no caller anywhere in src/.
//
// These tests pin the retirement so nobody quietly revives a second writer
// that would contend with generate's (user_id, project_id) unique index:
//   - both verbs answer 410 and point at /api/data-room/generate;
//   - the feature gate still runs first, so the manifest entry stays truthful
//     and an unentitled caller is still rejected before anything else;
//   - the route touches no database at all.

import { beforeEach, describe, expect, it, vi } from "vitest";

const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

const getSupabaseAdminMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET, POST, dynamic } from "./route";

function gateOk() {
  return { ok: true, user: { id: "u-1", email: "f@x.co", displayName: null } };
}
function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: new Response(JSON.stringify({ ok: false, error }), { status }),
  };
}

beforeEach(() => {
  gateMock.mockReset();
  getSupabaseAdminMock.mockReset();
});

describe("/api/data-room/initialize — retired", () => {
  it("is force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it.each([
    ["POST", POST],
    ["GET", GET],
  ])("%s answers 410 and names the replacement route", async (_verb, handler) => {
    gateMock.mockResolvedValue(gateOk());
    const res = await handler();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("retired");
    expect(body.use).toBe("/api/data-room/generate");
  });

  it("never touches the database — no second writer can creep back in", async () => {
    gateMock.mockResolvedValue(gateOk());
    await POST();
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("still runs the share_management gate first, so the manifest entry stays true", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST();
    expect(gateMock).toHaveBeenCalledWith("share_management");
    expect(res.status).toBe(402);
  });
});
