// G19-S47 — executive summary structure, pure and client-safe.
//
//   structureExecutive(thesis, chapters, valuation, phase, opts)
//     → ExecutiveStructured from the CEO agent's markdown-ish text (H1 / H2
//       headings, `**n. Title:**` items, `> **Key Insight:**`, "Verdict: BUY —"
//       and "Confidence Level: 65%") with HTML comments dropped; when the
//       text carries no recognisable structure, every section is built
//       deterministically from the chapters, the valuation consensus, the
//       phase gate and the action plan. Never returns markdown syntax.
//   ensureExecutiveStructured(report)
//     → the same document with `executive.structured` present and valid
//       (stored rows written before S47, degraded runs, adapter path).
//   finaliseExecutiveStructured(draft, ctx)
//     → caps + markdown stripping + dim validation for a CEO JSON payload.
//   executiveThesisFromStructured(structured)
//     → plain-text thesis (headline + paragraphs) for the back-compat field.

import { topBlockers, type PhaseGateResult } from "@/lib/growth/phase-gate";
import { GROWTH_PHASE_LABELS, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { getTbrStrings } from "@/lib/i18n/tbr-strings";
import { DIM_ORDER, DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { aud } from "@/lib/report-visuals/svg";
import { splitSentences, stripMarkdown, toParagraphs, truncateWords, wordCount } from "./paragraphs";
import {
  EXECUTIVE_CAPS,
  executiveStructuredSchema,
  type ActionStep,
  type ActionWindow,
  type Band,
  type DimensionChapter,
  type ExecutiveAction,
  type ExecutiveBenchmark,
  type ExecutiveGap,
  type ExecutiveReason,
  type ExecutiveStructured,
  type ExecutiveVerdictLabel,
  type ReportV2,
} from "./schema";

export interface StructureExecutiveOptions {
  locale?: ReportV2["locale"];
  cover?: Pick<ReportV2["cover"], "startupName" | "svi">;
  actionPlan?: readonly ActionStep[];
  /** The executive confidence to fall back on when the text states none. */
  confidence?: number;
}

type Locale = ReportV2["locale"];

// ── Tokeniser ────────────────────────────────────────────────────────────────

type Block = { kind: "h1" | "h2" | "quote" | "item" | "para"; text: string };

function tokenise(raw: string): Block[] {
  const lines = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join(" ").trim() });
    para = [];
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ kind: "quote", text: quote.join(" ").trim() });
    quote = [];
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flushPara();
      flushQuote();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^#\s+(.*)$/))) {
      flushPara();
      flushQuote();
      blocks.push({ kind: "h1", text: m[1].trim() });
    } else if ((m = t.match(/^#{2,6}\s+(.*)$/))) {
      flushPara();
      flushQuote();
      blocks.push({ kind: "h2", text: m[1].trim() });
    } else if ((m = t.match(/^>\s?(.*)$/))) {
      flushPara();
      quote.push(m[1].trim());
    } else if ((m = t.match(/^\*\*\s*\d{1,2}[.)]\s*(.*)$/))) {
      // "**1. Title:** body" — the bold wraps the number.
      flushPara();
      flushQuote();
      blocks.push({ kind: "item", text: `**${m[1].trim()}` });
    } else if ((m = t.match(/^(?:\d{1,2}[.)]|[-*+•])\s+(.*)$/))) {
      flushPara();
      flushQuote();
      blocks.push({ kind: "item", text: m[1].trim() });
    } else if (t.startsWith("**") && blocks.length && blocks[blocks.length - 1].kind === "item" && para.length === 0) {
      // A bold lead-in paragraph inside a list section is another item.
      flushQuote();
      blocks.push({ kind: "item", text: t });
    } else {
      flushQuote();
      para.push(t);
    }
  }
  flushPara();
  flushQuote();
  return blocks;
}

// ── Section classification ──────────────────────────────────────────────────

type SectionKind = "intro" | "reasons" | "gaps" | "benchmarks" | "phase" | "verdict" | "actions" | "other";

function classify(heading: string): SectionKind {
  const h = heading.toLowerCase();
  if (/executive summary|overview|snapshot|at a glance/.test(h)) return "intro";
  if (/verdict|confidence/.test(h)) return "verdict";
  if (/recommended \baction|next step|\bactions?\b|milestone|priorit|what to do|roadmap/.test(h)) return "actions";
  if (/gap|risk|weakness|concern|must change|red flag/.test(h)) return "gaps";
  if (/thesis|reason|why back|why invest|strength|case for|advantage/.test(h)) return "reasons";
  if (/benchmark|peer|cohort|comparison/.test(h)) return "benchmarks";
  if (/phase|stage now|where (you|it|they) (are|is)/.test(h)) return "phase";
  return "other";
}

