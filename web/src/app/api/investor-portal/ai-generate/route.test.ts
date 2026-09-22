import { beforeEach, expect, it, vi } from "vitest";
const ai = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai-client", () => ({ callAI: ai }));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_config: unknown, handler: unknown) => handler }));
import { POST } from "./route";
const request = (body: Record<string, unknown>) => new Request("http://127.0.0.1/api/investor-portal/ai-generate", {
  method: "POST", headers: { "content-type": "application/json", "x-investor-portal-token": "fixture-token" }, body: JSON.stringify(body),
});
beforeEach(() => { ai.mockReset(); vi.stubEnv("INVESTOR_PORTAL_AI_TOKEN", "fixture-token"); });
it("uses server report policy and returns actual provider metadata", async () => {
  ai.mockResolvedValue({ text: "valid", provider: "groq", via: "deepinfra", model: "fixture-model", policy: "blockid-report-v1" });
  const response = await POST(request({ user: "evidence", policy: "arbitrary", maxTokens: -20, temperature: 100, timeoutMs: "unbounded" }));
  expect(response.status).toBe(200);
  expect(ai.mock.calls[0][0]).toMatchObject({ policy: "blockid-report-v1", taskClass: "report", budgetMs: 120000, timeoutMs: 120000, maxTokens: 1, temperature: 1 });
  expect(await response.json()).toMatchObject({ provider: "deepinfra", model: "fixture-model", policy: "blockid-report-v1" });
});
it("retains one absolute deadline and provider policy through JSON repair", async () => {
  ai.mockResolvedValueOnce({ text: "bad" }).mockResolvedValueOnce({ text: '{"ok":true}' });
  const response = await POST(request({ user: "evidence", responseFormat: "json", timeoutMs: 45000 }));
  expect(response.status).toBe(200);
  expect(ai).toHaveBeenCalledTimes(2);
  expect(ai.mock.calls[1][0]).toMatchObject({ policy: "blockid-report-v1", deadlineAt: ai.mock.calls[0][0].deadlineAt, budgetMs: 45000 });
});
it("preserves configured proxy authentication before any model call", async () => {
  const req = request({ user: "evidence" }); req.headers.set("x-investor-portal-token", "wrong");
  expect((await POST(req)).status).toBe(401); expect(ai).not.toHaveBeenCalled();
});
it("returns provider failure without invoking an alternate route policy", async () => {
  ai.mockRejectedValue(new Error("budget exhausted"));
  expect((await POST(request({ user: "evidence" }))).status).toBe(502);
  expect(ai).toHaveBeenCalledTimes(1);
});
