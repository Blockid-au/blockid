// Colocated vitest for /api/cron/prune-rate-limits.
//
// Pins the CRON_SECRET gate, the ?interval= whitelist regex, the RPC call
// shape (`prune_rate_limits(older_than)`), the 200 / 500 / 503 envelope
// contracts, and the POST/GET parity (both handlers must delegate to the
// same handle() implementation so the server crontab can pick either verb).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const rpcMock = vi.fn();
const getSupabaseAdminMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET, POST } from "./route";

const SECRET = "cron-secret-prune-value";

function makeReq(url = "http://x/api/cron/prune-rate-limits", headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers });
}

function makeGetReq(url = "http://x/api/cron/prune-rate-limits", headers: Record<string, string> = {}) {
  return new Request(url, { method: "GET", headers });
}

beforeEach(() => {
  rpcMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue({ rpc: rpcMock });
  rpcMock.mockResolvedValue({ data: 0, error: null });
  process.env.CRON_SECRET = SECRET;
});

describe("POST /api/cron/prune-rate-limits — auth gate", () => {
  it("rejects with 401 when no Authorization header is sent", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "unauthorized" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the bearer token is wrong", async () => {
    const res = await POST(makeReq(undefined, { authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("fails closed with 401 when CRON_SECRET env var is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeReq(undefined, { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("fails closed with 401 when CRON_SECRET is an empty string", async () => {
    process.env.CRON_SECRET = "";
    const res = await POST(makeReq(undefined, { authorization: "Bearer " }));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the header value omits the 'Bearer ' prefix", async () => {
    const res = await POST(makeReq(undefined, { authorization: SECRET }));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("is case-sensitive — 'bearer' with a lowercase b is not accepted", async () => {
    const res = await POST(makeReq(undefined, { authorization: `bearer ${SECRET}` }));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/prune-rate-limits — supabase availability", () => {
  it("returns 503 supabase_unavailable when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await POST(makeReq(undefined, { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "supabase_unavailable" });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/prune-rate-limits — interval whitelist", () => {
  it("defaults to '2 hours' when no ?interval= param is provided", async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null });
    const res = await POST(makeReq(undefined, { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.interval).toBe("2 hours");
    expect(rpcMock).toHaveBeenCalledWith("prune_rate_limits", { older_than: "2 hours" });
  });

  it("accepts a valid ?interval=6 hours (URL-decoded from '6%20hours')", async () => {
    rpcMock.mockResolvedValueOnce({ data: 5, error: null });
    const res = await POST(makeReq("http://x/api/cron/prune-rate-limits?interval=6%20hours", {
      authorization: `Bearer ${SECRET}`,
    }));
    const body = await res.json();
    expect(body.interval).toBe("6 hours");
    expect(rpcMock).toHaveBeenCalledWith("prune_rate_limits", { older_than: "6 hours" });
  });

  it("accepts '30 minutes' as a valid interval", async () => {
    rpcMock.mockResolvedValueOnce({ data: 1, error: null });
    const res = await POST(makeReq("http://x/api/cron/prune-rate-limits?interval=30%20minutes", {
      authorization: `Bearer ${SECRET}`,
    }));
    const body = await res.json();
    expect(body.interval).toBe("30 minutes");
  });

  it("accepts '1 day' — singular unit still whitelisted", async () => {
    rpcMock.mockResolvedValueOnce({ data: 7, error: null });
    const res = await POST(makeReq("http://x/api/cron/prune-rate-limits?interval=1%20day", {
      authorization: `Bearer ${SECRET}`,
    }));
    const body = await res.json();
    expect(body.interval).toBe("1 day");
  });

  it("is case-insensitive on the unit — '2 HOURS' still whitelisted", async () => {
    rpcMock.mockResolvedValueOnce({ data: 0, error: null });
    const res = await POST(makeReq("http://x/api/cron/prune-rate-limits?interval=2%20HOURS", {
      authorization: `Bearer ${SECRET}`,
    }));
    const body = await res.json();
    expect(body.interval).toBe("2 HOURS");
  });

  it("falls back to default when interval is unrecognised ('junk')", async () => {
    rpcMock.mockResolvedValueOnce({ data: 0, error: null });
    const res = await POST(makeReq("http://x/api/cron/prune-rate-limits?interval=junk", {
      authorization: `Bearer ${SECRET}`,
    }));
    const body = await res.json();
    expect(body.interval).toBe("2 hours");
    expect(rpcMock).toHaveBeenCalledWith("prune_rate_limits", { older_than: "2 hours" });
  });

  it("falls back to default when interval unit is not in whitelist ('5 weeks')", async () => {
    rpcMock.mockResolvedValueOnce({ data: 0, error: null });
    const res = await POST(makeReq("http://x/api/cron/prune-rate-limits?interval=5%20weeks", {
      authorization: `Bearer ${SECRET}`,
    }));
    const body = await res.json();
    expect(body.interval).toBe("2 hours");
  });

  it("rejects SQL-injection attempts by falling back to default ('1 hour; DROP TABLE ...')", async () => {
    rpcMock.mockResolvedValueOnce({ data: 0, error: null });
    const res = await POST(makeReq(
      "http://x/api/cron/prune-rate-limits?interval=1%20hour%3B%20DROP%20TABLE%20rate_limits",
      { authorization: `Bearer ${SECRET}` },
    ));
    const body = await res.json();
    expect(body.interval).toBe("2 hours");
    expect(rpcMock).toHaveBeenCalledWith("prune_rate_limits", { older_than: "2 hours" });
  });

  it("falls back to default on empty ?interval= param", async () => {
    rpcMock.mockResolvedValueOnce({ data: 0, error: null });
    const res = await POST(makeReq("http://x/api/cron/prune-rate-limits?interval=", {
      authorization: `Bearer ${SECRET}`,
    }));
    const body = await res.json();
    expect(body.interval).toBe("2 hours");
  });
});

describe("POST /api/cron/prune-rate-limits — RPC result envelope", () => {
  it("returns 200 with `pruned` = numeric RPC data", async () => {
    rpcMock.mockResolvedValueOnce({ data: 42, error: null });
    const res = await POST(makeReq(undefined, { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, pruned: 42, interval: "2 hours" });
  });

  it("coerces non-numeric RPC data to `pruned: 0` in the 200 envelope", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(makeReq(undefined, { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, pruned: 0, interval: "2 hours" });
  });

  it("coerces string RPC data to `pruned: 0` (the guard is `typeof === 'number'`)", async () => {
    rpcMock.mockResolvedValueOnce({ data: "3", error: null });
    const res = await POST(makeReq(undefined, { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.pruned).toBe(0);
  });

  it("returns 500 with error message and pruned:0 when RPC errors", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
    const res = await POST(makeReq(undefined, { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "connection reset",
      pruned: 0,
      interval: "2 hours",
    });
  });

  it("echoes the resolved interval into the 500 envelope on RPC error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await POST(makeReq("http://x/api/cron/prune-rate-limits?interval=6%20hours", {
      authorization: `Bearer ${SECRET}`,
    }));
    const body = await res.json();
    expect(body.interval).toBe("6 hours");
    expect(body.error).toBe("boom");
  });
});

describe("GET /api/cron/prune-rate-limits — parity with POST", () => {
  it("GET rejects 401 when unauthorised", async () => {
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("GET is accepted when authorised — same handle() delegation as POST", async () => {
    rpcMock.mockResolvedValueOnce({ data: 9, error: null });
    const res = await GET(makeGetReq(undefined, { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, pruned: 9, interval: "2 hours" });
    expect(rpcMock).toHaveBeenCalledWith("prune_rate_limits", { older_than: "2 hours" });
  });

  it("GET honours ?interval= whitelist identically to POST", async () => {
    rpcMock.mockResolvedValueOnce({ data: 2, error: null });
    const res = await GET(makeGetReq("http://x/api/cron/prune-rate-limits?interval=15%20minutes", {
      authorization: `Bearer ${SECRET}`,
    }));
    const body = await res.json();
    expect(body.interval).toBe("15 minutes");
    expect(rpcMock).toHaveBeenCalledWith("prune_rate_limits", { older_than: "15 minutes" });
  });
});
