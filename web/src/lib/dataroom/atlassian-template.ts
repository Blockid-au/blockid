// Atlassian data-room template — phase-ordered projection of the
// showcase fixture's `dataRoomRows`.
//
// Pure transformation module (no I/O). Used by:
//   - web/src/lib/dataroom/populate.ts  — seeds a founder's data room
//   - web/src/app/api/dataroom/populate-from-template/route.ts
//
// Source of truth is web/src/lib/showcase/atlassian/fixture.ts. This
// module never invents new template rows — it re-orders the fixture
// rows by (a) folder order in DATA_ROOM_STRUCTURE, then (b) phase
// order (1..12) inside each folder — so the placeholders seeded into
// dataroom_files render in chronological "day-0 → exit" reading order
// on the founder's dashboard.

import { ATLASSIAN_DEMO } from "@/lib/showcase/atlassian/fixture";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";

export type DataRoomTemplateRow = {
  /** One of DATA_ROOM_STRUCTURE `name` values ("1. Corporate & Legal" etc). */
  category: string;
  title: string;
  /** Stringified 12-phase ordinal, "1".."12". */
  phaseSlug: string;
  sourceUrl?: string;
  /** How the Atlassian reference itself stands — used for founder UX copy. */
  status_in_reference: "present" | "redacted" | "inferred";
};

// Category → sort order derived from DATA_ROOM_STRUCTURE so we don't
// re-hard-code folder names here (data-room-templates.ts is the taxonomy
// source of truth per docs/plans/atlassian-standard-mapping-goal.md §2).
const CATEGORY_ORDER: Map<string, number> = new Map(
  DATA_ROOM_STRUCTURE.map((folder, index) => [folder.name, index]),
);

function categoryRank(name: string): number {
  const idx = CATEGORY_ORDER.get(name);
  return idx === undefined ? Number.MAX_SAFE_INTEGER : idx;
}

function phaseRank(slug: string): number {
  const n = Number.parseInt(slug, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

// Build once at module load. `dataRoomRows` is ~65 items so an in-memory
// sort is trivially fast; caching keeps the transform O(1) for callers.
export const ATLASSIAN_DATAROOM_TEMPLATE: DataRoomTemplateRow[] = [
  ...ATLASSIAN_DEMO.dataRoomRows,
]
  .map<DataRoomTemplateRow>((row) => ({
    category: row.category,
    title: row.title,
    phaseSlug: row.phaseSlug,
    sourceUrl: row.sourceUrl,
    status_in_reference: row.status,
  }))
  .sort((a, b) => {
    const c = categoryRank(a.category) - categoryRank(b.category);
    if (c !== 0) return c;
    const p = phaseRank(a.phaseSlug) - phaseRank(b.phaseSlug);
    if (p !== 0) return p;
    // Stable tie-break on title so re-imports don't shuffle rows.
    return a.title.localeCompare(b.title);
  });

/**
 * Get all template rows for a specific numeric phase slug ("1".."12").
 * Returns rows in the same (category, title) order as
 * ATLASSIAN_DATAROOM_TEMPLATE.
 */
export function templateRowsForPhase(
  phaseSlug: string,
): DataRoomTemplateRow[] {
  return ATLASSIAN_DATAROOM_TEMPLATE.filter((r) => r.phaseSlug === phaseSlug);
}

/**
 * Get every template row that is first-needed at or before the given
 * numeric phase — used by the nudge engine to compute the missing set
 * for a founder currently sitting at phase N.
 */
export function templateRowsUpToPhase(
  phaseSlug: string,
): DataRoomTemplateRow[] {
  const cutoff = phaseRank(phaseSlug);
  return ATLASSIAN_DATAROOM_TEMPLATE.filter(
    (r) => phaseRank(r.phaseSlug) <= cutoff,
  );
}