interface Section {
  kind: SectionKind;
  heading: string;
  blocks: Block[];
}

function sectionise(blocks: Block[]): { h1: string | null; sections: Section[] } {
  let h1: string | null = null;
  const sections: Section[] = [{ kind: "intro", heading: "", blocks: [] }];
  for (const b of blocks) {
    if (b.kind === "h1") {
      if (h1 === null) h1 = b.text;
      else sections.push({ kind: classify(b.text), heading: b.text, blocks: [] });
      continue;
    }
    if (b.kind === "h2") {
      sections.push({ kind: classify(b.text), heading: b.text, blocks: [] });
      continue;
    }
    sections[sections.length - 1].blocks.push(b);
  }
  return { h1, sections };
}

// ── Item parsing ────────────────────────────────────────────────────────────

interface ParsedItem {
  title: string;
  body: string;
  raw: string;
}

function parseItem(text: string): ParsedItem | null {
  const raw = text.trim();
  if (!raw) return null;
  let title = "";
  let body = "";
  let m: RegExpMatchArray | null;
  if ((m = raw.match(/^\*\*(.+?)\*\*\s*[:：—–-]?\s*([\s\S]*)$/))) {
    title = m[1].replace(/[\s:：—–-]+$/u, "");
    body = m[2];
  } else if ((m = raw.match(/^([^:.!?]{3,90}):\s+([\s\S]+)$/))) {
    title = m[1];
    body = m[2];
  } else {
    title = truncateWords(stripMarkdown(raw), 8);
    body = raw;
  }
  title = stripMarkdown(title).replace(/^\d{1,2}[.)]\s*/, "").trim();
  body = stripMarkdown(body).trim();
  if (!title && !body) return null;
  if (!title) title = truncateWords(body, 8);
  if (!body) body = title;
  // "**Hire a fractional CRO** to lead go-to-market" — the bold is the start of the sentence, not a label.
  else if (/^[a-z]/.test(body)) body = sentenceCase(`${title} ${body}`);
  return { title, body, raw };
}

/** Items of a section: list items first, else bold lead-in paragraphs, else every paragraph. */
function itemsOf(section: Section): ParsedItem[] {
  const list = section.blocks.filter((b) => b.kind === "item");
  const source = list.length ? list : section.blocks.filter((b) => b.kind === "para" && b.text.startsWith("**"));
  const fallback = source.length ? source : section.blocks.filter((b) => b.kind === "para");
  return fallback.map((b) => parseItem(b.text)).filter((i): i is ParsedItem => Boolean(i));
}

// ── Dim inference ───────────────────────────────────────────────────────────

const DIM_PATTERNS: Record<DimKey, RegExp> = {
  tre: /\b(traction|revenue|mrr|arr|monetis|monetiz|paying|paid|subscriptions?|sales|pricing|churn|retention|conversion|customers? (?:paying|count|acquisition))/i,
  mpc: /\b(market|tam\b|sam\b|som\b|category|demand|customer discovery|segment|go-to-market|gtm|outreach|landing page|positioning|competitor|pain point)/i,
  ftv: /\b(founder|co-founder|cofounder|team|hire|hiring|key[- ]person|cro\b|head of sales|leadership|solo)/i,
  ptd: /\b(product|tech|technical|platform|engineering|codebase|repository|architecture|feature)/i,
  cgh: /\b(cap table|esop|vesting|shareholders?'? agreement|governance|board|equity|runway|burn|capital)/i,
  iri: /\b(investor readiness|investor-ready|investor|data room|due diligence|fundrais|pitch deck|financial model|round\b)/i,
  lco: /\b(legal|compliance|regulat|\bip\b|trademark|patent|esic|asic|privacy|contract|audit)/i,
  svm: /\b(moat|vision|strateg|defensib|proprietary|dataset|switching cost|roadmap|network effect|innovation)/i,
};

function inferDim(title: string, body: string, chapters: readonly DimensionChapter[]): DimKey | undefined {
  const scores = new Map<DimKey, number>();
  const bump = (d: DimKey, n: number) => scores.set(d, (scores.get(d) ?? 0) + n);
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  for (const d of DIM_ORDER) {
    const names = [DIMENSION_OWNERS[d].title, DIMENSION_OWNERS[d].shortLabel, chapters.find((c) => c.dim === d)?.title ?? ""].filter(Boolean).map((n) => n.toLowerCase());
    for (const n of names) {
      if (t.includes(n)) bump(d, 12);
      else if (b.includes(n)) bump(d, 5);
    }
    if (new RegExp(`\\b${d}\\b`, "i").test(t)) bump(d, 12);
    else if (new RegExp(`\\b${d}\\b`, "i").test(b)) bump(d, 4);
    const tm = t.match(new RegExp(DIM_PATTERNS[d].source, "gi"));
    const bm = b.match(new RegExp(DIM_PATTERNS[d].source, "gi"));
    if (tm) bump(d, tm.length * 3);
    if (bm) bump(d, bm.length);
  }
  let best: DimKey | undefined;
  let bestScore = 0;
  for (const d of DIM_ORDER) {
    const sc = scores.get(d) ?? 0;
    if (sc > bestScore) {
      best = d;
      bestScore = sc;
    }
  }
  return best;
}

function inferWindow(text: string, index: number): ActionWindow {
  const t = text.toLowerCase();
  if (/immediate|this week|today|right now|\bnow\b|48 hours|7 days/.test(t)) return "this_week";
  if (/30[- ]day|30 days|within a month|next month|4 weeks|this month|by month end/.test(t)) return "30d";
  if (/90|quarter|6[- ]month|3 months|6 months|next phase|half/.test(t)) return "90d";
  return index === 0 ? "this_week" : index <= 2 ? "30d" : "90d";
}

// ── Caps ────────────────────────────────────────────────────────────────────

/** Whole sentences up to `max` words (at least one; a single long sentence is cut). */
function capSentences(text: string, max: number): string {
  const sentences = splitSentences(stripMarkdown(text));
  if (!sentences.length) return "";
  const out: string[] = [];
  let words = 0;
  for (const s of sentences) {
    const n = wordCount(s);
    if (out.length && words + n > max) break;
    out.push(s);
    words += n;
    if (words >= max) break;
  }
  const joined = out.join(" ");
  return wordCount(joined) > max ? truncateWords(joined, max) : joined;
}

/** Greedy sentence packing: paragraphs of ≤ `maxWords` words (a single longer sentence is cut). */
function packSentences(text: string, maxWords: number): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let words = 0;
  for (const sn of splitSentences(stripMarkdown(text))) {
    const n = wordCount(sn);
    if (current.length && words + n > maxWords) {
      out.push(current.join(" "));
      current = [];
      words = 0;
    }
    current.push(n > maxWords ? truncateWords(sn, maxWords) : sn);
    words += Math.min(n, maxWords);
  }
  if (current.length) out.push(current.join(" "));
  return out;
}

