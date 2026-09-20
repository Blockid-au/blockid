// G19-S47 — report typography helpers, pure and client-safe.
//
//   splitSentences(text)      → sentences (abbreviation / decimal / A$ aware)
//   toParagraphs(text, n)     → ≤ n-sentence paragraphs; existing blank-line
//                               paragraphs are kept, long ones are split on
//                               sentence boundaries
//   truncateWords(text, max)  → the first `max` words (ellipsis when cut)
//   stripMarkdown(text)       → bold / italic / heading / blockquote / list /
//                               fence / HTML-comment syntax removed, text kept
//   wordCount(text)
//
// Used by the executive summary (S47), the chapter verdicts and the criterion
// cards so a 200-word verdict reads as three short paragraphs instead of one
// block, on the web, in the PDF and in the DOCX alike.

/** Abbreviations a full stop does not end a sentence after (lower-cased, no dot). */
const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "approx", "no", "inc", "ltd", "pty", "co", "dr", "mr", "mrs", "ms", "st", "p.a", "cf", "est", "govt", "dept", "fig", "vol", "min", "max", "avg"]);

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Split prose into sentences on `. ! ?` followed by whitespace and a capital,
 * digit, quote or bracket — never inside a decimal ("A$1.2M"), an
 * abbreviation ("e.g. this") or an ellipsis. Whitespace-trimmed, empties dropped.
 */
export function splitSentences(text: string): string[] {
  const src = text.replace(/\s+/g, " ").trim();
  if (!src) return [];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    // Run of terminators ("..." / "?!") — move to the last one.
    let j = i;
    while (j + 1 < src.length && (src[j + 1] === "." || src[j + 1] === "!" || src[j + 1] === "?")) j++;
    // Optional closing quote / bracket right after the terminator.
    let k = j;
    while (k + 1 < src.length && /["'’”)\]]/.test(src[k + 1])) k++;
    const next = src[k + 1];
    if (next === undefined) break;
    if (next !== " ") {
      i = k;
      continue;
    }
    const after = src[k + 2];
    if (after === undefined || !/[A-Z0-9"'“(\[]/.test(after)) {
      i = k;
      continue;
    }
    if (ch === ".") {
      // Abbreviation check: the token before the dot.
      const before = src.slice(start, i).split(/\s+/).pop()?.toLowerCase().replace(/\.$/, "") ?? "";
      if (ABBREVIATIONS.has(before) || /^[a-z]$/.test(before)) {
        i = k;
        continue;
      }
    }
    out.push(src.slice(start, k + 1).trim());
    start = k + 2;
    i = k + 1;
  }
  const tail = src.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

/**
 * Paragraphs of at most `maxSentences` sentences. Blank-line paragraphs in
 * the source are honoured first; each longer block is split into the fewest
 * groups of ≤ cap sentences, balanced so no paragraph is a one-sentence
 * orphan (4 sentences → 2 + 2, 7 → 3 + 2 + 2).
 */
export function toParagraphs(text: string, maxSentences = 3): string[] {
  const cap = Math.max(1, Math.floor(maxSentences));
  const blocks = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const block of blocks) {
    const sentences = splitSentences(block);
    if (!sentences.length) continue;
    if (sentences.length <= cap) {
      out.push(sentences.join(" "));
      continue;
    }
    const groups = Math.ceil(sentences.length / cap);
    const base = Math.floor(sentences.length / groups);
    const extra = sentences.length % groups;
    let at = 0;
    for (let g = 0; g < groups; g++) {
      const size = base + (g < extra ? 1 : 0);
      out.push(sentences.slice(at, at + size).join(" "));
      at += size;
    }
  }
  return out;
}

/** First `max` words; an ellipsis marks a cut. */
export function truncateWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return `${words.slice(0, Math.max(1, max)).join(" ").replace(/[,;:\s]+$/u, "")}…`;
}

/**
 * Plain text from markdown-ish agent output: HTML comments dropped, bold /
 * italic / code markers removed, heading hashes / blockquote chevrons / list
 * markers stripped, whitespace normalised. Keeps `[ev:id]` citations.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[a-z]*\n?/gi, " ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]*(?:[-*+•]|\d{1,2}[.)])[ \t]+/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/** Verdict / card prose for display: markdown stripped, ≤ 3-sentence paragraphs. */
export function proseParagraphs(text: string, maxSentences = 3): string[] {
  return toParagraphs(stripMarkdown(text), maxSentences);
}
