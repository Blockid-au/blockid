// GET /api/admin/reseller-loop/status
//
// Read-only admin endpoint that returns the current reseller-goal-loop
// state + recent history so the /admin/reseller-loop dashboard can render
// live progress without touching the loop's log files itself.
//
// Sources:
//   - /tmp/blockid-reseller-monitor.txt (updated every minute by the
//     scripts/cron/reseller-monitor.sh cron)
//   - web/content/reports/reseller-monitor.jsonl (machine-readable history)
//   - web/content/reports/reseller-goal-history.jsonl (loop tick log)

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";

export const dynamic = "force-dynamic";

const REPO_ROOT = "/home/dovanlong/blockid.au";
const MONITOR_TXT = "/tmp/blockid-reseller-monitor.txt";
const MONITOR_JSONL = join(REPO_ROOT, "web", "content", "reports", "reseller-monitor.jsonl");
const HISTORY_JSONL = join(REPO_ROOT, "web", "content", "reports", "reseller-goal-history.jsonl");
const DONE_MARKER = "/tmp/blockid-reseller-goal-done";

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function tailLines(text: string, n: number): string[] {
  const lines = text.split("\n").filter((l) => l.length > 0);
  return lines.slice(-n);
}

export async function GET() {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 401 });
    }
    throw err;
  }

  const [snapshotText, monitorHistory, tickHistory, doneMarker] = await Promise.all([
    safeRead(MONITOR_TXT),
    safeRead(MONITOR_JSONL),
    safeRead(HISTORY_JSONL),
    safeRead(DONE_MARKER),
  ]);

  const monitorRows = tailLines(monitorHistory, 30)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const tickRows = tailLines(tickHistory, 40)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const isComplete = doneMarker.trim().length > 0;

  return NextResponse.json({
    ok: true,
    complete: isComplete,
    completed_at: isComplete ? doneMarker.trim() : null,
    snapshot: snapshotText,
    monitor_history: monitorRows,
    tick_history: tickRows,
    generated_at: new Date().toISOString(),
  });
}
