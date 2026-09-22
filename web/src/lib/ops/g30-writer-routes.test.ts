import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ allowed: true, guard: vi.fn(() => Response.json({ ok: false, deferred: true }, { status: 503 })) }));
beforeEach(() => { auth.allowed = true; auth.guard.mockClear(); });
vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/cron-auth", () => ({ isCronAuthorised: () => auth.allowed, cronSecret: () => "fixture-only" }));
vi.mock("@/lib/ops/g30-writer-ownership", () => ({ g30WriterDeferred: auth.guard }));
const calls = vi.hoisted(() => ({ exec: vi.fn(() => { throw new Error("must not execute shell"); }), notify: vi.fn(), budget: vi.fn(() => { throw new Error("must not spend/read budget"); }) }));
vi.mock("child_process", () => ({ exec: calls.exec, execSync: calls.exec, execFileSync: calls.exec, spawn: calls.exec }));
vi.mock("@/lib/telegram", () => ({ sendTelegram: calls.notify, mdEscape: (x: string) => x }));
vi.mock("@/lib/ai-client", () => ({ getAIBudgetStatus: calls.budget, canRunUpgradeTasks: calls.budget, callAI: calls.budget, callAIForUpgrade: calls.budget }));

const handlers: Record<string, () => Promise<{ POST: (request: Request) => Promise<Response> }>> = {
      "agent-deploy": () => import("@/app/api/cron/agent-deploy/route"),
      "agent-orchestrator": () => import("@/app/api/cron/agent-orchestrator/route"),
      "agent-auto-improve": () => import("@/app/api/cron/agent-auto-improve/route"),
      "agent-healthcheck": () => import("@/app/api/cron/agent-healthcheck/route"),
      "agent-guardian": () => import("@/app/api/cron/agent-guardian/route"),
    };

describe("scheduled writer API ownership before work", () => {
  it.each(["agent-deploy", "agent-orchestrator", "agent-auto-improve", "agent-healthcheck", "agent-guardian"])("defers %s before body, shell, budget or notification", async (name) => {
    const request = new Request("http://fixture.invalid/api/cron/" + name, { method: "POST" });
    const body = vi.spyOn(request, "json").mockRejectedValue(new Error("must not parse payload"));
    const response = await (await handlers[name]()).POST(request);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, deferred: true });
    expect(body).not.toHaveBeenCalled();
    expect(calls.exec).not.toHaveBeenCalled();
    expect(calls.notify).not.toHaveBeenCalled();
    expect(calls.budget).not.toHaveBeenCalled();
  });
  it.each(Object.keys(handlers))("keeps authentication before ownership for %s", async (name) => {
    auth.allowed = false;
    const response = await (await handlers[name]()).POST(new Request("http://fixture.invalid/", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(auth.guard).not.toHaveBeenCalled();
    expect(calls.exec).not.toHaveBeenCalled();
    expect(calls.notify).not.toHaveBeenCalled();
    expect(calls.budget).not.toHaveBeenCalled();
  });

});
