// G35 A2 — /api/cron/model-eval wiring (the loop itself: lib/ai/model-eval*.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ authorised: true, run: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/cron-auth", () => ({ isCronAuthorised: () => h.authorised }));
vi.mock("@/lib/ai/model-eval-cron", () => ({ runModelEvalCron: (...a: unknown[]) => h.run(...a) }));

import { GET, POST } from "./route";

const result = { mode: "smoke", run_id: "smoke-2026-10-20-x", period: "2026-10-20", status: "done", processed: 10, remaining: 0, planned: 10, spent_usd: 0.01, cap_usd: 1, month_spent_usd: 0.2, finalized: true, coordinated: true, decisions: 0, skipped: 0 };

beforeEach(() => {
  h.authorised = true;
  h.run.mockReset().mockResolvedValue(result);
});

describe("/api/cron/model-eval", () => {
  it("401 without cron auth, nothing runs", async () => {
    h.authorised = false;
    const res = await POST(new Request("https://blockid.au/api/cron/model-eval", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(h.run).not.toHaveBeenCalled();
  });

  it("defaults to smoke; passes full / restart / dry", async () => {
    let res = await POST(new Request("https://blockid.au/api/cron/model-eval", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, noop: false, status: "done", coordinated: true });
    expect(h.run).toHaveBeenLastCalledWith({ mode: "smoke", restart: false, dryRun: false, finalize: false });
    res = await GET(new Request("https://blockid.au/api/cron/model-eval?mode=full&restart=1&dry=true"));
    expect(res.status).toBe(200);
    expect(h.run).toHaveBeenLastCalledWith({ mode: "full", restart: true, dryRun: true, finalize: false });
  });

  it("?finalize=1 closes the window's run; a refused coordination (corrupt policy) answers ok:false", async () => {
    await POST(new Request("https://blockid.au/api/cron/model-eval?mode=full&finalize=1", { method: "POST" }));
    expect(h.run).toHaveBeenLastCalledWith({ mode: "full", restart: false, dryRun: false, finalize: true });
    h.run.mockResolvedValue({ ...result, coordinated: false, coordination_error: "policy invalid" });
    const res = await POST(new Request("https://blockid.au/api/cron/model-eval", { method: "POST" }));
    expect(await res.json()).toMatchObject({ ok: false, coordination_error: "policy invalid" });
  });

  it("a finished period answers noop:true (cron-runner skips the health line)", async () => {
    h.run.mockResolvedValue({ ...result, status: "noop", finalized: false, coordinated: false });
    const res = await POST(new Request("https://blockid.au/api/cron/model-eval?mode=full", { method: "POST" }));
    expect(await res.json()).toMatchObject({ ok: true, noop: true });
  });

  it("400 on an unknown mode; 500 (no detail) when the loop throws", async () => {
    expect((await POST(new Request("https://blockid.au/api/cron/model-eval?mode=everything", { method: "POST" }))).status).toBe(400);
    h.run.mockRejectedValue(new Error("disk full /secret/path"));
    const res = await POST(new Request("https://blockid.au/api/cron/model-eval", { method: "POST" }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("/secret/path");
  });
});
