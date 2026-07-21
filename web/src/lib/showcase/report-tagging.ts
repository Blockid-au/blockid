// Track B B1 — pure filename → DataRoom tag mapper for web/content/reports/*.md.
// No I/O; caller supplies the file list. Keeps the ingest cron testable.

export type ShowcaseAgent =
  | "ceo"
  | "cto"
  | "cfo"
  | "cmo"
  | "coo"
  | "cpo"
  | "cdo"
  | "chro"
  | "ciso"
  | "clo"
  | "cro"
  | "cso"
  | "ccso"
  | "ir"
  | "qa"
  | "rnd"
  | "customer-care"
  | "ops"
  | "perf"
  | "security"
  | "unknown";

export type ShowcaseReportKind =
  | "daily"
  | "review"
  | "milestone"
  | "audit"
  | "regression"
  | "self-analysis"
  | "vision"
  | "operations"
  | "knowledge-base"
  | "template"
  | "architecture"
  | "plan"
  | "priorities"
  | "cleanup"
  | "snapshot"
  | "misc";

export interface ShowcaseReportTag {
  filename: string;
  agent: ShowcaseAgent;
  kind: ShowcaseReportKind;
  phase_at_generation: number | null; // 1..12 growth phases; null for cross-cutting/system files
  generated_at: string | null;         // ISO date string when derivable from filename YYYY-MM-DD
  version: string | null;              // e.g. "v2.0.0-beta.6" or "v3.0.0" when in filename
  is_template: boolean;
  tags: string[];                      // additional labels for the DataRoom UI
}

const DATE_RX = /(\d{4})-(\d{2})-(\d{2})/;
const VERSION_RX = /(v\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.]+)?)/;

// Agent slug → C-Level role. "customer care" gets normalised to a slug too.
const AGENT_PREFIXES: Array<[RegExp, ShowcaseAgent]> = [
  [/^ceo\b/, "ceo"],
  [/^cto\b/, "cto"],
  [/^cfo\b/, "cfo"],
  [/^cmo\b/, "cmo"],
  [/^coo\b/, "coo"],
  [/^cpo\b/, "cpo"],
  [/^cdo\b/, "cdo"],
  [/^chro\b/, "chro"],
  [/^ciso\b/, "ciso"],
  [/^clo\b/, "clo"],
  [/^cro-cmo\b/, "cro"],
  [/^cro\b/, "cro"],
  [/^ccso\b/, "ccso"],
  [/^cso\b/, "cso"],
  [/^ir\b/, "ir"],
  [/^qa\b/, "qa"],
  [/^rnd\b/, "rnd"],
  [/^customer[\s-]care\b/, "customer-care"],
  [/^ops\b/, "ops"],
  [/^perf\b/, "perf"],
  [/^security\b/, "security"],
];

// C-Level → default 12-phase mapping (from plan U.9 journey matrix).
// A file lacking a more specific phase falls back to this.
const AGENT_PHASE: Record<ShowcaseAgent, number | null> = {
  ceo: null,        // cross-cutting — no single phase
  cmo: 3,           // Market Research
  cdo: 5,           // PMF signals & data quality
  cto: 4,           // MVP / architecture
  cfo: 6,           // Revenue / financial model
  chro: 8,          // Team & ESOP
  ciso: 10,         // Security / legal red flags (fundraise)
  clo: 10,          // Legal / term sheet review
  cro: 7,           // Growth / conversion
  cso: 2,           // Strategy / validation
  ccso: 2,          // Combined chief strategy officer
  cpo: 4,           // Product discovery
  coo: 11,          // Ops / post-funding scale
  ir: 9,            // Funding-ready
  qa: null,
  rnd: null,
  "customer-care": null,
  ops: null,
  perf: null,
  security: null,
  unknown: null,
};

function stripExt(name: string): string {
  return name.replace(/\.md$/i, "");
}

