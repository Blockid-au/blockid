// G16-A — lib/funnel: the typed façade over scripts/lib/funnel-core.mjs and
// the /admin/funnel readers. Pins:
//   - the TS façade really is the mjs reducer (same numbers on the same rows);
//   - the file schemas accept what scripts/funnel-report.mjs writes and
//     reject drift (a missing conv key, a bad date);
//   - readFunnelDaily drops invalid lines and sorts; readFunnelLatest reports
//     ok / stale / missing; liveTodayFunnel filters on the funnel event names
//     since UTC midnight and never throws.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FUNNEL_EVENT_NAMES, emptyCounts, funnelDailyRowSchema, funnelLatestSchema, reduceDaily, reduceFunnel, type FunnelEventRow } from "./core";
import { FUNNEL_MAX_AGE_MS, funnelStatusFrom, liveTodayFunnel, readFunnelDaily, readFunnelLatest } from "./read";
import { buildReport } from "../../../scripts/funnel-report.mjs";

const NOW = Date.UTC(2026, 8, 19, 4, 0, 0);
const ROWS: FunnelEventRow[] = [
  { event_id: "1", event_name: "sign_up", user_id: "u1", params: { method: "google", segment: "founder" }, ts: "2026-09-18T09:00:00.000Z" },
  { event_id: "2", event_name: "svi_analyze", user_id: "u1", params: { first: true, project_id: "p1" }, ts: "2026-09-18T09:05:00.000Z" },
  { event_id: "3", event_name: "report_view", user_id: "u1", params: { tier: "free", project_id: "p1" }, ts: "2026-09-18T09:06:00.000Z" },
  { event_id: "4", event_name: "report_view", user_id: "u1", params: { tier: "free", project_id: "p1" }, ts: "2026-09-18T09:07:00.000Z" },
  { event_id: "5", event_name: "sign_up", user_id: "qa", params: { method: "email", segment: "founder", qa: true }, ts: "2026-09-18T09:00:00.000Z" },
  { event_id: "6", event_name: "feature_gate_hit", user_id: "u1", params: { feature: "cap_table.write" }, ts: "2026-09-18T09:08:00.000Z" },
  { event_id: "7", event_name: "sign_up", user_id: "u2", params: { method: "email", segment: "unknown" }, ts: "2026-09-19T01:00:00.000Z" },
];

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "funnel-read-"));
  mkdirSync(join(root, "content", "reports"), { recursive: true });
  return root;
}

describe("core façade", () => {
  it("reduces exactly like the mjs reducer and the schemas accept the cron's output", () => {
    const c = reduceFunnel(ROWS);
    expect(c).toMatchObject({ signups: 2, analyses: 1, first_analyses: 1, report_views: 1, qa_excluded: 1, gate_hits: { "cap_table.write": 1 } });
    expect(c.conv.signup_to_analysis).toBe(0.5);
    expect(funnelDailyRowSchema.safeParse({ date: "2026-09-18", ...c }).success).toBe(true);
    expect(funnelDailyRowSchema.safeParse({ date: "18/09/2026", ...c }).success).toBe(false);
    const { conv: _conv, ...noConv } = c;
    void _conv;
    expect(funnelDailyRowSchema.safeParse({ date: "2026-09-18", ...noConv }).success).toBe(false);
    const { latest } = buildReport(ROWS, { days: 14, now: NOW, generatedAt: new Date(NOW).toISOString() });
    expect(funnelLatestSchema.safeParse(JSON.parse(JSON.stringify(latest))).success).toBe(true);
    expect(FUNNEL_EVENT_NAMES).toContain("trust_report_purchased");
    expect(emptyCounts().paid).toBe(0);
    expect(reduceDaily(ROWS, { days: 2, now: NOW }).map((r) => r.date)).toEqual(["2026-09-17", "2026-09-18"]);
  });
});

