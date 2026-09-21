// <VisualFigure> — the one React wrapper for a VisualSpecV2 on the web.
//
// Renders the deterministic SVG string inline (the same string the PDF /
// DOCX paths use) plus the visually-hidden a11y table from
// `a11y.tableFallback` (spec §D.2). Hook-free so it works in server and
// client components alike; the SVG is produced by our own renderers with
// every label escaped, so `dangerouslySetInnerHTML` carries no user HTML.

import { renderVisual } from "./index";
import type { VisualSpecV2 } from "./types";

export interface VisualFigureProps {
  spec: VisualSpecV2;
  /** Optional caption under the chart (defaults to the spec title). */
  caption?: string | null;
  className?: string;
  /** Skip the hidden table (when the chapter already prints it). */
  hideTable?: boolean;
}

export function VisualFigure({ spec, caption, className, hideTable }: VisualFigureProps) {
  // Renderers are deterministic and cheap, so the web never trusts a stored
  // `spec.svg` string (kept for PDF/DOCX twins) — it re-renders from data,
  // which keeps `dangerouslySetInnerHTML` fed only by our own escaped output
  // even if a report_v2 column is ever writable with user JSON (W1 review).
  const svg = renderVisual(spec);
  const rows = spec.a11y?.tableFallback ?? [];
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  return (
    <figure className={className} data-visual-kind={spec.kind} data-visual-state={spec.dataState}>
      {/* Phones: keep the SVG at its drawn width inside a horizontal scroller (a 560-unit
          chart squeezed into 293 px put its 9–10 px labels at ~5 px — illegible); from md
          the chart fills the column as before. */}
      <div className="w-full overflow-x-auto [&>svg]:h-auto [&>svg]:max-w-none md:[&>svg]:w-full md:[&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      {caption !== null && (
        <figcaption className="mt-1 text-xs text-muted">
          {caption ?? spec.title}
        </figcaption>
      )}
      {!hideTable && rows.length > 0 && (
        // The wrapper div honours `sr-only` (1 × 1 px, overflow hidden); a bare table keeps its
        // intrinsic width and widened the page at 375 px (G21-P1-B page sweep).
        <div className="sr-only">
        <table className="sr-only">
          <caption>{spec.a11y.title}</caption>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c}>{String(r[c] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </figure>
  );
}
