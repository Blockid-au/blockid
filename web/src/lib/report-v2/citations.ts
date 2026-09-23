// citations — G24-A: the inline `[ev:<id>]` / `[unevidenced]` markers the
// pipeline stores in ReportV2 prose (§5.4 claim gate, auto-cite, verdict
// trim) become numbered footnotes at RENDER time. The markers stay in the
// stored text exactly as written — `grounding.ts` and the llm-auditor keep
// reading them — this module only decides how a surface shows them:
//
//   parseCitations(text, index)   → segments { text } | { cite n … } | { unevidenced }
//   buildCitationIndex(report)    → one stable numbering per report: first
//                                   appearance in reading order (executive →
//                                   chapters → valuation → plan), one number
//                                   per evidence-register row, unknown ids
//                                   render nothing (never the raw marker)
//   citationEntries(index)        → the "Evidence cited" appendix rows
//   citationsToPlainText(text, …) → the same projection as one string
//                                   ("… grew 4.5 % [1]") for plain contexts
//
// Pure; client-safe; no I/O, no React. The web (`components/tbr/v2/
// shared.tsx`), the PDF twin and the DOCX twin all render from these
// segments so every surface prints the same numbers.

import type { EvidenceConfidence, EvidenceRow, EvidenceSource, ReportV2 } from "./schema";

/** One footnote row: the register row behind footnote `n`. */
export interface CitationEntry {
  n: number;
  id: string;
  label: string;
  /** The evidence-ladder rung the register row carries (null on rows stored before S43). */
  level: EvidenceConfidence | null;
  source: EvidenceSource;
  status: EvidenceRow["status"];
  /** ISO date (yyyy-mm-dd) or null when the row has no observation date. */
  observedAt: string | null;
}

export type CitationSegment = { kind: "text"; text: string } | { kind: "cite"; n: number; id: string; label: string; level: EvidenceConfidence | null } | { kind: "unevidenced" };

/**
 * The per-report numbering. `numberFor` assigns lazily (first appearance
 * wins) so a text field the pre-walk missed still gets a number as long as
 * it is rendered before the appendix; `entries` lists every number assigned
 * so far in numeric order.
 */
export interface CitationIndex {
  /** The register row for `id`, numbered on first request; null for an id that is not in the register. */
  numberFor(id: string): CitationEntry | null;
  /** Read-only: the row for an id that already has a number (never assigns). */
  peek(id: string): CitationEntry | null;
  entries(): CitationEntry[];
  /** How many distinct rows have been cited. */
  readonly size: number;
}

/** `[ev:<id>]` — same shape as `claim-gate.ts` EV_MARKER_RE; `[unevidenced]` / `[uncited]` are the explicit "cannot cite" admissions. */
const MARKER_SOURCE = "\\[(?:ev:\\s*([^\\]]+?)\\s*|(unevidenced|uncited))\\]";
/** Fresh per call: a shared global regex would leak `lastIndex` into `matchAll` clones. */
const markerRe = () => new RegExp(MARKER_SOURCE, "gi");
const MARKER_TEST_RE = new RegExp(MARKER_SOURCE, "i");

function normaliseId(id: string): string {
  return id.trim().toLowerCase();
}

/** A numbering over an evidence register (chapter rows + appendix rows are the same ids). */
export function createCitationIndex(register: readonly EvidenceRow[]): CitationIndex {
  const rows = new Map<string, EvidenceRow>();
  for (const r of register) if (!rows.has(normaliseId(r.evidence_id))) rows.set(normaliseId(r.evidence_id), r);
  const assigned = new Map<string, CitationEntry>();
  const entryOf = (row: EvidenceRow, n: number): CitationEntry => ({
    n,
    id: row.evidence_id,
    label: row.label,
    level: row.confidence ?? null,
    source: row.source,
    status: row.status,
    observedAt: row.observedAt ? row.observedAt.slice(0, 10) : null,
  });
  return {
    numberFor(id) {
      const key = normaliseId(id);
      const hit = assigned.get(key);
      if (hit) return hit;
      const row = rows.get(key);
      if (!row) return null;
      const entry = entryOf(row, assigned.size + 1);
      assigned.set(key, entry);
      return entry;
    },
    peek(id) {
      return assigned.get(normaliseId(id)) ?? null;
    },
    entries() {
      return [...assigned.values()].sort((a, b) => a.n - b.n);
    },
    get size() {
      return assigned.size;
    },
  };
}

/** The register every ReportV2 surface cites against: the appendix rows plus every chapter row (same ids, appendix first). */
export function citationRegister(report: Pick<ReportV2, "appendix" | "dimensions">): EvidenceRow[] {
  return [...report.appendix.evidenceRegister, ...report.dimensions.flatMap((d) => d.evidence)];
}

/**
 * Every prose field a surface renders, in reading order (executive → chapters
 * → valuation → action plan → cover questions). Walking this list numbers
 * the footnotes deterministically before any surface renders a paragraph.
 */
