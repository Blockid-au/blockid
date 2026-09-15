// S32-C — "which model wrote the last report".
//
// The first-analysis job records the provider + model that served each
// section when a report finishes; the newest record is kept in
// content/reports/ai-last-report.json so `/api/status` can publish
// `ai_last_report_provider` (trusted callers only) and ops can see at a
// glance whether reports are landing on the quality-cost tier or falling
// through to the free tiers. Never key material — provider ids, model ids,
// an analysis id and timestamps only.

import * as fs from "fs";
import * as path from "path";

export const LAST_REPORT_REL = path.join("content", "reports", "ai-last-report.json");
export const LAST_REPORT_FILE = path.join("/home/dovanlong/blockid.au/web", LAST_REPORT_REL);

export interface LastReportProvider {
  /** ISO — when the report finished. */
  at: string;
  analysis_id: string;
  /** The provider + model that wrote the most sections. */
  provider: string;
  model: string;
  /** Distinct "model via provider" labels, most-used first. */
  models: string[];
  /** Per section: provider + model + task class. */
  sections: Record<string, { provider: string; model: string; task_class: string }>;
  /** How many sections were written / failed in that run. */
  sections_written: number;
  sections_failed: number;
}

export function writeLastReportProvider(rec: LastReportProvider, file: string = LAST_REPORT_FILE): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
    fs.renameSync(tmp, file);
  } catch {
    /* fail-open — observability must never fail a report */
  }
}

/** Read the last record for /api/status; null when no report has finished yet. */
export async function readLastReportProvider(root: string = process.cwd()): Promise<LastReportProvider | null> {
  for (const file of [path.join(root, LAST_REPORT_REL), LAST_REPORT_FILE]) {
    try {
      const raw = await fs.promises.readFile(file, "utf-8");
      const parsed = JSON.parse(raw) as LastReportProvider;
      if (parsed && typeof parsed === "object" && typeof parsed.provider === "string") return parsed;
    } catch { /* try the next location */ }
  }
  return null;
}
