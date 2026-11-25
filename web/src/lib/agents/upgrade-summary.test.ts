// G36-C — the agent-upgrade summary the daily admin report reads (instead of
// re-running /api/cron/agent-upgrade, which timed out and duplicated work).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_UPGRADE_SUMMARY_MAX_AGE_MS, agentActivityFromSummary, readAgentUpgradeActivity, writeAgentUpgradeSummary } from "./upgrade-summary";

const NOW = Date.parse("2026-11-25T22:30:00Z");
const RAN = "2026-11-25T17:00:00.000Z";

describe("agentActivityFromSummary", () => {
  it("maps the route's real shape (status + result? / error?) to ok + result text", () => {
    const rows = agentActivityFromSummary({
      timestamp: RAN,
      results: [
        { id: "a", agent: "CMO", task: "SEO check", status: "ok", result: "12 pages fine" },
        { id: "b", agent: "CTO", task: "Health", status: "failed", error: "Worker timeout (30s)" },
        { id: "c", agent: "CFO", task: "Weekly", status: "skipped" },
      ],
    }, NOW);
    expect(rows).toEqual([
      { agent: "CMO", task: "SEO check", result: "12 pages fine", ok: true },
      // A failed task has no `result` — it used to throw in the e-mail template (r.result.slice).
      { agent: "CTO", task: "Health", result: "Worker timeout (30s)", ok: false },
      { agent: "CFO", task: "Weekly", result: "skipped", ok: false },
    ]);
  });

  it("a stale, malformed or missing summary yields no rows", () => {
    const results = [{ agent: "CMO", task: "x", status: "ok", result: "y" }];
    expect(agentActivityFromSummary({ timestamp: new Date(NOW - AGENT_UPGRADE_SUMMARY_MAX_AGE_MS - 1).toISOString(), results }, NOW)).toEqual([]);
    expect(agentActivityFromSummary({ timestamp: "garbage", results }, NOW)).toEqual([]);
    expect(agentActivityFromSummary({ timestamp: RAN, results: "nope" }, NOW)).toEqual([]);
    expect(agentActivityFromSummary(null, NOW)).toEqual([]);
    expect(agentActivityFromSummary({ timestamp: RAN, results: [null, { agent: 1, task: "x" }] }, NOW)).toEqual([]);
  });
});

describe("write / read round trip", () => {
  let dir: string | null = null;
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = null; });

  it("what agent-upgrade writes is what the admin report reads", async () => {
    dir = mkdtempSync(join(tmpdir(), "agent-upgrade-summary-"));
    const file = join(dir, "agent-upgrade-latest.json");
    await writeAgentUpgradeSummary(RAN, [{ id: "a", agent: "COO", task: "Ops", status: "ok", result: "fine" }], file);
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ timestamp: RAN });
    await expect(readAgentUpgradeActivity(NOW, file)).resolves.toEqual([{ agent: "COO", task: "Ops", result: "fine", ok: true }]);
  });

  it("never throws: a missing file reads as [] and a failed write only warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(readAgentUpgradeActivity(NOW, "/nonexistent-dir-g36/x.json")).resolves.toEqual([]);
      await expect(writeAgentUpgradeSummary(RAN, [], "/nonexistent-dir-g36/x.json")).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
