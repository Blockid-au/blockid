// Colocated vitest for GET /api/cron/ai-health (W1, pricing v5 §7.2 #1/#6).
//
// The token guardian reads `ok` from this route every 30 min. An answer from
// a model below the capability floor (Groq allam-2-7b) must NOT read as a
// healthy AI stack, and alerts are deduped to one per kind per UTC day.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callAI: vi.fn(),
  isAIConfigured: vi.fn(() => true),
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/ai-client", () => ({ callAI: mocks.callAI, isAIConfigured: mocks.isAIConfigured }));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/security/cron-auth", () => ({ isCronAuthorised: () => true }));

import { GET } from "./route";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ai-health-"));
  process.env.AI_HEALTH_ALERT_STATE_FILE = join(dir, "state.json");
  mocks.callAI.mockReset();
  mocks.sendEmail.mockClear();
  mocks.isAIConfigured.mockReturnValue(true);
});
afterEach(() => {
  delete process.env.AI_HEALTH_ALERT_STATE_FILE;
  rmSync(dir, { recursive: true, force: true });
});

const req = () => new Request("http://localhost/api/cron/ai-health", { headers: { authorization: "Bearer x" } });

describe("GET /api/cron/ai-health", () => {
  it("asks for a classify-class answer with room for a reasoning model and reports the serving provider", async () => {
    mocks.callAI.mockResolvedValue({ text: "OK", provider: "groq", via: "groq", model: "qwen/qwen3.8-27b" });
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ ok: true, representative: true, provider: "groq", model: "qwen/qwen3.8-27b" });
    expect(mocks.callAI.mock.calls[0][0]).toMatchObject({ taskClass: "classify", maxTokens: 64, priority: "background" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("an answer from allam-2-7b is not evidence of a healthy stack (ok:false, one alert per day)", async () => {
    mocks.callAI.mockResolvedValue({ text: "OK", provider: "groq", via: "groq", model: "allam-2-7b" });
    const first = await (await GET(req())).json();
    expect(first).toMatchObject({ ok: false, representative: false, model: "allam-2-7b" });
    await GET(req());
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("all providers failing alerts once per UTC day, not every 30 min", async () => {
    mocks.callAI.mockRejectedValue(new Error("All AI providers failed"));
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ ok: false, alerted: true });
    await GET(req());
    await GET(req());
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });
});
