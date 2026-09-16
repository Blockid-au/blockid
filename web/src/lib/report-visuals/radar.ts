// radar — 8-dimension SVI radar vs stage p50 (cover) and the 5-factor moat
// radar (SVM). Series polygon + optional dashed reference polygon.

import { BAND_COLOUR, INK, SERIES } from "./palette";
import type { RenderOpts } from "./render-opts";
import { clamp, fin, frame, num, polar, text, truncate } from "./svg";
import type { RadarData } from "./types";

export function renderRadar(data: RadarData, opts: RenderOpts): string {
  const size = Math.max(160, Math.round(fin(opts.width, 260)));
  const axes = (Array.isArray(data.axes) ? data.axes : []).slice(0, 12);
  const n = axes.length;
  const max = fin(data.max, 100) > 0 ? fin(data.max, 100) : 100;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = size / 2 - 34;
  let body = "";
  if (n < 3) {
    body = text(cx, cy, "Not enough axes to draw", { size: 10, anchor: "middle", fill: INK.muted });
    return frame({ id: opts.id, title: opts.title, description: opts.description, width: size, height: size, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
  }
  const step = 360 / n;
  // Grid rings at 25/50/75/100 %.
  for (const pct of [0.25, 0.5, 0.75, 1]) {
    const pts = axes.map((_, i) => polar(cx, cy, r * pct, i * step)).map((p) => `${num(p.x, 2)},${num(p.y, 2)}`).join(" ");
    body += `<polygon points="${pts}" fill="none" stroke="${INK.grid}" stroke-width="1"/>`;
  }
  // Spokes + labels.
  axes.forEach((axis, i) => {
    const end = polar(cx, cy, r, i * step);
    body += `<line x1="${cx}" y1="${cy}" x2="${num(end.x, 2)}" y2="${num(end.y, 2)}" stroke="${INK.grid}" stroke-width="1"/>`;
    const lab = polar(cx, cy, r + 16, i * step);
    const anchor = Math.abs(lab.x - cx) < 4 ? "middle" : lab.x < cx ? "end" : "start";
    body += text(lab.x, lab.y + 3, truncate(axis.label, 14), { size: 9, anchor, fill: INK.muted });
  });
  const hasRef = axes.some((a) => typeof a.reference === "number" && Number.isFinite(a.reference));
  if (hasRef) {
    const pts = axes
      .map((a, i) => polar(cx, cy, (clamp(fin(a.reference, 0), 0, max) / max) * r, i * step))
      .map((p) => `${num(p.x, 2)},${num(p.y, 2)}`)
      .join(" ");
    body += `<polygon points="${pts}" fill="${BAND_COLOUR.pending}" fill-opacity="0.12" stroke="${BAND_COLOUR.pending}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  }
  const seriesPts = axes.map((a, i) => polar(cx, cy, (clamp(fin(a.value), 0, max) / max) * r, i * step));
  body += `<polygon points="${seriesPts.map((p) => `${num(p.x, 2)},${num(p.y, 2)}`).join(" ")}" fill="${SERIES[0]}" fill-opacity="0.22" stroke="${SERIES[0]}" stroke-width="2"/>`;
  seriesPts.forEach((p) => {
    body += `<circle cx="${num(p.x, 2)}" cy="${num(p.y, 2)}" r="2.5" fill="${SERIES[0]}"/>`;
  });
  // Legend.
  const legendY = size - 6;
  body += `<rect x="8" y="${legendY - 8}" width="10" height="8" fill="${SERIES[0]}" fill-opacity="0.5"/>` + text(22, legendY, truncate(data.seriesLabel ?? "This startup", 22), { size: 8, fill: INK.muted });
  if (hasRef) {
    body += `<line x1="${size / 2 + 4}" y1="${legendY - 4}" x2="${size / 2 + 16}" y2="${legendY - 4}" stroke="${BAND_COLOUR.pending}" stroke-width="1.5" stroke-dasharray="4 3"/>` + text(size / 2 + 20, legendY, truncate(data.referenceLabel ?? "Stage p50", 22), { size: 8, fill: INK.muted });
  }
  return frame({ id: opts.id, title: opts.title, description: opts.description, width: size, height: size, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
