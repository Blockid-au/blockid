// G33 T15 — fetchTrialStatusShared: the three trial surfaces in the workspace
// layout share ONE /api/stripe/trial-status request instead of three.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  return import("./trial-status-client");
}

beforeEach(() => {
  fetchMock = vi.fn();
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("fetchTrialStatusShared", () => {
  it("concurrent callers share one request and all get the body", async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { fetchTrialStatusShared, TRIAL_STATUS_URL } = await load();
    const a = fetchTrialStatusShared();
    const b = fetchTrialStatusShared();
    const c = fetchTrialStatusShared();
    resolve(ok({ inTrial: true, daysLeft: 2 }));
    const results = await Promise.all([a, b, c]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(TRIAL_STATUS_URL, { method: "GET", credentials: "include", cache: "no-store" });
    for (const r of results) expect(r).toEqual({ ok: true, body: { inTrial: true, daysLeft: 2 } });
  });

  it("does not cache after settling — the next call fetches again (same freshness as before)", async () => {
    fetchMock.mockResolvedValue(ok({ inTrial: false }));
    const { fetchTrialStatusShared } = await load();
    await fetchTrialStatusShared();
    await fetchTrialStatusShared();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("non-OK response → { ok: false, body: null } without reading the body", async () => {
    const json = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json });
    const { fetchTrialStatusShared } = await load();
    expect(await fetchTrialStatusShared()).toEqual({ ok: false, body: null });
    expect(json).not.toHaveBeenCalled();
  });

  it("a network error rejects every sharer and is not pinned", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockResolvedValueOnce(ok({ inTrial: false }));
    const { fetchTrialStatusShared } = await load();
    const a = fetchTrialStatusShared();
    const b = fetchTrialStatusShared();
    await expect(a).rejects.toThrow("offline");
    await expect(b).rejects.toThrow("offline");
    expect(await fetchTrialStatusShared()).toEqual({ ok: true, body: { inTrial: false } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
