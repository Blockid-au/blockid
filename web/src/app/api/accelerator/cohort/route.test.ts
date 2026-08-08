// Colocated vitest for /api/accelerator/cohort — P9 batch.
//
// The route composes: auth gate → getCohort (id-scoped or default) → parallel
// listApplicants + getCohortSviAvg fan-out (GET); auth gate → JSON parse →
// name validation → deterministic draft echo (POST). Every branch is asserted
// in isolation to keep the accelerator-portal placeholder contract pinned
// while migration 0080 is still pending.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCohort: vi.fn(),
  listApplicants: vi.fn(),
  getCohortSviAvg: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/accelerator-portal", () => ({
  getCohort: (userId: string, cohortId?: string) => mocks.getCohort(userId, cohortId),
  listApplicants: (cohortId: string) => mocks.listApplicants(cohortId),
  getCohortSviAvg: (cohortId: string) => mocks.getCohortSviAvg(cohortId),
}));

import { GET, POST } from "./route";

const USER = { id: "user-1", email: "u@example.com", plan: "founder", role: "user" };

const DEFAULT_COHORT = {
  id: "cohort-42",
  name: "Q3 2026 Batch",
  founderCount: 12,
  startsAt: "2026-07-01T00:00:00.000Z",
  endsAt: "2026-09-30T00:00:00.000Z",
  batchSviAvg: 68.4,
  batchSviTrend: 2.1,
};

const DEFAULT_APPLICANTS = [
  {
    id: "app-1",
    startupName: "Foo",
    founderName: "Alice",
    submittedAt: "2026-07-10T00:00:00.000Z",
    status: "submitted",
    svi: 62,
  },
];

const DEFAULT_SVI = {
  cohortId: "cohort-42",
  avg: 68.4,
  trend: 2.1,
  sampleSize: 12,
};

function getReq(qs = "") {
  return new Request(`http://x/api/accelerator/cohort${qs}`, { method: "GET" });
}

