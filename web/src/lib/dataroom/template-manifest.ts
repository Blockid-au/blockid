// Data-room template manifest — single source of truth for the 10 Day-0
// minimum-viable dataroom docs shipped on startup creation.
//
// Consumed by:
//   - web/src/lib/dataroom/seed-templates.ts  — uploads bytes + inserts rows
//   - web/public/templates/README.md          — human-readable inventory
//   - web/src/lib/dataroom/seed-templates.test.ts
//
// Contract:
//   • Exactly 10 entries. Slugs are stable and unique.
//   • Every `category` MUST be an existing DATA_ROOM_STRUCTURE folder name
//     (validated by test — mirrors the invariant in atlassian-template.ts).
//   • `phaseSlug` ∈ "1".."12" mapping to the platform growth-phases doc.
//   • `size_bytes_max` is the CI hard-cap per file (200 KB). Manifest
//     bumps + source-file edits + deploy = re-seed job picks up new version
//     on next founder-digest tick (follow-up ticket).
//
// NOT LEGAL ADVICE — every .docx ships with a red banner and requires
// founder / lawyer review before external use.

export interface TemplateEntry {
  /** Stable, kebab-case identifier used as `dataroom_files.template_slug`. */
  readonly slug: string;
  /** Source-of-truth filename under web/public/templates/. */
  readonly filename: string;
  /** MIME type stamped onto dataroom_files.mime_type on upload. */
  readonly mime: string;
  /** DATA_ROOM_STRUCTURE folder name — e.g. "1. Corporate & Legal". */
  readonly category: string;
  /** 12-phase ordinal ("1".."12") from platform_growth_phases. */
  readonly phaseSlug: string;
  /** CI-enforced upper bound in bytes. */
  readonly size_bytes_max: number;
  /** Bump when the source file's content materially changes. */
  readonly version: string;
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SIZE_CAP = 200_000;
const V1 = "v1";

export const DATAROOM_TEMPLATE_MANIFEST: readonly TemplateEntry[] = [
  {
    slug: "pitch-deck",
    filename: "pitch-deck.docx",
    mime: DOCX_MIME,
    category: "1. Corporate & Legal",
    phaseSlug: "1",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
  {
    slug: "cap-table",
    filename: "cap-table.xlsx",
    mime: XLSX_MIME,
    category: "2. Cap Table & Equity",
    phaseSlug: "3",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
  {
    slug: "financial-model",
    filename: "financial-model.xlsx",
    mime: XLSX_MIME,
    category: "3. Financial Projections",
    phaseSlug: "4",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
  {
    slug: "term-sheet",
    filename: "term-sheet.docx",
    mime: DOCX_MIME,
    category: "2. Cap Table & Equity",
    phaseSlug: "7",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
  {
    slug: "safe",
    filename: "safe.docx",
    mime: DOCX_MIME,
    category: "2. Cap Table & Equity",
    phaseSlug: "7",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
  {
    slug: "sha",
    filename: "sha.docx",
    mime: DOCX_MIME,
    category: "2. Cap Table & Equity",
    phaseSlug: "7",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
  {
    slug: "esop-plan",
    filename: "esop-plan.docx",
    mime: DOCX_MIME,
    category: "2. Cap Table & Equity",
    phaseSlug: "5",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
  {
    slug: "ip-assignment",
    filename: "ip-assignment.docx",
    mime: DOCX_MIME,
    category: "7. IP & Compliance",
    phaseSlug: "2",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
  {
    slug: "employment-contract",
    filename: "employment-contract.docx",
    mime: DOCX_MIME,
    category: "6. Team & Advisors",
    phaseSlug: "5",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
  {
    slug: "board-consent",
    filename: "board-consent.docx",
    mime: DOCX_MIME,
    category: "1. Corporate & Legal",
    phaseSlug: "3",
    size_bytes_max: SIZE_CAP,
    version: V1,
  },
] as const;

/** Convenience — resolve a manifest entry by its stable slug. */
export function findTemplateBySlug(slug: string): TemplateEntry | undefined {
  return DATAROOM_TEMPLATE_MANIFEST.find((t) => t.slug === slug);
}

/** Storage-path builder (kept here so tests can pin the exact layout). */
export function templateStoragePath(
  projectId: string,
  entry: Pick<TemplateEntry, "filename" | "version">,
): string {
  return `startup-${projectId}/templates/${entry.version}/${entry.filename}`;
}
