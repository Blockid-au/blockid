// heat_map — team completeness (FTV), data-room completeness (IRI), risk
// (LCO secondary) and the 13 × 12 phase-gate matrix. Single-hue blue ramp;
// `null` cells render as "?" so an unknown is never mistaken for a zero.

import { INK, heatColour, heatInk } from "./palette";
import type { RenderOpts } from "./render-opts";
import { fin, frame, num, text, truncate } from "./svg";
import type { HeatMapData } from "./types";

export function renderHeatMap(data: HeatMapData, opts: RenderOpts): string {
  const rows = (Array.isArray(data.rows) ? data.rows : []).slice(0, 16);
  const cols = (Array.isArray(data.cols) ? data.cols : []).slice(0, 14);
  const max = fin(data.max, 100) > 0 ? fin(data.max, 100) : 100;
  const width = Math.max(200, Math.round(fin(opts.width, 360)));
  const labelW = 92;
  const headerH = 34;
  const cellW = Math.max(18, (width - labelW - 8) / Math.max(1, cols.length));
  const cellH = 22;
  const height = headerH + rows.length * cellH + (data.legend ? 18 : 8);
  let body = "";
  if (rows.length === 0 || cols.length === 0) {
    body = text(width / 2, 30, "No grid supplied", { size: 10, anchor: "middle", fill: INK.muted });
    return frame({ id: opts.id, title: opts.title, description: opts.description, width, height: 50, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
  }
  cols.forEach((c, j) => {
    body += text(labelW + j * cellW + cellW / 2, headerH - 8, truncate(c, Math.max(3, Math.floor(cellW / 5.5))), { size: 8, anchor: "middle", fill: INK.muted });
  });
  rows.forEach((r, i) => {
    const y = headerH + i * cellH;
    body += text(labelW - 6, y + cellH / 2 + 3, truncate(r, 16), { size: 9, anchor: "end", fill: INK.text });
    cols.forEach((_, j) => {
      const raw = data.cells?.[i]?.[j];
      const v = raw === null || raw === undefined ? null : fin(raw, 0);
      const x = labelW + j * cellW;
      body += `<rect x="${num(x, 2)}" y="${y}" width="${num(cellW - 2, 2)}" height="${cellH - 2}" rx="3" fill="${heatColour(v, max)}" stroke="${INK.grid}" stroke-width="0.5"/>`;
      const override = data.cellLabels?.[i]?.[j];
      const label = typeof override === "string" ? truncate(override, 4) : v === null ? "?" : num(v, 0);
      body += text(x + (cellW - 2) / 2, y + cellH / 2 + 3, label, { size: 8, anchor: "middle", fill: heatInk(v, max) });
    });
  });
  if (data.legend) body += text(labelW, height - 4, truncate(data.legend, 60), { size: 8, fill: INK.faint });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