const SCORE_RESTATEMENT = /\b\d{1,3}\s*\/\s*100\b|below the (strong |developing )?band|points below|\bscores? \d{1,3}\b/i;

function clean(text: string): string {
  return stripMarkdown(text).replace(/\s+/g, " ").trim();
}

// ── Deterministic builders (chapters / valuation / phase / plan) ────────────

function s47(locale: Locale | undefined) {
  return getTbrStrings(locale).v2.s47;
}

function dimTitle(dim: DimKey, chapters: readonly DimensionChapter[], locale: Locale | undefined): string {
  const ch = chapters.find((c) => c.dim === dim);
  if (ch) return locale === "vi" ? ch.titleVi : ch.title;
  return locale === "vi" ? DIMENSION_OWNERS[dim].titleVi : DIMENSION_OWNERS[dim].title;
}

function phaseLabelFor(id: GrowthPhaseId, locale: Locale | undefined): string {
  return GROWTH_PHASE_LABELS[id][locale === "vi" ? "vi" : "en"];
}

function firstBullet(list: readonly string[]): string | null {
  const hit = list.map((s) => clean(s)).find((s) => s && !SCORE_RESTATEMENT.test(s));
  return hit ? hit.replace(/\s*\([^)]*\)\s*$/u, "").replace(/[.;:,\s]+$/u, "") : null;
}

function reasonsFromChapters(chapters: readonly DimensionChapter[], locale: Locale | undefined, exclude: Set<DimKey>): ExecutiveReason[] {
  const L = s47(locale);
  return [...chapters]
    .filter((c) => c.band !== "pending" && !exclude.has(c.dim))
    .sort((a, b) => b.score - a.score || b.weight - a.weight)
    .map((c) => {
      const bullet = firstBullet([...c.criteria.flatMap((k) => k.strengths), ...c.strengths]);
      return {
        title: truncateWords(bullet ?? L.reasonTitle(dimTitle(c.dim, chapters, locale)), 12),
        body: capSentences(c.verdict, EXECUTIVE_CAPS.paragraphWords) || dimTitle(c.dim, chapters, locale),
        dim: c.dim,
      };
    });
}

