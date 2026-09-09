// Colocated spec for /api/analyses/[id]/publish.
//
// This endpoint is the only way analyses.public_visible ever becomes true, so
// the properties pinned here are the consent guarantees themselves:
//
//   * an anonymous caller cannot publish, even holding the anon cookie that
//     created the run — a cookie is not a claim on a company's name;
//   * a signed-in caller who does not own the row gets 404, never 403, so the
//     endpoint cannot be used to probe which analysis ids exist;
//   * publishing without an explicit `confirm: true` in the same request is
//     refused, so consent can never be inferred from a save;
//   * DELETE unpublishes and is subject to the identical ownership check.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getStateMock = vi.fn();
const publishMock = vi.fn();
const unpublishMock = vi.fn();
vi.mock("@/lib/publish/store", () => ({
  getPublishState: (...a: unknown[]) => getStateMock(...a),
  publishAnalysis: (...a: unknown[]) => publishMock(...a),
  unpublishAnalysis: (...a: unknown[]) => unpublishMock(...a),
}));

import { DELETE, GET, POST, dynamic, runtime } from "./route";

const ID = "aaaaaaaa-1111-1111-1111-111111111111";
const USER = "user-1";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(body: unknown, id = ID) {
  return POST(
    new Request("http://x", { method: "POST", body: JSON.stringify(body) }),
    ctx(id),
  );
}

const GOOD_BODY = {
  companyName: "Corella Health",
  oneLiner:
    "A GP-first triage tool that cuts avoidable emergency-department referrals for regional Australian clinics.",
  sector: "healthtech",
  websiteUrl: "https://corellahealth.com.au",
  confirm: true,
};

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: USER });
  getStateMock.mockReset().mockResolvedValue(null);
  publishMock.mockReset();
  unpublishMock.mockReset();
});

describe("module invariants", () => {
  it("runs on node and is never cached", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("authorisation", () => {
  it("refuses an anonymous caller — a cookie is not a claim on a company name", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await post(GOOD_BODY)).status).toBe(404);
    expect(publishMock).not.toHaveBeenCalled();
    expect((await GET(new Request("http://x"), ctx(ID))).status).toBe(404);
    expect((await DELETE(new Request("http://x"), ctx(ID))).status).toBe(404);
  });

  it("answers 404 rather than 403 for somebody else's analysis", async () => {
    publishMock.mockResolvedValue({ ok: false, status: 404, reasons: ["Not found"] });
    const res = await post(GOOD_BODY);
    expect(res.status).toBe(404);
    // A 403 would confirm the id exists. The body must be as blank as a miss.
    expect(await res.json()).toEqual({ ok: false, error: "Not found" });
  });

  it("answers 404 for a malformed id without touching the store", async () => {
    expect((await post(GOOD_BODY, "not-a-uuid")).status).toBe(404);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("tolerates a session lookup that throws", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("boom"));
    expect((await GET(new Request("http://x"), ctx(ID))).status).toBe(404);
  });
});

describe("POST — consent", () => {
  it("refuses to publish without an explicit confirmation", async () => {
    const res = await post({ ...GOOD_BODY, confirm: false });
    expect(res.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).toMatch(/confirm/i);
  });

  it("refuses when the confirmation is merely truthy rather than true", async () => {
    const res = await post({ ...GOOD_BODY, confirm: "yes" });
    expect(res.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("refuses when the confirmation is absent entirely", async () => {
    const { confirm: _drop, ...noConfirm } = GOOD_BODY;
    expect((await post(noConfirm)).status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("publishes and returns the live URL once confirmed", async () => {
    publishMock.mockResolvedValue({
      ok: true,
      slug: "corella-health",
      url: "https://blockid.au/listings/corella-health",
    });
    const res = await post(GOOD_BODY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      slug: "corella-health",
      url: "https://blockid.au/listings/corella-health",
    });
    expect(publishMock).toHaveBeenCalledWith({
      analysisId: ID,
      userId: USER,
      input: {
        companyName: GOOD_BODY.companyName,
        oneLiner: GOOD_BODY.oneLiner,
        sector: GOOD_BODY.sector,
        websiteUrl: GOOD_BODY.websiteUrl,
      },
    });
  });

  it("passes the store's own reasons back so a founder is told what to fix", async () => {
    publishMock.mockResolvedValue({
      ok: false,
      status: 400,
      reasons: ["This score came from typed text alone."],
    });
    const res = await post(GOOD_BODY);
    expect(res.status).toBe(400);
    expect((await res.json()).reasons).toEqual([
      "This score came from typed text alone.",
    ]);
  });

  it("refuses an unparseable body", async () => {
    const res = await POST(
      new Request("http://x", { method: "POST", body: "{" }),
      ctx(ID),
    );
    expect(res.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe("GET — current state", () => {
  it("returns what is public right now", async () => {
    getStateMock.mockResolvedValue({ published: true, slug: "corella-health" });
    const res = await GET(new Request("http://x"), ctx(ID));
    expect(res.status).toBe(200);
    expect((await res.json()).state.slug).toBe("corella-health");
    expect(getStateMock).toHaveBeenCalledWith(ID, USER);
  });
});

describe("DELETE — unpublish", () => {
  it("unpublishes for the owner", async () => {
    unpublishMock.mockResolvedValue({ ok: true, status: 200 });
    const res = await DELETE(new Request("http://x"), ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, published: false });
    expect(unpublishMock).toHaveBeenCalledWith({ analysisId: ID, userId: USER });
  });

  it("answers 404 for a non-owner", async () => {
    unpublishMock.mockResolvedValue({ ok: false, status: 404 });
    expect((await DELETE(new Request("http://x"), ctx(ID))).status).toBe(404);
  });

  it("surfaces a storage failure as a 500 rather than a false success", async () => {
    unpublishMock.mockResolvedValue({ ok: false, status: 500 });
    expect((await DELETE(new Request("http://x"), ctx(ID))).status).toBe(500);
  });
});
