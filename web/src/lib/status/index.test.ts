// G15-R2 — readStatusExtras assembly (60 s module cache, every section
// null-safe) and the public redaction.

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetStatusExtrasCache, publicStatusExtras, readStatusExtras, redactMessage, type StatusExtras } from "./index";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/ai-client", () => ({ getAIQueueDepth: () => ({}) }));

const NOW = Date.parse("2026-09-18T06:00:00.000Z");

beforeEach(() => _resetStatusExtrasCache());

describe("readStatusExtras", () => {
  it("empty root → every section at its null shape, no throw", async () => {
    const x = await readStatusExtras(mkdtempSync(join(tmpdir(), "x-")), NOW);
    expect(x).toEqual({
      errors_1h: null,
      ai: null,
      queues: { email_queued: null, email_failed_24h: null, webhook_failed_24h: null, report_orders_pending: null },
      backups_detail: { local_last_ok_at: null, local_age_h: null, offsite_status: "never", offsite_last_at: null, restore_drill_last_ok_at: null },
      latency: null,
      crons_failed_24h: [],
      uptime: null,
    });
  });
  it("caches for 60 s per process (force bypasses)", async () => {
    const root = mkdtempSync(join(tmpdir(), "x-"));
    const a = await readStatusExtras(root, NOW);
    mkdirSync(join(root, "content", "reports"), { recursive: true });
    writeFileSync(join(root, "content", "reports", "error-digest.jsonl"), JSON.stringify({ ts: new Date(NOW).toISOString(), total: 4, classes: [{ tag: "t", msg: "m", count: 4 }] }) + "\n");
    expect(await readStatusExtras(root, NOW + 30_000)).toBe(a);
    expect((await readStatusExtras(root, NOW + 30_000, { force: true })).errors_1h?.total).toBe(4);
    expect((await readStatusExtras(root, NOW + 61_000)).errors_1h?.total).toBe(4);
  });
});

describe("publicStatusExtras", () => {
  it("keeps counts/states/timestamps, redacts message text, drops cron error detail", () => {
    const full: StatusExtras = {
      errors_1h: { total: 7, classes: [{ tag: "ai-client", msg: "ECONNREFUSED http://ai-gateway:8080/v1 falling back; see /home/dovanlong/web/.env on ai-gateway:8080 and db.internal.local", count: 7 }], windows: 6, last_ts: "x" },
      ai: { providers: [{ name: "anthropic", state: "blocked", cooldown_until: null, reason: "401 key sk-…" }], budget_exhausted_1h: 1, interactive_order: ["deepinfra"], model_health: { updated_at: "u", total: 28, healthy: 13, quota_exceeded: 0 }, fully_degraded_24h: 2 },
      queues: { email_queued: 1, email_failed_24h: 0, webhook_failed_24h: null, report_orders_pending: 0 },
      backups_detail: { local_last_ok_at: "2026-09-17T02:20:05.000Z", local_age_h: 27.7, offsite_status: "founder_action_required", offsite_last_at: "2026-09-17T02:40:05.000Z", restore_drill_last_ok_at: null },
      latency: { ts: "t", latency_p95_ms: { marketing: 400, workspace: null, api_ai: null, api_other: 120, tbr: null }, err_rate_5xx: { marketing: 0, workspace: null, api_ai: null, api_other: 0, tbr: null }, requests: 100, timing: true },
      crons_failed_24h: [{ endpoint: "db-backup-offsite", count: 1, last_ts: "t", last_error: "Service account has no Drive quota" }],
    };
    const pub = publicStatusExtras(full);
    expect(pub.errors_1h).toEqual({ total: 7, classes: [{ tag: "ai-client", msg: "ECONNREFUSED <url> falling back; see <path> on <host> and <host>", count: 7 }] });
    expect(pub.ai).toEqual({ providers: [{ name: "anthropic", state: "blocked" }], budget_exhausted_1h: 1, models_healthy: 13, models_total: 28, fully_degraded_24h: 2 });
    expect(pub.crons_failed_24h).toEqual([{ endpoint: "db-backup-offsite", count: 1 }]);
    expect(pub.latency_p95_ms).toEqual(full.latency!.latency_p95_ms);
    expect(JSON.stringify(pub)).not.toMatch(/sk-|\/home\/|ai-gateway|Drive quota/);
  });
  it("nulls pass through", () => {
    const pub = publicStatusExtras({ errors_1h: null, ai: null, queues: { email_queued: null, email_failed_24h: null, webhook_failed_24h: null, report_orders_pending: null }, backups_detail: { local_last_ok_at: null, local_age_h: null, offsite_status: "never", offsite_last_at: null, restore_drill_last_ok_at: null }, latency: null, crons_failed_24h: [], uptime: null });
    expect(pub.errors_1h).toBeNull();
    expect(pub.ai).toBeNull();
    expect(pub.latency_p95_ms).toBeNull();
  });
  it("redactMessage", () => {
    expect(redactMessage("PGRST<n> Could not find the <str> column")).toBe("PGRST<n> Could not find the <str> column");
    expect(redactMessage("open /data/logs/x.log")).toBe("open <path>");
  });
});
