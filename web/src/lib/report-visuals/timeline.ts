// timeline — exit paths 3/5/7 yr (SVM secondary), grant deadlines, and the
// `gantt` 3 × 30-day action plan. Horizontal axis, milestone dots / bars.

import { BAND_COLOUR, INK, SERIES } from "./palette";
import type { RenderOpts } from "./render-opts";
import { fin, frame, num, text, truncate } from "./svg";
import type { GanttData, TimelineData } from "./types";

export function renderTimeline(data: TimelineData, opts: RenderOpts): string {
  const width = Math.max(220, Math.round(fin(opts.width, 360)));
  const items = (Array.isArray(data.items) ? data.items : []).map((i) => ({ ...i, at: fin(i?.at) })).slice(0, 10);
  const height = 96;
  const padL = 16;
  const padR = 16;
  const axisY = 56;
  const plotW = width - padL - padR;
  let body = "";
  if (items.length === 0) {
    body = text(width / 2, 40, "No milestones", { size: 10, anchor: "middle", fill: INK.muted });
    return frame({ id: opts.id, title: opts.title, description: opts.description, width, height: 60, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
  }
  const horizon = Math.max(fin(data.horizon, 0), ...items.map((i) => i.at), 1);
  const sx = (at: number) => padL + (Math.max(0, at) / horizon) * plotW;
  body += `<line x1="${padL}" y1="${axisY}" x2="${padL + plotW}" y2="${axisY}" stroke="${INK.grid}" stroke-width="2"/>`;
  items.forEach((item, i) => {
    const x = sx(item.at);
    const colour = item.status === "done" ? BAND_COLOUR.strong : item.status === "current" ? BAND_COLOUR.developing : SERIES[i % SERIES.length];
    body += `<circle cx="${num(x, 2)}" cy="${axisY}" r="5" fill="${colour}"/>`;
    const above = i % 2 === 0;
    const anchor = x < padL + 30 ? "start" : x > padL + plotW - 30 ? "end" : "middle";
    body += text(x, above ? axisY - 14 : axisY + 20, truncate(item.label, 18), { size: 9, anchor, fill: INK.text, weight: 600 });
    const sub = item.detail ? truncate(item.detail, 20) : `${num(item.at, 0)}${data.unit ? ` ${data.unit}` : ""}`;
    body += text(x, above ? axisY - 4 : axisY + 31, sub, { size: 8, anchor, fill: INK.muted });
  });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}

export function renderGantt(data: GanttData, opts: RenderOpts): string {
  const width = Math.max(240, Math.round(fin(opts.width, 380)));
  const rows = (Array.isArray(data.rows) ? data.rows : []).slice(0, 12);
  const labelW = 120;
  const rowH = 18;
  const top = 22;
  const height = top + Math.max(1, rows.length) * rowH + 18;
  const plotW = width - labelW - 12;
  const horizon = Math.max(fin(data.horizon, 0), ...rows.map((r) => fin(r?.end)), 1);
  const sx = (v: number) => labelW + (Math.max(0, Math.min(horizon, fin(v))) / horizon) * plotW;
  let body = "";
  // Gridlines at thirds (30/60/90 for a 90-day plan).
  for (const t of [1 / 3, 2 / 3, 1]) {
    const x = labelW + plotW * t;
    body += `<line x1="${num(x, 2)}" y1="${top - 6}" x2="${num(x, 2)}" y2="${height - 16}" stroke="${INK.grid}" stroke-width="1"/>`;
    body += text(x, height - 4, `${num(horizon * t, 0)}${data.unit ? ` ${data.unit}` : ""}`, { size: 8, anchor: "middle", fill: INK.faint });
  }
  if (rows.length === 0) body += text(labelW + plotW / 2, top + 10, "No steps", { size: 10, anchor: "middle", fill: INK.muted });
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const x1 = sx(r.start);
    const x2 = Math.max(sx(r.end), x1 + 4);
    body += text(labelW - 6, y + 12, truncate(r.label, 22), { size: 9, anchor: "end", fill: INK.text });
    body += `<rect x="${num(x1, 2)}" y="${y + 3}" width="${num(x2 - x1, 2)}" height="${rowH - 6}" rx="3" fill="${SERIES[i % SERIES.length]}" fill-opacity="0.8"/>`;
    if (r.owner) body += text(Math.min(width - 4, x2 + 4), y + 12, truncate(r.owner.toUpperCase(), 6), { size: 8, fill: INK.muted });
  });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
