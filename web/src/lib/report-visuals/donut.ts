// donut — cap table (CGH primary; actual or `target`) and any share split.
// Arc paths only (react-pdf safe). A `target` donut is drawn dashed.

import { INK, SERIES, strokeDash } from "./palette";
import type { RenderOpts } from "./render-opts";
import { arcPath, fin, frame, num, text, truncate } from "./svg";
import type { DonutData } from "./types";

export function renderDonut(data: DonutData, opts: RenderOpts): string {
  const width = Math.max(220, Math.round(fin(opts.width, 300)));
  const height = 150;
  const slices = (Array.isArray(data.slices) ? data.slices : []).map((s) => ({ label: String(s?.label ?? ""), value: Math.max(0, fin(s?.value)) })).slice(0, 8);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const cx = 78;
  const cy = height / 2 + 4;
  const r = 52;
  let body = "";
  if (total <= 0) {
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK.grid}" stroke-width="14"/>`;
    body += text(cx, cy + 4, "no data", { size: 9, anchor: "middle", fill: INK.muted });
  } else {
    let angle = 0;
    slices.forEach((s, i) => {
      if (s.value <= 0) return;
      const sweep = (s.value / total) * 360;
      const end = angle + sweep;
      body += `<path d="${arcPath(cx, cy, r, angle, Math.min(end, 359.999))}" fill="none" stroke="${SERIES[i % SERIES.length]}" stroke-width="14"${strokeDash(opts.dataState)}/>`;
      angle = end;
    });
    if (data.centreValue) body += text(cx, cy + 3, truncate(data.centreValue, 8), { size: 14, anchor: "middle", weight: 700 });
    if (data.centreLabel) body += text(cx, cy + 16, truncate(data.centreLabel, 14), { size: 8, anchor: "middle", fill: INK.muted });
  }
  // Legend.
  const lx = cx + r + 26;
  slices.forEach((s, i) => {
    const y = 30 + i * 16;
    body += `<rect x="${lx}" y="${y - 8}" width="10" height="10" rx="2" fill="${SERIES[i % SERIES.length]}"/>`;
    const pct = total > 0 ? ` ${num((s.value / total) * 100, 0)}%` : "";
    body += text(lx + 15, y + 1, `${truncate(s.label, 18)}${pct}`, { size: 9, fill: INK.text });
  });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