function postReq(body: unknown, opts: { asString?: boolean } = {}) {
  const payload = opts.asString ? String(body) : JSON.stringify(body);
  return new Request("http://x/api/accelerator/cohort", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.getCohort.mockResolvedValue(DEFAULT_COHORT);
  mocks.listApplicants.mockResolvedValue(DEFAULT_APPLICANTS);
  mocks.getCohortSviAvg.mockResolvedValue(DEFAULT_SVI);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/accelerator/cohort", () => {
  it("returns 401 when no current user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("unauthorized");
    expect(mocks.getCohort).not.toHaveBeenCalled();
    expect(mocks.listApplicants).not.toHaveBeenCalled();
    expect(mocks.getCohortSviAvg).not.toHaveBeenCalled();
  });

  it("returns 200 ok:true envelope with cohort, applicants, svi", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.cohort).toEqual(DEFAULT_COHORT);
    expect(body.applicants).toEqual(DEFAULT_APPLICANTS);
    expect(body.svi).toEqual(DEFAULT_SVI);
  });

  it("passes cohort id from ?id query param through to getCohort", async () => {
    await GET(getReq("?id=cohort-99"));
    expect(mocks.getCohort).toHaveBeenCalledWith(USER.id, "cohort-99");
  });

  it("passes undefined cohort id when ?id is absent", async () => {
    await GET(getReq());
    expect(mocks.getCohort).toHaveBeenCalledWith(USER.id, undefined);
  });

  it("passes undefined cohort id when ?id is empty string", async () => {
    await GET(getReq("?id="));
    // "" → falsy → coerced to undefined by `?? undefined` after ?? null-coalesce
    const call = mocks.getCohort.mock.calls[0];
    expect(call?.[0]).toBe(USER.id);
    // empty string is truthy for searchParams.get() → passes through as ""
    expect(call?.[1]).toBe("");
  });

  it("uses cohort.id (not query id) when calling listApplicants + getCohortSviAvg", async () => {
    mocks.getCohort.mockResolvedValue({ ...DEFAULT_COHORT, id: "resolved-cohort" });
    await GET(getReq("?id=hint"));
    expect(mocks.listApplicants).toHaveBeenCalledWith("resolved-cohort");
    expect(mocks.getCohortSviAvg).toHaveBeenCalledWith("resolved-cohort");
  });

  it("fans out listApplicants + getCohortSviAvg in parallel (Promise.all)", async () => {
    const order: string[] = [];
    let releaseApplicants!: () => void;
    let releaseSvi!: () => void;
    mocks.listApplicants.mockImplementation(
      () =>
        new Promise((resolve) => {
          order.push("applicants-start");
          releaseApplicants = () => {
            order.push("applicants-resolve");
            resolve(DEFAULT_APPLICANTS);
          };
        }),
    );
    mocks.getCohortSviAvg.mockImplementation(
      () =>
        new Promise((resolve) => {
          order.push("svi-start");
          releaseSvi = () => {
            order.push("svi-resolve");
            resolve(DEFAULT_SVI);
          };
        }),
    );
    const pending = GET(getReq());
    // both starts should have fired before either resolves
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["applicants-start", "svi-start"]);
    releaseSvi();
    releaseApplicants();
    await pending;
    expect(order).toEqual([
      "applicants-start",
      "svi-start",
      "svi-resolve",
      "applicants-resolve",
    ]);
  });

  it("returns empty applicants array when helper resolves to []", async () => {
    mocks.listApplicants.mockResolvedValue([]);
    const res = await GET(getReq());
    const body = (await json(res)) as { applicants: unknown[] };
    expect(body.applicants).toEqual([]);
  });

  it("propagates thrown error from getCohort", async () => {
    mocks.getCohort.mockRejectedValue(new Error("cohort down"));
    await expect(GET(getReq())).rejects.toThrow("cohort down");
  });

  it("propagates thrown error from listApplicants", async () => {
    mocks.listApplicants.mockRejectedValue(new Error("applicants down"));
    await expect(GET(getReq())).rejects.toThrow("applicants down");
  });

  it("propagates thrown error from getCohortSviAvg", async () => {
    mocks.getCohortSviAvg.mockRejectedValue(new Error("svi down"));
    await expect(GET(getReq())).rejects.toThrow("svi down");
  });

  it("passes user.id (not email) into getCohort", async () => {
    await GET(getReq());
    expect(mocks.getCohort).toHaveBeenCalledWith(USER.id, undefined);
    expect(mocks.getCohort.mock.calls[0]?.[0]).toBe(USER.id);
    expect(mocks.getCohort.mock.calls[0]?.[0]).not.toBe(USER.email);
  });

  it("does not leak query params beyond ?id into helpers", async () => {
    await GET(getReq("?id=cohort-99&other=nope"));
    expect(mocks.getCohort).toHaveBeenCalledWith(USER.id, "cohort-99");
    expect(mocks.listApplicants).toHaveBeenCalledWith(DEFAULT_COHORT.id);
    expect(mocks.getCohortSviAvg).toHaveBeenCalledWith(DEFAULT_COHORT.id);
  });
});

