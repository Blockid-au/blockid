// gauge — half-dial (CWV / tech-audit, PTD secondary) and `progress` bar
// (IRI readiness ring fallback, generic completion).

import { BAND_COLOUR, INK, bandFor } from "./palette";
import type { RenderOpts } from "./render-opts";
import { arcPath, clamp, fin, frame, num, text, truncate } from "./svg";
import type { GaugeData, ProgressData } from "./types";

export function renderGauge(data: GaugeData, opts: RenderOpts): string {
  const width = Math.max(160, Math.round(fin(opts.width, 200)));
  const height = 120;
  const min = fin(data.min, 0);
  const max = fin(data.max, 100) > min ? fin(data.max, 100) : min + 100;
  const value = clamp(fin(data.value, min), min, max);
  const pct = (value - min) / (max - min);
  const cx = width / 2;
  const cy = 88;
  const r = 60;
  const band = bandFor(pct * 100);
  let body = `<path d="${arcPath(cx, cy, r, 270, 450)}" fill="none" stroke="${INK.grid}" stroke-width="12" stroke-linecap="round"/>`;
  if (pct > 0) body += `<path d="${arcPath(cx, cy, r, 270, 270 + pct * 180)}" fill="none" stroke="${BAND_COLOUR[band]}" stroke-width="12" stroke-linecap="round"/>`;
  body += text(cx, cy - 6, `${num(value, value >= 100 ? 0 : 1)}${data.unit ?? ""}`, { size: 20, anchor: "middle", weight: 700, fill: BAND_COLOUR[band] });
  if (data.label) body += text(cx, cy + 12, truncate(data.label, 26), { size: 9, anchor: "middle", fill: INK.muted });
  body += text(cx - r, cy + 14, num(min, 0), { size: 8, anchor: "middle", fill: INK.faint });
  body += text(cx + r, cy + 14, num(max, 0), { size: 8, anchor: "middle", fill: INK.faint });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}

export function renderProgress(data: ProgressData, opts: RenderOpts): string {
  const width = Math.max(160, Math.round(fin(opts.width, 300)));
  const height = 48;
  const max = fin(data.max, 100) > 0 ? fin(data.max, 100) : 100;
  const value = clamp(fin(data.value), 0, max);
  const pct = value / max;
  const band = bandFor(pct * 100);
  const barX = 8;
  const barW = width - 16;
  let body = text(barX, 16, truncate(data.label ?? "Progress", 40), { size: 9, fill: INK.muted });
  body += `<rect x="${barX}" y="22" width="${barW}" height="12" rx="6" fill="${INK.grid}"/>`;
  body += `<rect x="${barX}" y="22" width="${num(Math.max(2, barW * pct), 2)}" height="12" rx="6" fill="${BAND_COLOUR[band]}"/>`;
  body += text(width - 8, 16, `${num(pct * 100, 0)}%`, { size: 9, anchor: "end", fill: INK.text, weight: 600 });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
