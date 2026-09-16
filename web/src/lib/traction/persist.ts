// Persistence for the daily traction snapshot (G14-S33).
//
//   content/reports/traction-snapshot.json   latest, pretty-printed — read by
//                                             /api/status, /api/platform-stats,
//                                             /admin/traction, investor-update.mjs
//   content/reports/traction-history.jsonl   one compact line per run
//
// Never throws — the cron route reports `persisted: false` and the run still
// counts as clean (the figures are in the response body either way).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { TractionSnapshot } from "./snapshot";
import { TRACTION_HISTORY_FILE, TRACTION_SNAPSHOT_FILE } from "./status";

export async function persistTractionSnapshot(snapshot: TractionSnapshot, root: string = process.cwd()): Promise<boolean> {
  try {
    const latest = path.join(root, TRACTION_SNAPSHOT_FILE);
    await fs.mkdir(path.dirname(latest), { recursive: true });
    await fs.writeFile(latest, JSON.stringify(snapshot, null, 2) + "\n");
    await fs.appendFile(path.join(root, TRACTION_HISTORY_FILE), JSON.stringify(snapshot) + "\n");
    return true;
  } catch (err) {
    console.error("[blockid:traction] snapshot write failed", err instanceof Error ? err.message : err);
    return false;
  }
}