export function citedTextFields(report: ReportV2): string[] {
  const out: string[] = [];
  const x = report.executive.structured;
  if (x) {
    out.push(x.headline, ...x.summary, x.keyInsight ?? "");
    for (const r of x.reasonsToBack) out.push(r.title, r.body);
    for (const g of x.criticalGaps) out.push(g.title, g.body);
    out.push(x.phaseNow.blocker, x.phaseNow.whatItTakes, x.verdict.condition ?? "");
    for (const a of x.actions) out.push(a.title, a.detail);
  } else {
    out.push(report.executive.thesis);
  }
  for (const d of report.dimensions) {
    out.push(d.verdict);
    for (const c of d.criteria) out.push(c.verdict, ...c.strengths, ...c.gaps, c.nextAction);
    out.push(...d.strengths, ...d.gaps, d.nextAction.title, d.phaseLens.whatMattersNow, d.scoreNote ?? "");
  }
  out.push(report.valuation.narrative);
  for (const s of report.actionPlan.steps) out.push(s.title);
  out.push(report.cover.threeQuestions.where, report.cover.threeQuestions.worth, report.cover.threeQuestions.next);
  return out.filter(Boolean);
}

/** One index per document: pre-walked in reading order so the numbering is stable on web, PDF and DOCX alike. */
export function buildCitationIndex(report: ReportV2): CitationIndex {
  const index = createCitationIndex(citationRegister(report));
  for (const text of citedTextFields(report)) {
    for (const m of text.matchAll(markerRe())) if (m[1]) index.numberFor(m[1]);
  }
  return index;
}

/** The appendix rows (empty when nothing was cited → the section is omitted). */
export function citationEntries(index: CitationIndex): CitationEntry[] {
  return index.entries();
}

/** Anchor id of footnote `n` (the superscript links here; the appendix row carries it). */
export function citationAnchorId(n: number): string {
  return `ev-${n}`;
}

function pushText(out: CitationSegment[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === "text") last.text += text;
  else out.push({ kind: "text", text });
}

/**
 * Split prose into segments. A citation hugs the word before it (the
 * whitespace before `[ev:]` is dropped, so "4.5 % [ev:x]." reads "4.5 %¹.");
 * an unknown id becomes a visible unevidenced admission; an
 * `[unevidenced]` admission keeps one space before it (it renders as a chip).
 * Runs of spaces left behind collapse to one, and a space before closing
 * punctuation is removed.
 */
export function parseCitations(text: string, register: CitationIndex | readonly EvidenceRow[] = []): CitationSegment[] {
  const index: CitationIndex = Array.isArray(register) ? createCitationIndex(register as readonly EvidenceRow[]) : (register as CitationIndex);
  const out: CitationSegment[] = [];
  let at = 0;
  for (const m of text.matchAll(markerRe())) {
    const start = m.index ?? 0;
    let before = text.slice(at, start);
    if (m[1]) {
      const entry = index.numberFor(m[1]);
      pushText(out, before.replace(/\s+$/u, ""));
      const prev = out[out.length - 1];
      // Adjacent duplicates ("[ev:a] [ev:a]") collapse to one footnote.
      if (entry && !(prev && prev.kind === "cite" && prev.n === entry.n)) out.push({ kind: "cite", n: entry.n, id: entry.id, label: entry.label, level: entry.level });
      // An unresolved reference is visible uncertainty, never silently erased.
      else if (!entry) {
        pushText(out, " ");
        out.push({ kind: "unevidenced" });
      } else if (/\S$/u.test(before) && /^\S/u.test(text.slice(start + m[0].length))) pushText(out, " ");
    } else {
      before = before.replace(/\s+$/u, "");
      pushText(out, before ? `${before} ` : "");
      out.push({ kind: "unevidenced" });
    }
    at = start + m[0].length;
  }
  pushText(out, text.slice(at));
  // Tidy the text segments: runs of spaces → one, no space before closing punctuation.
  for (const seg of out) {
    if (seg.kind !== "text") continue;
    seg.text = seg.text.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?)\]])/g, "$1");
  }
  // A leading space on the first segment or a trailing one on the last is noise.
  const first = out[0];
  if (first && first.kind === "text") first.text = first.text.replace(/^\s+/u, "");
  const last = out[out.length - 1];
  if (last && last.kind === "text") last.text = last.text.replace(/\s+$/u, "");
  return out.filter((s) => s.kind !== "text" || s.text.length > 0);
}

/** True when the text carries at least one marker (cheap pre-check for renderers). */
export function hasCitationMarkers(text: string): boolean {
  return MARKER_TEST_RE.test(text);
}

/**
 * The plain-string projection for contexts that cannot hold inline elements
 * (titles, table cells, e-mail subjects): a footnote number is `[n]` right
 * after the word, an admission is the localised chip word in parentheses,
 * an unknown id becomes an admission too.
 */
export function citationsToPlainText(text: string, index: CitationIndex | readonly EvidenceRow[] = [], unverifiedWord = "unverified"): string {
  return parseCitations(text, index)
    .map((s) => (s.kind === "text" ? s.text : s.kind === "cite" ? `[${s.n}]` : `(${unverifiedWord})`))
    .join("")
    .trim();
}

/** Strip every marker without numbering anything (previews, meta descriptions, the first-sentence lead). */
export function stripCitationMarkers(text: string): string {
  return parseCitations(text, [])
    .map((s) => (s.kind === "text" ? s.text : ""))
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?)\]])/g, "$1")
    .trim();
}