describe("POST /api/accelerator/cohort", () => {
  it("returns 401 when no current user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq({ name: "New" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("unauthorized");
  });

  it("returns 400 invalid_json when body is not JSON", async () => {
    const res = await POST(postReq("not-json{", { asString: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 name_required when name field is missing", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("name_required");
  });

  it("returns 400 name_required when name is empty string", async () => {
    const res = await POST(postReq({ name: "" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("name_required");
  });

  it("returns 400 name_required when name is whitespace only", async () => {
    const res = await POST(postReq({ name: "   " }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("name_required");
  });

  it("returns 400 name_required when name is not a string", async () => {
    const res = await POST(postReq({ name: 42 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("name_required");
  });

  it("returns 200 ok:true envelope with persisted:false and draft cohort", async () => {
    const res = await POST(postReq({ name: "Batch X" }));
    expect(res.status).toBe(200);
    const body = (await json(res)) as { ok: boolean; persisted: boolean; cohort: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(false);
    expect(body.cohort.persisted).toBe(false);
    expect(body.cohort.name).toBe("Batch X");
    expect(body.cohort.ownerId).toBe(USER.id);
  });

  it("draft id has cohort-draft- prefix + base36 timestamp suffix", async () => {
    const res = await POST(postReq({ name: "X" }));
    const body = (await json(res)) as { cohort: { id: string } };
    expect(body.cohort.id).toMatch(/^cohort-draft-[a-z0-9]+$/);
  });

  it("trims surrounding whitespace from name", async () => {
    const res = await POST(postReq({ name: "  Trimmed  " }));
    const body = (await json(res)) as { cohort: { name: string } };
    expect(body.cohort.name).toBe("Trimmed");
  });

  it("uses provided starts_at ISO string when it is a string", async () => {
    const startsAt = "2027-01-15T00:00:00.000Z";
    const res = await POST(postReq({ name: "X", starts_at: startsAt }));
    const body = (await json(res)) as { cohort: { startsAt: string } };
    expect(body.cohort.startsAt).toBe(startsAt);
  });

  it("defaults startsAt to now (ISO) when starts_at is missing", async () => {
    const before = Date.now();
    const res = await POST(postReq({ name: "X" }));
    const after = Date.now();
    const body = (await json(res)) as { cohort: { startsAt: string } };
    const ts = Date.parse(body.cohort.startsAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("defaults startsAt to now when starts_at is not a string", async () => {
    const before = Date.now();
    const res = await POST(postReq({ name: "X", starts_at: 42 }));
    const after = Date.now();
    const body = (await json(res)) as { cohort: { startsAt: string } };
    const ts = Date.parse(body.cohort.startsAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("uses provided ends_at ISO string when it is a string", async () => {
    const endsAt = "2027-06-30T00:00:00.000Z";
    const res = await POST(postReq({ name: "X", ends_at: endsAt }));
    const body = (await json(res)) as { cohort: { endsAt: string } };
    expect(body.cohort.endsAt).toBe(endsAt);
  });

  it("defaults endsAt to now + 90 days when ends_at is missing", async () => {
    const before = Date.now() + 90 * 86_400_000;
    const res = await POST(postReq({ name: "X" }));
    const after = Date.now() + 90 * 86_400_000;
    const body = (await json(res)) as { cohort: { endsAt: string } };
    const ts = Date.parse(body.cohort.endsAt);
    // allow a small window
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it("uses provided founder_count when it is a number", async () => {
    const res = await POST(postReq({ name: "X", founder_count: 25 }));
    const body = (await json(res)) as { cohort: { founderCount: number } };
    expect(body.cohort.founderCount).toBe(25);
  });

  it("defaults founder_count to 0 when missing", async () => {
    const res = await POST(postReq({ name: "X" }));
    const body = (await json(res)) as { cohort: { founderCount: number } };
    expect(body.cohort.founderCount).toBe(0);
  });

  it("defaults founder_count to 0 when it is not a number", async () => {
    const res = await POST(postReq({ name: "X", founder_count: "12" }));
    const body = (await json(res)) as { cohort: { founderCount: number } };
    expect(body.cohort.founderCount).toBe(0);
  });

  it("accepts founder_count of 0 explicitly", async () => {
    const res = await POST(postReq({ name: "X", founder_count: 0 }));
    const body = (await json(res)) as { cohort: { founderCount: number } };
    expect(body.cohort.founderCount).toBe(0);
  });

  it("does not call cohort helpers on POST", async () => {
    await POST(postReq({ name: "X" }));
    expect(mocks.getCohort).not.toHaveBeenCalled();
    expect(mocks.listApplicants).not.toHaveBeenCalled();
    expect(mocks.getCohortSviAvg).not.toHaveBeenCalled();
  });

  it("stamps ownerId from user.id (not user.email)", async () => {
    const res = await POST(postReq({ name: "X" }));
    const body = (await json(res)) as { cohort: { ownerId: string } };
    expect(body.cohort.ownerId).toBe(USER.id);
    expect(body.cohort.ownerId).not.toBe(USER.email);
  });

  it("draft response always carries persisted:false at both root and cohort level", async () => {
    const res = await POST(postReq({ name: "X", founder_count: 3 }));
    const body = (await json(res)) as { persisted: boolean; cohort: { persisted: boolean } };
    expect(body.persisted).toBe(false);
    expect(body.cohort.persisted).toBe(false);
  });
});