function extractDate(name: string): string | null {
  const m = name.match(DATE_RX);
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  // Cross-check the round-trip (guards Feb 30 etc.).
  if (dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function extractVersion(name: string): string | null {
  const m = name.match(VERSION_RX);
  return m ? m[1] : null;
}

function detectAgent(basename: string): ShowcaseAgent {
  const lower = basename.toLowerCase();
  for (const [rx, agent] of AGENT_PREFIXES) {
    if (rx.test(lower)) return agent;
  }
  return "unknown";
}

function detectKind(basename: string): ShowcaseReportKind {
  const lower = basename.toLowerCase();
  if (lower.startsWith("_") || /\btemplate\b/.test(lower)) return "template";
  if (/\bdaily\b/.test(lower)) return "daily";
  if (/\breview\b/.test(lower)) return "review";
  if (/\bmilestone\b/.test(lower)) return "milestone";
  if (/\baudit\b/.test(lower)) return "audit";
  if (/\bregression\b/.test(lower)) return "regression";
  if (/\bself-analysis\b/.test(lower)) return "self-analysis";
  if (/\bvision\b/.test(lower)) return "vision";
  if (/\boperations\b/.test(lower)) return "operations";
  if (/\bknowledge-base\b/.test(lower)) return "knowledge-base";
  if (/\barchitecture\b/.test(lower)) return "architecture";
  if (/\bimplementing-plan\b|\bplan\b/.test(lower)) return "plan";
  if (/\bpriorities\b/.test(lower)) return "priorities";
  if (/\bcleanup\b/.test(lower)) return "cleanup";
  if (/\bsnapshot\b/.test(lower)) return "snapshot";
  return "misc";
}

// Cross-cutting filenames route to canonical phases even when no agent prefix hits.
// This keeps the DataRoom's phase bucket meaningful for the 15+ ungrouped files.
function inferPhaseFromKind(kind: ShowcaseReportKind, basename: string): number | null {
  const lower = basename.toLowerCase();
  if (kind === "milestone") return 11;      // post-funding scale
  if (kind === "vision") return 1;          // Day-0 Idea
  if (kind === "architecture") return 4;    // MVP / Product Discovery
  if (kind === "plan") return 1;            // strategic/planning artefact
  if (kind === "audit" && /\b404\b/.test(lower)) return 4;
  if (kind === "audit" && /\bperf\b/.test(lower)) return 7;
  if (kind === "audit" && /\bsecurity\b/.test(lower)) return 10;
  if (kind === "regression") return 4;      // stability during MVP iteration
  if (kind === "self-analysis") return 2;   // idea validation feedback loop
  if (kind === "priorities") return 1;      // roadmap grooming
  if (kind === "cleanup") return null;
  if (kind === "snapshot") return null;
  if (kind === "operations") return 11;
  if (kind === "knowledge-base") return null;
  return null;
}

export function parseReportFilename(filename: string): ShowcaseReportTag {
  const basename = stripExt(filename);
  const agent = detectAgent(basename);
  const kind = detectKind(basename);
  const generated_at = extractDate(basename);
  const version = extractVersion(basename);
  const is_template = kind === "template";

  const phase_at_generation =
    inferPhaseFromKind(kind, basename) ?? AGENT_PHASE[agent] ?? null;

  const tags: string[] = [];
  if (agent !== "unknown") tags.push(`agent:${agent}`);
  if (kind !== "misc") tags.push(`kind:${kind}`);
  if (version) tags.push(`version:${version}`);
  if (generated_at) tags.push(`date:${generated_at}`);
  if (phase_at_generation !== null) tags.push(`phase:${phase_at_generation}`);

  return {
    filename,
    agent,
    kind,
    phase_at_generation,
    generated_at,
    version,
    is_template,
    tags,
  };
}

// Batch helper — turns a list of file paths (or basenames) into DataRoom-ready rows.
// Templates are filtered out by default (they belong in the /guide/reports gallery,
// not the founder's DataRoom for the BlockID.au showcase workspace).
export interface BuildDataRoomInput {
  filenames: string[];
  includeTemplates?: boolean;
}

export interface DataRoomShowcaseRow {
  source_path: string;         // web/content/reports/<filename>
  filename: string;
  title: string;               // human-friendly display name
  generated_by_agent: ShowcaseAgent;
  phase_at_generation: number | null;
  generated_at: string | null;
  version: string | null;
  tags: string[];
}

function toTitle(basename: string): string {
  return basename
    .replace(/^_+/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildShowcaseDataRoomRows(
  input: BuildDataRoomInput,
): DataRoomShowcaseRow[] {
  const includeTemplates = input.includeTemplates ?? false;
  const rows: DataRoomShowcaseRow[] = [];
  for (const filename of input.filenames) {
    const basename = filename.split("/").pop() ?? filename;
    const tag = parseReportFilename(basename);
    if (tag.is_template && !includeTemplates) continue;
    rows.push({
      source_path: `web/content/reports/${basename}`,
      filename: basename,
      title: toTitle(stripExt(basename)),
      generated_by_agent: tag.agent,
      phase_at_generation: tag.phase_at_generation,
      generated_at: tag.generated_at,
      version: tag.version,
      tags: tag.tags,
    });
  }
  // Newest-first by generated_at (nulls last), then filename asc for stable order.
  rows.sort((a, b) => {
    if (a.generated_at && b.generated_at) return b.generated_at.localeCompare(a.generated_at);
    if (a.generated_at) return -1;
    if (b.generated_at) return 1;
    return a.filename.localeCompare(b.filename);
  });
  return rows;
}