function gapsFromChapters(chapters: readonly DimensionChapter[], locale: Locale | undefined, exclude: Set<DimKey>): ExecutiveGap[] {
  const L = s47(locale);
  return [...chapters]
    .filter((c) => !exclude.has(c.dim))
    .sort((a, b) => b.nextAction.expectedLift - a.nextAction.expectedLift || a.score - b.score)
    .map((c) => {
      const bullet = firstBullet([...c.criteria.flatMap((k) => k.gaps), ...c.gaps]);
      const lift = c.nextAction.expectedLift > 0 ? c.nextAction.expectedLift : undefined;
      return {
        title: truncateWords(bullet ?? L.gapTitle(dimTitle(c.dim, chapters, locale)), 12),
        body: capSentences(c.nextAction.title, EXECUTIVE_CAPS.paragraphWords) || capSentences(c.verdict, EXECUTIVE_CAPS.paragraphWords) || dimTitle(c.dim, chapters, locale),
        dim: c.dim,
        ...(lift !== undefined ? { lift } : {}),
      };
    });
}

function benchmarksFromChapters(chapters: readonly DimensionChapter[]): ExecutiveBenchmark[] {
  return DIM_ORDER.map((d) => chapters.find((c) => c.dim === d))
    .filter((c): c is DimensionChapter => Boolean(c))
    .map((c) => ({ dim: c.dim, score: Math.max(0, Math.min(100, Math.round(c.score))), band: c.band }));
}

function actionsFromPlan(plan: readonly ActionStep[] | undefined, chapters: readonly DimensionChapter[], locale: Locale | undefined): ExecutiveAction[] {
  const L = s47(locale);
  const fromPlan = (plan ?? []).slice(0, EXECUTIVE_CAPS.actions).map((st) => ({
    title: truncateWords(clean(st.title), 14),
    detail: L.actionDetail(st.ownerAgent.toUpperCase(), st.expectedLift),
    window: (st.day === 30 ? "30d" : "90d") as ActionWindow,
    dim: st.dimension,
  }));
  if (fromPlan.length) return fromPlan;
  return [...chapters]
    .filter((c) => c.nextAction.title.trim())
    .sort((a, b) => b.nextAction.expectedLift - a.nextAction.expectedLift)
    .slice(0, EXECUTIVE_CAPS.actions)
    .map((c) => ({
      title: truncateWords(clean(c.nextAction.title), 14),
      detail: L.actionDetail(c.ownerAgent.toUpperCase(), c.nextAction.expectedLift),
      window: c.nextAction.window,
      dim: c.dim,
    }));
}

function verdictFromBand(band: Band | undefined): ExecutiveVerdictLabel {
  if (band === "strong") return "back";
  if (band === "developing") return "back_with_conditions";
  if (band === "early") return "watch";
  return "not_yet";
}

// ── Verdict / confidence parsing ────────────────────────────────────────────

