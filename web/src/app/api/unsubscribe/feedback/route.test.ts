// Colocated vitest for POST /api/unsubscribe/feedback — release QA-4 P2-b.
//
// Pins the body-parse contract: an empty or malformed JSON body is a 400
// (`readJsonBody`), never a 500 through the generic catch — and no DB call
// happens for a body that failed validation.

import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const getSupabaseAdminMock = vi.fn<() => { from: typeof fromMock } | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { POST } from "./route";

function raw(body: string): Request {
  return new Request("http://localhost/api/unsubscribe/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  fromMock.mockReset();
  getSupabaseAdminMock.mockReset().mockReturnValue({ from: fromMock });
});

describe("POST /api/unsubscribe/feedback — body guards", () => {
  it("empty body → 400 invalid_json (not 500)", async () => {
    const res = await POST(raw(""));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("malformed JSON → 400 invalid_json (not 500)", async () => {
    const res = await POST(raw("{nope"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("JSON that is not an object → 400 (token required)", async () => {
    const res = await POST(raw("null"));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("missing token → 400", async () => {
    const res = await POST(raw(JSON.stringify({ reason: "other" })));
    expect(res.status).toBe(400);
  });

  it("invalid reason → 400", async () => {
    const res = await POST(raw(JSON.stringify({ token: "t", reason: "because" })));
    expect(res.status).toBe(400);
  });

  it("valid body reaches the DB and returns 200", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "p1", email: "a@b.co" } });
    const selectChain = { eq: vi.fn(() => ({ maybeSingle })) };
    fromMock.mockReturnValue({ select: vi.fn(() => selectChain), update: updateMock });

    const res = await POST(raw(JSON.stringify({ token: "tok", reason: "too_many", detail: "x" })));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ unsubscribe_reason: "too_many", unsubscribe_feedback: "x" }),
    );
  });
});
