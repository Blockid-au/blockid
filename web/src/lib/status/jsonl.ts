// G15-R2 — tiny shared reader for the content/reports/*.jsonl tails that the
// /api/status v2 sections are built from. Never throws: a missing, unreadable
// or half-written file yields an empty array, a bad line is skipped.

import { promises as fs } from "node:fs";
import path from "node:path";

export const REPORTS_DIR = path.join("content", "reports");

// Post-ship review 2026-09-18 (P1): on production `process.cwd()` is
// `/data/releases/<BUILD_ID>` — a build-time COPY of web/content that the
// crons (error-digest, latency-sample, backups, cron-runner) never write to.
// Read the live checkout instead, like `lib/project-state.ts` does.
// Resolved lazily (route tests mock `node:fs` without `existsSync`).
const LIVE_WEB_DIR = "/home/dovanlong/blockid.au/web";
let statusRoot: string | null = null;
export function getStatusRoot(): string {
  if (statusRoot) return statusRoot;
  if (process.env.BLOCKID_WEB_DIR) return (statusRoot = process.env.BLOCKID_WEB_DIR);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    statusRoot = existsSync(path.join(LIVE_WEB_DIR, REPORTS_DIR)) ? LIVE_WEB_DIR : process.cwd();
  } catch {
    statusRoot = process.cwd();
  }
  return statusRoot;
}

export async function readJsonlTail<T = Record<string, unknown>>(root: string, file: string, maxLines: number): Promise<T[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(root, REPORTS_DIR, file), "utf8");
  } catch {
    return [];
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(-maxLines);
  const out: T[] = [];
  for (const line of lines) {
    try {
      const v = JSON.parse(line) as unknown;
      if (v && typeof v === "object" && !Array.isArray(v)) out.push(v as T);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

export async function readJsonFile<T = Record<string, unknown>>(root: string, rel: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(root, rel), "utf8");
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

/** ISO string → epoch ms, NaN when not a date. */
export function tsMs(v: unknown): number {
  return typeof v === "string" ? new Date(v).getTime() : Number.NaN;
}

/** True when `v` is a timestamp inside the last `ms` (5 min of clock skew tolerated). */
export function withinLast(v: unknown, ms: number, now: number): boolean {
  const t = tsMs(v);
  return Number.isFinite(t) && now - t <= ms && t <= now + 5 * 60_000;
}
