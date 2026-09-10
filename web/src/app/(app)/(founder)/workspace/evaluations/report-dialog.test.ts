// Colocated vitest for report-dialog.tsx's run orchestration (money-path
// review #9). Pins, with an injected fetch + clock:
//   * the confirmed POST carries the idempotency_key; a 200 resolves ok;
//   * a fetch that aborts / drops NEVER re-POSTs — it polls
//     GET …/report?kind=&idempotency_key=&since= every POLL_INTERVAL_MS
//     and resolves with the row once the server has written it;
//   * polling gives up after POLL_MAX_MS with the "will not charge twice"
//     copy, never the old "Nothing was charged";
//   * the client budget is ≥ 150 s (above Cloudflare's 100 s origin cap);
//   * newIdempotencyKey mints RFC 4122 v4 uuids.

import { describe, expect, it, vi } from "vitest";
import {
  POLL_INTERVAL_MS,
  POLL_MAX_MS,
  RUN_TIMEOUT_MS,
  TIMEOUT_COPY,
  newIdempotencyKey,
  runReport,
} from "./report-dialog";

const KEY = "0b7f3f2e-9c1a-4c6e-8e5d-2f0a1b2c3d4e";
const ROW = { kind: "full", via: "quota", credits_spent: 0, balance: 0, remaining_quota: 6, svi: 71, report_url: "/tbr/tok", pdf_url: null, share_token: "tok", reused: true };

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as unknown as Response;
}

/** A fake clock: sleep() advances it, so the poll loop needs no real timers. */
function clock() {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}

describe("runReport", () => {
  it("constants: client budget above the 100 s Cloudflare cap, 10 s polls for 3 min, the no-double-charge copy", () => {
    expect(RUN_TIMEOUT_MS).toBeGreaterThanOrEqual(150_000);
    expect(POLL_INTERVAL_MS).toBe(10_000);
    expect(POLL_MAX_MS).toBe(180_000);
    expect(TIMEOUT_COPY).toBe("Still generating — this can take up to 3 minutes. We will not charge twice; reopen this dialog to pick it up.");
    expect(TIMEOUT_COPY).not.toMatch(/Nothing was charged/);
  });

  it("POSTs once with confirm + the idempotency key and resolves ok on 200", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, ...ROW, reused: false }));
    const c = clock();
    const out = await runReport({ evaluationId: "e-1", kind: "full", idempotencyKey: KEY }, { fetchImpl, ...c });
    expect(out).toEqual({ status: "ok", result: { ok: true, ...ROW, reused: false } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/evaluations/e-1/report");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ kind: "full", confirm: true, idempotency_key: KEY });
    expect(init.signal).toBeDefined();
  });

  it("a 4xx/5xx JSON body becomes an error outcome carrying the server's message + cost", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: false, error: "insufficient_credits", message: "Could not reserve 3 credits", cost: { via: "none" } }));
    const out = await runReport({ evaluationId: "e-1", kind: "full", idempotencyKey: KEY }, { fetchImpl, ...clock() });
    expect(out).toEqual({ status: "error", message: "Could not reserve 3 credits", cost: { via: "none" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("on a timed-out / dropped POST it never re-POSTs: polls GET with the key until the row lands", async () => {
    let polls = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new DOMException("aborted", "AbortError");
      polls++;
      expect(url.startsWith("/api/evaluations/e-1/report?kind=full&idempotency_key=" + KEY + "&since=")).toBe(true);
      return jsonResponse(polls < 3 ? { ok: true, report: null } : { ok: true, report: ROW });
    });
    const c = clock();
    const out = await runReport({ evaluationId: "e-1", kind: "full", idempotencyKey: KEY }, { fetchImpl, ...c });
    expect(out).toEqual({ status: "ok", result: ROW });
    const posts = fetchImpl.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(polls).toBe(3);
  });

  it("gives up after POLL_MAX_MS with the will-not-charge-twice copy (and still never re-POSTs)", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new TypeError("Failed to fetch");
      return jsonResponse({ ok: true, report: null });
    });
    const c = clock();
    const out = await runReport({ evaluationId: "e-1", kind: "full", idempotencyKey: KEY }, { fetchImpl, ...c, pollIntervalMs: 10_000, pollMaxMs: 30_000 });
    expect(out).toEqual({ status: "timeout", message: TIMEOUT_COPY });
    const posts = fetchImpl.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(fetchImpl.mock.calls.length - 1).toBe(3); // 3 polls in 30 s
  });

  it("a transient poll failure is skipped, not fatal", async () => {
    let polls = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new DOMException("aborted", "AbortError");
      polls++;
      if (polls === 1) throw new TypeError("Failed to fetch");
      return jsonResponse({ ok: true, report: ROW });
    });
    const out = await runReport({ evaluationId: "e-1", kind: "full", idempotencyKey: KEY }, { fetchImpl, ...clock() });
    expect(out.status).toBe("ok");
    expect(polls).toBe(2);
  });

  it("newIdempotencyKey mints distinct v4 uuids", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(b).not.toBe(a);
  });
});
