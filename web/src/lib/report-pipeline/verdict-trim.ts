// verdict-trim — G23-A fix (c): a chapter verdict over its word cap is trimmed
// to the last full sentence that fits instead of failing the schema.
//
// Before: `DimensionChapterPayload.verdict` carried a `≤ 80 words` refine, so
// an 85-word verdict failed the parse, cost a repair pass, and when the
// repair overran too the whole chapter degraded to a deterministic card
// (G19 review: one of the three causes behind groundedShare 0.41). Now the
// schema accepts the text and the chapter builder trims it here — whole
// sentences first; a single sentence longer than the cap is cut on a word
// boundary — keeping the trailing `[ev:<id>]` / `[unevidenced]` markers of the
// kept sentence so the citation gate still sees them. Pure.

import { splitSentences, wordCount } from "@/lib/report-v2/paragraphs";

export interface TrimResult {
  text: string;
  /** True when words were dropped. */
  trimmed: boolean;
  wordsBefore: number;
  wordsAfter: number;
}

const TRAILING_MARKERS = /((?:\s*\[(?:ev:[^\]]+|unevidenced)\])+)\s*([.!?]?)\s*$/i;

/** Trim `text` to at most `maxWords` words on a sentence boundary (word boundary for a single long sentence). */
export function trimVerdict(text: string, maxWords: number): TrimResult {
  const src = (text ?? "").replace(/\s+/g, " ").trim();
  const wordsBefore = wordCount(src);
  if (!src || wordsBefore <= maxWords) return { text: src, trimmed: false, wordsBefore, wordsAfter: wordsBefore };
  const sentences = splitSentences(src);
  const kept: string[] = [];
  let words = 0;
  for (const s of sentences) {
    const n = wordCount(s);
    if (words + n > maxWords) break;
    kept.push(s);
    words += n;
  }
  let out: string;
  if (kept.length) out = kept.join(" ");
  else {
    // One sentence longer than the cap: cut on a word boundary, keep its markers.
    const first = sentences[0] ?? src;
    const m = TRAILING_MARKERS.exec(first);
    const markers = m ? m[1]!.trim() : "";
    const body = m ? first.slice(0, m.index) : first;
    const bodyWords = body.trim().split(/\s+/).filter(Boolean);
    const markerWords = markers ? markers.split(/\s+/).length : 0;
    const cut = bodyWords.slice(0, Math.max(1, maxWords - markerWords)).join(" ").replace(/[,;:\s]+$/u, "");
    out = `${cut}${markers ? ` ${markers}` : ""}.`;
  }
  const wordsAfter = wordCount(out);
  return { text: out, trimmed: wordsAfter < wordsBefore, wordsBefore, wordsAfter };
}
