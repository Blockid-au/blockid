// positioning_2x2 — price × differentiation competitor map (MPC secondary)
// and `scatter` — comparables ARR vs valuation (valuation secondary).
// Points are 0..100 on both axes; `self` is drawn as a filled ring.

import { BAND_COLOUR, INK, SERIES } from "./palette";
import type { RenderOpts } from "./render-opts";
import { clamp, fin, frame, num, text, truncate } from "./svg";
import type { Positioning2x2Data, ScatterData } from "./types";

function plotPoints(
  points: Array<{ label: string; x: number; y: number; self?: boolean }>,
  box: { x: number; y: number; w: number; h: number },
  maxX: number,
  maxY: number,
): string {
  let body = "";
  points.slice(0, 16).forEach((p, i) => {
    const px = box.x + (clamp(fin(p.x), 0, maxX) / maxX) * box.w;
    const py = box.y + box.h - (clamp(fin(p.y), 0, maxY) / maxY) * box.h;
    if (p.self) {
      body += `<circle cx="${num(px, 2)}" cy="${num(py, 2)}" r="7" fill="${BAND_COLOUR.strong}" fill-opacity="0.25" stroke="${BAND_COLOUR.strong}" stroke-width="2"/>`;
      body += `<circle cx="${num(px, 2)}" cy="${num(py, 2)}" r="3" fill="${BAND_COLOUR.strong}"/>`;
    } else {
      body += `<circle cx="${num(px, 2)}" cy="${num(py, 2)}" r="4" fill="${SERIES[(i + 1) % SERIES.length]}"/>`;
    }
    const anchor = px > box.x + box.w - 40 ? "end" : "start";
    body += text(px + (anchor === "end" ? -8 : 8), py + 3, truncate(p.label, 16), { size: 8, anchor, fill: p.self ? INK.text : INK.muted, weight: p.self ? 700 : undefined });
  });
  return body;
}

export function renderPositioning2x2(data: Positioning2x2Data, opts: RenderOpts): string {
  const width = Math.max(220, Math.round(fin(opts.width, 320)));
  const height = 240;
  const box = { x: 34, y: 20, w: width - 46, h: height - 56 };
  let body = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${INK.surfaceAlt}" stroke="${INK.grid}" stroke-width="1"/>`;
  body += `<line x1="${box.x + box.w / 2}" y1="${box.y}" x2="${box.x + box.w / 2}" y2="${box.y + box.h}" stroke="${INK.grid}" stroke-width="1" stroke-dasharray="3 3"/>`;
  body += `<line x1="${box.x}" y1="${box.y + box.h / 2}" x2="${box.x + box.w}" y2="${box.y + box.h / 2}" stroke="${INK.grid}" stroke-width="1" stroke-dasharray="3 3"/>`;
  const q = data.quadrants;
  if (q && q.length === 4) {
    body += text(box.x + 6, box.y + 12, truncate(q[0], 20), { size: 8, fill: INK.faint });
    body += text(box.x + box.w - 6, box.y + 12, truncate(q[1], 20), { size: 8, anchor: "end", fill: INK.faint });
    body += text(box.x + 6, box.y + box.h - 5, truncate(q[2], 20), { size: 8, fill: INK.faint });
    body += text(box.x + box.w - 6, box.y + box.h - 5, truncate(q[3], 20), { size: 8, anchor: "end", fill: INK.faint });
  }
  body += plotPoints(Array.isArray(data.points) ? data.points : [], box, 100, 100);
  body += text(box.x + box.w / 2, height - 10, `${truncate(data.xLabel, 30)} →`, { size: 9, anchor: "middle", fill: INK.muted });
  body += `<text x="12" y="${box.y + box.h / 2}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="9" fill="${INK.muted}" text-anchor="middle" transform="rotate(-90 12 ${box.y + box.h / 2})">${truncate(data.yLabel, 30).replace(/&/g, "&amp;").replace(/</g, "&lt;")} →</text>`;
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}

export function renderScatter(data: ScatterData, opts: RenderOpts): string {
  const width = Math.max(220, Math.round(fin(opts.width, 340)));
  const height = 220;
  const box = { x: 40, y: 20, w: width - 52, h: height - 56 };
  const points = Array.isArray(data.points) ? data.points : [];
  const maxX = Math.max(1, ...points.map((p) => fin(p?.x)));
  const maxY = Math.max(1, ...points.map((p) => fin(p?.y)));
  let body = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${INK.surfaceAlt}" stroke="${INK.grid}" stroke-width="1"/>`;
  if (points.length === 0) body += text(box.x + box.w / 2, box.y + box.h / 2, "No comparables yet", { size: 10, anchor: "middle", fill: INK.muted });
  body += plotPoints(points, box, maxX, maxY);
  body += text(box.x + box.w / 2, height - 10, truncate(data.xLabel, 36), { size: 9, anchor: "middle", fill: INK.muted });
  body += `<text x="12" y="${box.y + box.h / 2}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="9" fill="${INK.muted}" text-anchor="middle" transform="rotate(-90 12 ${box.y + box.h / 2})">${truncate(data.yLabel, 30).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
  body += text(box.x, height - 22, "0", { size: 8, fill: INK.faint });
  body += text(box.x + box.w, height - 22, num(maxX, 0), { size: 8, anchor: "end", fill: INK.faint });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
