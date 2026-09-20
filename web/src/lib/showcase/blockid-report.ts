// BlockID's own Trusted Business Report — the public showcase read (G19-S46,
// docs/plans/g19-report-quality-2026-09-20.md §0 row 6).
//
// `scripts/run-self-analysis.mjs --report` runs the same
// `runTrustReportForProject(tier: "standard")` every founder gets on
// BlockID's canonical project and persists the ReportV2 on that day's
// `svi_snapshots` row. `/showcase/blockid/report` renders the NEWEST snapshot
// of that project that stores a `report_v2` — never an adapter projection of
// a bare weekly re-score — through this loader:
//
//   * the project id is fixed (env `BLOCKID_SHOWCASE_PROJECT_ID` overrides —
//     the script prints which project it resolved so drift is visible);
//   * one data-cache entry, 1 h (`unstable_cache`, tag
//     `showcase-blockid-report`), with the direct read as the fallback
//     outside the Next runtime (vitest, scripts) — the lib/startup-index-cache
//     pattern;
//   * 42P01 / no DB / no report → `null` → the page renders its "not
//     published yet" empty state (never a 500, never a demo fixture passed
//     off as ours).

import "server-only";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { unstable_cache } from "next/cache";
import { loadLatestReportV2ForProject, type LoadedReportV2 } from "@/lib/report-v2/load";
import type { ReportV2 } from "@/lib/report-v2/schema";

/** "Blockid.au 1" — admin@blockid.au's project with the longest snapshot history (180 rows on 2026-09-20). */
export const BLOCKID_SHOWCASE_PROJECT_ID_DEFAULT = "2bf55234-e359-4390-8faa-06597824f77a";
export const BLOCKID_SHOWCASE_REPORT_CACHE_TAG = "showcase-blockid-report";
/** Matches the page's `revalidate = 3600`. */
export const BLOCKID_SHOWCASE_REPORT_CACHE_SECONDS = 3600;
export const BLOCKID_SHOWCASE_STARTUP_NAME = `BlockID.au (${LEGAL_ENTITY.operator})`;

export function blockidShowcaseProjectId(): string {
  const fromEnv = process.env.BLOCKID_SHOWCASE_PROJECT_ID?.trim();
  return fromEnv || BLOCKID_SHOWCASE_PROJECT_ID_DEFAULT;
}

/** What the page needs — JSON-serialisable so the data cache can hold it. */
export interface BlockidShowcaseReport {
  report: ReportV2;
  snapshotId: string;
  /** ISO of the pipeline run (ReportV2.generatedAt). */
  generatedAt: string;
}

export function toShowcasePayload(loaded: LoadedReportV2 | null): BlockidShowcaseReport | null {
  if (!loaded || loaded.path !== "stored") return null;
  return { report: loaded.report, snapshotId: loaded.snapshotId, generatedAt: loaded.report.generatedAt };
}

/** Uncached read (the cron / script side, tests). Never throws. */
export async function readBlockidShowcaseReport(projectId: string = blockidShowcaseProjectId()): Promise<BlockidShowcaseReport | null> {
  try {
    const loaded = await loadLatestReportV2ForProject(projectId, { startupName: BLOCKID_SHOWCASE_STARTUP_NAME, locale: "en" });
    return toShowcasePayload(loaded);
  } catch {
    return null;
  }
}

function isOutsideNextRuntime(err: unknown): boolean {
  return err instanceof Error && /incrementalCache missing/.test(err.message);
}

const cachedRead = unstable_cache((projectId: string) => readBlockidShowcaseReport(projectId), ["showcase-blockid-report"], {
  tags: [BLOCKID_SHOWCASE_REPORT_CACHE_TAG],
  revalidate: BLOCKID_SHOWCASE_REPORT_CACHE_SECONDS,
});

/** The page read: data-cached 1 h; direct read outside the Next runtime; null on any failure. */
export async function loadBlockidShowcaseReport(projectId: string = blockidShowcaseProjectId()): Promise<BlockidShowcaseReport | null> {
  try {
    return await cachedRead(projectId);
  } catch (err) {
    if (isOutsideNextRuntime(err)) return readBlockidShowcaseReport(projectId);
    return null;
  }
}
