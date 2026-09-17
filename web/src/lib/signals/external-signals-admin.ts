/**
 * /admin/external-signals data loader (G14-S40). Reads the allow-list
 * (external_sources), per-source / per-signal-type row counts and the last
 * ingest summary (content/reports/external-signals-latest.json). Every read
 * is 42P01-guarded: before 0410 is applied the page shows the code
 * catalogue with a "table missing" banner and zero counts.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { EXTERNAL_SIGNAL_TYPES } from "./external-signals";
import { loadExternalSources, type ExternalSourceRow } from "./external-sources";

export const EXTERNAL_SIGNALS_SUMMARY_FILE = "content/reports/external-signals-latest.json";
export const EXTERNAL_SIGNALS_HISTORY_FILE = "content/reports/external-signals-history.jsonl";

export interface IngestSummarySource {
  id: string;
  status: string;
  licence?: string | null;
  file?: string | null;
  parsed: number;
  kept: number;
  filtered_out: number;
  duplicates: number;
  inserted: number;
  row_count?: number | null;
  error?: string | null;
}

export interface IngestSummary {
  ok: boolean;
  dry: boolean;
  ran_at: string;
  db: boolean;
  allow_set_size: number;
  allow_set?: Record<string, number>;
  sources: IngestSummarySource[];
  totals: { parsed: number; kept: number; inserted: number; duplicates: number; refused: number; errors: number };
  error?: string | null;
}

export interface ExternalSignalsAdminData {
  sources: ExternalSourceRow[];
  fromDb: boolean;
  sourcesError: string | null;
  /** source id → signal_type → rows */
  counts: Record<string, Record<string, number>>;
  totalRows: number;
  distinctAbns: number | null;
  summary: IngestSummary | null;
  summaryError: string | null;
  historyLines: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any };

/** The last run summary as the CLI wrote it (null when absent / unparseable). */
export function readIngestSummary(root: string = process.cwd()): { summary: IngestSummary | null; error: string | null; historyLines: number } {
  const file = path.join(root, EXTERNAL_SIGNALS_SUMMARY_FILE);
  const history = path.join(root, EXTERNAL_SIGNALS_HISTORY_FILE);
  let historyLines = 0;
  try {
    if (existsSync(history)) historyLines = readFileSync(history, "utf8").split("\n").filter((l) => l.trim()).length;
  } catch {
    historyLines = 0;
  }
  if (!existsSync(file)) return { summary: null, error: "no run yet (content/reports/external-signals-latest.json missing)", historyLines };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as IngestSummary;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sources)) return { summary: null, error: "summary file is not an ingest summary", historyLines };
    return { summary: parsed, error: null, historyLines };
  } catch (e) {
    return { summary: null, error: e instanceof Error ? e.message : String(e), historyLines };
  }
}

async function headCount(db: Db, sourceId: string, signalType: string): Promise<number | null> {
  try {
    const { count, error } = await db.from("external_signals").select("id", { count: "exact", head: true }).eq("source_id", sourceId).eq("signal_type", signalType);
    if (error) return null;
    return typeof count === "number" ? count : 0;
  } catch {
    return null;
  }
}

export async function loadExternalSignalsAdmin(db: Db | null | undefined, root: string = process.cwd()): Promise<ExternalSignalsAdminData> {
  const { rows, fromDb, error } = await loadExternalSources(db);
  const counts: Record<string, Record<string, number>> = {};
  let totalRows = 0;
  if (db && fromDb) {
    for (const s of rows) {
      if (s.status === "cite_only") continue;
      counts[s.id] = {};
      for (const t of EXTERNAL_SIGNAL_TYPES) {
        const n = await headCount(db, s.id, t);
        if (n) {
          counts[s.id][t] = n;
          totalRows += n;
        }
      }
    }
  }
  const { summary, error: summaryError, historyLines } = readIngestSummary(root);
  return { sources: rows, fromDb, sourcesError: error, counts, totalRows, distinctAbns: null, summary, summaryError, historyLines };
}
