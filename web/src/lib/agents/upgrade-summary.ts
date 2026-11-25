// G36-C — the latest /api/cron/agent-upgrade run, as a small JSON file the
// daily admin report READS instead of re-running agent-upgrade over HTTP.
//
// Before: daily-admin-report POSTed /api/cron/agent-upgrade on every run. That
// (a) ran the whole C-level task set a second time each day — duplicate AI
// calls, and on Mondays a second "Weekly Growth Report" e-mail — and (b) timed
// out at 75 s whenever two weekly AI tasks fell on the same day (the route
// waits 60 s between AI tasks): "[daily-admin-report] agent-upgrade call failed:
// TimeoutError" in the live log. It also read `r.ok` / `r.result`, which the
// route never returns (it returns `status` and `result?` / `error?`), so every
// row rendered red and a failed task without `result` threw in the template.
// (The route's growth_insights insert targets columns that table does not have,
// so the DB was never a usable source.)

import { readFile, writeFile } from "node:fs/promises";
import { runtimeReportsPath } from "@/lib/runtime-paths";

export const AGENT_UPGRADE_SUMMARY_FILE = "agent-upgrade-latest.json";
/** agent-upgrade runs daily at 17:00 UTC, the admin report at 22:30 UTC — 26 h tolerates one late run. */
export const AGENT_UPGRADE_SUMMARY_MAX_AGE_MS = 26 * 60 * 60_000;

export interface AgentUpgradeTaskResult {
  id?: string;
  agent: string;
  task: string;
  status: "ok" | "skipped" | "failed";
  result?: string;
  error?: string;
}

export interface AgentActivityRow {
  agent: string;
  task: string;
  result: string;
  ok: boolean;
}

/** Pure: the admin-report rows from a summary file's parsed JSON; [] when stale or malformed. */
export function agentActivityFromSummary(raw: unknown, now: number = Date.now()): AgentActivityRow[] {
  if (!raw || typeof raw !== "object") return [];
  const { timestamp, results } = raw as { timestamp?: unknown; results?: unknown };
  const at = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(at) || now - at > AGENT_UPGRADE_SUMMARY_MAX_AGE_MS || !Array.isArray(results)) return [];
  const rows: AgentActivityRow[] = [];
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const { agent, task, status, result, error } = r as Partial<AgentUpgradeTaskResult>;
    if (typeof agent !== "string" || typeof task !== "string") continue;
    const text = typeof result === "string" && result ? result : typeof error === "string" && error ? error : String(status ?? "");
    rows.push({ agent, task, result: text, ok: status === "ok" });
  }
  return rows;
}

/** Best-effort write by the agent-upgrade route; never throws. */
export async function writeAgentUpgradeSummary(timestamp: string, results: readonly AgentUpgradeTaskResult[], file: string = runtimeReportsPath(AGENT_UPGRADE_SUMMARY_FILE)): Promise<void> {
  try {
    await writeFile(file, JSON.stringify({ timestamp, results }), "utf8");
  } catch (err) {
    console.warn("[agent-upgrade] summary write failed:", err instanceof Error ? err.message : err);
  }
}

/** Never throws: [] when the file is missing, unreadable, stale or malformed. */
export async function readAgentUpgradeActivity(now: number = Date.now(), file: string = runtimeReportsPath(AGENT_UPGRADE_SUMMARY_FILE)): Promise<AgentActivityRow[]> {
  try {
    return agentActivityFromSummary(JSON.parse(await readFile(file, "utf8")), now);
  } catch {
    return [];
  }
}
