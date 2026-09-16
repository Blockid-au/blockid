// score_ring — SVI total / chapter header ring (cover, chapter headers).
// Extracted geometry of components/svi/svi-score-ring.tsx as a pure string
// renderer so PDF / DOCX / email draw the identical ring.

import { BAND_COLOUR, INK, bandFor } from "./palette";
import type { RenderOpts } from "./render-opts";
import { arcPath, clamp, fin, frame, num, text, truncate } from "./svg";
import type { ScoreRingData } from "./types";

export function renderScoreRing(data: ScoreRingData, opts: RenderOpts): string {
  const size = Math.max(80, Math.round(fin(opts.width, 120)));
  const max = fin(data.max, 100) > 0 ? fin(data.max, 100) : 100;
  const value = clamp(fin(data.value), 0, max);
  const band = data.band ?? bandFor(value);
  const colour = BAND_COLOUR[band];
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const sweep = (value / max) * 360;
  const track = `<circle cx="${cx}" cy="${cy}" r="${num(r, 2)}" fill="none" stroke="${INK.grid}" stroke-width="8"/>`;
  const arc =
    sweep > 0
      ? `<path d="${arcPath(cx, cy, r, 0, sweep)}" fill="none" stroke="${colour}" stroke-width="8" stroke-linecap="round"/>`
      : "";
  const body =
    track +
    arc +
    text(cx, cy + 6, num(value, 0), { size: Math.round(size * 0.26), anchor: "middle", weight: 700, fill: colour }) +
    (data.label ? text(cx, cy + 6 + size * 0.16, truncate(data.label, 18), { size: 9, anchor: "middle", fill: INK.muted }) : "") +
    (data.sublabel ? text(cx, size - 4, truncate(data.sublabel, 22), { size: 8, anchor: "middle", fill: INK.faint }) : "");
  return frame(
    { id: opts.id, title: opts.title, description: opts.description, width: size, height: size, dataState: opts.dataState, hideBadge: opts.hideBadge ?? true },
    body,
  );
}