const POSITIVE = /\b(buy|back|invest|strong yes|yes|go\b|proceed|fund|support)\b/i;
const CONDITIONAL = /\b(condition|conditional|subject to|contingent|provided|milestone|if\b|once\b|pending)\b/i;
const NEGATIVE = /\b(pass|no-go|avoid|decline|not yet|too early|not ready|do not|don't)\b/i;
const WATCH = /\b(watch|hold|monitor|wait|revisit|neutral|cautious)\b/i;

function parseVerdictLabel(line: string): ExecutiveVerdictLabel | null {
  if (NEGATIVE.test(line)) return "not_yet";
  if (POSITIVE.test(line)) return CONDITIONAL.test(line) ? "back_with_conditions" : "back";
  if (WATCH.test(line)) return "watch";
  return null;
}

function parseConfidence(text: string): number | null {
  const pct = text.match(/confidence(?:\s+level)?\s*[:：—–-]?\s*(?:of\s+)?(\d{1,3})\s*%/i) ?? text.match(/(\d{1,3})\s*%\s*confidence/i);
  if (pct) {
    const n = Number(pct[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n / 100;
  }
  const frac = text.match(/confidence(?:\s+level)?\s*[:：—–-]?\s*(0?\.\d+|1\.0|[01])\b/i);
  if (frac) {
    const n = Number(frac[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  }
  return null;
}

function stripInsightLabel(s: string): string {
  return s.replace(/^key insight\s*[:：—–-]?\s*/i, "");
}

function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

// ── Main ────────────────────────────────────────────────────────────────────

/**
 * The CEO text as sections. `chapters` in DIM_ORDER (any subset tolerated),
 * `valuation` null when the CFO model did not run, `phase` the deterministic
 * gate. Always returns a schema-valid ExecutiveStructured.
 */
export function structureExecutive(
  thesis: string,
  chapters: readonly DimensionChapter[],
  valuation: ReportV2["valuation"] | null | undefined,
  phase: PhaseGateResult,
  opts: StructureExecutiveOptions = {},
): ExecutiveStructured {
  const locale = opts.locale;
  const L = s47(locale);
  const bandLabels = getTbrStrings(locale).v2.band;
  const { h1, sections } = sectionise(tokenise(thesis ?? ""));
  const find = (kind: SectionKind) => sections.filter((sct) => sct.kind === kind);
  const startupName = opts.cover?.startupName?.trim() || chapters[0]?.title.split(" ")[0] || "Startup";
  const svi = opts.cover?.svi;

  // Headline.
  let headline = h1 ? clean(h1.replace(/^executive summary\s*[:：—–-]*\s*/i, "")) : "";
  if (!headline) headline = svi && svi.band !== "pending" ? L.headlineFallback(startupName, svi.total, bandLabels[svi.band].toLowerCase()) : L.headlinePending(startupName);
  headline = truncateWords(headline, EXECUTIVE_CAPS.headlineWords);

  // Summary paragraphs: intro prose (never the quote / items), ≤ 60 words each, ≤ 3.
  const summary: string[] = [];
  const introParas = sections.filter((sct) => sct.kind === "intro" || sct.kind === "other").flatMap((sct) => sct.blocks.filter((b) => b.kind === "para"));
  for (const b of introParas) {
    const text = clean(b.text);
    if (!text || SCORE_RESTATEMENT.test(text) && wordCount(text) < 12) continue;
    for (const piece of packSentences(text, EXECUTIVE_CAPS.paragraphWords)) {
      if (summary.length >= EXECUTIVE_CAPS.summaryParagraphs) break;
      if (piece) summary.push(piece);
    }
    if (summary.length >= EXECUTIVE_CAPS.summaryParagraphs) break;
  }
  // Deterministic paragraphs fill to at least two: worth, then phase.
  const worth =
    valuation && valuation.consensus.confidence >= 0.3 && valuation.consensus.highAud > 0
      ? L.worthParagraph(aud(valuation.consensus.lowAud), aud(valuation.consensus.highAud), Math.round(valuation.consensus.confidence * 100))
      : L.worthPending;
  const phaseSentence = L.phaseParagraph(phaseLabelFor(phase.currentPhase, locale), Math.round(phase.completionPct), phase.nextPhase ? phaseLabelFor(phase.nextPhase, locale) : null);
  for (const extra of [worth, phaseSentence]) {
    if (summary.length >= 2) break;
    if (!summary.includes(extra)) summary.push(extra);
  }

  // Key insight.
  const quote = sections.flatMap((sct) => sct.blocks).find((b) => b.kind === "quote");
  const keyInsight = quote ? capSentences(stripInsightLabel(clean(quote.text)), 90) : undefined;

  // Reasons / gaps.
  const usedReason = new Set<DimKey>();
  const reasons: ExecutiveReason[] = find("reasons")
    .flatMap(itemsOf)
    .slice(0, EXECUTIVE_CAPS.reasons)
    .map((it) => {
      const dim = inferDim(it.title, it.body, chapters);
      if (dim) usedReason.add(dim);
      return { title: truncateWords(it.title, 12), body: capSentences(it.body, EXECUTIVE_CAPS.paragraphWords) || it.title, ...(dim ? { dim } : {}) };
    });
  for (const r of reasonsFromChapters(chapters, locale, usedReason)) {
    if (reasons.length >= EXECUTIVE_CAPS.reasons) break;
    reasons.push(r);
  }
  const usedGap = new Set<DimKey>();
  const gaps: ExecutiveGap[] = find("gaps")
    .flatMap(itemsOf)
    .slice(0, EXECUTIVE_CAPS.gaps)
    .map((it) => {
      const dim = inferDim(it.title, it.body, chapters);
      if (dim) usedGap.add(dim);
      const ch = dim ? chapters.find((c) => c.dim === dim) : undefined;
      const lift = ch && ch.nextAction.expectedLift > 0 ? ch.nextAction.expectedLift : undefined;
      return { title: truncateWords(it.title, 12), body: capSentences(it.body, EXECUTIVE_CAPS.paragraphWords) || it.title, ...(dim ? { dim } : {}), ...(lift !== undefined ? { lift } : {}) };
    });
  for (const g of gapsFromChapters(chapters, locale, usedGap)) {
    if (gaps.length >= EXECUTIVE_CAPS.gaps) break;
    gaps.push(g);
  }

  // Benchmarks: always the chapters; a note when the text mentions the dimension in one short sentence.
  const benchText = find("benchmarks").flatMap((sct) => sct.blocks.map((b) => clean(b.text))).join(" ");
  const benchSentences = splitSentences(benchText);
  const benchmarks = benchmarksFromChapters(chapters).map((bm) => {
    const names = [DIMENSION_OWNERS[bm.dim].title, DIMENSION_OWNERS[bm.dim].shortLabel, bm.dim.toUpperCase()];
    const note = benchSentences.find((sn) => names.some((n) => sn.includes(n)) && wordCount(sn) <= 40 && !/\d{1,3}\s*\/\s*100/.test(sn));
    return note ? { ...bm, note } : bm;
  });

  // Phase now.
  const gateBlocker = topBlockers(phase, 1)[0]?.detail;
  const phaseText = find("phase").flatMap((sct) => sct.blocks.filter((b) => b.kind === "para" || b.kind === "item").map((b) => clean(b.text))).join(" ");
  const phaseSentences = splitSentences(phaseText);
  const blockerSentence = phaseSentences.find((sn) => /blocker|blocks|gate|must improve|below/i.test(sn));
  const blocker = capSentences(gateBlocker ?? blockerSentence ?? L.noBlocker, 60) || L.noBlocker;
  const takesSentences = phaseSentences.filter((sn) => sn !== blockerSentence && !/currently in the/i.test(sn));
  const topGapAction = (gaps[0]?.title ?? chapters[0]?.nextAction.title ?? "").replace(/[.…]+$/u, "");
  const whatItTakes = capSentences(takesSentences.join(" "), 60) || L.takesFallback(truncateWords(topGapAction, 20));
  const phaseNow = { phaseId: phase.currentPhase, label: truncateWords(phaseLabelFor(phase.currentPhase, locale), 12), blocker, whatItTakes };

  // Verdict.
  const verdictText = find("verdict").flatMap((sct) => sct.blocks.map((b) => clean(b.text))).join("\n");
  const allText = clean(thesis ?? "");
  const verdictLine = (verdictText || allText).match(/verdict\s*[:：—–-]\s*([^\n]+)/i)?.[1] ?? "";
  const firstVerdictSentence = splitSentences(verdictLine)[0] ?? "";
  const parsedLabel = parseVerdictLabel(firstVerdictSentence || verdictLine);
  const label: ExecutiveVerdictLabel = parsedLabel ?? verdictFromBand(svi?.band);
  const dash = firstVerdictSentence.match(/[—–:]\s*(.+)$/);
  let condition: string | undefined = dash ? sentenceCase(clean(dash[1]).replace(/^(with|subject to|provided|if)\s+/i, (m) => m.toLowerCase())) : undefined;
  if (!condition) {
    const sn = splitSentences(verdictText).find((x) => CONDITIONAL.test(x) && !/^verdict/i.test(x));
    if (sn) condition = sn;
  }
  if (!condition && label === "back_with_conditions") condition = L.conditionFallback(truncateWords(topGapAction, 20));
  if (condition) condition = capSentences(condition, 60) || undefined;
  const confidence = parseConfidence(verdictText) ?? parseConfidence(allText) ?? (typeof opts.confidence === "number" && Number.isFinite(opts.confidence) ? Math.max(0, Math.min(1, opts.confidence)) : 0.5);
  const verdict = { label, ...(condition ? { condition } : {}), confidence: Math.round(confidence * 100) / 100 };

  // Actions.
  const actions: ExecutiveAction[] = find("actions")
    .flatMap(itemsOf)
    .slice(0, EXECUTIVE_CAPS.actions)
    .map((it, i) => {
      const dim = inferDim(it.title, it.body, chapters);
      return { title: truncateWords(it.title, 14), detail: capSentences(it.body, EXECUTIVE_CAPS.paragraphWords) || it.title, window: inferWindow(`${it.title} ${it.body}`, i), ...(dim ? { dim } : {}) };
    });
  const finalActions = actions.length ? actions : actionsFromPlan(opts.actionPlan, chapters, locale);

  const draft: ExecutiveStructured = {
    headline,
    summary: summary.slice(0, EXECUTIVE_CAPS.summaryParagraphs),
    ...(keyInsight ? { keyInsight } : {}),
    reasonsToBack: reasons,
    criticalGaps: gaps,
    benchmarks,
    phaseNow,
    verdict,
    actions: finalActions,
  };
  return finaliseExecutiveStructured(draft, { chapters, phase, locale, confidence: verdict.confidence });
}

// ── Finalise (caps + validation, shared with the CEO JSON path) ─────────────

export interface FinaliseContext {
  chapters: readonly DimensionChapter[];
  phase: PhaseGateResult;
  locale?: Locale;
  confidence?: number;
  actionPlan?: readonly ActionStep[];
  cover?: Pick<ReportV2["cover"], "startupName" | "svi">;
}

/**
 * Clamp a draft (parsed text or CEO JSON) to the S47 contract: markdown
 * stripped, word caps by whole sentences, only known dims, ≤ 3 / 3 / 5
 * items, verdict label valid, confidence 0–1, benchmarks from the chapters
 * when absent, every empty slot filled deterministically. Throws only when
 * the result still fails the schema (a programmer error, never model output).
 */
export function finaliseExecutiveStructured(draft: Partial<ExecutiveStructured>, ctx: FinaliseContext): ExecutiveStructured {
  const L = s47(ctx.locale);
  const isDim = (d: unknown): d is DimKey => typeof d === "string" && (DIM_ORDER as readonly string[]).includes(d);
  const bandLabels = getTbrStrings(ctx.locale).v2.band;
  const name = ctx.cover?.startupName?.trim() || "Startup";
  const svi = ctx.cover?.svi;

  const headlineRaw = clean(draft.headline ?? "");
  const headline = truncateWords(headlineRaw || (svi && svi.band !== "pending" ? L.headlineFallback(name, svi.total, bandLabels[svi.band].toLowerCase()) : L.headlinePending(name)), EXECUTIVE_CAPS.headlineWords);

  const summarySrc = Array.isArray(draft.summary) ? draft.summary : typeof draft.summary === "string" ? [draft.summary] : [];
  const summary = summarySrc
    .flatMap((p) => toParagraphs(clean(String(p ?? "")), 3))
    .map((p) => (wordCount(p) > EXECUTIVE_CAPS.paragraphWords ? capSentences(p, EXECUTIVE_CAPS.paragraphWords) : p))
    .filter(Boolean)
    .slice(0, EXECUTIVE_CAPS.summaryParagraphs);
  if (!summary.length) summary.push(L.phaseParagraph(phaseLabelFor(ctx.phase.currentPhase, ctx.locale), Math.round(ctx.phase.completionPct), ctx.phase.nextPhase ? phaseLabelFor(ctx.phase.nextPhase, ctx.locale) : null));

  const keyInsight = draft.keyInsight ? capSentences(stripInsightLabel(clean(draft.keyInsight)), 90) : "";

  const usedReason = new Set<DimKey>();
  const reasons: ExecutiveReason[] = (Array.isArray(draft.reasonsToBack) ? draft.reasonsToBack : [])
    .map((r) => {
      const title = truncateWords(clean(r?.title ?? ""), 12);
      const body = capSentences(clean(r?.body ?? ""), EXECUTIVE_CAPS.paragraphWords);
      if (!title && !body) return null;
      const dim = isDim(r?.dim) ? r.dim : inferDim(title, body, ctx.chapters);
      if (dim) usedReason.add(dim);
      return { title: title || truncateWords(body, 8), body: body || title, ...(dim ? { dim } : {}) };
    })
    .filter((r): r is ExecutiveReason => Boolean(r))
    .slice(0, EXECUTIVE_CAPS.reasons);
  for (const r of reasonsFromChapters(ctx.chapters, ctx.locale, usedReason)) {
    if (reasons.length >= EXECUTIVE_CAPS.reasons) break;
    reasons.push(r);
  }

  const usedGap = new Set<DimKey>();
  const gaps: ExecutiveGap[] = (Array.isArray(draft.criticalGaps) ? draft.criticalGaps : [])
    .map((g) => {
      const title = truncateWords(clean(g?.title ?? ""), 12);
      const body = capSentences(clean(g?.body ?? ""), EXECUTIVE_CAPS.paragraphWords);
      if (!title && !body) return null;
      const dim = isDim(g?.dim) ? g.dim : inferDim(title, body, ctx.chapters);
      if (dim) usedGap.add(dim);
      const ch = dim ? ctx.chapters.find((c) => c.dim === dim) : undefined;
      const liftRaw = typeof g?.lift === "number" && Number.isFinite(g.lift) && g.lift > 0 ? Math.round(g.lift) : ch && ch.nextAction.expectedLift > 0 ? ch.nextAction.expectedLift : undefined;
      return { title: title || truncateWords(body, 8), body: body || title, ...(dim ? { dim } : {}), ...(liftRaw !== undefined ? { lift: liftRaw } : {}) };
    })
    .filter((g): g is ExecutiveGap => Boolean(g))
    .slice(0, EXECUTIVE_CAPS.gaps);
  for (const g of gapsFromChapters(ctx.chapters, ctx.locale, usedGap)) {
    if (gaps.length >= EXECUTIVE_CAPS.gaps) break;
    gaps.push(g);
  }

  const chapterBench = benchmarksFromChapters(ctx.chapters);
  const givenBench = (Array.isArray(draft.benchmarks) ? draft.benchmarks : []).filter((b) => isDim(b?.dim));
  const benchmarks: ExecutiveBenchmark[] = (chapterBench.length ? chapterBench : []).map((cb) => {
    const given = givenBench.find((b) => b.dim === cb.dim);
    const note = given?.note ? truncateWords(clean(given.note), 40) : undefined;
    return note ? { ...cb, note } : cb;
  });
  if (!benchmarks.length) {
    for (const b of givenBench.slice(0, EXECUTIVE_CAPS.benchmarks)) {
      const band: Band = b.band === "strong" || b.band === "developing" || b.band === "early" || b.band === "pending" ? b.band : "pending";
      const score = typeof b.score === "number" && Number.isFinite(b.score) ? Math.max(0, Math.min(100, Math.round(b.score))) : 0;
      benchmarks.push({ dim: b.dim, score, band, ...(b.note ? { note: truncateWords(clean(b.note), 40) } : {}) });
    }
  }

  const gateBlocker = topBlockers(ctx.phase, 1)[0]?.detail;
  const pn = draft.phaseNow;
  const phaseId: GrowthPhaseId = pn && typeof pn.phaseId === "string" && pn.phaseId in GROWTH_PHASE_LABELS ? (pn.phaseId as GrowthPhaseId) : ctx.phase.currentPhase;
  const topGapAction = (gaps[0]?.title ?? "").replace(/[.…]+$/u, "");
  const phaseNow = {
    phaseId,
    label: truncateWords(clean(pn?.label ?? "") || phaseLabelFor(phaseId, ctx.locale), 12),
    blocker: capSentences(clean(pn?.blocker ?? "") || gateBlocker || L.noBlocker, 60) || L.noBlocker,
    whatItTakes: capSentences(clean(pn?.whatItTakes ?? ""), 60) || L.takesFallback(truncateWords(topGapAction, 20)),
  };

  const rawLabel = draft.verdict?.label;
  const label: ExecutiveVerdictLabel = rawLabel === "back" || rawLabel === "back_with_conditions" || rawLabel === "watch" || rawLabel === "not_yet" ? rawLabel : (parseVerdictLabel(String(rawLabel ?? "")) ?? verdictFromBand(svi?.band));
  let condition = draft.verdict?.condition ? capSentences(clean(draft.verdict.condition), 60) : "";
  if (!condition && label === "back_with_conditions") condition = L.conditionFallback(truncateWords(topGapAction, 20));
  const confRaw = draft.verdict?.confidence;
  const confidence = typeof confRaw === "number" && Number.isFinite(confRaw) ? (confRaw > 1 ? confRaw / 100 : confRaw) : (ctx.confidence ?? 0.5);
  const verdict = { label, ...(condition ? { condition } : {}), confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100 };

  const actions: ExecutiveAction[] = (Array.isArray(draft.actions) ? draft.actions : [])
    .map((a, i) => {
      const title = truncateWords(clean(a?.title ?? ""), 14);
      const detail = capSentences(clean(a?.detail ?? ""), EXECUTIVE_CAPS.paragraphWords);
      if (!title && !detail) return null;
      const window: ActionWindow = a?.window === "this_week" || a?.window === "30d" || a?.window === "90d" ? a.window : inferWindow(`${title} ${detail}`, i);
      const dim = isDim(a?.dim) ? a.dim : inferDim(title, detail, ctx.chapters);
      return { title: title || truncateWords(detail, 8), detail: detail || title, window, ...(dim ? { dim } : {}) };
    })
    .filter((a): a is ExecutiveAction => Boolean(a))
    .slice(0, EXECUTIVE_CAPS.actions);
  const finalActions = actions.length ? actions : actionsFromPlan(ctx.actionPlan, ctx.chapters, ctx.locale);

  const out: ExecutiveStructured = {
    headline,
    summary,
    ...(keyInsight ? { keyInsight } : {}),
    reasonsToBack: reasons,
    criticalGaps: gaps,
    benchmarks,
    phaseNow,
    verdict,
    actions: finalActions,
  };
  const parsed = executiveStructuredSchema.safeParse(out);
  if (!parsed.success) {
    throw new Error(`finaliseExecutiveStructured produced an invalid document: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data as ExecutiveStructured;
}

// ── Document helpers ────────────────────────────────────────────────────────

/** True when the stored `executive.structured` validates as-is. */
export function hasValidExecutiveStructured(report: Pick<ReportV2, "executive">): boolean {
  return Boolean(report.executive.structured) && executiveStructuredSchema.safeParse(report.executive.structured).success;
}

/**
 * The document with `executive.structured` guaranteed: a valid stored block
 * is kept untouched; otherwise the thesis is parsed (or the sections are
 * built from the chapters). Pure — returns the same object when nothing
 * had to change.
 */
export function ensureExecutiveStructured(report: ReportV2): ReportV2 {
  if (hasValidExecutiveStructured(report)) return report;
  const structured = structureExecutive(report.executive.thesis, report.dimensions, report.valuation, report.executive.phaseNow, {
    locale: report.locale,
    cover: { startupName: report.cover.startupName, svi: report.cover.svi },
    actionPlan: report.actionPlan.steps,
    confidence: report.executive.confidence,
  });
  return { ...report, executive: { ...report.executive, structured } };
}

/** Plain-text thesis (headline, paragraphs, key insight) for the back-compat `executive.thesis`. */
export function executiveThesisFromStructured(s: ExecutiveStructured): string {
  return [s.headline, ...s.summary, ...(s.keyInsight ? [s.keyInsight] : [])].join("\n\n");
}
