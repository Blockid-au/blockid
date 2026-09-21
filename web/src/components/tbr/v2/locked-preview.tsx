// G16-B — the locked preview a FREE founder sees at the free-tier cut
// (chapters the projection renders as cards): the chapter's first sentence,
// then a pure-CSS skeleton where the primary visual and the evidence table
// would sit. No image, no inline script, no real chart — the S-R1 primary
// `svg[role=img]` deliberately stays out of a locked chapter so the count
// of live visuals on the page is the count the reader can actually use.
//
// Hook-free: renders in the server /tbr/demo page and the client TBR alike.

import { stripCitationMarkers } from "@/lib/report-v2/citations";
import type { DimensionChapter } from "@/lib/report-v2/schema";
import { v2Strings, type TbrUiLocale } from "./shared";

/** First sentence of a narrative (≤ 220 chars), the preview's only real text — G24-A: citation markers stripped, never numbered here. */
export function firstSentence(text: string, max = 220): string {
  const clean = stripCitationMarkers(text).replace(/\s+/g, " ").trim();
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
    <div data-tbr-locked={ch.dim} className="relative overflow-hidden rounded-xl border border-line-subtle bg-surface p-4 print:break-inside-avoid">
      {lead && <p className="text-sm leading-relaxed text-primary">{lead}</p>}
      <div aria-hidden="true" className="pointer-events-none mt-3 grid select-none gap-3 blur-[3px] md:grid-cols-[minmax(0,1fr)_240px]" data-tbr-skeleton="visual">
        <div className="space-y-2">
          {SKELETON_BARS.map((w, i) => (
            <div key={i} className="h-3 rounded bg-surface-sunken" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="flex h-28 items-end gap-2 rounded-lg border border-line-subtle p-3">
          {[40, 65, 30, 80, 55].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-brand-200/70" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
      <p className="relative mt-2 text-xs font-medium text-muted">
        {t.lockedNote}
      </p>
    </div>
  );
}
