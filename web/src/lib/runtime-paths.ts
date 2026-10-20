// L1-3 (2026-10-20) — ONE place that decides where mutable runtime state lives.
//
// On production the server's `process.cwd()` is the frozen release copy
// `/data/releases/<BUILD_ID>` (G30 origin units: WorkingDirectory=<release>).
// Anything the crons write (content/reports/*.json(l): backtest, calibration,
// traction, audit-chain, backups, deploy-log, cron-health, ga4, …) lands in
// the LIVE web checkout, and anything the server itself writes under the
// release dir is lost on the next deploy. So:
//
//   runtimeReportsPath(...)  — content/reports/** that crons or the server
//                              write at runtime (READ and WRITE through this)
//   runtimeContentPath(...)  — any other mutable content/** runtime state
//   releaseContentPath(...)  — immutable content bundled with THIS release
//                              (version.json, schema-migrations.json, legal,
//                              insights, seeds) — deliberately process.cwd()
//
// Web dir resolution (getRuntimeWebDir):
//   1. BLOCKID_WEB_DIR (set for every G30 origin by g30-supervised-launch.py
//      and by start-production.sh);
//   2. the documented live checkout /home/dovanlong/blockid.au/web, only when
//      it exists AND contains content/reports;
//   3. process.cwd() (dev / CI / a fresh checkout).
//
// Guard: src/lib/runtime-paths.test.ts fails when new code joins
// process.cwd() with "content/reports".

import path from "node:path";

export const DEFAULT_LIVE_WEB_DIR = "/home/dovanlong/blockid.au/web";

let fallbackRoot: string | null = null;

/** Absolute web dir that holds the mutable runtime content (see header). */
export function getRuntimeWebDir(): string {
  const env = process.env.BLOCKID_WEB_DIR?.trim();
  if (env) return env;
  if (fallbackRoot) return fallbackRoot;
  try {
    // Resolved lazily via require: route tests mock `node:fs` without
    // `existsSync`, and a missing export must degrade to cwd, not throw.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    fallbackRoot = existsSync(path.join(DEFAULT_LIVE_WEB_DIR, "content", "reports")) ? DEFAULT_LIVE_WEB_DIR : process.cwd();
  } catch {
    fallbackRoot = process.cwd();
  }
  return fallbackRoot;
}

/** Test hook: forget the cached fallback (env is read on every call anyway). */
export function resetRuntimeWebDirCache(): void {
  fallbackRoot = null;
}

/** `<runtime web dir>/content/<...segments>` — mutable runtime content. */
export function runtimeContentPath(...segments: string[]): string {
  return path.join(getRuntimeWebDir(), "content", ...segments);
}

/** `<runtime web dir>/content/reports/<...segments>` — cron/server-written reports. */
export function runtimeReportsPath(...segments: string[]): string {
  return runtimeContentPath("reports", ...segments);
}

/** `<process.cwd()>/content/<...segments>` — immutable content shipped with this release. */
export function releaseContentPath(...segments: string[]): string {
  return path.join(process.cwd(), "content", ...segments);
}
