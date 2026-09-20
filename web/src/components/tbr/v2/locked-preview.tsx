// G16-B — the locked preview a FREE founder sees at the free-tier cut
// (chapters the projection renders as cards): the chapter's first sentence,
// then a pure-CSS skeleton where the primary visual and the evidence table
// would sit. No image, no inline script, no real chart — the S-R1 primary
// `svg[role=img]` deliberately stays out of a locked chapter so the count
// of live visuals on the page is the count the reader can actually use.
//
// Hook-free: renders in the server /tbr/demo page and the client TBR alike.

import type { DimensionChapter } from "@/lib/report-v2/schema";
import { v2Strings, type TbrUiLocale } from "./shared";

/** First sentence of a narrative (≤ 220 chars), the preview's only real text. */
export function firstSentence(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const m = clean.match(/^(.+?[.!?])(?:\s|$)/);
  const first = (m ? m[1] : clean).trim();
  if (first.length <= max) return first;
  return `${first.slice(0, max - 1).trimEnd()}…`;
}

const SKELETON_BARS = [72, 48, 84, 36, 60] as const;

export function TbrLockedChapterPreview({ chapter, locale = "en" }: { chapter: DimensionChapter; locale?: TbrUiLocale }) {
  const ch = chapter;
  const t = v2Strings(locale).rail;
  const lead = firstSentence(ch.verdict);
  return (
    <div data-tbr-locked={ch.dim} className="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-950 print:break-inside-avoid">
      {lead && <p className="text-sm leading-relaxed text-ink-800 dark:text-ink-200">{lead}</p>}
      <div aria-hidden="true" className="pointer-events-none mt-3 grid select-none gap-3 blur-[3px] md:grid-cols-[minmax(0,1fr)_240px]" data-tbr-skeleton="visual">
        <div className="space-y-2">
          {SKELETON_BARS.map((w, i) => (
            <div key={i} className="h-3 rounded bg-ink-200/80 dark:bg-ink-800" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="flex h-28 items-end gap-2 rounded-lg border border-ink-200 p-3 dark:border-ink-800">
          {[40, 65, 30, 80, 55].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-brand-200/70 dark:bg-brand-900/60" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-ink-950" />
      <p className="relative mt-2 text-[11px] font-medium text-ink-500 dark:text-ink-400">
        {t.lockedNote}
      </p>
    </div>
  );
}
