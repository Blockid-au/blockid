// Unit tests for POST /api/dataroom/reseed-templates — P1-reseed-templates-route.
//
// Asserts the route contract branches from route.ts:
//   1. 401 when the feature gate rejects (unauthenticated) — no rate-limit
//      consumed, no project lookup, no seeder invocation.
//   2. 429 rate_limited when the persistent bucket denies — Retry-After
//      header + retry_after_seconds body both populated from the bucket
//      reply; seeder is NOT invoked; the `no_active_project` branch is
//      short-circuited too.
//   3. 429 rate_limited defaults Retry-After to "60" when the bucket reply
//      omits retry_after_seconds (matches the `?? 60` fallback at route.ts:44).
//   4. 400 no_active_project when getProjectIdFromRequest resolves null —
//      even after passing the gate + rate-limit; seeder is NOT invoked.
//   5. Rate-limit bucket, actorId, limit, and window pinned to
//      { bucket: "dataroom.reseed_templates", actorId: user.id,
//        limit: 5, windowSeconds: 3600 } per route.ts:27-32.
//   6. Happy-path 200 forwards { projectId, userId, email } into the seeder
//      and echoes { ok, uploaded, skipped, failed } verbatim.
//   7. Seeder ok:false is passed through — the route does NOT convert to
//      a 500; it echoes the seeder's ok flag so the UI can render a
//      "partial" state without an error toast.
//   8. Seeder failed[] is preserved bit-for-bit so the UI can highlight
//      which template slugs to retry.
//
// The seeder + rate-limit lib + project lookup + feature-gate are all mocked
// so this test asserts pure route wiring, not seeder behaviour (that's
// covered by seed-templates.test.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

const consumeRateLimitMock = vi.fn<(opts: Record<string, unknown>) => Promise<Record<string, unknown>>>();
vi.mock("@/lib/rate-limit/persistent", () => ({
  consumeRateLimit: (opts: Record<string, unknown>) => consumeRateLimitMock(opts),
}));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdFromRequestMock(),
}));

const seedMock = vi.fn<(params: Record<string, unknown>) => Promise<Record<string, unknown>>>();
vi.mock("@/lib/dataroom/seed-templates", () => ({
  seedDataroomTemplates: (params: Record<string, unknown>) => seedMock(params),
}));

import { POST } from "./route";

function gateOk(user: { id: string; email: string }) {
  return {
    ok: true,
    user,
    uwp: { id: user.id, plan: "free", segment: "founder" },
  };
}

function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error }, { status }),
  };
}

function allowRate() {
  return {
    allowed: true,
    limit: 5,
    remaining: 4,
    reset_at: "2026-07-31T04:00:00.000Z",
  };
}

function denyRate(retry: number | null) {
  return {
    allowed: false,
    limit: 5,
    remaining: 0,
    reset_at: "2026-07-31T04:00:00.000Z",
    ...(retry != null ? { retry_after_seconds: retry } : {}),
  };
}

const USER = { id: "u-42", email: "founder@x.co" };

beforeEach(() => {
  gateMock.mockReset();
  consumeRateLimitMock.mockReset();
  getProjectIdFromRequestMock.mockReset();
  seedMock.mockReset();
});

describe("POST /api/dataroom/reseed-templates", () => {
  it("401s when the feature gate rejects (anonymous caller)", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(getProjectIdFromRequestMock).not.toHaveBeenCalled();
    expect(seedMock).not.toHaveBeenCalled();
  });

  it("uses the correct rate-limit bucket + window + actor id", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectIdFromRequestMock.mockResolvedValue("proj-1");
    seedMock.mockResolvedValue({ ok: true, uploaded: 0, skipped: 10, failed: [] });
    await POST();
    expect(consumeRateLimitMock).toHaveBeenCalledTimes(1);
    const [opts] = consumeRateLimitMock.mock.calls[0];
    expect(opts).toEqual({
      bucket: "dataroom.reseed_templates",
      actorId: "u-42",
      limit: 5,
      windowSeconds: 3600,
    });
  });

  it("429 rate_limited passes through retry_after_seconds into body + Retry-After header", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(denyRate(1234));
    const res = await POST();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1234");
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("rate_limited");
    expect(body.limit).toBe(5);
    expect(body.retry_after_seconds).toBe(1234);
    expect(getProjectIdFromRequestMock).not.toHaveBeenCalled();
    expect(seedMock).not.toHaveBeenCalled();
  });

  it("429 defaults Retry-After to '60' when retry_after_seconds is absent", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(denyRate(null));
    const res = await POST();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await res.json();
    expect(body.retry_after_seconds).toBeUndefined();
    expect(seedMock).not.toHaveBeenCalled();
  });

  it("400 no_active_project when getProjectIdFromRequest resolves null", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("no_active_project");
    expect(seedMock).not.toHaveBeenCalled();
  });

  it("happy-path 200 forwards {projectId, userId, email} into the seeder and echoes its envelope", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectIdFromRequestMock.mockResolvedValue("proj-abc");
    seedMock.mockResolvedValue({
      ok: true,
      uploaded: 7,
      skipped: 3,
      failed: [],
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      uploaded: 7,
      skipped: 3,
      failed: [],
    });
    expect(seedMock).toHaveBeenCalledTimes(1);
    const [params] = seedMock.mock.calls[0];
    expect(params).toEqual({
      projectId: "proj-abc",
      userId: "u-42",
      email: "founder@x.co",
    });
  });

  it("passes seeder ok:false through without converting to a 500", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectIdFromRequestMock.mockResolvedValue("proj-abc");
    seedMock.mockResolvedValue({
      ok: false,
      uploaded: 0,
      skipped: 0,
      failed: ["executive-summary", "pitch-deck"],
    });
    const res = await POST();
    // Route still returns 200 — the `dataroom_seed: 'partial'` envelope in
    // the caller (populate.ts) is derived from ok/failed, not from status.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.uploaded).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.failed).toEqual(["executive-summary", "pitch-deck"]);
  });

  it("preserves the seeder failed[] slug list bit-for-bit for UI retry surfacing", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectIdFromRequestMock.mockResolvedValue("proj-abc");
    const failed = [
      "founders-agreement",
      "esop-plan-rules",
      "vesting-schedule",
    ];
    seedMock.mockResolvedValue({
      ok: false,
      uploaded: 7,
      skipped: 0,
      failed,
    });
    const res = await POST();
    const body = await res.json();
    expect(body.failed).toEqual(failed);
    // Ensure no reordering: same array reference contents in the same order.
    expect(body.failed[0]).toBe("founders-agreement");
    expect(body.failed[2]).toBe("vesting-schedule");
  });

  it("does NOT invoke getProjectIdFromRequest when the rate-limit denies", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(denyRate(30));
    await POST();
    expect(getProjectIdFromRequestMock).not.toHaveBeenCalled();
  });

  it("skips the seeder call entirely when the project lookup fails", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    await POST();
    expect(seedMock).not.toHaveBeenCalled();
  });

  it("passes the feature key 'share_management' to the gate", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    await POST();
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("402 feature_locked short-circuits before rate-limit + project lookup", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("feature_locked");
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(getProjectIdFromRequestMock).not.toHaveBeenCalled();
    expect(seedMock).not.toHaveBeenCalled();
  });
});
