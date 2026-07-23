// Unit test for POST /api/cron/archived-purge — Iteration-18 T1 (Q4 MP #5).
//
// Asserts:
//   1. Requests without the correct `Authorization: Bearer <CRON_SECRET>`
//      header are rejected 401 and the DB helper is never called.
//   2. Requests with the correct secret invoke `purgeArchivedOlderThan(90)`
//      and return the count + list of purged ids.
//   3. One `project.purged` audit row per project is emitted, each carrying
//      the original owning user_id + `reason: retention_90d`.
//   4. When the purge helper returns ok:false, the route emits a
//      `project.purge.failed` audit row and returns 500 — failure is never
//      silent.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const purgeArchivedOlderThanMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  purgeArchivedOlderThan: (days: number) => purgeArchivedOlderThanMock(days),
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
}));

import { POST } from "./route";

const SECRET = "cron-secret-test-value";

beforeEach(() => {
  purgeArchivedOlderThanMock.mockReset();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
  process.env.CRON_SECRET = SECRET;
});

function makeReq(headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/archived-purge", {
    method: "POST",
    headers,
  });
}

describe("POST /api/cron/archived-purge — CRON_SECRET gate", () => {
  it("rejects requests with no Authorization header (401)", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(purgeArchivedOlderThanMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("rejects requests with a wrong bearer (401)", async () => {
    const res = await POST(makeReq({ authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(purgeArchivedOlderThanMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(401);
    expect(purgeArchivedOlderThanMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/archived-purge — happy path", () => {
  it("purges with 90-day window and returns count + ids", async () => {
    purgeArchivedOlderThanMock.mockResolvedValue({
      ok: true,
      count: 2,
      purged: [
        { id: "p1", user_id: "u1" },
        { id: "p2", user_id: "u2" },
      ],
    });

    const res = await POST(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.purged_count).toBe(2);
    expect(body.purged_ids).toEqual(["p1", "p2"]);
    expect(purgeArchivedOlderThanMock).toHaveBeenCalledWith(90);
  });

  it("emits one project.purged audit row per project with owning user_id", async () => {
    purgeArchivedOlderThanMock.mockResolvedValue({
      ok: true,
      count: 2,
      purged: [
        { id: "p1", user_id: "u1" },
        { id: "p2", user_id: "u2" },
      ],
    });

    const res = await POST(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);

    expect(logUserActionMock).toHaveBeenCalledTimes(2);
    const args = logUserActionMock.mock.calls.map((c) => c[0]);
    for (const a of args) {
      expect(a.action).toBe("project.purged");
      expect(a.subjectType).toBe("project");
      expect(a.fields.reason).toBe("retention_90d");
      expect(a.fields.retention_days).toBe(90);
      expect(typeof a.fields.purged_at).toBe("string");
      expect(a.route).toBe("/api/cron/archived-purge");
    }
    expect(args[0].userId).toBe("u1");
    expect(args[0].subjectId).toBe("p1");
    expect(args[1].userId).toBe("u2");
    expect(args[1].subjectId).toBe("p2");
  });

  it("emits zero audit rows when nothing was purged", async () => {
    purgeArchivedOlderThanMock.mockResolvedValue({
      ok: true,
      count: 0,
      purged: [],
    });
    const res = await POST(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.purged_count).toBe(0);
    expect(body.purged_ids).toEqual([]);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/archived-purge — failure surface", () => {
  it("emits project.purge.failed audit row and returns 500 on helper error", async () => {
    purgeArchivedOlderThanMock.mockResolvedValue({
      ok: false,
      error: "db_down",
    });
    const res = await POST(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "db_down",
      purged_count: 0,
      purged_ids: [],
    });

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("project.purge.failed");
    expect(arg.subjectType).toBe("cron_run");
    expect(arg.subjectId).toBeNull();
    expect(arg.fields.reason).toBe("retention_90d");
    expect(arg.fields.error).toBe("db_down");
    expect(typeof arg.fields.purged_at).toBe("string");
  });
});
