// Route tests for POST /api/evaluations/claim/[token] (T0270).
//   1. Anonymous → 401, claim not attempted.
//   2. not_found → 404, email_mismatch → 403, claim_failed → 500.
//   3. Happy path → 200 with already_claimed + project_name, and the invite
//      token is never echoed back to the founder.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const claimEvaluationMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({
  claimEvaluation: (t: string, u: unknown) => claimEvaluationMock(t, u),
}));

import { POST } from "./route";

const FOUNDER = { id: "u-f", email: "jo@acme.io", plan: "founder_free" };
const req = () => new Request("http://localhost/api/evaluations/claim/tok", { method: "POST" });
const ctx = (token = "tok") => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  getCurrentUserMock.mockReset();
  claimEvaluationMock.mockReset();
  getCurrentUserMock.mockResolvedValue(FOUNDER);
});

describe("POST /api/evaluations/claim/[token]", () => {
  it("401s anonymous callers without attempting the claim", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(401);
    expect(claimEvaluationMock).not.toHaveBeenCalled();
  });

  it("maps lib errors to 404 / 403 / 500", async () => {
    claimEvaluationMock.mockResolvedValue({ ok: false, error: "not_found", message: "Invite not found" });
    expect((await POST(req(), ctx())).status).toBe(404);

    claimEvaluationMock.mockResolvedValue({ ok: false, error: "email_mismatch", message: "This invite was sent to jo@acme.io." });
    const mm = await POST(req(), ctx());
    expect(mm.status).toBe(403);
    expect(await mm.json()).toEqual({ ok: false, error: "email_mismatch", message: "This invite was sent to jo@acme.io." });

    claimEvaluationMock.mockResolvedValue({ ok: false, error: "claim_failed", message: "x" });
    expect((await POST(req(), ctx())).status).toBe(500);
  });

  it("returns the claimed evaluation without the invite token", async () => {
    claimEvaluationMock.mockResolvedValue({
      ok: true,
      alreadyClaimed: false,
      projectName: "Acme",
      evaluation: {
        id: "e-1", projectId: "p-1", ownerKind: "founder_claimed", consentTier: "reports_shared",
        inviteToken: "tok", founderUserId: "u-f", claimedAt: "2026-09-10T02:00:00Z",
      },
    });
    const res = await POST(req(), ctx("tok"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, already_claimed: false, project_name: "Acme" });
    expect(json.evaluation).toMatchObject({ id: "e-1", ownerKind: "founder_claimed", consentTier: "reports_shared" });
    expect(json.evaluation).not.toHaveProperty("inviteToken");
    expect(claimEvaluationMock).toHaveBeenCalledWith("tok", FOUNDER);
  });
});
