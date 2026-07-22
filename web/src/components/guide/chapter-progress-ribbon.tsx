// "Chapter X of 12" progress ribbon shown at the top of every guide chapter
// page. Closes CPO advisory §25 recommendation #4 — a founder reading a
// chapter directly still needs to perceive the linear 12-phase arc even when
// they arrive from a deep link (search, share, drawer link) rather than the
// product-tour banner.
//
// Server component — pure presentation, no hooks. Two variants:
//   - "workspace" — light background, sits inside WorkspaceLayout on
//     /workspace/guide/[chapter]. Uses the same emerald accent as the
//     eyebrow row above it and the product-tour banner idiom.
//   - "marketing"  — matches the /guide/[chapter] slate palette + dark-mode
//     tokens already used in that route.
//
// Locale mirrors the shared getLocale() cookie — EN "Chapter X of 12", VI
// "Chương X trên 12". Segment labels are numeric so the row is readable at
// any width; the current segment is highlighted, prior segments carry a
// subtler tone, and future segments are ghosted.

import type { Locale } from "@/lib/i18n";

const TOTAL_CHAPTERS = 12;

interface Props {
  phase: number;
  locale: Locale;
  variant: "workspace" | "marketing";
}

export function ChapterProgressRibbon({ phase, locale, variant }: Props) {
  const current = Math.min(Math.max(1, Math.floor(phase)), TOTAL_CHAPTERS);
  const label =
    locale === "vi"
      ? `Chương ${current} trên ${TOTAL_CHAPTERS}`
      : `Chapter ${current} of ${TOTAL_CHAPTERS}`;
  const percent = Math.round((current / TOTAL_CHAPTERS) * 100);
  const percentLabel =
    locale === "vi" ? `${percent}% hành trình` : `${percent}% of the journey`;

  const containerClass =
    variant === "marketing"
      ? "mb-8 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      : "mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3";
  const captionClass =
    variant === "marketing"
      ? "flex items-baseline justify-between text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
      : "flex items-baseline justify-between text-xs uppercase tracking-wide text-emerald-800";
  const trackFilledClass =
    variant === "marketing"
      ? "bg-emerald-600 dark:bg-emerald-400"
      : "bg-emerald-600";
  const trackEmptyClass =
    variant === "marketing"
      ? "bg-slate-200 dark:bg-slate-800"
      : "bg-emerald-100";

  return (
    <div
      className={containerClass}
      role="progressbar"
      aria-label={label}
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={TOTAL_CHAPTERS}
    >
      <p className={captionClass}>
        <span className="font-semibold">{label}</span>
        <span>{percentLabel}</span>
      </p>
      <ol className="mt-2 flex gap-1" aria-hidden="true">
        {Array.from({ length: TOTAL_CHAPTERS }, (_, i) => i + 1).map((n) => {
          const filled = n <= current;
          const isCurrent = n === current;
          return (
            <li
              key={n}
              className={[
                "flex h-2 flex-1 items-center justify-center rounded-full",
                filled ? trackFilledClass : trackEmptyClass,
                isCurrent ? "ring-2 ring-emerald-500/50" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          );
        })}
      </ol>
    </div>
  );
}
