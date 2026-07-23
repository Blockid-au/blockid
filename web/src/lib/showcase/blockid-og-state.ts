// Iteration-8 T3 — thin, defensive helper for the /showcase/blockid OG +
// Twitter-card routes. Reads the same on-disk artefacts that page.tsx uses
// (milestone-report-state.json + reports/*.md) to derive the current phase,
// but returns `null` on any I/O or parse failure so the OG image always
// renders (a preview card with a fallback badge is strictly better than a
// 500 from the metadata pipeline).
//
// Intentionally does not import `summarisePublicView` — that path pulls in
// the whole report-tagging graph. Here we only need the highest phase
// ordinal observed across recent report filenames, which is much cheaper.

import { promises as fs } from "node:fs";
import path from "node:path";
import { buildShowcaseDataRoomRows } from "@/lib/showcase/report-tagging";

const REPORT_DIR_CANDIDATES = [
  ["web", "content", "reports"],
  ["content", "reports"],
] as const;

export async function readShowcaseCurrentPhase(): Promise<number | null> {
  for (const parts of REPORT_DIR_CANDIDATES) {
    try {
      const dir = path.join(process.cwd(), ...parts);
      const entries = await fs.readdir(dir);
      const markdown = entries.filter((f) => f.endsWith(".md"));
      if (markdown.length === 0) continue;
      const rows = buildShowcaseDataRoomRows({
        filenames: markdown,
        includeTemplates: false,
      });
      let max: number | null = null;
      for (const row of rows) {
        if (row.phase_at_generation === null) continue;
        if (max === null || row.phase_at_generation > max) {
          max = row.phase_at_generation;
        }
      }
      return max;
    } catch {
      // try next candidate
    }
  }
  return null;
}
