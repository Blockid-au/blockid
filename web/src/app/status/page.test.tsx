// Colocated test for the public /status page (G15-R2). The page is a server
// component that fetches the ANONYMOUS /api/status payload and reads the
// deploy log + uptime snapshot. Pins:
//   - renders with an empty / failed payload (every value falls back to a dash,
//     no throw — an outage must not take the status page down too);
//   - the G15-R2 sections render from the payload read-only: latency by route
//     class, errors (1 h) with the top classes, AI providers, queues, backups,
//     failed jobs (24 h);
//   - nothing path-, host- or secret-like leaks into the HTML even when the
//     payload carries it (the API redacts; the page must not add any back).
// The marketing shell mounts NavV2 → useRouter(), so it is mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/marketing/marketing-hero", () => ({
  MarketingHero: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/lib/platform-metrics", () => ({
  readUptimeSnapshot: async () => ({ last_healthy: true, last_http_local: 200, last_ts: "2026-09-18T05:00:00Z", window_pct: 100, window_healthy: 1440, window_total: 1440 }),
}));
vi.mock("node:fs", () => ({
  promises: { readFile: vi.fn(async () => "") },
}));

import StatusPage from "./page";

async function html(): Promise<string> {
  const el = await StatusPage();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function payload(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    version: "v1.2.3",
    updated_at: "2026-09-18T05:30:00.000Z",
    services: [
      { name: "db", status: "ok" },
      { name: "stripe", status: "ok" },
      { name: "audit_chain", status: "ok" },
      { name: "ga4", status: "ok" },
    ],
    slo: { uptime_pct_24h: 100 },
    last_deploy: { ts: "2026-09-18T04:00:00Z", gates_passed: 12, gates_expected: 12 },
    traction: "ok",
    svi_backtest: "ok",
    ...extra,
  };
}

describe("/status page", () => {
  it("renders every section with dashes when /api/status is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const out = await html();
    expect(out).toContain("System status");
    expect(out).toContain("Latency by route class");
    expect(out).toContain("Operations");
    expect(out).toContain("Application errors (1 h)");
    expect(out).toContain("digest not yet running");
    expect(out).toContain("Database backup");
    expect(out).not.toContain("Scheduled jobs that failed");
  });

  it("renders the G15-R2 sections from the anonymous payload", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        payload({
          slo: { uptime_pct_24h: 99.98, latency_p95_ms: { marketing: 412, workspace: 1900, api_ai: null, api_other: 150, tbr: null } },
          errors_1h: { total: 12, classes: [{ tag: "ai-client", msg: "Gateway unavailable (ECONNREFUSED) <host> for <n> min", count: 9 }, { tag: "svi", msg: "createProject failed <uuid>", count: 3 }] },
          ai: { providers: [{ name: "deepinfra", state: "ok" }, { name: "anthropic", state: "blocked" }], budget_exhausted_1h: 0, models_healthy: 13, models_total: 28, fully_degraded_24h: 1 },
          queues: { email_queued: 2, email_failed_24h: 0, webhook_failed_24h: 1, report_orders_pending: 0 },
          backups_detail: { local_last_ok_at: "2026-09-18T02:20:05Z", local_age_h: 3.2, offsite_status: "founder_action_required", offsite_last_at: "2026-09-18T02:40:05Z", restore_drill_last_ok_at: null },
          crons_failed_24h: [{ endpoint: "db-backup-offsite", count: 1 }],
        }),
    });
    const out = await html();
    // latency tiles
    expect(out).toContain("Marketing pages");
    expect(out).toContain("412 ms");
    expect(out).toContain("1900 ms");
    expect(out).toContain("Internal SLO target 60 s");
    // errors
    expect(out).toContain("2 classes");
    expect(out).toContain("[ai-client]");
    expect(out).toContain("Gateway unavailable (ECONNREFUSED) &lt;host&gt; for &lt;n&gt; min");
    // ai
    expect(out).toContain("1/2 ok");
    expect(out).toContain("1 degraded report (24 h)");
    expect(out).toContain("anthropic");
    expect(out).toContain("blocked");
    // queues + backups + failed jobs
    expect(out).toContain("0 email / 1 webhook failures (24 h)");
    expect(out).toContain("3.2 h ago");
    expect(out).toContain("Needs operator action");
    expect(out).toContain("restore drill: never");
    expect(out).toContain("Scheduled jobs that failed in the last 24 h");
    expect(out).toContain("db-backup-offsite");
    // the page fetched the anonymous endpoint without a bearer
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/status$/), { cache: "no-store" });
  });

  it("never prints file paths, hosts or bearer material, even if the payload carried them", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        payload({
          errors_1h: { total: 1, classes: [{ tag: "cron", msg: "EACCES open <path>", count: 1 }] },
          backups_detail: { local_last_ok_at: "2026-09-18T02:20:05Z", local_age_h: 0.5, offsite_status: "ok", offsite_last_at: null, restore_drill_last_ok_at: "2026-09-14T03:30:00Z" },
          crons_failed_24h: [],
        }),
    });
    const out = await html();
    expect(out).toContain("30 min ago");
    expect(out).toContain("off-site: Ok");
    expect(out).not.toMatch(/\/data\/|\/home\/|\/var\/log|Bearer|TELEGRAM|localhost:4001/);
  });
});
