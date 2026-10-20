// G35 A3 — /api/cron/ai-balance wiring (the logic is covered by lib/ai/balances.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  authorised: true,
  run: vi.fn(),
  telegram: vi.fn(async () => true),
  insert: vi.fn(async () => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/cron-auth", () => ({ isCronAuthorised: () => h.authorised }));
vi.mock("@/lib/ai/balances", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), runBalanceCheck: (d: unknown) => h.run(d) }));
vi.mock("@/lib/telegram", () => ({ sendTelegram: (t: string) => h.telegram(t), mdEscape: (t: string) => t }));
vi.mock("@/lib/ai/spend-guard", () => ({ SPEND_HISTORY_FILE: "/nx/history.jsonl", SPEND_LEDGER_FILE: "/nx/daily.json", founderUserId: async () => "founder-1" }));
vi.mock("@/lib/notifications", () => ({ insertNotification: (a: unknown) => h.insert(a) }));

import { GET, POST } from "./route";

const snapshot = {
  updated_at: "2026-10-20T12:00:00.000Z",
  flags: { updated_at: "2026-10-20T12:00:00.000Z", deepinfra_critical: true, openrouter_paid_disabled: false },
  providers: { deepinfra: { provider: "deepinfra", level: "critical", balance_usd: 2, burn_usd_per_day: 1, runway_days: 2 } },
  alerts: [{ key: "deepinfra:critical:2026-10-20", sent: true }],
};

const saved = { di: process.env.DEEPINFRA_API_KEY, or: process.env.OPENROUTER_API_KEY };
beforeEach(() => {
  h.authorised = true;
  h.run.mockReset().mockResolvedValue(snapshot);
  h.telegram.mockClear();
  h.insert.mockClear();
  process.env.DEEPINFRA_API_KEY = "di-secret-value";
  process.env.OPENROUTER_API_KEY = "or-secret-value";
});
afterEach(() => {
  process.env.DEEPINFRA_API_KEY = saved.di;
  process.env.OPENROUTER_API_KEY = saved.or;
});

describe("/api/cron/ai-balance", () => {
  it("401 without cron auth, and nothing runs", async () => {
    h.authorised = false;
    const res = await POST(new Request("https://blockid.au/api/cron/ai-balance", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(h.run).not.toHaveBeenCalled();
  });

  it("runs the check with the runtime paths, env keys and both alert channels; never returns a key", async () => {
    const res = await GET(new Request("https://blockid.au/api/cron/ai-balance"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("secret-value");
    expect(JSON.parse(text)).toMatchObject({ ok: true, flags: { deepinfra_critical: true }, providers: { deepinfra: { level: "critical", runway_days: 2 } }, alerts: snapshot.alerts });
    const deps = h.run.mock.calls[0][0];
    expect(deps.paths.balances).toMatch(/content\/reports\/ai-balances\.json$/);
    expect(deps.paths.flags).toMatch(/content\/reports\/ai-balance-flags\.json$/);
    expect(deps.paths.alertState).toMatch(/\.local\/state\/blockid-runtime\/ai-balance-alerts\.json$/);
    expect(deps.keys).toEqual({ deepinfra: "di-secret-value", openrouter: "or-secret-value" });
    await deps.send("hello");
    expect(h.telegram).toHaveBeenCalledWith("hello");
    await deps.notifyFounder({ provider: "deepinfra", level: "critical", dedupeKey: "ai_balance:deepinfra:critical:2026-10-20", payload: { reason: "ai_balance" } });
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({ userId: "founder-1", kind: "ai_capacity", dedupeKey: "ai_balance:deepinfra:critical:2026-10-20" }));
  });
});