describe("readFunnelDaily / readFunnelLatest", () => {
  it("returns validated rows sorted by date, dropping malformed lines; missing file → []", async () => {
    const root = tmpRoot();
    const y = { date: "2026-09-18", ...reduceFunnel(ROWS) };
    const d2 = { date: "2026-09-17", ...emptyCounts() };
    writeFileSync(join(root, "content", "reports", "funnel-daily.jsonl"), `${JSON.stringify(y)}\n{bad\n${JSON.stringify({ date: "x" })}\n${JSON.stringify(d2)}\n`);
    const rows = await readFunnelDaily(root);
    expect(rows.map((r) => r.date)).toEqual(["2026-09-17", "2026-09-18"]);
    expect(rows[1].signups).toBe(2);
    expect(await readFunnelDaily(tmpRoot())).toEqual([]);
  });

  it("latest: ok when fresh, stale when old, missing when absent, error when the shape drifted", async () => {
    const root = tmpRoot();
    const file = join(root, "content", "reports", "funnel-latest.json");
    const { latest } = buildReport(ROWS, { days: 14, now: NOW, generatedAt: new Date(NOW).toISOString() });
    writeFileSync(file, JSON.stringify(latest));
    const ok = await readFunnelLatest(root);
    expect(ok.error).toBeNull();
    expect(ok.latest?.yesterday.date).toBe("2026-09-18");
    expect(ok.latest?.d7.signups).toBe(1);
    expect(funnelStatusFrom(ok.latest, NOW + 1000)).toBe("ok");
    expect(funnelStatusFrom(ok.latest, NOW + FUNNEL_MAX_AGE_MS + 1)).toBe("stale");
    expect(funnelStatusFrom(null)).toBe("missing");
    expect(funnelStatusFrom({ generated_at: "nope" })).toBe("missing");
    writeFileSync(file, JSON.stringify({ ...latest, d7: { signups: 1 } }));
    const drift = await readFunnelLatest(root);
    expect(drift.latest).toBeNull();
    expect(drift.error).toMatch(/schema/);
    expect((await readFunnelLatest(tmpRoot())).status).toBe("missing");
  });
});

describe("liveTodayFunnel", () => {
  function client(resp: { data: unknown[] | null; error: { message?: string } | null }, calls: Record<string, unknown>[] = [], throws = false) {
    return {
      from: (table: string) => ({
        select: (cols: string) => ({
          in: (col: string, v: readonly string[]) => ({
            gte: (gcol: string, gv: string) => ({
              order: () => ({
                limit: (n: number) => {
                  calls.push({ table, cols, col, v, gcol, gv, n });
                  if (throws) throw new Error("network down");
                  return Promise.resolve(resp);
                },
              }),
            }),
          }),
        }),
      }),
    };
  }

  it("filters on the funnel event names since UTC midnight and reduces today's rows", async () => {
    const calls: Record<string, unknown>[] = [];
    const out = await liveTodayFunnel(client({ data: ROWS.filter((r) => r.ts!.startsWith("2026-09-19")), error: null }, calls), NOW);
    expect(out.date).toBe("2026-09-19");
    expect(out.counts?.signups).toBe(1);
    expect(out.warning).toBeNull();
    expect(calls[0]).toMatchObject({ table: "analytics_events", col: "event_name", v: FUNNEL_EVENT_NAMES, gcol: "ts", gv: "2026-09-19T00:00:00.000Z" });
  });

  it("null client / query error / throw → counts null + warning, never a throw", async () => {
    expect(await liveTodayFunnel(null, NOW)).toEqual({ counts: null, date: "2026-09-19", warning: "supabase not configured" });
    expect((await liveTodayFunnel(client({ data: null, error: { message: "42P01" } }), NOW)).warning).toBe("analytics_events: 42P01");
    expect((await liveTodayFunnel(client({ data: [], error: null }, [], true), NOW)).warning).toBe("analytics_events: network down");
  });
});
